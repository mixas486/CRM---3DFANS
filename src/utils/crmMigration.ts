import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const runChatAnalyticsMigration = async () => {
    const chatsRef = collection(db, 'chats');
    const msgsRef = collection(db, 'messages');
    const snapshot = await getDocs(chatsRef);
    const msgsSnapshot = await getDocs(msgsRef);
    const batch = writeBatch(db);
    let count = 0;
    
    // Group messages by chatId and sort by timestamp
    const msgsByChat: Record<string, any[]> = {};
    msgsSnapshot.docs.forEach(doc => {
        const msg = doc.data();
        if (!msg.chatId) return;
        if (!msgsByChat[msg.chatId]) msgsByChat[msg.chatId] = [];
        msgsByChat[msg.chatId].push({ ...msg, timestamp: msg.timestamp?.toMillis ? msg.timestamp.toMillis() : (msg.timestamp || 0) });
    });
    
    Object.keys(msgsByChat).forEach(chatId => {
        msgsByChat[chatId].sort((a,b) => a.timestamp - b.timestamp);
    });

    snapshot.docs.forEach(docSnap => {
        const chatId = docSnap.id;
        const msgs = msgsByChat[chatId] || [];
        
        let outboundCount = 0;
        let inboundCount = 0;
        let lastOutboundAt = null;
        let lastInboundAt = null;
        let firstOutboundAt = null;
        let firstInboundAt = null;
        let lastMessageDirection = null;
        let repliedAfterOutbound = false;

        msgs.forEach(msg => {
            const isOutbound = msg.fromMe === true;
            if (isOutbound) {
                outboundCount++;
                lastOutboundAt = msg.timestamp;
                if (!firstOutboundAt) firstOutboundAt = msg.timestamp;
                lastMessageDirection = 'outbound';
            } else {
                inboundCount++;
                lastInboundAt = msg.timestamp;
                if (!firstInboundAt) firstInboundAt = msg.timestamp;
                if (lastOutboundAt) repliedAfterOutbound = true;
                lastMessageDirection = 'inbound';
            }
        });

        batch.update(doc(db, 'chats', chatId), {
            hasOutbound: outboundCount > 0,
            outboundCount,
            inboundCount,
            lastOutboundAt,
            lastInboundAt,
            firstOutboundAt,
            firstInboundAt,
            lastMessageDirection,
            repliedAfterOutbound
        });
        count++;
    });
    
    if (count > 0) {
        await batch.commit();
        return count;
    }
    return 0;
};
