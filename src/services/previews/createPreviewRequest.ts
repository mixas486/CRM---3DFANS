import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { serverDb } from '../../server/firebase';
import { logger } from '../logging/logger';

const TAG = 'PREVIEW';

interface CreatePreviewRequestParams {
  chatId: string;
  contactId: string;
  customerName: string;
  phone: string;
  originalImageUrl: string;
}

/**
 * Creates a new document in the `preview_requests` collection to track an image generation request.
 */
export async function createPreviewRequest({
  chatId,
  contactId,
  customerName,
  phone,
  originalImageUrl,
}: CreatePreviewRequestParams) {
  try {
    const requestId = `req_${Date.now()}_${contactId}`;
    const requestRef = doc(serverDb, 'preview_requests', requestId);

    await setDoc(requestRef, {
      id: requestId,
      chatId,
      contactId,
      customerName,
      phone,
      originalImageUrl,
      createdAt: serverTimestamp(),
      status: 'uploaded', // Initial status
    });

    logger.info(TAG, 'Preview request created in Firestore.', { requestId, chatId });
    return requestId;
  } catch (error) {
    logger.error(TAG, 'Failed to create preview request in Firestore.', error);
    throw error;
  }
}
