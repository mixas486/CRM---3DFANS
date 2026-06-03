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
  serverTimestamp
} from 'firebase/firestore';

import { serverDb } from './firebase';
import { resolveSDRState } from '../utils/sdrState'; 

import { isValidE164BR } from './phoneUtils';
import { extractWhatsAppIdentity } from '../utils/whatsappIdentity';

export function normalizeJid(jid: string): string {
  if (!jid) return '';
  return jid.trim();
}

export async function handleEvolutionWebhook(req: any, res: any) {
  try {
    const { event, instance, data } = req.body;

    if (!event) {
      return res.status(200).send('No event provided');
    }

    console.log('[EVENT TYPE]', event);

    const allowedEvents = [
      'messages.upsert',
      'messages.update'
    ];

    if (!allowedEvents.includes(event)) {
      console.log('[IGNORED EVENT]', event);
      return res.sendStatus(200);
    }

    const remoteJid = data?.key?.remoteJid || data?.remoteJid || '';
    const fromMe = data?.key?.fromMe === true || data?.fromMe === true;

    console.log('[Webhook Incoming]', {
        remoteJid,
        fromMe,
        event,
        instance
    });

    if (!remoteJid) {
      console.log('[IGNORED NO_JID]');
      return res.sendStatus(200);
    }

    if (fromMe) {
      console.log('[IGNORED FROM_ME]', {
        event,
        remoteJid
      });
      return res.sendStatus(200);
    }

    if (event === 'messages.upsert') {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${protocol}://${req.headers.host}`;

      await handleMessageUpsert(data, baseUrl, instance);
    }

    else if (event === 'messages.update') {
      await handleMessageUpdate(data);
    }

    return res.status(200).send('OK');

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
  forcedPhone?: string
): Promise<string | null> {

  const waIdentity = extractWhatsAppIdentity({
    remoteJid: remoteJid,
    sender: forcedPhone || remoteJid
  });

  if (!waIdentity.isValid) {
    console.warn('[INVALID IDENTITY SKIPPED]', remoteJid);
    return null;
  }

  // realPhone should only be used for the phone field, NOT for the conversation identity
  const phoneDigits = (forcedPhone || waIdentity.numericPhone || remoteJid)
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '');

  if (phoneDigits.length < 10) {
    console.warn('[INVALID PHONE DIGITS SKIPPED]', phoneDigits);
    return null;
  }

  const phoneE164 = `+${phoneDigits}`;

  console.log('[WHATSAPP PARSED]', {
    remoteJid: waIdentity.remoteJid,
    phoneE164,
    pushName
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

    return newRef.id;
  }

  const existingId = snap.docs[0].id;

  await updateDoc(doc(serverDb, 'contacts', existingId), {
    lastContactAt: Date.now(),
    whatsappLinked: true,
    remoteJid: waIdentity.remoteJid,
    ...(profilePicUrl ? { profilePicUrl } : {})
  });

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

        if (fromMe) {
          console.log('[IGNORED FROM_ME]', {
            remoteJid: remoteJid,
            msgId: keyObj.id || msgData.id
          });
          continue;
        }

        if (!remoteJid) {
            console.log('[IGNORED NO_JID_IN_LOOP]');
            continue;
        }

        console.log('[REMOTE JID]', remoteJid);

        const conversationIdentity = remoteJid;
        const chatId = `${instance || '3dfans'}:${conversationIdentity}`;

        const realPhone = remoteJid
          .replace('@s.whatsapp.net', '')
          .replace('@lid', '')
          .replace(/\D/g, '');

        console.log('[CONVERSATION IDENTITY]', conversationIdentity);
        console.log('[TARGET PHONE]', realPhone);
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

      const messageContent = msgData.message;

      if (messageContent?.conversation) {
        text = messageContent.conversation;
      }

      else if (messageContent?.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
      }

      else if (messageContent?.imageMessage) {
        mediaType = 'image';
        mediaUrl = messageContent.imageMessage.url || '';
        text = messageContent.imageMessage.caption || '[IMAGEM]';
      }

      else if (messageContent?.videoMessage) {
        mediaType = 'video';
        mediaUrl = messageContent.videoMessage.url || '';
        text = messageContent.videoMessage.caption || '[VIDEO]';
      }

      else if (messageContent?.audioMessage) {
        mediaType = 'audio';
        mediaUrl = messageContent.audioMessage.url || '';
        text = '[AUDIO]';
      }

      else if (messageContent?.documentMessage) {
        mediaType = 'document';
        mediaUrl = messageContent.documentMessage.url || '';
        text = '[DOCUMENTO]';
      }

      const timestamp = msgData.messageTimestamp
        ? Number(msgData.messageTimestamp) * 1000
        : Date.now();

      console.log(
        '[Inbound Parsed]',
        {
          sender: remoteJid,
          remoteJid: remoteJid,
          phoneE164: realPhone,
          text
        }
      );
      console.log(
        '[FULL MESSAGE DATA]',
        JSON.stringify(msgData, null, 2)
      );

      const contactId = await ensureContactExists(
        remoteJid,
        msgData.pushName || '',
        msgData.profilePicUrl || '',
        realPhone
      );

      const msgRef = doc(collection(serverDb, 'messages'), msgId);

      const phoneE164 = `+${realPhone}`;

      await setDoc(
        msgRef,
        {
          id: msgId,
          messageId: msgId,
          chatId: chatId,
          remoteJid: remoteJid,
          phoneE164: realPhone,
          sender: remoteJid,
          instanceId: instance,
          instance,
          contactId: contactId || '',
          direction: fromMe ? 'outbound' : 'inbound',
          fromMe,
          text,
          body: text,
          mediaType,
          mediaUrl,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: fromMe ? 'sent' : 'received'
        },
        { merge: true }
      );

      console.log("[MESSAGE SAVED]", {
        chatId: chatId,
        text,
        sender: remoteJid
      });

      const chatRef = doc(collection(serverDb, 'chats'), chatId);

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

      const contactName =
        msgData.pushName ||
        chatSnap.data()?.contactName ||
        'Contato';

      await setDoc(
        chatRef,
        {
          id: chatId,
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
              console.log('[CALLING runAI]', { chatId: chatId });
              const mod = await import('./sdrEngine');
              console.log('[runAI MODULE LOADED]', { hasRunAI: !!mod.runSDR });
              await mod.runSDR(chatId);
              console.log('[runAI FINISHED]', { chatId: chatId });
          } catch (runSdrError: any) {
              console.error('[runAI CRASH]', runSdrError);
              console.error('[runAI CRASH STACK]', runSdrError?.stack);
              console.error('[runAI CRASH FULL]', JSON.stringify(runSdrError, null, 2));
          }
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

  if (!data?.state) return;

  const ref = doc(collection(serverDb, 'system'), 'evolution_status');

  await setDoc(
    ref,
    {
      state: data.state,
      updatedAt: Date.now()
    },
    { merge: true }
  );
}