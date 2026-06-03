import { collection, doc, setDoc, updateDoc, getDoc, query, where, getDocs, onSnapshot, increment, limit, getCountFromServer } from 'firebase/firestore';
import { serverDb } from './firebase';

const activeCampaigns = new Map<string, boolean>();

let cachedSystemSettings: any = null;
let lastSettingsFetchTime = 0;

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
        delayMinMs: 15000,
        delayMaxMs: 45000,
        dailyLimit: 1000,
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
 * Executes a specific campaign by scanning its pending queue items and processing them sequentially with delays.
 */
async function processCampaign(campaignId: string) {
  console.log(`[Campaign Worker] Starting work for campaign: ${campaignId}`);

  // Fetch campaign details
  const campaignRef = doc(serverDb, 'campaigns', campaignId);
  
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

    const delayMin = settings.delayMinMs || 15000;
    const delayMax = settings.delayMaxMs || 45000;
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
    const contactSnap = await getDoc(contactRef);
    
    if (!contactSnap.exists()) {
      console.warn(`[Campaign Worker] Processing failed: Contact ID ${queueItem.contactId} does not exist in Firestore.`);
      await updateDoc(queueDocRef, { status: 'falhou', error: 'Contato inexistente no CRM', processedAt: Date.now() });
      await updateDoc(campaignRef, { 
        'stats.falhas': increment(1),
        'stats.aguardando': increment(-1)
      });
      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', 'Contato excluído do banco de dados.');
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    const contact = contactSnap.data();
    if (!contact.optIn) {
      console.warn(`[Campaign Worker] Processing skipped: Contact "${queueItem.nome}" has optIn set to false.`);
      await updateDoc(queueDocRef, { status: 'falhou', error: 'Contato sem Opt-In ativo', processedAt: Date.now() });
      await updateDoc(campaignRef, { 
        'stats.falhas': increment(1),
        'stats.aguardando': increment(-1)
      });
      await createCampaignLog(campaignId, queueItem.contactId, queueItem.nome, queueItem.telefoneE164, 'falhou', 'Bloqueado: Contato desabilitou recebimento (opt-in falso).');
      await new Promise((resolve) => setTimeout(resolve, 500));
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
      await new Promise((resolve) => setTimeout(resolve, 500));
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
    try {
      const url = (process.env.EVOLUTION_API_URL || 'https://api.3dfans.pro').replace(/\/$/, '');
      const key = process.env.EVOLUTION_API_KEY || '3dfans123';
      const instance = process.env.EVOLUTION_INSTANCE || '3dfans';

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
        await new Promise((resolve) => setTimeout(resolve, 500));
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
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      // LOG OBRIGATÓRIO: Sending to Evolution API...
      console.log(`[Campaign Worker] Sending to Evolution API...
- url: ${url}/message/sendText/${instance}
- number: ${number}
- body:`, JSON.stringify({
          number: number,
          text: messageText,
          delay: 1200,
          linkPreview: false
        }, null, 2));

      const response = await fetch(`${url}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: number,
          text: messageText,
          delay: 1200,
          linkPreview: false
        })
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

      const instanceId = campaign.instanceId || 'default';
      const parsedPhone = number.replace(/[^\d]/g, '');
      const chatIdVal = `${instanceId}:${parsedPhone}`;

      // Save Message to system wide messages to let it show up in CRM dashboards
      const msgRef = doc(collection(serverDb, 'messages'), remoteMessageId);
      await setDoc(msgRef, {
        chatId: chatIdVal,
        remoteJid: remoteJid,
        phoneE164: parsedPhone,
        instanceId: instanceId,
        contactId: queueItem.contactId,
        direction: 'outbound',
        text: messageText,
        mediaType: 'text',
        timestamp: Date.now(),
        status: 'sent',
        campaignId: campaignId
      });

      // Optionally update CRM contact's lastContactAt timestamp
      await updateDoc(doc(serverDb, 'contacts', queueItem.contactId), {
        lastContactAt: Date.now()
      });

    } catch (apiError: any) {
      console.error(`[Campaign Worker] API Failure sending to ${queueItem.nome}: ${apiError.message}`);
      
      const errorStr = apiError.message || String(apiError);

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
         try {
            await updateDoc(doc(serverDb, 'contacts', queueItem.contactId), {
                optIn: false,
                status: 'invalid',
                notes: 'Desativado: Número não possui WhatsApp ativo (Detectado pela API da Evolution).',
                needsReview: true
            });
         } catch (e) {
            console.error('[Campaign Worker] Falha ao desativar contato inválido', e);
         }
      }
    }

    // 8. Execute anti-ban delay (warmup helper & delay)
    const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
    console.log(`[Campaign Worker] Applying anti-ban interval delay of ${randomDelay}ms before next message...`);
    await new Promise((resolve) => setTimeout(resolve, randomDelay));
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
  const openaiKey = process.env.OPENAI_API_KEY;

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
      const openai = new OpenAI({ apiKey: openaiKey });
      console.log(`[AI Variator] Asking OpenAI gpt-4o-mini for variation...`);
      const completion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o-mini',
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