import { collection, query, orderBy, onSnapshot, where, limit, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getContactsByPhone } from './firestore'; 
import { Contact } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { extractWhatsAppPhone } from '../utils/whatsapp';
import { normalizeChat } from '../utils/chatNormalizer';

export const markChatAsRead = async (chatId: string) => {
    try {
        const chatRef = doc(db, 'chats', chatId);
        await updateDoc(chatRef, {
            unreadCount: 0
        });
    } catch (e) {
        console.error("Failed to mark chat as read", e);
    }
};

export interface InboxChat {
    id: string; // chatId
    chatId: string;
    telefoneE164?: string;
    phoneE164?: string;
    pushName?: string;
    profilePicUrl?: string;
    lastMessage: string;
    lastMessageTime: number; // replacing lastTimestamp for consistency
    lastMessageAt?: number;
    unreadCount: number;
    contact?: Contact;
    hasOutbound?: boolean;
    outboundCount?: number;
    inboundCount?: number;
    lastOutboundAt?: any;
    lastInboundAt?: any;
    sdrEnabled?: boolean;
    sdrStage?: 'novo_lead' | 'qualificacao' | 'orcamento' | 'followup' | 'fechamento';
    sdrProcessing?: boolean;
    lastSdrReplyAt?: any;
    humanTakeover?: boolean;
}

export interface EvolMessage {
    id: string;
    chatId: string;
    fromMe: boolean;
    type: string;
    text: string;
    timestamp: number;
    status: string;
}

const contactCache: Record<string, Contact | null> = {};

/**
 * Robust fallback: Reconstructs chat documents dynamically from the 'messages' collection
 * if the 'chats' collection is completely empty in Firestore.
 */
async function reconstructChatsFromMessages(): Promise<InboxChat[]> {
    console.log('[Inbox Hydration] Inside reconstructChatsFromMessages, querying messages...');
    const messagesColl = collection(db, 'messages');
    try {
        const msgsSnap = await getDocs(messagesColl);
        if (msgsSnap.empty) {
            console.warn('[Inbox Hydration] No messages found to reconstruct chats from.');
            return [];
        }
        
        console.log(`[Inbox Hydration] Found ${msgsSnap.size} messages total for fallback reconstruction.`);
        
        // Group messages by chatId to find the latest
        const latestMsgMap: Record<string, any> = {};
        msgsSnap.docs.forEach((docSnap) => {
            const msg = docSnap.data();
            const chatId = msg.chatId || msg.remoteJid;
            if (!chatId) return;
            
            if (!latestMsgMap[chatId] || msg.timestamp > latestMsgMap[chatId].timestamp) {
                latestMsgMap[chatId] = msg;
            }
        });
        
        const reconstructedChats: InboxChat[] = [];
        const promises = Object.keys(latestMsgMap).map(async (chatId) => {
            const latestMsg = latestMsgMap[chatId];
            const parsedPhone = extractWhatsAppPhone(chatId);
            const phoneE164 = parsedPhone ? '+' + parsedPhone : '';
            
            // Try to resolve contact name/info from CRM contacts collection
            let pushName = latestMsg.pushName || '';
            if (!pushName && phoneE164) {
                try {
                    const matches = await getContactsByPhone(phoneE164);
                    if (matches.length > 0) {
                        pushName = matches[0].nome;
                    }
                } catch (e) {
                    console.error('[Inbox Hydration] Error checking contact for reconstruction:', e);
                }
            }
            if (!pushName) {
                pushName = parsedPhone || chatId;
            }
            
            // Re-save chat document back to Firestore to self-heal the DB
            const chatRef = doc(db, 'chats', chatId);
            const chatData = {
                chatId: chatId,
                phone: parsedPhone || chatId,
                pushName: pushName,
                contactName: pushName,
                lastMessage: latestMsg.text || latestMsg.body || 'Nova mensagem',
                lastMessageTime: latestMsg.timestamp || Date.now(),
                unreadCount: 0,
                archived: false,
                pinned: false,
                labels: [],
                updatedAt: Date.now()
            };
            
            try {
                await setDoc(chatRef, chatData, { merge: true });
                console.log(`[Chat Upserted] Self-healed empty chats db collection. Re-saved chat: ${chatId}`, chatData);
            } catch (err) {
                console.error(`[Inbox Hydration] Error saving self-healed chat doc for ${chatId}:`, err);
            }
            
            // Hydrate contact details
            let contact: Contact | undefined;
            if (contactCache[phoneE164] !== undefined) {
                contact = contactCache[phoneE164] || undefined;
            } else {
                try {
                    const matches = await getContactsByPhone(phoneE164);
                    if (matches.length > 0) {
                        contact = matches[0];
                        contactCache[phoneE164] = contact;
                    } else {
                        contactCache[phoneE164] = null;
                    }
                } catch (e) {
                    console.error('[Inbox Hydration] Cache check failed during fallback:', e);
                }
            }
            
            reconstructedChats.push(normalizeChat({
                ...latestMsg,
                chatId,
                lastMessageTime: latestMsg.timestamp || Date.now(),
                pushName,
            }) as InboxChat);
        });
        
        await Promise.all(promises);
        reconstructedChats.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        return reconstructedChats;
    } catch (err) {
        console.error('[Inbox Hydration] Error reconstructing chats from messages collection:', err);
        return [];
    }
}

export const subscribeToInboxChats = (
    callback: (chats: InboxChat[]) => void,
    onError: (err: any) => void,
    maxLimit: number = 100
) => {
    console.log(`[Inbox Hydration] Subscribing to "chats" collection with limit ${maxLimit}...`);
    const q = query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'), limit(maxLimit));
    let hasAttemptedReconstruction = false;
    
    return onSnapshot(q, (snapshot) => {
        console.log(`[Inbox Hydration] [Realtime Chats Loaded] size: ${snapshot.size}`);
        
        if (snapshot.empty) {
            console.warn('[Inbox Hydration] Chats collection is empty in Firestore.');
            if (!hasAttemptedReconstruction) {
                hasAttemptedReconstruction = true;
                console.log('[Inbox Hydration] Attempting robust fallback chat reconstruction from messages collection...');
                reconstructChatsFromMessages().then((fallbackChats) => {
                    if (fallbackChats.length > 0) {
                        console.log(`[Inbox Hydration] Fallback reconstruction yielded ${fallbackChats.length} chats.`);
                        callback(fallbackChats);
                    } else {
                        callback([]);
                    }
                }).catch((reconstructErr) => {
                    console.error('[Inbox Hydration] Fallback reconstruction failed:', reconstructErr);
                    callback([]);
                });
                return;
            }
            callback([]);
            return;
        }
        
        let chats = snapshot.docs.map((docSnap) => {
            const data = docSnap.data({ serverTimestamps: 'estimate' }) || {};
            const chatId = docSnap.id;
            const normalized = normalizeChat({ ...data, chatId }) as InboxChat;
            console.log('[CHAT SORT]', {
                chatId: normalized.chatId,
                ts: normalized.lastMessageTime,
            });
            return normalized;
        });

        // Sort in memory by lastMessageTime descending
        chats.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        
        if (chats.length > maxLimit) {
            chats = chats.slice(0, maxLimit);
        }
        
        console.log(`[Inbox Hydration] Loaded ${chats.length} chats in realtime successfully.`);
        callback(chats);
    }, (err) => {
        console.error('[Inbox Hydration] Error listening to "chats" collection:', err);
        try {
            handleFirestoreError(err, OperationType.GET, 'chats');
        } catch (mappedError) {
            onError(mappedError);
        }
    });
};

export const subscribeToInboxMessages = (
    chatId: string,
    callback: (messages: any[]) => void, // formatting it like UI expects
    onError: (err: any) => void,
    maxLimit: number = 100
) => {
    console.log(`[Firestore Query Audit] Subscribing to "messages" for chatId: ${chatId} with limitOf ${maxLimit}...`);
    const q = query(
        collection(db, 'messages'), 
        where('chatId', '==', chatId),
        orderBy('timestamp', 'desc'),
        limit(maxLimit)
    );
    
    return onSnapshot(q, (snapshot) => {
        console.log(`[Firestore Query Audit] Received messages update for chat ${chatId}. Doc count: ${snapshot.size}`);
        let msgs = snapshot.docs.map(doc => {
            const data = doc.data({ serverTimestamps: 'estimate' }) || {};
            const getMillis = (val: any) => val?.toMillis ? val.toMillis() : (typeof val === 'number' ? val : 0);
            return {
                id: doc.id,
                direction: (data.fromMe || data.direction === 'outbound') ? 'outbound' : 'inbound',
                body: data.text || data.body || '',
                timestamp: getMillis(data.timestamp) || getMillis(data.createdAt) || 0,
                status: data.status || 'received',
                mediaType: data.mediaType || 'text',
                mediaUrl: data.mediaUrl || ''
            };
        });
        
        // Sort in memory by timestamp ascending to order chronologically (oldest first, newest last)
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        
        callback(msgs);
    }, (err) => {
        console.error(`[Firestore Query Audit] Error listening to messages for chat ${chatId}:`, err);
        try {
            handleFirestoreError(err, OperationType.GET, `messages/${chatId}`);
        } catch (mappedError) {
            onError(mappedError);
        }
    });
};

export interface SyncStatus {
    status: 'syncing' | 'completed' | 'idle';
    chatsCount: number;
    messagesCount: number;
    contactsCount: number;
    lastSyncAt: number;
    updatedAt: number;
}

export const subscribeToSyncStatus = (
    callback: (status: SyncStatus | null) => void,
    onError?: (err: any) => void
) => {
    return onSnapshot(
        doc(db, 'system', 'sync_status'),
        (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.data() as SyncStatus);
            } else {
                callback(null);
            }
        },
        (err) => {
            console.error('Error listening to sync_status:', err);
            try {
                handleFirestoreError(err, OperationType.GET, 'system/sync_status');
            } catch (mappedError) {
                if (onError) onError(mappedError);
            }
        }
    );
};
