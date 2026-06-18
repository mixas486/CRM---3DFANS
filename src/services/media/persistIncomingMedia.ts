import { uploadOriginalImageToStorage } from './uploadOriginalImage';
import { adminDb } from '../../server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '../logging/logger';

const TAG = 'MEDIA';

interface PersistParams {
  buffer: Buffer;
  chatId: string;
  contactId: string;
  mimeType: string;
  customerPhone?: string;
}

export async function persistIncomingMedia({
  buffer,
  chatId,
  contactId,
  mimeType,
  customerPhone
}: PersistParams) {
  const uploadResult = await uploadOriginalImageToStorage({
    buffer,
    contactId,
    mimeType,
    customerPhone
  });

  if (!uploadResult) {
    logger.error(TAG, 'Upload returned null — aborting persistence');
    throw new Error('Upload returned null');
  }

  const { publicUrl, storagePath } = uploadResult;

  // Save directly without batch — avoids NOT_FOUND on set+merge
  try {
    // PRE-EMPTIVE SET: Ensure chat document exists before saving media metadata.
    await adminDb.collection('chats').doc(chatId).set({
      id: chatId,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    logger.info(TAG, `[MEDIA SAVE] Attempting to update chat document. Chat ID: ${chatId}, Path: chats/${chatId}`);
    await adminDb.collection('chats').doc(chatId).set({
      originalImageUrl: publicUrl,
      originalImageStoragePath: storagePath,
      originalImageUploadedAt: FieldValue.serverTimestamp(),
      hasOriginalImage: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    logger.info(TAG, `[MEDIA SAVE] Chat document updated for chat ID: ${chatId}`);

    if (contactId) {
      logger.info(TAG, `[MEDIA SAVE] Attempting to update contact document. Contact ID: ${contactId}, Path: contacts/${contactId}`);
      await adminDb.collection('contacts').doc(contactId).set({
        lastUploadedReference: publicUrl,
        totalReferencesSent: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      logger.info(TAG, `[MEDIA SAVE] Contact document updated for contact ID: ${contactId}`);
    } else {
      logger.warn(TAG, '[MEDIA SAVE WARNING] Missing contactId. Skipping contact document update for original media persistence.');
    }

    logger.info(TAG, 'Upload completed');
  } catch (err) {
    logger.error(TAG, 'Failed to update Firestore with original media', err);
    // Don't throw — upload succeeded, Firestore is secondary
  }

  return { publicUrl, storagePath };
}
