// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyAJt3GcqLqf5Prd2waVePNDYi5xQevNB-I",
  authDomain: "dfans-site.firebaseapp.com",
  projectId: "dfans-site",
  storageBucket: "dfans-site.firebasestorage.app",
  messagingSenderId: "704756420172",
  appId: "1:704756420172:web:c561e94f3c09b963b0eee9",
  measurementId: "G-91QVGZ9TNT"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, "crm-3dfans");

console.log("[Firestore] Connected to crm-3dfans database");

export const auth = getAuth(app);

export const storage = getStorage(app);

console.log(
  '[ACTIVE FIREBASE PROJECT]',
  firebaseConfig.projectId
);

if (
  firebaseConfig.projectId === 'gen-lang-client-0016488375' ||
  firebaseConfig.projectId.startsWith('ai-studio-')
) {
  throw new Error(
    '[OLD FIREBASE PROJECT DETECTED]'
  );
}

