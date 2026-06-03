import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, "crm-3dfans");

async function fixEligibility() {
  console.log("Fixing optIn, status, and needsReview on existing contacts using batched writes...");
  const contacts = await getDocs(collection(db, 'contacts'));
  
  let batchCounter = 0;
  let batch = writeBatch(db);
  
  for (const docSnap of contacts.docs) {
    const data = docSnap.data();
    let updates: any = {};
    updates.status = 'active';
    updates.needsReview = false;
    updates.optIn = true;
    
    batch.update(doc(db, 'contacts', docSnap.id), updates);
    batchCounter++;
    if (batchCounter === 450) {
       await batch.commit();
       console.log('Committed a batch of 450...');
       batch = writeBatch(db);
       batchCounter = 0;
    }
  }
  
  if (batchCounter > 0) {
     await batch.commit();
     console.log(`Committed remaining ${batchCounter} contacts...`);
  }
  
  console.log("Finished all!");
  process.exit(0);
}

fixEligibility();
