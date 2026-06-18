import { adminDb } from "./firebase-admin";
import { serverDb } from "./firebase";
import { doc, getDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs, setDoc } from "firebase/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { randomBetween, sleep } from "../utils/time";
import { generateAIResponse, generateAIAudio, generateElevenLabsAudio, analyzeImageForSDR } from "./aiProviders";
import { getAgentConfig } from "./agentConfig";
import { resolveSDRState } from "../utils/sdrState";
import { downloadIncomingMedia } from "../services/media/downloadIncomingMedia";

// New Services
import { LeadStage } from "../services/crm/updateLeadStage"; // updateLeadStage is implicitly handled by setting leadStage directly
import { generatePreviewImage } from "../services/imageGeneration/generatePreviewImage";
import { sendEvolutionImage, sendEvolutionText, sendEvolutionAudio, sendPresence } from "../services/whatsapp/sendEvolutionImage";
import { logger } from "../services/logging/logger";

// Persistence Services
import { uploadPreviewToStorage } from "../services/previews/uploadPreviewToStorage";
import { savePreviewMetadata } from "../services/previews/savePreview";
import { getRelevantExamples, triggerConversationAnalysis } from "../services/learning/conversationMemory";
import { trackAIUsage, trackTTSUsage, trackElevenLabsTTSUsage, trackGeminiImageUsage } from "../services/metrics/aiUsageTracker";
import axios from "axios";

const TAG = 'SDR_ENGINE';

export const runSDR = async (chatId: string, _triggerMsgId?: string, mediaType?: string) => {
    const agentConfig = await getAgentConfig();
    
    if (!agentConfig.enabled) {
        logger.warn(TAG, 'AGENT GLOBALLY DISABLED');
        return;
    }

    logger.info(TAG, `[START] Processing Chat: ${chatId} | Argument mediaType: ${mediaType}`);
    const chatRef = doc(serverDb, 'chats', chatId);
    const systemConfigRef = doc(serverDb, 'system', 'system');
    
    try {
        const [chatSnap, systemSnap] = await Promise.all([
            getDoc(chatRef),
            getDoc(systemConfigRef)
        ]);
        
        if (!chatSnap.exists()) {
            logger.error(TAG, `Chat not found: ${chatId}`);
            return;
        }
        
        const chat = chatSnap.data();
        const systemConfig = systemSnap.exists() ? systemSnap.data() : null;

        // --- CONTEXT RESOLUTION ---
        const currentStage = (chat.leadStage as LeadStage) || 'greeting';
        logger.info(TAG, `[LEAD STAGE] ${currentStage}`);

        let contactData = null;
        if (chat.contactId) {
            const contactRef = doc(serverDb, 'contacts', chat.contactId);
            const contactSnap = await getDoc(contactRef);
            if (contactSnap.exists()) {
                contactData = contactSnap.data();
            }
        }

        const resolvedContactName = (contactData?.nome && contactData.nome !== contactData.telefoneRaw && contactData.nome !== contactData.telefoneE164) ? contactData.nome : null;
        const resolvedPushName = contactData?.pushName;
        const resolvedChatName = (chat.pushName && chat.pushName !== 'Contato') ? chat.pushName : null;
        const clientName = resolvedContactName || resolvedPushName || resolvedChatName || 'amigo';

        // --- SDR STATE & LOCKING ---
        const isSdrEnabled = resolveSDRState(chat, systemConfig as any);
        if (!isSdrEnabled || chat.sdrProcessing) {
            logger.info(TAG, `Chat locked or SDR disabled for ${chatId}`);
            return;
        }

        // Contact-level override: if the contact has SDR explicitly disabled, skip
        if (contactData?.sdrStatus === 'sdr_disabled') {
            logger.info(TAG, `SDR disabled at contact level for ${chat.contactId} — skipping`);
            return;
        }
        
        const msgsColl = collection(serverDb, 'messages');
        const msgsQuery = query(msgsColl, where('chatId', '==', chatId), orderBy('timestamp', 'desc'), limit(30));
        const msgsSnap = await getDocs(msgsQuery);
        const msgs = msgsSnap.docs.map(d => d.data()).reverse();

        // Use the passed mediaType or fallback to the last message in history
        const effectiveMediaType = mediaType || msgs[msgs.length - 1]?.mediaType || 'text';

        // Reset sdrProcessing if current message is not an image (to prevent stale states)
        if (effectiveMediaType !== 'image' && chat.sdrProcessing) {
            logger.info(TAG, '[SDR STATE] Resetting sdrProcessing for non-image message.');
            await setDoc(chatRef, { sdrProcessing: false, sdrProcessingSince: null }, { merge: true });
        }

        // 1. OBRIGATÓRIO: O SDR não inicia antes do Webhook terminar o upload.
        // Se a mensagem for imagem, mas ainda não houver originalImageUrl do lado do Chat, abortamos esta execução.
        // A próxima trigger (quando o uploadOriginal terminar e atualizar o firestore) vai re-acionar o SDR Engine.
        if (effectiveMediaType === 'image' && !chat?.originalImageUrl) {
            logger.info(TAG, '[SDR] Aborting execution: Waiting for webhook original image upload to finish.');
            return;
        }

        await setDoc(chatRef, { sdrProcessing: true, sdrProcessingSince: serverTimestamp() }, { merge: true });
        logger.info(TAG, '[SDR] Starting after upload');

        const lastMsg = msgs[msgs.length - 1];
        const triggerText = lastMsg?.text || '';

        const remoteJid = chat.remoteJid;
        const targetIdentifier = remoteJid.includes('@lid') ? remoteJid : chat.telefoneE164?.replace(/[^\d]/g, '');

        if (!targetIdentifier) throw new Error('Target identifier missing');

        let flowInstructions = "";
        let nextStage: LeadStage = currentStage;
        let sdrResponseHandled = false;

        // --- HARD MULTIMODAL FLOW FOR IMAGES ---
        if (effectiveMediaType === 'image') {
            logger.info(TAG, '[IMAGE FLOW] Starting multimodal image processing');

            const mediaBuffer = lastMsg?.mediaUrl
                ? await downloadIncomingMedia(lastMsg.mediaUrl).catch(() => null)
                : null;
            const imageSource: string | Buffer = mediaBuffer || chat.originalImageUrl;

            if (!imageSource) {
                logger.error(TAG, '[IMAGE FLOW] No image source available');
                sdrResponseHandled = true;
                return;
            }

            // 1. Extract customer description — from caption or recent text messages
            const rawCaption = lastMsg?.text || '';
            const captionText = !rawCaption.startsWith('[') ? rawCaption.trim() : '';

            const recentCustomerTexts = msgs
                .filter(m => !m.fromMe && m.mediaType !== 'image' && m.text &&
                             !m.text.startsWith('[') && m.text.length > 3)
                .slice(-4)
                .map(m => m.text)
                .join(' ')
                .trim();

            const customerDescription = captionText || recentCustomerTexts || '';
            logger.info(TAG, `[IMAGE FLOW] Customer description: "${customerDescription || '(none)'}"`);

            // 2. Vision analysis — understand what's in the image
            let visionResult = { sdrSummary: '', detailedDescription: 'The subject in the reference photo' };
            if (mediaBuffer) {
                try {
                    visionResult = await analyzeImageForSDR(mediaBuffer);
                    logger.info(TAG, `[IMAGE FLOW] Vision summary: ${visionResult.sdrSummary}`);
                } catch (visionErr) {
                    logger.warn(TAG, '[IMAGE FLOW] Vision analysis failed, continuing without it', visionErr);
                }
            }

            // 3. Send personalized acknowledgment before generation starts
            const visionPart = visionResult.sdrSummary ? `${visionResult.sdrSummary}. ` : '';
            const descPart = customerDescription ? `Entendi que você quer ${customerDescription}. ` : '';
            const ackText = `${visionPart}${descPart}Estou criando sua miniatura agora! Isso leva alguns minutinhos, mas o resultado vai ficar incrível ✨`;

            await adminDb.collection('chats').doc(chatId).set({
                leadStage: 'generating_preview',
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            await sendPresence(targetIdentifier);
            await sendEvolutionText(targetIdentifier, ackText);

            // 4. Generate preview with image + customer description
            try {
                const startTime = Date.now();
                const generationDescription = customerDescription || visionResult.detailedDescription;

                logger.info(TAG, '[IMAGE FLOW] Calling generatePreviewImage');
                const publicUrl = await generatePreviewImage(imageSource, 2, generationDescription);
                trackGeminiImageUsage(1)
                    .catch(err => logger.error(TAG, 'Gemini image usage tracking failed', err));

                // 5. Persist preview to storage + Firestore (fire-and-forget on failure)
                try {
                    const imageRes = await axios.get(publicUrl, { responseType: 'arraybuffer' });
                    const previewBuffer = Buffer.from(imageRes.data);

                    const storageResult = await uploadPreviewToStorage({
                        buffer: previewBuffer,
                        contactId: chat.contactId,
                        customerName: clientName,
                        customerPhone: chat.telefoneE164 || '',
                        chatId,
                    });

                    await savePreviewMetadata({
                        previewId: `prev_${Date.now()}`,
                        chatId,
                        contactId: chat.contactId,
                        customerName: clientName,
                        customerPhone: chat.telefoneE164 || '',
                        previewImageUrl: storageResult.publicUrl,
                        previewStoragePath: storageResult.storagePath,
                        originalImageUrl: chat.originalImageUrl || '',
                        generationStatus: 'success',
                        generationTimeMs: Date.now() - startTime,
                        quoteValue: 597,
                        crmInstance: process.env.EVOLUTION_INSTANCE || '3dfans2',
                    });

                    logger.info(TAG, '[IMAGE FLOW] Preview persisted');
                } catch (persistErr) {
                    logger.error(TAG, '[IMAGE FLOW] Persistence failed, continuing with send', persistErr);
                }

                // 6. Send preview image + quote
                await sendEvolutionImage(targetIdentifier, publicUrl, '🔥 Aqui está uma prévia da sua miniatura 3DFans! O que achou?');

                const quoteMsg = `✨ Sua miniatura ficaria perfeita assim!\n\n• 16cm premium resinada\n• Pintura artesanal Vallejo\n• Base personalizada\n\n💰 Valor: R$ 597\n🚚 Frete grátis para você!`;
                await sleep(5000);
                await sendEvolutionText(targetIdentifier, quoteMsg);

                await adminDb.collection('chats').doc(chatId).set({
                    previewUrl: publicUrl,
                    previewGeneratedAt: Date.now(),
                    previewStatus: 'success',
                    leadStage: 'preview_sent',
                    lastMessage: '[Prévia e Orçamento Enviados]',
                    leadScore: FieldValue.increment(30),
                }, { merge: true });

                logger.info(TAG, '[IMAGE FLOW] Preview sent successfully');
            } catch (genErr) {
                logger.error(TAG, '[IMAGE FLOW] Generation failed', genErr);
                await sendEvolutionText(targetIdentifier,
                    `Tive um probleminha técnico para gerar sua prévia 😅 Mas não se preocupe — nossa equipe foi notificada e vai criar manualmente. Em breve você recebe ✨`
                );
                await adminDb.collection('chats').doc(chatId).set({
                    previewStatus: 'error',
                    leadStage: 'collecting_reference',
                }, { merge: true });
            }

            sdrResponseHandled = true;
            return;
        }

        // --- INTENT DETECTION from client's last message ---
        const lowerTrigger = triggerText.toLowerCase();
        const clientAskingPrice  = /quanto|preço|valor|custa|custo|pagar|pagamento|parcel|forma de pag/i.test(lowerTrigger);
        const clientBuyingIntent = /quero comprar|vou comprar|fechar|quero pedir|me manda o link|como (pago|compro|faço o pedido)|quero fazer|bora|aceito|topo|vou levar|quero (a miniatura|encomendar)|pode gerar|gera o link|link de pagamento/i.test(lowerTrigger);
        const clientObjection    = /caro|muito (caro|dinheiro)|não tenho|não posso|acho que não|talvez depois|depois eu|não sei|pensando/i.test(lowerTrigger);
        const clientHasQuestion  = triggerText.includes('?') || /como (funciona|é feito|fica|demora|é o processo)|quanto tempo|onde (fica|é feito|produz)|me (conta|fala|explica)|o que é|qual é a diferença|é artesanal|é manual|é resina|é impressão/i.test(lowerTrigger);

        const clientAskingTracking = /rastreio|rastrear|rastreamento|c[oó]digo.{0,20}pedido|pedido.{0,20}c[oó]digo|status.{0,20}pedido|pedido.{0,20}status|status.{0,20}entrega|entrega.{0,20}status|qual.{0,15}status|onde.{0,20}pedido|meu pedido|acompanhar.*pedido|foi entregue|chegou|chegando|previs[aã]o.{0,20}entrega|data.{0,20}entrega|quando chega|quando vai chegar|entrega|n[uú]mero.{0,20}pedido|pedido.{0,20}n[uú]mero|minha encomenda|minha compra/i.test(lowerTrigger);

        logger.info(TAG, `[INTENT] askingPrice=${clientAskingPrice} buyingIntent=${clientBuyingIntent} objection=${clientObjection} hasQuestion=${clientHasQuestion} askingTracking=${clientAskingTracking} | trigger="${triggerText.slice(0, 80)}"`);

        // --- TRACKING INTERCEPTOR — fires before the stage switch ---
        if (clientAskingTracking) {
            // Set immediately so the AI sales flow NEVER runs for tracking queries,
            // even if the API call or Firestore writes fail below.
            sdrResponseHandled = true;
            logger.info(TAG, '[TRACKING] Order tracking request detected');

            const rawPhone = (chat.telefoneE164 || '').replace(/\D/g, ''); // e.g. "557398328844"
            const stripped = rawPhone.replace(/^55/, '');                   // e.g. "7398328844"
            const phoneWith9    = stripped.length === 10 ? stripped.slice(0, 2) + '9' + stripped.slice(2) : stripped; // "73998328844"
            const phoneWithout9 = stripped.length === 11 && stripped[2] === '9' ? stripped.slice(0, 2) + stripped.slice(3) : stripped; // "7398328844"
            const phoneWith55   = rawPhone; // "557398328844" — original with country code, no +

            // Candidate formats to try in order
            const phoneCandidates = [...new Set([phoneWith9, phoneWithout9, phoneWith55])];

            const STATUS_LABELS: Record<string, string> = {
                received:  '📋 Pedido recebido',
                pending:   '⏳ Aguardando produção',
                printing:  '🖨️ Em impressão',
                painting:  '🎨 Em pintura',
                finishing: '✨ Em acabamento',
                quality:   '🔍 Controle de qualidade',
                shipped:   '🚚 Enviado / Em trânsito',
                delivered: '✅ Entregue',
                cancelled: '❌ Cancelado',
            };

            try {
                // Try each phone format until one returns a non-404 response
                let trackRes = await axios.get(
                    `https://pedidos.3dfans.pro/api/track?phone=${phoneCandidates[0]}`,
                    { timeout: 8000, validateStatus: (s) => s < 500 }
                );
                let apiPhone = phoneCandidates[0];

                for (let i = 1; i < phoneCandidates.length && trackRes.status === 404; i++) {
                    logger.info(TAG, `[TRACKING] 404 with phone=${apiPhone}, retrying with ${phoneCandidates[i]}`);
                    trackRes = await axios.get(
                        `https://pedidos.3dfans.pro/api/track?phone=${phoneCandidates[i]}`,
                        { timeout: 8000, validateStatus: (s) => s < 500 }
                    );
                    apiPhone = phoneCandidates[i];
                }

                logger.info(TAG, `[TRACKING] API status=${trackRes.status} phone=${apiPhone}`);

                // Response format: { orders: [ { id, title, status, customerName, deliveryDate, photo, trackingLink } ] }
                const orders = (trackRes.data?.orders as any[] | undefined) ?? [];
                const order = orders[0] ?? null;

                await sendPresence(targetIdentifier, 'composing');
                await sleep(randomBetween(2, 3) * 1000);

                if (trackRes.status === 404 || !order) {
                    const searchLink = `https://pedidos.3dfans.pro/?track=${phoneWith9}`;
                    await sendEvolutionText(
                        targetIdentifier,
                        `Não encontrei nenhum pedido vinculado a este número 🤔\n\nVocê pode consultar diretamente aqui:\n${searchLink}\n\nOu me passa o número do pedido que verifico agora pra você!`
                    );
                } else {
                    const statusLabel = STATUS_LABELS[order.status] || order.status || 'Em andamento';
                    const deliveryDate = order.deliveryDate
                        ? new Date(order.deliveryDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : null;

                    // Fix trackingLink: replace localhost with production domain
                    const trackingLink = (order.trackingLink as string || '')
                        .replace(/https?:\/\/localhost(:\d+)?/, 'https://pedidos.3dfans.pro');

                    let trackMsg = `📦 *Pedido de ${order.customerName || order.title}*\n\n`;
                    trackMsg += `Status: ${statusLabel}\n`;
                    if (deliveryDate) trackMsg += `Previsão de entrega: *${deliveryDate}*\n`;
                    trackMsg += `\n🔗 Acompanhe em tempo real:\n${trackingLink}`;

                    await sendEvolutionText(targetIdentifier, trackMsg);

                    if (order.photo?.startsWith('http')) {
                        await sleep(1200);
                        await sendEvolutionImage(
                            targetIdentifier,
                            order.photo,
                            '📸 Foto do andamento do seu pedido'
                        ).catch((e: any) => logger.warn(TAG, '[TRACKING] photo send failed', e?.message));
                    }
                }

            } catch (trackErr: any) {
                logger.error(TAG, '[TRACKING] API error', trackErr?.message);
                await sendPresence(targetIdentifier, 'composing');
                await sleep(1500);
                await sendEvolutionText(
                    targetIdentifier,
                    `Tive um probleminha para acessar o sistema de pedidos agora 😅 Me passa o número do pedido que verifico manualmente!`
                ).catch(() => {});
            }

            setDoc(doc(collection(serverDb, 'messages'), `sdr_track_${chatId}_${Date.now()}`), {
                chatId, remoteJid: chat.remoteJid || '', contactId: chat.contactId || '',
                fromMe: true, direction: 'outbound',
                text: '[Status do pedido enviado]', body: '[Status do pedido enviado]',
                mediaType: 'text', timestamp: serverTimestamp(), createdAt: serverTimestamp(),
                status: 'sent', source: 'sdr',
            }, { merge: true }).catch(err => logger.error(TAG, 'Failed to save tracking msg', err));

            setDoc(chatRef, {
                lastMessage: '[Status do pedido enviado]',
                lastMessageAt: serverTimestamp(),
                lastMessageDirection: 'outbound',
            }, { merge: true }).catch(err => logger.error(TAG, 'Failed to update chat after tracking', err));

            // Tracking handled — skip all sales AI flow
            return;
        }

        // --- MODO RASTREIO: ignora silenciosamente qualquer mensagem não relacionada a pedidos ---
        if (agentConfig.modoRastreio) {
            logger.info(TAG, '[MODO RASTREIO] Non-tracking message ignored silently');
            return;
        }

        // If client asked a question, always answer it first — injected into every flowInstruction
        const questionNote = clientHasQuestion
            ? '\nATENÇÃO: O cliente fez uma pergunta — responda ESSA pergunta de forma direta e clara antes de qualquer outra coisa.'
            : '';

        // --- CRM CONTROLLED FLOW ENGINE ---
        if (!sdrResponseHandled) switch (currentStage) {
            case 'greeting':
                flowInstructions = `Primeiro contato. Seja autêntica e animada — não exagere, mas mostre que você genuinamente adora o que faz. Apresente-se como Laura da 3DFans. Com curiosidade real, pergunte quem o cliente quer transformar em miniatura: uma pessoa especial, um pet, um personagem favorito? Uma ou duas frases, leve e calorosa.${questionNote}`;
                nextStage = 'collecting_reference';
                break;

            case 'collecting_reference':
                if (clientBuyingIntent) {
                    flowInstructions = `O cliente demonstrou que quer comprar. Acolha o entusiasmo dele de forma genuína — não seja fria nem robótica. Confirme que é R$597 com frete grátis, Pix ou parcelado em 12x no cartão. Para que a miniatura fique única e personalizada, peça a foto da pessoa ou pet que vai virar arte. Deixe claro que isso é o que torna cada peça especial.${questionNote}`;
                    nextStage = 'negotiating';
                } else if (clientAskingPrice) {
                    flowInstructions = `O cliente quer saber o preço. Responda sem hesitar e com naturalidade: R$597 com frete grátis pra qualquer lugar do Brasil. Não liste especificações como catálogo — diga em conversa o que está incluso e por que vale. Depois, com entusiasmo genuíno, diga que com a foto fica ainda mais especial e personalizado.${questionNote}`;
                    nextStage = 'collecting_reference';
                } else if (clientObjection) {
                    flowInstructions = `O cliente hesitou ou achou caro. NÃO entre em modo de vendedor ansioso. Acolha a hesitação com empatia real: 'entendo, não é barato mesmo'. Depois reframe com convicção: não é um produto, é uma obra de arte feita à mão, exclusiva, que dura a vida inteira. Mencione as parcelas de forma natural. Plante a semente — não force.${questionNote}`;
                    nextStage = 'negotiating';
                } else {
                    flowInstructions = `O cliente está engajado mas ainda não enviou a foto. Continue a conversa de forma natural — não pressione. Mostre entusiasmo pelo projeto específico dele. Instigue a curiosidade: como será quando a pessoa ou pet virar arte? Convide a foto de forma leve, como se fosse o próximo passo óbvio e empolgante. Não repita o que já foi dito.${questionNote}`;
                    nextStage = 'collecting_reference';
                }
                break;

            case 'generating_preview':
                flowInstructions = `A prévia está sendo criada. Seja divertida e gere antecipação — tipo 'tô ansiosa pra ver o resultado'. Tom de quem está genuinamente empolgada com o projeto. Uma ou duas frases curtas.${questionNote}`;
                nextStage = 'generating_preview';
                break;

            case 'preview_sent':
            case 'negotiating': {
                logger.info(TAG, '[FLOW EXECUTED] PRICE FLOW');
                logger.info(TAG, `[PRICE FLOW DEBUG] leadStage: ${chat.leadStage}, chatId: ${chatId}, contactId: ${chat.contactId}`);

                if (clientBuyingIntent) {
                    flowInstructions = `O cliente quer fechar! Combine o entusiasmo dele — seja genuinamente feliz por isso. De forma prática e calorosa, pergunte se prefere Pix ou cartão e diga que o link vem na hora. Sem enrolação.${questionNote}`;
                    nextStage = 'checkout';
                } else if (clientObjection) {
                    flowInstructions = `O cliente hesita no preço. Não tente convencer na força — use empatia. Reconheça que R$597 é um investimento. Contextualize com convicção: é uma miniatura exclusiva, feita à mão por artistas, que vai durar anos e se tornar um item especial. Mencione as parcelas sem pressa. Uma ou duas frases, calorosas e sem pressão.${questionNote}`;
                    nextStage = 'negotiating';
                } else {
                    flowInstructions = `Continue a negociação com naturalidade. Fale sobre o valor de R$597 com confiança — você acredita nesse produto. Escolha UM ponto forte para destacar agora (não liste tudo de uma vez). Direcione para o fechamento com uma pergunta direta e calorosa: Pix ou cartão?${questionNote}`;
                    nextStage = 'negotiating';
                }

                if (!chat.contactId) {
                    logger.error(TAG, '[PRICE FLOW ERROR] Missing contactId. Cannot update leadScore.');
                } else {
                    logger.info(TAG, `[PRICE FLOW DEBUG] Attempting to get contact document for contactId: ${chat.contactId}`);
                    const contactRef = adminDb.collection('contacts').doc(chat.contactId);
                    const contactSnap = await contactRef.get();
                    logger.info(TAG, `[PRICE FLOW DEBUG] Contact document path: ${contactRef.path}, exists: ${contactSnap.exists}`);
                    if (!contactSnap.exists) {
                        logger.warn(TAG, `[PRICE FLOW WARNING] Contact document does not exist for contactId: ${chat.contactId}. Creating it with initial leadScore.`);
                    }
                    await contactRef.set({ leadScore: FieldValue.increment(40), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                    logger.info(TAG, `[PRICE FLOW DEBUG] leadScore updated for contactId: ${chat.contactId}`);
                }
                break;
            }

            case 'checkout': {
                logger.info(TAG, '[FLOW EXECUTED] CHECKOUT FLOW');
                flowInstructions = `Momento de fechar. Seja prática, calorosa e rápida — o cliente já decidiu. Confirme a escolha, pergunte Pix ou cartão e diga que o link chega agora. Máximo duas frases.${questionNote}`;
                nextStage = 'checkout';
                if (chat.contactId) await adminDb.collection('contacts').doc(chat.contactId).set({ leadScore: FieldValue.increment(70) }, { merge: true });
                break;
            }

            default:
                flowInstructions = `O cliente disse algo fora do fluxo principal. Responda de forma genuína e humana ao que ele disse — não ignore nem redirecione abruptamente. Se for pergunta sobre processo, entrega, qualidade ou materiais: responda com clareza e boa energia. Depois, com naturalidade, traga de volta ao tema das miniaturas. Seja uma pessoa interessante, não um bot.${questionNote}`;
                break;
        }

        if (sdrResponseHandled) return;

        // --- CONTEXT BUILDING ---

        // Build conversation context — label customer audio transcriptions clearly
        const conversationContext = msgs.map(m => {
            const speaker = m.fromMe ? agentConfig.agentName : 'Lead';
            if (m.text?.startsWith('[Áudio Transcrito]')) {
                const clean = m.text.replace('[Áudio Transcrito]: ', '').replace('[Áudio Transcrito]:', '').trim();
                return `${speaker} [áudio]: ${clean}`;
            }
            return `${speaker}: ${m.text || ''}`;
        }).join('\n');

        const runtimeContext = `\n--- RUNTIME CONTEXT ---\nleadStage: ${currentStage}\ncustomerName: ${clientName}\nhasReferenceImage: ${chat?.hasOriginalImage || !!chat?.originalImageUrl}\npreviewStatus: ${chat?.previewStatus || 'none'}\nmediaType: ${effectiveMediaType || 'text'}\n-----------------------\n`;

        // Anti-repetition: last SDR audio responses stored in chat (max 8)
        const sdrAudioLog: { text: string; ts: number }[] = chat.sdrAudioLog || [];
        const antiRepetitionBlock = sdrAudioLog.length > 0
            ? `\n--- SUAS ÚLTIMAS RESPOSTAS EM ÁUDIO (NÃO REPITA ESTAS FRASES OU INFORMAÇÕES) ---\n${sdrAudioLog.slice(-8).map(e => `- "${e.text}"`).join('\n')}\n---\n`
            : '';

        // Inject learned examples from past successful conversations (empty string if none yet)
        const salesExamples = await getRelevantExamples(currentStage);

        // Audio mode: resolve current state from chat doc, then decide via conditions or fallback
        const currentAudioMode: boolean = chat.audioMode ?? false;
        let resolvedAudioMode = currentAudioMode;

        let audioInstruction = "";
        if (agentConfig.respondWithAudio) {
            const hasConditions = !!(agentConfig.audioStartCondition || agentConfig.audioStopCondition);

            if (hasConditions) {
                // Condition-based: AI signals [USAR_ÁUDIO] or [USAR_TEXTO] at start of response
                const startCond = agentConfig.audioStartCondition || "quando o cliente enviar áudio";
                const stopCond  = agentConfig.audioStopCondition  || "quando o cliente enviar mensagem de texto após estar em modo áudio";
                audioInstruction = `

CONTROLE DE MODO ÁUDIO:
Modo atual: ${currentAudioMode ? 'ÁUDIO' : 'TEXTO'}
Condição para INICIAR áudio: ${startCond}
Condição para PARAR áudio e voltar ao texto: ${stopCond}

Analise o histórico da conversa e decida se o modo deve mudar.
Coloque UMA das tags abaixo na PRIMEIRA linha da sua resposta (antes de qualquer texto):
[USAR_ÁUDIO] — se a resposta deve ser enviada como áudio
[USAR_TEXTO] — se a resposta deve ser enviada como texto

REGRAS EXTRAS EXCLUSIVAS DO ÁUDIO (quando usar [USAR_ÁUDIO]):
- Escreva como FALA, não como escreve — linguagem oral e natural.
- PROIBIDO: emojis, listas, bullets, asteriscos, hífens, qualquer markdown (são lidos em voz alta).`;
            } else {
                // Legacy: respond with audio only if current message is audio
                if (effectiveMediaType === 'audio') {
                    resolvedAudioMode = true;
                    audioInstruction = `

MODO ÁUDIO — REGRAS EXTRAS EXCLUSIVAS DO TTS:
- Escreva como FALA, não como escreve — linguagem oral e natural.
- PROIBIDO: emojis, listas, bullet points, asteriscos, hífens, markdown (são lidos em voz alta e ficam estranhos).
- PROIBIDO: mencionar que gosta de conversar por áudio ou que ouve bem.`;
                }
            }
        }

        const identityBlock = `IDENTIDADE OBRIGATÓRIA (PRIORIDADE MÁXIMA — sobrepõe qualquer outra instrução):
- Seu nome é: ${agentConfig.agentName}
- Seu cargo é: ${agentConfig.agentRole}
- Sua personalidade: ${agentConfig.personality}
- Nunca use outro nome. Nunca diga que é uma IA ou robô.

`;

        const humanStyleBlock = `REGRAS DE RESPOSTA — OBRIGATÓRIAS SEMPRE (texto e áudio):
- OBRIGATÓRIO: responda SEMPRE à última mensagem do lead — ela é o ponto de partida.
- OBRIGATÓRIO: máximo 2 a 3 frases por resposta. Nunca despeje tudo de uma vez.
- OBRIGATÓRIO: varie SEMPRE o início das mensagens — nunca use o mesmo padrão duas vezes.
- PROIBIDO: começar com "Claro!", "Ótimo!", "Com certeza!", "Perfeito!", "Entendido!".
- PROIBIDO: repetir frases ou informações já dadas nesta conversa.
- PROIBIDO: se apresentar novamente se já existe histórico de conversa.
- Use linguagem informal e calorosa: "olha", "cara", "então", "né", "sabe?", "imagina".
- Cada mensagem deve parecer escrita na hora, para aquela pessoa. Nunca soe como script.

`;

        const systemInstruction = `${identityBlock}${agentConfig.promptBase}\n\n${humanStyleBlock}${runtimeContext}${antiRepetitionBlock}${salesExamples}\n\nOBJETIVO DESTA RESPOSTA — SIGA EXATAMENTE ISTO:\n${flowInstructions}${audioInstruction}`;

        const ttsVoice = agentConfig.ttsVoice || 'nova';
        logger.info(TAG, `[SDR CONFIG] respondWithAudio: ${agentConfig.respondWithAudio} | mediaType: ${effectiveMediaType} | ttsVoice: ${ttsVoice} | ttsProvider: ${agentConfig.ttsProvider} | elevenLabsVoiceId: "${agentConfig.elevenLabsVoiceId}"`);
        logger.info(TAG, `[PROMPT CONFIG] NextStage: ${nextStage}`);

        const { response: responseText, provider, usage } = await generateAIResponse(`Histórico:\n${conversationContext}`, systemInstruction, agentConfig.temperature, chat.originalImageUrl);

        if (responseText) {
            // Parse audio mode signal from AI response (condition-based mode only)
            let rawText = responseText;
            const hasConditions = agentConfig.respondWithAudio &&
                !!(agentConfig.audioStartCondition || agentConfig.audioStopCondition);
            if (hasConditions) {
                const audioSignal = rawText.match(/^\[USAR_(ÁUDIO|AUDIO|TEXTO)\]/i);
                if (audioSignal) {
                    const wantsAudio = /ÁUDIO|AUDIO/i.test(audioSignal[1]);
                    resolvedAudioMode = wantsAudio;
                    rawText = rawText.replace(audioSignal[0], '').trimStart();
                    // Persist mode change to Firestore only when it actually changes
                    if (wantsAudio !== currentAudioMode) {
                        await adminDb.collection('chats').doc(chatId).update({ audioMode: wantsAudio });
                        logger.info(TAG, `[AUDIO MODE] switched to ${wantsAudio ? 'ÁUDIO' : 'TEXTO'}`);
                    }
                } else {
                    // AI didn't signal — keep current mode
                    resolvedAudioMode = currentAudioMode;
                }
            }

            // Sanitize markdown that WhatsApp renders literally
            // [display text](url) → url  |  **bold** → *bold*  |  strip ``` blocks
            const sanitizedText = rawText
                .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$2')  // markdown links → plain URL
                .replace(/\*\*([^*]+)\*\*/g, '*$1*')                      // **bold** → *bold* (WhatsApp)
                .replace(/```[\s\S]*?```/g, '')                           // strip code blocks
                .trim();

            if (agentConfig.respondWithAudio && resolvedAudioMode) {
                try {
                    // Strip emojis and all markdown before TTS
                    const cleanTextForAudio = sanitizedText
                        .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
                        .replace(/[*_~`#>]/g, '')
                        .replace(/\n+/g, ' ')
                        .trim();

                    if (cleanTextForAudio.length > 5) {
                        const useElevenLabs = agentConfig.ttsProvider === 'elevenlabs' && !!agentConfig.elevenLabsVoiceId;
                        logger.info(TAG, `[TTS] Provider: ${useElevenLabs ? 'elevenlabs' : 'openai'}, voice: ${useElevenLabs ? agentConfig.elevenLabsVoiceId : ttsVoice}`);
                        await sendPresence(targetIdentifier, 'recording');
                        const base64Audio = useElevenLabs
                            ? await generateElevenLabsAudio(cleanTextForAudio, agentConfig.elevenLabsVoiceId)
                            : await generateAIAudio(cleanTextForAudio, ttsVoice);
                        (useElevenLabs ? trackElevenLabsTTSUsage : trackTTSUsage)(cleanTextForAudio.length)
                            .catch(err => logger.error(TAG, 'TTS usage tracking failed', err));
                        await sleep(randomBetween(2, 4) * 1000);
                        await sendEvolutionAudio(targetIdentifier, base64Audio);

                        // Persist this response text so future turns avoid repeating it
                        const updatedLog = [...sdrAudioLog, { text: cleanTextForAudio, ts: Date.now() }].slice(-8);
                        await adminDb.collection('chats').doc(chatId).update({ sdrAudioLog: updatedLog });
                    } else {
                        await sendPresence(targetIdentifier, 'composing');
                        await sleep(randomBetween(5, 10) * 1000);
                        await sendEvolutionText(targetIdentifier, sanitizedText);
                    }
                } catch (ttsErr) {
                    logger.error(TAG, 'TTS Generation failed, falling back to text only', ttsErr);
                    await sendPresence(targetIdentifier, 'composing');
                    await sleep(randomBetween(5, 10) * 1000);
                    await sendEvolutionText(targetIdentifier, sanitizedText);
                }
            } else {
                await sendPresence(targetIdentifier, 'composing');
                await sleep(randomBetween(5, 10) * 1000);
                await sendEvolutionText(targetIdentifier, sanitizedText);
            }

            // Persist SDR response to messages collection so future turns have full conversation context.
            // Evolution API may not reliably echo back fromMe audio messages with text content.
            const sdrMsgId = `sdr_out_${chatId}_${Date.now()}`;
            setDoc(doc(collection(serverDb, 'messages'), sdrMsgId), {
                id: sdrMsgId,
                messageId: sdrMsgId,
                chatId,
                remoteJid: chat.remoteJid || '',
                contactId: chat.contactId || '',
                fromMe: true,
                direction: 'outbound',
                text: sanitizedText,
                body: sanitizedText,
                mediaType: (agentConfig.respondWithAudio && resolvedAudioMode) ? 'audio' : 'text',
                timestamp: serverTimestamp(),
                createdAt: serverTimestamp(),
                status: 'sent',
                source: 'sdr',
            }, { merge: true }).catch(err => logger.error(TAG, 'Failed to save SDR response to messages', err));

            await setDoc(chatRef, {
                lastMessage: responseText,
                lastMessageAt: serverTimestamp(),
                leadStage: nextStage,
                lastMessageDirection: 'outbound',
                aiProvider: provider
            }, { merge: true });
            logger.info(TAG, `[SDR RESPONSE] Sent via ${provider} (in=${usage.inputTokens} out=${usage.outputTokens})`);

            // Fire-and-forget: track token usage and cost
            if (provider === 'gemini' || provider === 'openai') {
                trackAIUsage(provider, usage.inputTokens, usage.outputTokens)
                    .catch(err => logger.error(TAG, 'Usage tracking failed', err));
            }

            // Fire-and-forget: analyze conversation at key stages to learn what works
            if ((nextStage === 'negotiating' || nextStage === 'checkout') && chat.contactId) {
                triggerConversationAnalysis(chatId, chat.contactId, nextStage, msgs as { fromMe: boolean; text?: string }[]);
            }

            sdrResponseHandled = true;
        }

    } catch (e: any) {
        logger.error(TAG, '[FATAL ERROR]', e);
    } finally {
        await setDoc(chatRef, { sdrProcessing: false, sdrProcessingSince: null }, { merge: true });
        logger.info(TAG, `[FINISH] Chat: ${chatId}`);
    }
};
