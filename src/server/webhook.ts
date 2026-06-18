import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  increment,
  limit,
  orderBy,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';

import { serverDb } from './firebase';
import { resolveSDRState } from '../utils/sdrState'; 

import { isValidE164BR } from './phoneUtils';
import { extractWhatsAppIdentity } from '../utils/whatsappIdentity';
import { getEvolutionMedia } from '../services/whatsapp/sendEvolutionImage';
import { transcribeAudio } from './aiProviders';
import { trackWhisperUsage } from '../services/metrics/aiUsageTracker';

// Media Persistence Pipeline
import { downloadIncomingMedia } from '../services/media/downloadIncomingMedia';
import { persistIncomingMedia } from '../services/media/persistIncomingMedia';
import { uploadToGCS } from '../services/storage/uploadToGCS';

console.log('[WEBHOOK] Media services loaded');

export function normalizeJid(jid: string): string {
  if (!jid) return '';
  return jid.trim();
}

const mediaPersistenceMap = new Set<string>();
const processingMessages = new Set<string>();

export async function handleEvolutionWebhook(req: any, res: any) {
  try {
    const { event: rawEvent, instance, data } = req.body;

    if (!rawEvent) {
      console.log('[WEBHOOK EMPTY EVENT] Request received but no event field found. Keys:', Object.keys(req.body || {}));
      return res.status(200).send('No event provided');
    }

    const event = rawEvent.toLowerCase().replace(/_/g, '.');
    console.log(`[EVENT TYPE] Raw: ${rawEvent} -> Normalized: ${event} | Instance: ${instance}`);

    // CORRIGIR EVENT FILTER: Somente messages.upsert pode processar mídia e SDR
    if (event !== 'messages.upsert') {
      console.log('[WEBHOOK] Ignored non-upsert event', event);
      return res.sendStatus(200);
    }

    const msgId = data?.key?.id || data?.messages?.[0]?.key?.id || data?.id;
    if (msgId) {
        if (processingMessages.has(msgId)) {
            console.log("[WEBHOOK] Message already processing", msgId);
            return res.sendStatus(200);
        }
        processingMessages.add(msgId);
        console.log('[WEBHOOK] Message locked', msgId);
    }

    try {
        const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('host.docker.internal') || req.headers.host?.includes('localhost') ? 'http' : 'https');
        const baseUrl = `${protocol}://${req.headers.host}`;

        await handleMessageUpsert(data, baseUrl, instance);
        return res.status(200).send('OK');

    } finally {
        if (msgId) {
            processingMessages.delete(msgId);
        }
    }

  } catch (error) {
    console.error('[Webhook Error]', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function updateSyncStats(
  field: 'messagesCount' | 'contactsCount' | 'chatsCount',
  count: number
) {
  try {
    const ref = doc(collection(serverDb, 'system'), 'sync_status');

    await setDoc(
      ref,
      {
        [field]: increment(count),
        updatedAt: Date.now()
      },
      { merge: true }
    );

    console.log(`[Webhook Stats] Incremented ${field} by ${count}`);

  } catch (err) {
    console.error('[Webhook Stats Error]', err);
  }
}

async function ensureContactExists(
  remoteJid: string,
  pushName?: string,
  profilePicUrl?: string,
  forcedPhone?: string,
  isLid?: boolean
): Promise<string | null> {

  const waIdentity = extractWhatsAppIdentity({
    remoteJid: remoteJid,
    sender: forcedPhone || remoteJid
  });

  if (!waIdentity.isValid) {
    console.warn('[INVALID IDENTITY SKIPPED]', remoteJid);
    return null;
  }

  // If it's a LID, we don't have a phone number, but we MUST create a contact anyway
  // to maintain CRM functionality. We use the LID digits as a placeholder.
  const phoneDigits = isLid ? remoteJid.replace(/\D/g, '') : (forcedPhone || waIdentity.numericPhone || remoteJid)
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '');

  if (phoneDigits.length < 10) {
    console.warn('[INVALID PHONE DIGITS SKIPPED]', phoneDigits);
    return null;
  }

  const phoneE164 = isLid ? `lid:${phoneDigits}` : `+${phoneDigits}`;

  console.log('[WHATSAPP PARSED]', {
    remoteJid: waIdentity.remoteJid,
    phoneE164,
    pushName,
    isLid
  });

  const contactsRef = collection(serverDb, 'contacts');

  const q = query(
    contactsRef,
    where('telefoneE164', '==', phoneE164)
  );

  const snap = await getDocs(q);

  if (snap.empty) {

    const newRef = doc(contactsRef);

    await setDoc(newRef, {
      id: newRef.id,
      nome: pushName || phoneDigits,
      telefoneRaw: phoneDigits,
      telefoneE164: phoneE164,
      remoteJid: waIdentity.remoteJid,
      whatsappLinked: true,
      tags: [],
      stage: 'Novo Lead',
      status: 'active',
      optIn: true,
      leadScore: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastContactAt: Date.now(),
      profilePicUrl: profilePicUrl || ''
    });

    console.log(`[Webhook] Novo contato criado: ${phoneE164}`);

    if (pushName && pushName.trim()) {
      console.log('[CONTACT FIRESTORE UPDATED]', { contactId: newRef.id, pushName: pushName.trim() });
    }

    return newRef.id;
  }

  const existingDoc = snap.docs[0];
  const existingId = existingDoc.id;
  const existingData = existingDoc.data();

  const updates: any = {
    lastContactAt: Date.now(),
    updatedAt: Date.now(),
    whatsappLinked: true,
    remoteJid: waIdentity.remoteJid,
    telefoneE164: phoneE164
  };

  if (profilePicUrl) {
    updates.profilePicUrl = profilePicUrl;
  }

  if (pushName && pushName.trim()) {
    updates.pushName = pushName.trim();
    if (!existingData.nome || existingData.nome === existingData.telefoneRaw || existingData.nome === existingData.telefoneE164) {
      updates.nome = pushName.trim();
    }
    console.log('[FIRESTORE CONTACT UPDATED]', { contactId: existingId, pushName: pushName.trim() });
  }

  await setDoc(doc(serverDb, 'contacts', existingId), updates, { merge: true });

  return existingId;
}

async function handleMessageUpsert(data: any, baseUrl: string, instance?: string) {

  const systemConfigSnap = await getDoc(doc(serverDb, 'system', 'system'));
  const systemConfig = systemConfigSnap.exists() ? systemConfigSnap.data() : null;

  let messagesList: any[] = [];

  if (Array.isArray(data)) {
    messagesList = data;
  }

  else if (Array.isArray(data?.messages)) {
    messagesList = data.messages;
  }

  else if (Array.isArray(data?.data)) {
    messagesList = data.data;
  }

  else if (data) {
    messagesList = [data];
  }

  let count = 0;

    for (const msgData of messagesList) {
      try {
        const keyObj = msgData.key || {};
        const remoteJid = keyObj.remoteJid || msgData.remoteJid || '';

        const fromMe = keyObj.fromMe === true || msgData.fromMe === true;

        if (!remoteJid) {
            console.log('[IGNORED NO_JID_IN_LOOP]');
            continue;
        }

        console.log('[REMOTE JID]', remoteJid);

        if (fromMe) {
          console.log('[PROCESSING FROM_ME]', {
            remoteJid: remoteJid,
            msgId: keyObj.id || msgData.id
          });
        }

        // Log all available identity sources
        const sender = msgData.sender || keyObj.participant || msgData.participant || '';
        const pushName = msgData.pushName || keyObj.pushName || '';
        const isLid = remoteJid.includes('@lid');
        
        console.log('[WEBHOOK IDENTITY SOURCES]', {
          remoteJid,
          sender,
          participant: keyObj.participant || msgData.participant,
          pushName,
          isLid,
          source: msgData.source,
          messageType: msgData.messageType
        });

        const conversationIdentity = remoteJid;
        const chatId = `${instance || '3dfans'}:${conversationIdentity}`;

        const realPhone = isLid ? '' : remoteJid
          .replace('@s.whatsapp.net', '')
          .replace(/\D/g, '');

        console.log('[CONVERSATION IDENTITY]', conversationIdentity);
        console.log('[TARGET PHONE]', realPhone || '[HIDDEN BY LID]');
        console.log('[CHAT ID]', chatId);

        // Extract full identity for contact matching/creation
        const waIdentity = extractWhatsAppIdentity({
            remoteJid: remoteJid,
            sender: remoteJid // Use remoteJid as sender to avoid owner collapse
        });

        // Group check
        if (waIdentity.isGroup || remoteJid.includes('@g.us')) {
          continue;
        }

        const msgId = keyObj.id || msgData.id || `msg_${Date.now()}`;

      let text = '';
      let mediaType = 'text';
      let mediaUrl = '';
      let mimeType = '';
      let fileName = '';
      let caption = '';

      const messageContent = msgData.message || {};
      const baseType = msgData.messageType || '';

      if (!msgData.message) {
          console.log('[Webhook Message No Content]', JSON.stringify(msgData, null, 2));
      }

      // Helper robusto para extrair a mídia em qualquer formato aninhado do Baileys/Evolution
      const extractMedia = (msg: any) => {
        if (!msg) return null;
        if (msg.imageMessage) return { type: 'image', data: msg.imageMessage };
        if (msg.videoMessage) return { type: 'video', data: msg.videoMessage };
        if (msg.audioMessage) return { type: 'audio', data: msg.audioMessage };
        if (msg.documentMessage) return { type: 'document', data: msg.documentMessage };
        if (msg.stickerMessage) return { type: 'sticker', data: msg.stickerMessage };
        if (msg.documentWithCaptionMessage?.message?.documentMessage) return { type: 'document', data: msg.documentWithCaptionMessage.message.documentMessage };
        if (msg.viewOnceMessage?.message?.imageMessage) return { type: 'image', data: msg.viewOnceMessage.message.imageMessage };
        if (msg.viewOnceMessage?.message?.videoMessage) return { type: 'video', data: msg.viewOnceMessage.message.videoMessage };
        if (msg.viewOnceMessageV2?.message?.imageMessage) return { type: 'image', data: msg.viewOnceMessageV2.message.imageMessage };
        if (msg.viewOnceMessageV2?.message?.videoMessage) return { type: 'video', data: msg.viewOnceMessageV2.message.videoMessage };
        return null;
      };

      const mediaPayload = extractMedia(messageContent);

      if (mediaPayload) {
        mediaType = mediaPayload.type;
        mediaUrl = mediaPayload.data.url || msgData.base64 || '';
        mimeType = mediaPayload.data.mimetype || '';
        caption = mediaPayload.data.caption || '';
        fileName = mediaPayload.data.fileName || 'documento';

        if (mediaType === 'image') {
            text = caption || '[Cliente enviou uma imagem]';
            console.log('[IMAGE RECEIVED]', { msgId, hasCaption: !!caption });
            console.log('[MEDIA] Incoming image detected');
        } else if (mediaType === 'video') {
            text = caption || '[Cliente enviou um vídeo]';
            console.log('[VIDEO RECEIVED]', { msgId, hasCaption: !!caption });
        } else if (mediaType === 'audio') {
            text = '[Cliente enviou um áudio]';
            console.log('[AUDIO RECEIVED]', { msgId });
            try {
                const audioBuffer = await getEvolutionMedia(msgData);

                // Upload to GCS for permanent, playable URL in the CRM inbox
                try {
                    const gcsPath = `audio/${chatId}/${msgId}.ogg`;
                    const audioMime = mimeType || 'audio/ogg; codecs=opus';
                    const publicUrl = await uploadToGCS(audioBuffer, gcsPath, audioMime);
                    mediaUrl = publicUrl;
                    console.log('[AUDIO UPLOADED TO GCS]', publicUrl);
                } catch (uploadErr) {
                    console.error('[AUDIO GCS UPLOAD FAILED]', uploadErr);
                }

                // Whisper transcription
                const transcribedText = await transcribeAudio(audioBuffer);
                if (transcribedText && transcribedText.length > 2) {
                    text = `[Áudio Transcrito]: ${transcribedText}`;
                    console.log(`[AUDIO TRANSCRIBED] ${transcribedText}`);
                    trackWhisperUsage(10).catch(() => {});
                }
            } catch (err) {
                console.error('[AUDIO TRANSCRIPTION FAILED]', err);
            }
        } else if (mediaType === 'document') {
            text = caption || `[Cliente enviou um documento: ${fileName}]`;
            console.log('[DOCUMENT RECEIVED]', { msgId, fileName });
        } else if (mediaType === 'sticker') {
            text = '[Cliente enviou uma figurinha]';
        }

        console.log('[MEDIA DETECTED]', { mediaType, mimeType });

      } else if (messageContent?.conversation) {
        text = messageContent.conversation;
      } else if (messageContent?.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
      } else if (baseType && baseType.includes('Message') && baseType !== 'extendedTextMessage') {
         // Fallback genérico para tipos de mídia Evolution API não cobertos pelo extrator
         mediaType = baseType.replace('Message', '');
         text = msgData.text || caption || `[Cliente enviou um(a) ${mediaType}]`;
         console.log('[MEDIA DETECTED VIA BASETYPE]', { mediaType, baseType });
      }

      const timestamp = msgData.messageTimestamp
        ? Number(msgData.messageTimestamp) * 1000
        : Date.now();

      // Mídia original será tratada e salva diretamente do payload (Base64)
      let finalMediaUrl = mediaUrl;

      console.log(
        '[MULTIMODAL MESSAGE]',
        {
          remoteJid: remoteJid,
          isLid,
          pushName,
          phoneE164: realPhone,
          phoneNote: isLid ? '[@lid preserved for outbound]' : '[Real phone number]',
          text,
          mediaType,
          hasMediaUrl: !!mediaUrl
        }
      );

      // Garante que o contato existe e pega o ID dele
      const contactId = await ensureContactExists(
        remoteJid,
        pushName,
        msgData.profilePicUrl || '',
        undefined,
        isLid
      );

      if (!contactId) {
        console.warn('[WEBHOOK SKIPPED] Could not resolve contact for', remoteJid);
        continue;
      }

      console.log('[CONTACT ID]', contactId);
      console.log('[CHAT ID]', chatId);

      // --- IMMEDIATE MEDIA PERSISTENCE PIPELINE ---
      let mediaBuffer: Buffer | undefined;
      if (mediaType === 'image') {
          try {
              mediaBuffer = await downloadIncomingMedia(msgData);
              
              const { publicUrl } = await persistIncomingMedia({
                  buffer: mediaBuffer,
                  chatId,
                  contactId,
                  mimeType: mimeType || 'image/jpeg',
                  customerPhone: realPhone
              });
              
              finalMediaUrl = publicUrl;
          } catch (mediaErr) {
              console.error('[MEDIA ERROR] Immediate persistence failed', mediaErr);
          }
      }

      await setDoc(doc(serverDb, 'contacts', contactId), {
        lastContactAt: Date.now(),
        ...(fromMe ? { lastOutboundAt: Date.now() } : { lastInboundAt: Date.now() }),
        whatsappLinked: true,
        remoteJid: remoteJid,
        ...(msgData.profilePicUrl ? { profilePicUrl: msgData.profilePicUrl } : {})
      }, { merge: true });

      const msgRef = doc(collection(serverDb, 'messages'), msgId);

      const phoneE164 = isLid ? '' : `+${realPhone}`;

      await setDoc(
        msgRef,
        {
          id: msgId,
          messageId: msgId,
          chatId: chatId,
          remoteJid: remoteJid,
          phoneE164: phoneE164,
          sender: remoteJid,
          instanceId: instance,
          instance,
          contactId: contactId || '',
          direction: fromMe ? 'outbound' : 'inbound',
          fromMe,
          text,
          body: text,
          mediaType,
          mediaUrl: finalMediaUrl,
          rawMediaUrl: mediaUrl,
          mimeType,
          caption,
          fileName,
          messageContent: { key: msgData.key || {}, message: msgData.message || {} }, // Full msg for proxy decryption
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: fromMe ? 'sent' : 'received'
        },
        { merge: true }
      );

      // Only skip SDR if there's truly nothing to process
      const hasMedia = mediaType !== 'text';
      if (!text && !hasMedia) {
        console.log('[SDR SKIPPED] Empty message content', { msgId });
        continue;
      }

      console.log("[MESSAGE SAVED]", {
        chatId: chatId,
        text,
        mediaType,
        sender: remoteJid
      });

      // Ensure chat document exists before any message or media operations
      const chatRef = doc(collection(serverDb, 'chats'), chatId);
      await setDoc(chatRef, { id: chatId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });

      const chatSnap = await getDoc(chatRef);
      const chatSnapData = chatSnap.data();

      let unreadCount = 0;

      if (!fromMe) {
        unreadCount = chatSnap.exists()
          ? (chatSnap.data().unreadCount || 0) + 1
          : 1;
      }

      else {
        unreadCount = chatSnap.exists()
          ? (chatSnap.data().unreadCount || 0)
          : 0;
      }

      const existingChatName = chatSnap.data()?.pushName || chatSnap.data()?.contactName;
      const contactName = (pushName && pushName.trim()) ? pushName.trim() : (existingChatName || 'Contato');

      await setDoc(
        chatRef,
        {
          id: chatId,
          contactId: contactId, // Store contactId in chat doc for SDR
          remoteJid: remoteJid,
          telefoneE164: phoneE164,
          pushName: contactName,
          unreadCount,
          lastMessage: text || `[${mediaType}]`,
          lastMessageAt: serverTimestamp(),
          instanceId: instance,
          updatedAt: serverTimestamp(),
          ...(fromMe ? {
            hasOutbound: true,
            outboundCount: increment(1),
            lastOutboundAt: serverTimestamp(),
            lastMessageDirection: 'outbound',
            ...(!chatSnap.data()?.firstOutboundAt ? { firstOutboundAt: serverTimestamp() } : {}),
            ...(!chatSnap.data()?.firstInboundAt ? {} : {})
          } : {
            inboundCount: increment(1),
            lastInboundAt: serverTimestamp(),
            lastMessageDirection: 'inbound',
            ...(!chatSnap.data()?.firstInboundAt ? { firstInboundAt: serverTimestamp() } : {}),
            ...(chatSnap.data()?.hasOutbound ? { repliedAfterOutbound: true } : {})
          })
        },
        { merge: true }
      );

      if (!fromMe && chatSnap.data()?.hasOutbound && !chatSnap.data()?.repliedAfterOutbound && contactId) {
        await setDoc(doc(serverDb, 'contacts', contactId), { repliedAfterOutbound: true }, { merge: true });
      }

      const shouldRunSDR = resolveSDRState(chatSnapData, systemConfig as any);
      
      console.log('[SDR RESOLUTION]', {
          chatId: chatId,
          fromMe,
          shouldRunSDR,
          chatExists: chatSnap.exists(),
          globalSDREnabled: systemConfig?.globalSDREnabled
      });

      if (!fromMe && shouldRunSDR) {
          try {
              console.log('[SDR TRIGGER] Attempting to run SDR Engine', { chatId, mediaType });
              const mod = await import('./sdrEngine');
              await mod.runSDR(chatId, msgId, mediaType);
              console.log('[SDR SUCCESS] SDR Engine execution finished');
          } catch (runSdrError: any) {
              console.error('[runAI CRASH]', runSdrError);
              console.error('[runAI CRASH STACK]', runSdrError?.stack);
              console.error('[runAI CRASH FULL]', JSON.stringify(runSdrError, null, 2));
          }
      }

      // Campaign image reply trigger (fire-and-forget)
      if (!fromMe && contactId && realPhone && !isLid) {
          triggerCampaignImageReply(contactId, `+${realPhone}`, instance || '3dfans')
              .catch((e: unknown) => console.error('[CAMPAIGN IMAGE REPLY ERROR]', e));
      }

      console.log('[CHAT UPSERT]', chatId);
      console.log('[MESSAGE SAVED]', msgId);
      console.log('[INBOX UPDATED]', chatId);

      count++;

    } catch (err) {
      console.error('[Webhook Message Error]', err);
    }
  }

  if (count > 0) {
    await updateSyncStats('messagesCount', count);
  }
}

async function handleMessageUpdate(data: any) {
  console.log('[Message Update]', data);
}

async function handleChatUpsert(data: any) {

  let list: any[] = [];

  if (Array.isArray(data)) {
    list = data;
  }

  else if (Array.isArray(data?.data)) {
    list = data.data;
  }

  else if (data) {
    list = [data];
  }

  let count = 0;

  for (const chatData of list) {

    const remoteJid = normalizeJid(chatData.id);

    if (!remoteJid) continue;
    if (remoteJid.includes('@g.us')) continue;

    await ensureContactExists(
      remoteJid,
      chatData.name || chatData.pushName || ''
    );

    count++;
  }

  if (count > 0) {
    await updateSyncStats('chatsCount', count);
  }
}

async function handleContactUpsert(data: any) {

  let list: any[] = [];

  if (Array.isArray(data)) {
    list = data;
  }

  else if (Array.isArray(data?.data)) {
    list = data.data;
  }

  else if (data) {
    list = [data];
  }

  let count = 0;

  for (const contactData of list) {

    const remoteJid = normalizeJid(
      contactData.id ||
      contactData.remoteJid
    );

    if (!remoteJid) continue;
    if (remoteJid.includes('@g.us')) continue;

    await ensureContactExists(
      remoteJid,
      contactData.pushName || contactData.name || '',
      contactData.profilePicUrl || ''
    );

    count++;
  }

  if (count > 0) {
    await updateSyncStats('contactsCount', count);
  }
}

async function handleConnectionUpdate(data: any) {
  const state = data?.state || data?.instance?.state;
  if (!state) {
    console.log('[Webhook ConnectionUpdate] No state found in data:', JSON.stringify(data));
    return;
  }

  const ref = doc(collection(serverDb, 'system'), 'evolution_status');

  await setDoc(
    ref,
    {
      state: state,
      updatedAt: Date.now()
    },
    { merge: true }
  );
  console.log(`[Webhook ConnectionUpdate] Status updated to: ${state}`);
}

/**
 * When a contact replies to a campaign message:
 *  1. Tracks the reply (increments stats.respondidos)
 *  2. Sends personalized image from API if enableImageReply is set
 *  3. Sends configurable auto-reply text/image if enableAutoReply is set
 */
async function triggerCampaignImageReply(contactId: string, phoneE164: string, instance: string): Promise<void> {
  if (!phoneE164 || phoneE164.startsWith('lid:')) return;

  const number = phoneE164.replace(/\D/g, '');
  if (!number || number.length < 10) return;

  const windowMs = 1 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(Date.now() - windowMs);

  const queueSnap = await getDocs(
    query(
      collection(serverDb, 'campaign_queue'),
      where('contactId', '==', contactId),
      where('status', '==', 'enviado'),
      where('processedAt', '>=', cutoff.toMillis()),
      orderBy('processedAt', 'desc'),
      limit(5)
    )
  );
  if (queueSnap.empty) return;

  // Track reply: increment respondidos once per contact per campaign
  const unrepliedDoc = queueSnap.docs.find(d => !d.data().repliedToCampaign);
  let campaignId = unrepliedDoc?.data().campaignId ?? queueSnap.docs[0].data().campaignId;

  if (unrepliedDoc) {
    await updateDoc(unrepliedDoc.ref, { repliedToCampaign: true });
    await updateDoc(doc(serverDb, 'campaigns', campaignId), {
      'stats.respondidos': increment(1),
    });
    console.log(`[CAMPAIGN REPLY] respondidos++ for campaign ${campaignId}`);
  }

  const campaignSnap = await getDoc(doc(serverDb, 'campaigns', campaignId));
  if (!campaignSnap.exists()) return;
  const campaign = campaignSnap.data();

  const evoUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
  const evoKey = process.env.EVOLUTION_API_KEY;
  if (!evoUrl || !evoKey) {
    console.error('[CAMPAIGN REPLY] Evolution API env vars not set');
    return;
  }

  // Feature 1: personalized image from API
  if (campaign.enableImageReply) {
    const imageReplyDoc = queueSnap.docs.find(d => !d.data().imageReplySent);
    if (imageReplyDoc) {
      const apiBase = (campaign.imageReplyApiUrl || 'https://miniaturas.3dfans.pro/api/image-by-phone').replace(/\/$/, '');
      await updateDoc(imageReplyDoc.ref, { imageReplySent: true, imageReplySentAt: Date.now() });

      console.log(`[CAMPAIGN IMAGE REPLY] Calling image API for ${phoneE164}`);
      let imageUrl = '';
      try {
        const apiRes = await fetch(`${apiBase}/${encodeURIComponent(number)}`);
        if (!apiRes.ok) {
          console.error(`[CAMPAIGN IMAGE REPLY] API ${apiRes.status} for ${number}`);
        } else {
          const body = await apiRes.text();
          try {
            const json = JSON.parse(body);
            imageUrl = json.url || json.imageUrl || json.image || json.link || json.data?.url || '';
          } catch {
            if (body.trim().startsWith('http')) imageUrl = body.trim();
          }
        }
      } catch (fetchErr: any) {
        console.error('[CAMPAIGN IMAGE REPLY] API fetch failed:', fetchErr.message);
      }

      if (imageUrl) {
        try {
          const sendRes = await fetch(`${evoUrl}/message/sendMedia/${instance}`, {
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number, mediatype: 'image', media: imageUrl, caption: '', delay: 1500 })
          });
          if (!sendRes.ok) {
            console.error(`[CAMPAIGN IMAGE REPLY] Send failed ${sendRes.status}:`, await sendRes.text());
          } else {
            console.log(`[CAMPAIGN IMAGE REPLY] Image sent to ${phoneE164} (campaign: ${campaignId})`);
          }
        } catch (sendErr: any) {
          console.error('[CAMPAIGN IMAGE REPLY] Evolution send error:', sendErr.message);
        }
      } else {
        console.warn('[CAMPAIGN IMAGE REPLY] No image URL returned by API for', number);
      }
    }
  }

  // Feature 2: configurable auto-reply text (+ optional image)
  if (campaign.enableAutoReply && campaign.autoReplyText?.trim()) {
    const autoReplyDoc = queueSnap.docs.find(d => !d.data().autoReplySent);
    if (autoReplyDoc) {
      await updateDoc(autoReplyDoc.ref, { autoReplySent: true, autoReplySentAt: Date.now() });

      const replyText = campaign.autoReplyText.trim();
      const replyImageUrl = campaign.autoReplyImageUrl?.trim();

      console.log(`[CAMPAIGN AUTO-REPLY] Sending auto-reply to ${phoneE164}`);
      try {
        if (replyImageUrl) {
          const sendRes = await fetch(`${evoUrl}/message/sendMedia/${instance}`, {
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number, mediatype: 'image', media: replyImageUrl, caption: replyText, delay: 2000 })
          });
          if (!sendRes.ok) {
            console.error(`[CAMPAIGN AUTO-REPLY] Send failed ${sendRes.status}:`, await sendRes.text());
          } else {
            console.log(`[CAMPAIGN AUTO-REPLY] Image+text sent to ${phoneE164}`);
          }
        } else {
          const sendRes = await fetch(`${evoUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number, text: replyText, delay: 2000, linkPreview: true })
          });
          if (!sendRes.ok) {
            console.error(`[CAMPAIGN AUTO-REPLY] Send failed ${sendRes.status}:`, await sendRes.text());
          } else {
            console.log(`[CAMPAIGN AUTO-REPLY] Text sent to ${phoneE164}`);
          }
        }
      } catch (sendErr: any) {
        console.error('[CAMPAIGN AUTO-REPLY] Evolution send error:', sendErr.message);
      }
    }
  }
}