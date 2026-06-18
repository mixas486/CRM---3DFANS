import { bucket } from '../../server/firebase-admin';
import { logger } from '../logging/logger';

const TAG = 'PREVIEW_STORAGE';

interface UploadParams {
  buffer: Buffer;
  contactId: string;
  customerName: string;
  customerPhone: string;
  chatId: string;
}

/**
 * Uploads preview to Firebase Storage with professional hierarchy and metadata
 */
export async function uploadPreviewToStorage({ 
  buffer, 
  contactId, 
  customerName, 
  customerPhone, 
  chatId 
}: UploadParams): Promise<{ publicUrl: string; storagePath: string }> {
  logger.info(TAG, 'Upload started');

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = Date.now();
  
  const storagePath = `preview/generated/${year}/${month}/${contactId}/preview_${timestamp}.png`;
  
  try {
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      resumable: false,
      public: true,
      metadata: {
        contentType: 'image/png',
        metadata: {
          customerName,
          customerPhone,
          contactId,
          chatId,
          generatedBy: 'gemini',
          system: '3dfans-crm'
        }
      }
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    logger.info(TAG, `Upload completed: ${publicUrl}`);

    return { publicUrl, storagePath };
  } catch (err) {
    logger.error(TAG, 'Upload failed', err);
    throw err;
  }
}
