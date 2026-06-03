const { initializeApp } = require('firebase/app');
const { initializeFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, "crm-3dfans");

function extractWhatsAppPhone(remoteJid) {
  if (!remoteJid) return null;

  if (
    remoteJid.includes('@g.us') ||
    remoteJid.includes('@lid')
  ) {
    return null;
  }

  const cleaned = remoteJid
    .replace('@s.whatsapp.net', '')
    .replace(/[^\d]/g, '');

  if (
    !cleaned.startsWith('55') ||
    cleaned.length < 12 ||
    cleaned.length > 13
  ) {
    return null;
  }

  return cleaned;
}

async function clean() {
  console.log("Cleaning contacts...");
  const contacts = await getDocs(collection(db, 'contacts'));
  for (const item of contacts.docs) {
    const data = item.data();
    let jid = data.remoteJid || (data.telefoneE164 ? data.telefoneE164.replace('+', '') + '@s.whatsapp.net' : null) || (data.telefoneRaw + '@s.whatsapp.net');
    let phone = extractWhatsAppPhone(jid);
    if (!phone) {
      console.log("Deleting invalid contact", item.id, data.telefoneE164, data.remoteJid);
      await deleteDoc(doc(db, 'contacts', item.id));
    }
  }

  console.log("Cleaning chats...");
  const chats = await getDocs(collection(db, 'chats'));
  for (const item of chats.docs) {
    const data = item.data();
    let jid = data.remoteJid || item.id;
    let phone = extractWhatsAppPhone(jid);
    if (!phone) {
      console.log("Deleting invalid chat", item.id, jid);
      await deleteDoc(doc(db, 'chats', item.id));
    }
  }

  console.log("Cleaning messages...");
  const msgs = await getDocs(collection(db, 'messages'));
  for (const item of msgs.docs) {
    const data = item.data();
    let jid = data.remoteJid || data.chatId;
    let phone = extractWhatsAppPhone(jid);
    if (!phone) {
      console.log("Deleting invalid msg", item.id, jid);
      await deleteDoc(doc(db, 'messages', item.id));
    }
  }

  console.log("Done.");
}

clean();
