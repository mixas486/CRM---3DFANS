import { adminDb } from '../../server/firebase-admin';
import { logger } from '../logging/logger';

const TAG = 'MEDIA';

/**
 * Retrieves the original image URL for a given chat.
 * Used to verify if a preview can be generated.
 */
export async function getOriginalImageUrl(chatId: string): Promise<string | null> {
  try {
    const chatDoc = await adminDb.collection('chats').doc(chatId).get();
    
    if (!chatDoc.exists) {
      return null;
    }

    const data = chatDoc.data();
    
    if (data?.hasOriginalImage && data?.originalImageUrl) {
      return data.originalImageUrl;
    }

    return null;
  } catch (err) {
    logger.error(TAG, 'Failed to fetch original image URL', err);
    return null;
  }
}
