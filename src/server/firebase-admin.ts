import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

let app: admin.app.App;

if (!admin.apps.length) {
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: 'dfans-site.firebasestorage.app'
  });
} else {
  app = admin.apps[0]!;
}

export const adminDb = getFirestore(app, 'crm-3dfans');
export const adminStorage = getStorage(app);
export const bucket = adminStorage.bucket();
export const adminAuth = getAuth(app);

console.log('[Firebase Admin] Initialized successfully with database: crm-3dfans');
