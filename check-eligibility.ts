import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, "crm-3dfans");

async function checkEligibility() {
  const contacts = await getDocs(collection(db, 'contacts'));
  
  let eligible = 0;
  
  for (const docSnap of contacts.docs) {
    const c = docSnap.data();
    if (c.optIn && !c.needsReview && c.status === 'active') {
       eligible++;
    }
  }
  
  console.log("Eligible contacts:", eligible);
  process.exit(0);
}

checkEligibility();
