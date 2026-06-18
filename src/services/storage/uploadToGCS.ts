import { bucket } from '../../server/firebase-admin';
import { logger } from '../logging/logger';
import axios from 'axios';

const TAG = 'STORAGE';

/**
 * Uploads a buffer or URL to Firebase Storage
 */
export async function uploadToGCS(source: Buffer | string, destination: string, contentType: string = 'image/png'): Promise<string> {
  logger.info(TAG, `Uploading to ${destination}`);
  
  try {
    const file = bucket.file(destination);

    let buffer: Buffer;

    if (typeof source === 'string' && source.startsWith('http')) {
      const response = await axios.get(source, { responseType: 'arraybuffer' });
      buffer = Buffer.from(response.data);
    } else {
      buffer = source as Buffer;
    }

    await file.save(buffer, {
      metadata: { contentType },
      public: true,
      resumable: false
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    logger.info(TAG, `Upload completed: ${publicUrl}`);
    
    return publicUrl;
  } catch (err) {
    logger.error(TAG, 'Upload failed', err);
    throw err;
  }
}
