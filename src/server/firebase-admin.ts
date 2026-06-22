import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let app: admin.app.App;

// Locate credentials relative to this file — avoids env var / dotenv load-order issues
// (firebase-admin.ts is imported as a transitive dep before dotenv/config runs in server.ts)
const KEY_PATH = path.join(__dirname, '..', '..', 'credentials', 'firebase-key.json');
const credentialExists = fs.existsSync(KEY_PATH);

if (!admin.apps.length) {
  const credential = credentialExists
    ? admin.credential.cert(KEY_PATH)
    : admin.credential.applicationDefault();

  app = admin.initializeApp({
    credential,
    projectId: 'dfans-site',
    storageBucket: 'dfans-site.firebasestorage.app',
  });
} else {
  app = admin.apps[0]!;
}

// Use @google-cloud/firestore directly with credentials object (parsed JSON) so that
// google-gax's GoogleAuth receives jsonContent and skips applicationDefault() entirely.
function createAdminDb() {
  if (credentialExists) {
    const { Firestore } = require('@google-cloud/firestore');
    const serviceAccount = JSON.parse(fs.readFileSync(KEY_PATH, 'utf-8'));
    return new Firestore({
      projectId: 'dfans-site',
      databaseId: 'crm-3dfans',
      credentials: serviceAccount,
    });
  }
  return getFirestore(app, 'crm-3dfans');
}

export const adminDb = createAdminDb();
export const adminStorage = getStorage(app);
export const bucket = adminStorage.bucket();
export const adminAuth = getAuth(app);

console.log('[Firebase Admin] Initialized successfully with database: crm-3dfans');
