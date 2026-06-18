import { adminDb } from '../../server/firebase-admin';
import { logger } from '../logging/logger';
import { FieldValue } from 'firebase-admin/firestore';

const TAG = 'PREVIEW_DB';

export async function savePreviewMetadata(data: any) {
  logger.info(TAG, 'Firestore saving started');

  const previewId = data.previewId || `prev_${Date.now()}`;
  const previewRef = adminDb.collection('previews').doc(previewId);
  const chatRef = adminDb.collection('chats').doc(data.chatId);
  const contactRef = adminDb.collection('contacts').doc(data.contactId);

  const previewDoc = {
    ...data,
    previewId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    archived: false,
    viewedByAdmin: false
  };

  try {
    const batch = adminDb.batch();

    // 1. Save main preview document
    batch.set(previewRef, previewDoc);

    // 2. Update Chat metadata
    batch.set(chatRef, {
      lastPreviewUrl: data.previewImageUrl,
      lastPreviewAt: FieldValue.serverTimestamp(),
      previewsCount: FieldValue.increment(1),
      lastQuoteValue: data.quoteValue || 597
    }, { merge: true });

    // 3. Update Contact metadata
    batch.set(contactRef, {
      totalPreviews: FieldValue.increment(1),
      lastPreviewDate: FieldValue.serverTimestamp(),
      lastPreviewUrl: data.previewImageUrl,
      hasGeneratedPreview: true
    }, { merge: true });

    await batch.commit();
    logger.info(TAG, 'Firestore saved and links updated');
    
    return previewId;
  } catch (err) {
    logger.error(TAG, 'Firestore save failed', err);
    throw err;
  }
}
