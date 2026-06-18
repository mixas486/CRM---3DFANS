import { adminDb } from '../../server/firebase-admin';
import { logger } from '../logging/logger';
import { FieldValue } from 'firebase-admin/firestore';

const TAG = 'MEDIA';

interface SaveMediaParams {
  chatId: string;
  contactId: string;
  publicUrl: string;
  storagePath: string;
}

export async function saveOriginalMedia({
  chatId,
  contactId,
  publicUrl,
  storagePath
}: SaveMediaParams) {
  try {
    // Use set+merge instead of update to avoid NOT_FOUND on missing docs
    await adminDb.collection('chats').doc(chatId).set({
      originalImageUrl: publicUrl,
      originalImageStoragePath: storagePath,
      originalImageUploadedAt: FieldValue.serverTimestamp(),
      hasOriginalImage: true,
      lastMessage: '[Imagem Recebida]',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    await adminDb.collection('contacts').doc(contactId).set({
      lastUploadedReference: publicUrl,
      totalReferencesSent: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    logger.info(TAG, 'Firestore updated');
  } catch (err) {
    logger.error(TAG, 'Failed to update Firestore with original media', err);
    throw err;
  }
}
