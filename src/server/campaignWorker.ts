import { collection, doc, setDoc, updateDoc, getDoc, query, where, getDocs, onSnapshot, increment, limit, getCountFromServer, serverTimestamp } from 'firebase/firestore';
import { serverDb } from './firebase';

const activeCampaigns = new Map<string, boolean>();

let cachedSystemSettings: any = null;
let lastSettingsFetchTime = 0;

// Variável global em memória para travar envios mais rápidos que 30s
let lastGlobalSendTime = 0;

async function getCachedSystemSettings() {
  const now = Date.now();
  if (!cachedSystemSettings || (now - lastSettingsFetchTime > 15000)) {
    console.log('[Campaign Worker] Cache miss or stale settings. Reading "system/settings" doc from Firestore...');
    const settingsRef = doc(serverDb, 'system', 'settings');
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists()) {
      cachedSystemSettings = settingsSnap.data();
    } else {
      cachedSystemSettings = {
        delayMinMs: 35000,
        delayMaxMs: 90000,
        dailyLimit: 1000,
        batchSize: 20,
        batchPauseMs: 60000,
        enableDispatchSound: true,
        dispatchSoundUrl: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
        openAiModel: 'gpt-4o-mini'
      };
    }
    lastSettingsFetchTime = now;
  } else {
    console.log('[Campaign Worker] Using cached system settings from memory (last read less than 15s ago).');
  }
  return cachedSystemSettings;
}

/**
 * Initializes the realtime server-side campaign processing engine.
 */
export function initCampaignWorker() {
  console.log('[Campaign Worker] Starting Campaign Processing Engine Realtime Worker...');
  
  const campaignsColl = collection(serverDb, 'campaigns');
  const q = query(campaignsColl, where('status', '==', 'running'));

  // Scheduler: every 30s activates campaigns/paused-resumes that are due
  setInterval(async () => {
    try {
      const now = Date.now();
      const [scheduledSnap, pausedSnap] = await Promise.all([
        getDocs(query(collection(serverDb, 'campaigns'), where('status', '==', 'scheduled'))),
        getDocs(query(collection(serverDb, 'campaigns'), where('status', '==', 'paused')))
      ]);
      const due = [...scheduledSnap.docs, ...pausedSnap.docs].filter(d => {
        const t = d.data().scheduledStartAt;
        return t && t <= now;
      });
      for (const snap of due) {
        console.log(`[Scheduler] Activating campaign: ${snap.id}`);
        await updateDoc(snap.ref, { status: 'running', scheduledStartAt: null });
        await createCampaignLog(snap.id, 'system', 'Agendador', 'Sistema', 'enviado',
          'Campanha ativada automaticamente pelo agendamento.');
      }
    } catch (err) {
      console.error('[Scheduler] Error checking scheduled campaigns:', err);
    }
  }, 30000);

  onSnapshot(q, (snapshot) => {
    console.log(`[Campaign Worker] Snapshot received from Firestore campaigns. Found ${snapshot.size} active running campaigns on db.`);
    snapshot.docs.forEach((docSnap) => {
      const campaignId = docSnap.id;
      const data = docSnap.data();
      console.log(`[Campaign Worker] Scanning running campaign: ID=${campaignId}, Nome="${data.nome || 'Campanha'}"`);
      
      if (!activeCampaigns.has(campaignId)) {
        console.log(`[Campaign Worker] Campaign ${campaignId} is not in tracked memory. Spawning dedicated processor thread...`);
        activeCampaigns.set(campaignId, true);
        processCampaign(campaignId).catch((error) => {
          console.error(`[Campaign Worker] Catastrophic error in processor thread for campaign ${campaignId}:`, error);
          activeCampaigns.delete(campaignId);
        });
      } else {
        console.log(`[Campaign Worker] Campaign ${campaignId} processor thread is already actively running.`);
      }
    });
  }, (err) => {
    console.error('[Campaign Worker] Realtime campaigns subscription FAILED. Error details:', err);
  });
}

/**
 * Checks if a contact is eligible for receiving a campaign message based on cooldown rules.
 */
function canSendCampaign(contact: any, chat: any) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // 1. Check if human takeover is active
  if (chat?.humanTakeover || contact?.needsReview) {
      return {
          allowed: false,
          reason: 'Atendimento humano ativo ou revisão necessária.',
          code: 'human_takeover'
      };
  }

  // 2. Check if contact is currently in an active SDR interaction
  if (chat?.sdrProcessing) {
      return {
          allowed: false,
          reason: 'O sistema de IA (SDR) está processando uma resposta agora.',
          code: 'sdr_busy'
      };
  }

  // 3. Check last inbound message (Rule: must be > 7 days ago)
  const lastInbound = contact.lastInboundAt || chat?.lastInboundAt;
  if (lastInbound) {
    const timeSinceInbound = now - lastInbound;
    if (timeSinceInbound < sevenDaysMs) {
      const daysLeft = ((sevenDaysMs - timeSinceInbound) / (24 * 60 * 60 * 1000)).toFixed(1);
      return { 
        allowed: false, 
        reason: `Interação recente do cliente há ${daysLeft} dias. Cooldown ativo de 7 dias.`,
        code: 'cooldown_inbound'
      };
    }
  }

  // 4. Check last campaign sent (Rule: must be > 7 days ago)
  if (contact.lastCampaignAt) {
    const timeSinceLastCampaign = now - contact.lastCampaignAt;
    if (timeSinceLastCampaign < sevenDaysMs) {
      const daysLeft = ((sevenDaysMs - timeSinceLastCampaign) / (24 * 60 * 60 * 1000)).toFixed(1);
      return { 
        allowed: false, 
        reason: `Já recebeu uma campanha há menos de 7 dias (${daysLeft} dias restantes).`,
        code: 'cooldown_campaign' 
      };
    }
  }

  return { allowed: true };
}

/**
 * Executes a specific campaign by scanning its pending queue items and processing them sequentially with delays.
 */
async function processCampaign(campaignId: string) {
  console.log(`[Campaign Worker] Starting work for campaign: ${campaignId}`);

  // Fetch campaign details
  const campaignRef = doc(serverDb, 'campaigns', campaignId);
  let batchCounter = 0; // Local counter for batch pause logic
  
  while (true) {
    // 1. Check campaign status on each step in case of user interaction (e.g. paused)
    const campaignSnap = await getDoc(campaignRef);
    if (!campaignSnap.exists()) {
      console.log(`[Campaign Worker] Campaign ${campaignId} was deleted. Terminating worker.`);
      activeCampaigns.delete(campaignId);
      break;
    }

    const campaign = campaignSnap.data();
    if (campaign.status !== 'running') {
      console.log(`[Campaign Worker] Campaign ${campaignId} status is not running (currently ${campaign.status}). Stopping processing.`);
      activeCampaigns.delete(campaignId);
      break;
    }

    // 2. Fetch campaign settings (cached in memory)
    const settings = await getCachedSystemSettings();

    const delayMin = settings.delayMinMs || 35000;
    const delayMax = settings.delayMaxMs || 90000;
    const dailyLimit = settings.dailyLimit || 1000;

    // 3. Keep track of daily limits (e.g. check campaigns sent today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Optimized count of successfully sent queue items today using getCountFromServer (1 read instead of N reads!)
    const queueColl = collection(serverDb, 'campaign_queue');
    const sentTodayQuery = query(
      queueColl,
      where('status', '==', 'enviado'),
      where('processedAt', '>=', todayStart.getTime())
    );
    const countSnap = await getCountFromServer(sentTodayQuery);
    const sentTodaySize = countSnap.data().count;
    
    if (sentTodaySize >= dailyLimit) {
      console.warn(`[Campaign Worker] Daily transmission limit of ${dailyLimit} reached. Pausing campaign ${campaignId}.`);
      await updateDoc(campaignRef, { status: 'paused' });
      await createCampaignLog(campaignId, 'system_limit', 'Limitador de Transmissão', 'Limitação', 'paused', `O limite diário de ${dailyLimit} envios foi atingido. Campanha pausada.`);
      activeCampaigns.delete(campaignId);
      break;
    }

    // 4. Fetch the next pending queue item (limited to 1 to optimize Firestore read costs)
    const pendingQuery = query(
      queueColl,
      where('campaignId', '==', campaignId),
      where('status', '==', 'aguardando'),
      limit(1)
    );
    const pendingSnap = await getDocs(pendingQuery);
    
    // LOG OBRIGATÓRIO: Queue loaded: X items
    console.log(`[Campaign Worker] Queue loaded: ${pendingSnap.size} items matching campaignId ${campaignId} with status 'aguardando'`);
    
    if (pendingSnap.empty) {
      console.log(`[Campaign Worker] Campaign ${campaignId} completed! All items processed.`);
      await updateDoc(campaignRef, { status: 'completed' });
      await createCampaignLog(campaignId, 'system_complete', 'Engine', 'Sistema', 'completed', 'Todos os disparos planejados foram concluídos com sucesso.');
      activeCampaigns.delete(campaignId);
      break;
    }

    const queueDoc = pendingSnap.docs[0];
    const queueItem = queueDoc.data();
    const queueDocRef = doc(serverDb, 'campaign_queue', queueDoc.id);

    // LOG OBRIGATÓRIO: Processing item: phone: contact: queueId:
    console.log(`[Campaign Worker] Processing item:
- phone: ${queueItem.telefoneE164}
- contact: ${queueItem.nome}
- queueId: ${queueDoc.id}`);

    // Update queue status to sending
    await updateDoc(queueDocRef, { status: 'enviando' });

    // 5. Verify contact opt-in and active status
    const contactRef = doc(serverDb, 'contacts', queueItem.contactId);
    
    // Fetch contact and associated chat (for SDR state)
    const instanceId = campaign.instanceId || process.env.EVOLUTION_INSTANCE || '3dfans';
    const parsedPhone = queueItem.telefoneE164.replace(/[^\d]/g, '');
    const chatIdVal = `${instanceId}:${parsedPhone}@s.whatsapp.net`;
    const chatRef = doc(serverDb, 'chats', chatIdVal);

    const [contactSnap, chatSnap] = await Promise.all([
        getDoc(contactRef),
        getDoc(chatRef)
    ]);
    
    if (!contactSnap.exists()) {
      console.warn(`[Campaign Worker] Processing failed: Contact ID ${queueItem.contactId} does not exist in Firestore.`);
      await updateDoc(queueDocRef, { status: 'falhou', error: 'Contato inexistente no CRM', processedAt: Date.now() });
      await updateDoc(campaignRef, {
        'stats.falhas': increment(1),
        'stats.aguardando': increment(-1)
      });
      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', 'Contato excluído do banco de dados.');
      await new Promise((resolve) => setTimeout(resolve, 500)); // no message sent — skip fast
      continue;
    }

    const contact = contactSnap.data();
    const chat = chatSnap.exists() ? chatSnap.data() : null;

    // --- Cooldown & Eligibility Check ---
    const eligibility = canSendCampaign(contact, chat);
    if (!eligibility.allowed) {
      console.warn(`[Campaign Worker] Skipping contact ${queueItem.nome}: ${eligibility.reason}`);
      await updateDoc(queueDocRef, {
        status: 'falhou',
        error: `IGNORADO (Cooldown): ${eligibility.reason}`,
        processedAt: Date.now()
      });
      await updateDoc(campaignRef, {
        'stats.falhas': increment(1),
        'stats.aguardando': increment(-1),
        'stats.ignorados': increment(1)
      });
      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', `Pular: ${eligibility.reason}`);
      await new Promise((resolve) => setTimeout(resolve, 500)); // no message sent — skip fast
      continue;
    }
    // --- End Check ---

    if (!contact.optIn) {
      console.warn(`[Campaign Worker] Processing skipped: Contact "${queueItem.nome}" has optIn set to false.`);
      await updateDoc(queueDocRef, { status: 'falhou', error: 'Contato sem Opt-In ativo', processedAt: Date.now() });
      await updateDoc(campaignRef, {
        'stats.falhas': increment(1),
        'stats.aguardando': increment(-1)
      });
      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', 'Bloqueado: Contato desabilitou recebimento (opt-in falso).');
      await new Promise((resolve) => setTimeout(resolve, 500)); // no message sent — skip fast
      continue;
    }

    if (contact.status !== 'active') {
      console.warn(`[Campaign Worker] Processing skipped: Contact "${queueItem.nome}" is archived or inactive in CRM.`);
      await updateDoc(queueDocRef, { status: 'falhou', error: 'Contato inativo no CRM', processedAt: Date.now() });
      await updateDoc(campaignRef, {
        'stats.falhas': increment(1),
        'stats.aguardando': increment(-1)
      });
      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', 'Bloqueado: Contato arquivado ou inativo.');
      await new Promise((resolve) => setTimeout(resolve, 500)); // no message sent — skip fast
      continue;
    }

    // 6. Generate Message via AI Variadora
    let messageText = '';
    try {
      messageText = await generateVariatedText(campaign.templateText, contact);
    } catch (err: any) {
      console.error('[Campaign Worker] AI variator error, using template fallback:', err);
      messageText = campaign.templateText
        .replace(/{{nome}}/g, contact.nome || '')
        .replace(/{{produto}}/g, contact.produto || '')
        .replace(/{{interesse}}/g, contact.interesse || '');
    }

      // 7. Send message via Evolution API
      
      // CHECAGEM DE SEGURANÇA GLOBAL (Nunca menos de 30 segundos)
      const now = Date.now();
      const timeSinceLastSend = now - lastGlobalSendTime;
      if (lastGlobalSendTime > 0 && timeSinceLastSend < 30000) {
        console.error(`[CRITICAL BAN RISK] Tentativa de envio muito rápida detectada (${timeSinceLastSend}ms desde o último disparo). Pausando campanha por segurança.`);
        
        await updateDoc(queueDocRef, { status: 'aguardando' }); // Devolve para a fila
        await updateDoc(campaignRef, { 
          status: 'paused', 
          pausedByAntiban: true,
          pausedAt: Date.now(),
          antibanDecay: (campaign.antibanDecay || 0) + 15 // Aumenta a punição/risk score
        });
        
        await createCampaignLog(
          campaignId, 
          'system', 
          'Sistema de Proteção', 
          'CRM', 
          'paused', 
          `SISTEMA PAUSADO AUTOMATICAMENTE: Foi detectado um envio simultâneo ou mais rápido do que 30 segundos (${(timeSinceLastSend/1000).toFixed(1)}s). A operação foi congelada para evitar o banimento do número.`
        );
        
        // Dispara um sinal para o frontend exibir o modal
        await setDoc(doc(serverDb, 'system', 'settings'), {
           lastEmergencyPause: Date.now(),
           emergencyPauseReason: `Envio duplo evitado. Último disparo foi há ${(timeSinceLastSend/1000).toFixed(1)}s.`
        }, { merge: true });
        
        activeCampaigns.delete(campaignId);
        break; // Quebra o worker thread
      }

      // Trava imediatamente a variável na memória ANTES do fetch para impedir concorrência de threads
      lastGlobalSendTime = now;

      try {
        const url = process.env.EVOLUTION_API_URL;
      const key = process.env.EVOLUTION_API_KEY;
      const instance = process.env.EVOLUTION_INSTANCE;
      
      if (!url || !key || !instance) {
        throw new Error('Evolution API credentials not configured: EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE must be set in .env');
      }
      
      const baseUrl = url.replace(/\/$/, '');

      // telefoneE164 já é um telefone real (vindo do webhook/sync via extractWhatsAppIdentity).
      // NUNCA derivamos telefone de @lid: se o valor contiver @lid, é dado sujo e deve falhar.
      const rawNumber = queueItem.telefoneE164 || contact?.telefoneE164 || contact?.phoneE164 || contact?.telefoneRaw || '';

      if (typeof rawNumber === 'string' && rawNumber.includes('@lid')) {
        console.error('[SEND BLOCKED] Campaign worker recusou número derivado de @lid:', rawNumber);
        await updateDoc(campaignRef, {
          'stats.falhas': increment(1),
          'stats.aguardando': increment(-1)
        });
        await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, rawNumber, 'falhou', `Bloqueado: identificador @lid não é um telefone válido (${rawNumber}). Resincronize o contato.`);
        const currentDelayMin = (await getCachedSystemSettings()).delayMinMs || 35000;
        await new Promise((resolve) => setTimeout(resolve, currentDelayMin));
        continue;
      }

      const number = rawNumber
        .replace('@s.whatsapp.net', '')
        .replace(/[^\d]/g, '');

      if (!number.startsWith('55') || number.length < 12) {
        console.error('[SEND BLOCKED] Campaign worker found invalid phone number:', number);
        await updateDoc(campaignRef, {
          'stats.falhas': increment(1),
          'stats.aguardando': increment(-1)
        });
        await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, number, 'falhou', `Bloqueado: Telefone inválido (${number}). Requer código de país 55 e mínimo de 12 dígitos.`);
        const currentDelayMin = (await getCachedSystemSettings()).delayMinMs || 35000;
        await new Promise((resolve) => setTimeout(resolve, currentDelayMin));
        continue;
      }

      // 7a. Fetch personalized image if sendImageWithMessage is enabled
      let imageBase64: string | null = null;
      let imageMimeType = 'image/jpeg';
      let campaignImageUrl = ''; // source URL of the image (used as mediaUrl in the message)

      if (campaign.sendImageWithMessage) {
        const apiBase = (campaign.imageReplyApiUrl || 'https://miniaturas.3dfans.pro/api/image-by-phone').replace(/\/$/, '');
        try {
          console.log(`[Campaign Worker] Fetching personalized image for ${number}...`);
          const apiRes = await fetch(`${apiBase}/${encodeURIComponent(number)}`);
          if (apiRes.ok) {
            const body = await apiRes.text();
            let imgUrl = '';
            try {
              const j = JSON.parse(body);
              imgUrl = j.url || j.imageUrl || j.image || j.link || j.data?.url || '';
            } catch {
              if (body.trim().startsWith('http')) imgUrl = body.trim();
            }
            if (imgUrl) {
              const imgFetch = await fetch(imgUrl);
              if (imgFetch.ok) {
                const buf = await imgFetch.arrayBuffer();
                imageBase64 = Buffer.from(buf).toString('base64');
                imageMimeType = imgFetch.headers.get('content-type') || 'image/jpeg';
                campaignImageUrl = imgUrl; // save for message document
                console.log(`[Campaign Worker] Image downloaded (${imageBase64.length} bytes base64, ${imageMimeType})`);
              }
            }
          }
        } catch (imgErr: any) {
          console.warn(`[Campaign Worker] Image fetch failed, falling back to text: ${imgErr.message}`);
        }
      }

      // LOG OBRIGATÓRIO: Sending to Evolution API...
      const sendEndpoint = imageBase64
        ? `${baseUrl}/message/sendMedia/${instance}`
        : `${baseUrl}/message/sendText/${instance}`;
      const sendPayload = imageBase64
        ? { number, mediatype: 'image', mimetype: imageMimeType, media: imageBase64, caption: messageText, delay: 1200 }
        : { number, text: messageText, delay: 1200, linkPreview: false };

      console.log(`[Campaign Worker] Sending to Evolution API...
- url: ${sendEndpoint}
- number: ${number}
- mode: ${imageBase64 ? 'image+caption' : 'text'}
- body:`, JSON.stringify(sendPayload, null, 2));

      const response = await fetch(sendEndpoint, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendPayload)
      });

      const responseText = await response.text();
      // LOG OBRIGATÓRIO: Evolution Response status and response
      console.log(`[Campaign Worker] Evolution Response:
- status: ${response.status}
- response: ${responseText}`);

      let responseData: any = {};
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {}

      if (!response.ok) {
        let errorMsg = responseData?.error || responseData?.message || `HTTP ${response.status} failed`;
        let isInvalidNumber = false;
        
        if (responseData?.response?.message && Array.isArray(responseData.response.message) && responseData.response.message.length > 0) {
           const info = responseData.response.message[0];
           if (info.exists === false) {
               errorMsg = 'Número não possui WhatsApp ativo.';
               isInvalidNumber = true;
           } else {
               errorMsg = JSON.stringify(responseData.response.message);
           }
        } else if (typeof responseData?.message === 'object') {
           errorMsg = JSON.stringify(responseData.message);
        } else if (typeof responseData?.response === 'string') {
           errorMsg = responseData.response;
        }

        const err = new Error(errorMsg) as any;
        err.isInvalidNumber = isInvalidNumber;
        throw err;
      }

      const remoteMessageId = responseData.key?.id || ('msg_camp_' + Date.now());
      // Seguro: `number` já passou pelo bloqueio de @lid e validação E164 acima,
      // portanto este JID é sempre canônico (telefone real), nunca um @lid convertido.
      const remoteJid = `${number}@s.whatsapp.net`;

      // Record successful dispatch
      await updateDoc(queueDocRef, {
        status: 'enviado',
        messageId: remoteMessageId,
        processedAt: Date.now()
      });

      console.log(`[Campaign Worker] Message successfully sent to ${queueItem.nome}. ID: ${remoteMessageId}`);

      // Update campaign general statistics
      await updateDoc(campaignRef, {
        'stats.enviados': increment(1),
        'stats.aguardando': increment(-1)
      });

      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'enviado', 'Mensagem enviada via Evolution API.', remoteMessageId, messageText);

      // Save Message to system wide messages to let it show up in CRM dashboards
      const msgRef = doc(collection(serverDb, 'messages'), remoteMessageId);
      await setDoc(msgRef, {
        id: remoteMessageId,
        chatId: chatIdVal,
        remoteJid: remoteJid,
        phoneE164: parsedPhone,
        instanceId: instanceId,
        instance: instanceId,
        contactId: queueItem.contactId,
        fromMe: true,
        direction: 'outbound',
        text: messageText,
        body: messageText,
        mediaType: imageBase64 ? 'image' : 'text',
        mediaUrl: campaignImageUrl,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        status: 'sent',
        campaignId: campaignId
      });

      // Update the chat document so the webhook knows there's an outbound message
      await setDoc(chatRef, {
        id: chatIdVal,
        contactId: queueItem.contactId,
        remoteJid: remoteJid,
        telefoneE164: `+${parsedPhone}`,
        pushName: queueItem.nome || 'Contato',
        lastMessage: messageText,
        lastMessageAt: serverTimestamp(),
        lastMessageDirection: 'outbound',
        instanceId: instanceId,
        updatedAt: serverTimestamp(),
        hasOutbound: true
      }, { merge: true });

      // Optionally update CRM contact's lastContactAt timestamp
      await updateDoc(doc(serverDb, 'contacts', queueItem.contactId), {
        lastContactAt: Date.now(),
        lastOutboundAt: Date.now(),
        lastCampaignAt: Date.now()
      });

    } catch (apiError: any) {
      console.error(`[Campaign Worker] API Failure sending to ${queueItem.nome}: ${apiError.message}`);
      const errorStr = apiError.message || String(apiError);

      // Inner try/catch: Firestore writes inside the catch must NOT propagate —
      // if they throw, the delay at step 8 would be skipped and the next contact
      // would be processed immediately, causing a burst of rapid sends.
      try {
        await updateDoc(queueDocRef, {
          status: 'falhou',
          error: errorStr,
          processedAt: Date.now()
        });
        await updateDoc(campaignRef, {
          'stats.falhas': increment(1),
          'stats.aguardando': increment(-1)
        });
        await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', `Falha Evolution API: ${errorStr}`);

        if (apiError.isInvalidNumber) {
          await updateDoc(doc(serverDb, 'contacts', queueItem.contactId), {
            optIn: false,
            status: 'invalid',
            notes: 'Desativado: Número não possui WhatsApp ativo (Detectado pela API da Evolution).',
            needsReview: true
          });
        }
      } catch (innerErr: any) {
        console.error('[Campaign Worker] Firestore write failed inside error handler (non-fatal):', innerErr?.message || innerErr);
      }
    }

    // 8. Anti-ban delay — runs after EVERY contact (success or failure).
    // Wrapped in try/catch with fallback so a settings-fetch error never skips the wait.
    try {
      const settingsPost = await getCachedSystemSettings();
      const dMin = settingsPost.delayMinMs || 35000;
      const dMax = settingsPost.delayMaxMs || 90000;
      const batchSize = settingsPost.batchSize || 20;
      const batchPause = settingsPost.batchPauseMs || 60000;

      batchCounter++;

      if (batchSize > 0 && batchCounter >= batchSize) {
        console.log(`[Campaign Worker] Batch limit of ${batchSize} reached. Applying batch pause of ${batchPause}ms...`);
        try {
          await createCampaignLog(campaignId, 'system', 'Worker', 'Segurança', 'enviado', `Pausa de segurança: ${batchPause / 1000}s após lote de ${batchSize} disparos.`);
          await updateDoc(campaignRef, { batchPauseUntil: Date.now() + batchPause, batchPauseDuration: batchPause });
        } catch { /* non-fatal */ }

        batchCounter = 0;
        await new Promise((resolve) => setTimeout(resolve, batchPause));

        try {
          await updateDoc(campaignRef, { batchPauseUntil: null });
        } catch { /* non-fatal */ }
      } else {
        const randomDelay = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin;
        console.log(`[Campaign Worker] Anti-ban delay: ${randomDelay}ms`);
        await new Promise((resolve) => setTimeout(resolve, randomDelay));
      }
    } catch (delayErr: any) {
      // Settings fetch failed — fall back to minimum safe delay to avoid burst
      const fallbackDelay = delayMin;
      console.error(`[Campaign Worker] Delay step failed, applying fallback ${fallbackDelay}ms:`, delayErr?.message || delayErr);
      await new Promise((resolve) => setTimeout(resolve, fallbackDelay));
    }
  }
}

/**
 * Uses Gemini (preferred) or OpenAI to generate creative text variations.
 */
async function generateVariatedText(template: string, contact: any): Promise<string> {
  const nome = contact.nome || 'Amigo(a)';
  const produto = contact.produto || contact.interesse || 'nossos produtos';
  const cidade = contact.cidade || '';
  
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENROUTER_API_KEY;

  const prompt = `Você é um gestor comercial experiente brasileiro personalizando contatos via WhatsApp.
Mensagem Original a ser variada:
"""
${template}
"""

Informações do Lead:
Nome: ${nome}
Produto de interesse: ${produto}
Cidade: ${cidade}

Escreva uma nova versão única, elegante e natural desta mensagem direcionada especificamente a esta pessoa.
REGRAS DE SEGURANÇA ANTIBAN:
1. Mantenha INTEGRALMENTE todos os links, cupons, preços, valores, datas ou informações contratuais que estiverem na mensagem original. Não mude, não remova e não fantasie dados.
2. Não utilize jargões robóticos. Escreva como se fosse um ser humano digitando agora no celular.
3. Se houver variáveis como {{nome}}, substitua por "${nome}". Se houver {{produto}}, substitua por "${produto}". Se houver {{cidade}}, substitua por "${cidade}".
4. Varie levemente o início ("Olá...", "E aí...", "Tudo bem...") ou o jeito de fazer a chamada final para evitar que redes de spam marquem o texto como cópia idêntica.
5. Retorne EXCLUSIVAMENTE a mensagem variada pronta. Absolutamente nenhuma outra introdução, aspas, notas explicativas ou tags markdown.`;

  // Try Google Gemini
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: geminiKey
      });
      const modelName = 'gemini-2.5-flash';
      console.log('[GEMINI MODEL]', modelName);
      console.log(`[AI Variator] Asking Gemini ${modelName} for variation...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt
      });
      const text = response.text?.trim();
      if (text) {
        console.log(`[AI Variator] Gemini successfully rephrased message!`);
        return text;
      }
    } catch (e: any) {
      console.warn(`[AI Variator] Gemini attempt failed (key may be suspended), falling back to OpenAI... Error: ${e.message}`);
    }
  }

  // Try OpenAI fallback
  if (openaiKey) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiKey, baseURL: 'https://openrouter.ai/api/v1' });
      console.log(`[AI Variator] Asking OpenRouter openai/gpt-4o-mini for variation...`);
      const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'openai/gpt-4o-mini',
        temperature: 0.6,
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        console.log(`[AI Variator] OpenAI successfully rephrased message!`);
        return text;
      }
    } catch (e) {
      console.warn('[AI Variator] OpenAI attempt failed, falling back to replace...');
    }
  }

  // Raw replacement fallback
  console.log(`[AI Variator] Using offline text replacement engine fallback...`);
  return template
    .replace(/{{nome}}/g, nome)
    .replace(/{{produto}}/g, produto)
    .replace(/{{cidade}}/g, cidade);
}

/**
 * Creates campaign logs in 'campaign_logs' collection for visibility
 */
async function createCampaignLog(
  campaignId: string,
  contactId: string,
  nome: string,
  telefoneE164: string,
  status: 'enviado' | 'entregue' | 'lido' | 'falhou' | 'completed' | 'paused',
  message?: string,
  messageId?: string,
  sentBody?: string
) {
  try {
    const logsColl = collection(serverDb, 'campaign_logs');
    const newLogRef = doc(logsColl);
    await setDoc(newLogRef, {
      id: newLogRef.id,
      campaignId,
      contactId,
      nome,
      telefoneE164,
      status,
      message: message || '',
      messageId: messageId || '',
      sentBody: sentBody || '',
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[Campaign Worker] Error saving log in Firestore:', err);
  }
}