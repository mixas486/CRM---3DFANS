import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, "crm-3dfans");

function extractWhatsAppPhone(remoteJid: string): string | null {
  if (!remoteJid) return null;
  if (remoteJid.includes('@g.us') || remoteJid.includes('@lid')) return null;
  const cleaned = remoteJid.replace('@s.whatsapp.net', '').replace(/[^\d]/g, '');
  if (!cleaned.startsWith('55') || cleaned.length < 12 || cleaned.length > 13) return null;
  return cleaned;
}

async function run() {
  console.log("Migrating chats from contacts...");
  const contactsSnap = await getDocs(collection(db, 'contacts'));
  const chatsSnap = await getDocs(collection(db, 'chats'));
  
  const existingChats = new Set(chatsSnap.docs.map(d => d.id));
  
  for (const docSnap of contactsSnap.docs) {
    const data = docSnap.data();
    if (data.remoteJid) {
       const jid = data.remoteJid;
       if (!existingChats.has(jid)) {
          const phone = extractWhatsAppPhone(jid);
          if (phone) {
            console.log("Creating chat for:", jid);
            await setDoc(doc(db, 'chats', jid), {
               remoteJid: jid,
               telefoneE164: '+' + phone,
               pushName: data.nome || data.pushName || '+' + phone,
               contactName: data.nome || data.pushName || '+' + phone,
               unreadCount: 0,
               lastMessage: 'Nova conversa iniciada',
               lastMessageAt: data.updatedAt || Date.now(),
               updatedAt: Date.now(),
               instanceId: data.instanceId || ''
            }, { merge: true });
          }
       }
    }
  }
  
  console.log("Fixing existing chats to have lastMessageAt");
  for (const docSnap of chatsSnap.docs) {
     const data = docSnap.data();
     if (!data.lastMessageAt) {
        console.log("Fixing chat", docSnap.id);
        const jid = docSnap.id;
        const phone = extractWhatsAppPhone(jid);
        await setDoc(doc(db, 'chats', docSnap.id), {
           lastMessageAt: data.lastMessageTime || data.updatedAt || Date.now(),
           telefoneE164: data.telefoneE164 || (phone ? '+' + phone : ''),
        }, { merge: true });
     }
  }

  console.log("Done");
  process.exit(0);
}
run();
