import { serverDb } from "./firebase";
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs, increment, setDoc } from "firebase/firestore";
import { randomBetween, sleep } from "../utils/time";
import { sendEvolutionMessage } from "./evolution";
import { generateAIResponse } from "./aiProviders";
import { getAgentConfig } from "./agentConfig";
import { resolveSDRState } from "../utils/sdrState";

console.log('[AGENT ENGINE MODULE LOADED]');

export const runSDR = async (chatId: string) => {
    const agentConfig = await getAgentConfig();
    const tag = `[${agentConfig.agentName.toUpperCase()}]`;
    
    if (!agentConfig.enabled) {
        console.log(`${tag} AGENT GLOBALLY DISABLED`);
        return;
    }

    console.log(`${tag} START`, { chatId });
    const chatRef = doc(serverDb, 'chats', chatId);
    const systemConfigRef = doc(serverDb, 'system', 'system');
    
    try {
        console.log(`${tag} STEP 1`, { chatId });
        const [chatSnap, systemSnap] = await Promise.all([
            getDoc(chatRef),
            getDoc(systemConfigRef)
        ]);
        
        if (!chatSnap.exists()) {
            console.log(`${tag} CHAT NOT FOUND`, { chatId });
            return;
        }
        
        const chat = chatSnap.data();
        const systemConfig = systemSnap.exists() ? systemSnap.data() : null;

        const isEnabled = resolveSDRState(chat, systemConfig as any);

        if (chat.sdrProcessing || !isEnabled) {
            console.log(`${tag} LOCKED or DISABLED`, { 
                chatId, 
                sdrProcessing: chat.sdrProcessing, 
                isEnabled,
                humanTakeover: chat.humanTakeover,
                sdrEnabled: chat.sdrEnabled,
                globalSDREnabled: systemConfig?.globalSDREnabled
            });
            return;
        }
        
        console.log(`${tag} STEP 2`, { chatId });
        await updateDoc(chatRef, { sdrProcessing: true });
        
        console.log(`${tag} STEP 3`, { chatId });
        const msgsColl = collection(serverDb, 'messages');
        const msgsQuery = query(msgsColl, where('chatId', '==', chatId), orderBy('timestamp', 'desc'), limit(15));
        const msgsSnap = await getDocs(msgsQuery);
        const msgs = msgsSnap.docs.map(d => d.data()).reverse();
        
        const context = msgs.map(m => `${m.fromMe ? (agentConfig.agentName + ':') : 'Lead:'} ${m.text}`).join('\n');
        
        const systemInstruction = `Você é ${agentConfig.agentName}, ${agentConfig.agentRole} da 3DFans.
Personalidade: ${agentConfig.personality}
${agentConfig.promptBase || ''}

Objetivo:
- Responder naturalmente ao lead
- Manter conversa agradável
- Português brasileiro natural

REGRAS:
- Respostas curtas
- Tom humano
- Não parecer robô
- Não inventar preços ou prazos
- Não enviar mensagens enormes
- Não enviar múltiplas mensagens seguidas`;

        const prompt = `Contexto da Conversa:\n${context}`;
        
        console.log(`${tag} GENERATING RESPONSE`, { chatId });
        const { response: responseText, provider } = await generateAIResponse(prompt, systemInstruction);
        console.log(`${tag} RESPONSE`, responseText);
        
        if (!responseText || responseText.trim() === "") {
            console.log(`${tag} ABORTING] Empty response from AI`, { chatId });
            await updateDoc(chatRef, { sdrProcessing: false });
            return;
        }

        const parts = chatId.split(':');
        const instance = parts[0];
        const rawJid = parts.slice(1).join(':'); // This is the full JID (e.g. number@s.whatsapp.net or id@lid)
        
        // Check if it's a valid ID for sending
        if (!rawJid || rawJid.includes('@g.us') || rawJid.includes('@broadcast')) {
            console.error(`[INVALID ${agentConfig.agentName.toUpperCase()} JID BLOCKED]`, rawJid);
            await updateDoc(chatRef, { sdrProcessing: false });
            return;
        }

        console.log(`${tag} TARGET JID`, {
            chatId,
            rawJid
        });

        const delay = randomBetween(8, 20);
        console.log(`${tag} DELAY`, { delay });
        await sleep(delay * 1000);
        
        console.log('[EVOLUTION SEND START]', {
            jid: rawJid,
            chatId
        });
        
        console.log('[EVOLUTION FINAL PAYLOAD]', {
            jid: rawJid,
            text: responseText?.slice(0, 80)
        });

        await sendEvolutionMessage(rawJid, responseText);
        console.log('[EVOLUTION SEND SUCCESS]', {
            jid: rawJid
        });

        // Save outbound message and update chat
        const msgId = `msg_${agentConfig.agentName.toLowerCase()}_${Date.now()}`;
        const msgRef = doc(collection(serverDb, 'messages'), msgId);
        await setDoc(msgRef, {
            id: msgId,
            chatId,
            direction: 'outbound',
            fromMe: true,
            text: responseText,
            body: responseText,
            senderName: agentConfig.agentName,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
            status: 'sent'
        });

        await updateDoc(chatRef, {
            lastMessage: responseText,
            lastMessageAt: serverTimestamp(),
            hasOutbound: true,
            outboundCount: increment(1),
            lastOutboundAt: serverTimestamp(),
            lastMessageDirection: 'outbound',
            aiProvider: provider,
            sdrProcessing: false // Unlock
        });
        console.log(`${tag} FINISHED`, { chatId });
    } catch (e: any) {
        console.error(`${tag} FATAL ERROR`, e?.message || e);
        console.error(`${tag} FATAL STACK`, e?.stack);
        console.error(`${tag} FATAL ERROR FULL`, JSON.stringify(e, null, 2));                
        try {
            await updateDoc(chatRef, { sdrProcessing: false }); // Ensure unlock
        } catch (unlockE) {
            console.error(`${tag} FAILED TO UNLOCK`, unlockE);
        }
    } finally {
        console.log(`${tag} FINALLY`, { chatId });
    }
};
