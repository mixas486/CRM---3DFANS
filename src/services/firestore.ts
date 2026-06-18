import { collection, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Contact, ContactFolder, Message } from '../types';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { extractBrazilGeo } from '../utils/brazilGeo';

export const contactsCollection = collection(db, 'contacts');
export const messagesCollection = collection(db, 'messages');

export const getContactsByPhone = async (telefoneE164: string): Promise<Contact[]> => {
  try {
    const q = query(contactsCollection, where('telefoneE164', '==', telefoneE164));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contact[];
  } catch (e: any) {
    if (e.message?.includes('offline')) {
      console.warn("Firestore is offline, returning empty contacts array.");
    } else {
      console.error("Failed to fetch contacts by phone:", e);
    }
    return [];
  }
};

export const createContact = async (data: Omit<Contact, 'id' | 'createdAt'>) => {
  const { ddd, state } = extractBrazilGeo(data.telefoneE164);
  const contactData = { ...data, ddd, estado: state || data.estado, createdAt: Date.now() };
  const docRef = doc(contactsCollection);
  await setDoc(docRef, contactData);
  return docRef.id;
};

export const updateContact = async (id: string, data: Partial<Contact>) => {
  const docRef = doc(db, 'contacts', id);
  await updateDoc(docRef, data);
};

export const createMessageRecord = async (data: Omit<Message, 'id'>) => {
  const docRef = doc(messagesCollection);
  await setDoc(docRef, data);
};

export const deleteContact = async (id: string) => {
  const docRef = doc(db, 'contacts', id);
  await deleteDoc(docRef);
};

export const bulkDeleteContacts = async (
  ids: string[],
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = writeBatch(db);
    ids.slice(i, i + CHUNK).forEach(id => batch.delete(doc(db, 'contacts', id)));
    await batch.commit();
    onProgress?.(Math.min(i + CHUNK, ids.length), ids.length);
  }
};

export const bulkCreateContacts = async (contacts: Omit<Contact, 'id' | 'createdAt'>[]) => {
  const now = Date.now();
  const CHUNK_SIZE = 450;
  
  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    chunk.forEach(contact => {
      const docRef = doc(contactsCollection);
      const { ddd, state } = extractBrazilGeo(contact.telefoneE164);
      const data: any = { ...contact, ddd, estado: state || contact.estado, createdAt: now };
      
      // Clean undefined variables to prevent Firestore crash
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) {
          delete data[key];
        }
      });
      
      batch.set(docRef, data);
    });
    
    await batch.commit();
  }
}

export const subscribeToContacts = (
  callback: (contacts: Contact[]) => void,
  onError: (err: any) => void
) => {
  console.log('[Firestore Query Audit] Executing realtime query on "contacts" collection...');
  const q = query(contactsCollection, orderBy('createdAt', 'desc'));
  return onSnapshot(
    q, 
    (snapshot) => {
      console.log(`[Firestore Query Audit] Received "contacts" update. Document count: ${snapshot.size}`);
      if (snapshot.empty) {
        console.warn('[Firestore Query Audit] Contacts collection snapshot is empty. Zero documents retrieved.');
      }
      const contacts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as Contact;
      });
      callback(contacts);
    }, 
    (err) => {
      console.error('[Firestore Query Audit] Error listening to "contacts" collection:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'contacts');
      } catch (mappedError) {
        onError(mappedError);
      }
    }
  );
};

// ── Contact Folders ──────────────────────────────────────────────────────────

const foldersCollection = collection(db, 'contact_folders');

export const subscribeToFolders = (
  callback: (folders: ContactFolder[]) => void,
  onError: (err: any) => void
) => {
  const q = query(foldersCollection, orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ContactFolder));
  }, onError);
};

export const createFolder = async (name: string): Promise<string> => {
  const ref = doc(foldersCollection);
  await setDoc(ref, { name: name.trim(), createdAt: Date.now() });
  return ref.id;
};

export const renameFolder = async (id: string, name: string): Promise<void> => {
  await updateDoc(doc(db, 'contact_folders', id), { name: name.trim() });
};

export const deleteFolder = async (id: string): Promise<void> => {
  // Unassign contacts in this folder first
  const q = query(contactsCollection, where('folderId', '==', id));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { folderId: null }));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'contact_folders', id));
};

export const moveContactsToFolder = async (contactIds: string[], folderId: string | null): Promise<void> => {
  const CHUNK = 450;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const batch = writeBatch(db);
    contactIds.slice(i, i + CHUNK).forEach(id => {
      batch.update(doc(db, 'contacts', id), { folderId: folderId ?? null });
    });
    await batch.commit();
  }
};

// ─────────────────────────────────────────────────────────────────────────────

export const subscribeToContactMessages = (
  contactId: string, 
  callback: (messages: Message[]) => void,
  onError: (err: any) => void
) => {
  const q = query(messagesCollection, where('contactId', '==', contactId), orderBy('timestamp', 'asc'), limit(250));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Message[];
    callback(messages);
  }, (err) => {
    console.error(`Error listening to messages for contact ${contactId}:`, err);
    try {
      handleFirestoreError(err, OperationType.GET, `messages/${contactId}`);
    } catch (mappedError) {
      onError(mappedError);
    }
  });
};

export const settingsDocRef = doc(db, 'system', 'settings');

export const getSettings = async (): Promise<any> => {
  try {
    const snapshot = await getDoc(settingsDocRef);
    if (snapshot.exists()) {
      return snapshot.data();
    }
  } catch (e: any) {
    if (e.message?.includes('offline')) {
      console.warn("Firestore is offline, returning default settings for now.");
    } else {
      console.error("Failed to fetch settings:", e);
    }
  }
  const defaultSettings = {
    evolutionUrl: '',
    instanceName: '',
    delayMinMs: 30000,
    delayMaxMs: 90000,
    dailyLimit: 1000,
    warmupLimit: 50,
    batchSize: 20,
    batchPauseMs: 60000,
    enableDispatchSound: true,
    dispatchSoundUrl: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
    enableReplySound: false,
    replySoundUrl: '',
    pauseOnHighFailureRate: true,
    openAiModel: 'gpt-4o-mini',
    optOutKeywords: ['sair', 'parar', 'cancelar'],
    templates: []
  };
  await setDoc(settingsDocRef, defaultSettings);
  return defaultSettings;
};

export const updateSettings = async (data: any) => {
  await setDoc(settingsDocRef, data, { merge: true });
};

export const subscribeToConnectionStatus = (
  callback: (status: string) => void,
  onError: (err: any) => void
) => {
  const docRef = doc(db, 'system', 'evolution_status');
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data().state);
    } else {
      callback('offline');
    }
  }, (err) => {
    console.error('Error listening to evolution_status:', err);
    try {
      handleFirestoreError(err, OperationType.GET, 'system/evolution_status');
    } catch (mappedError) {
      onError(mappedError);
    }
  });
};

export const subscribeToSettings = (
  callback: (settings: any) => void,
  onError: (err: any) => void
) => {
  return onSnapshot(settingsDocRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    } else {
      getSettings().then(callback).catch(onError);
    }
  }, (err) => {
    console.error('Error listening to system/settings:', err);
    try {
      handleFirestoreError(err, OperationType.GET, 'system/settings');
    } catch (mappedError) {
      onError(mappedError);
    }
  });
};
