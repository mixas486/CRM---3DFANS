import { logger } from '../logging/logger';
import axios from 'axios';

console.log('[MEDIA MODULE] Loaded');

const TAG = 'MEDIA';

/**
 * Extracts incoming media buffer immediately from the Webhook payload.
 * Supports jpegThumbnail byte arrays, base64 strings, and public URLs.
 * Eliminates race conditions by avoiding secondary fetches via msgId.
 */
export async function downloadIncomingMedia(msgData: any): Promise<Buffer> {
  logger.info(TAG, 'Download started');

  const messageContent = msgData?.message || {};
  
  // 1. Check for raw JPEG Thumbnail bytes array (Evolution API sending object array)
  // Evolution sometimes sends message.imageMessage.jpegThumbnail as an object with numeric keys or array
  const thumbnailObj = messageContent?.imageMessage?.jpegThumbnail || messageContent?.videoMessage?.jpegThumbnail;
  
  let buffer: Buffer | null = null;

  if (thumbnailObj) {
    // Check if it's already a Buffer or Uint8Array
    if (Buffer.isBuffer(thumbnailObj) || thumbnailObj instanceof Uint8Array) {
       buffer = Buffer.from(thumbnailObj);
    } 
    // Check if it's an object containing numeric bytes { "0": 255, "1": 216, ... }
    else if (thumbnailObj && typeof thumbnailObj === 'object') {
       const bytes = Object.values(thumbnailObj) as number[];
       if (bytes.length > 0) {
         buffer = Buffer.from(bytes);
       }
    } 
    // Check if it's a base64 string
    else if (typeof thumbnailObj === 'string') {
       buffer = Buffer.from(thumbnailObj, 'base64');
    }
  }

  // 2. Evolution API v2: Base64 direct property
  if (!buffer) {
    const base64Data = messageContent?.base64 || msgData?.base64 || messageContent?.mediaBase64;
    if (base64Data && typeof base64Data === 'string') {
      buffer = Buffer.from(base64Data, 'base64');
    }
  }

  // 3. Fallback to direct public link (S3/MinIO)
  if (!buffer) {
    const mediaUrl = messageContent?.imageMessage?.url || messageContent?.videoMessage?.url;
    if (mediaUrl && !mediaUrl.includes('whatsapp.net')) {
      logger.info(TAG, `Downloading from public storage URL: ${mediaUrl}`);
      const response = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 15000 });
      buffer = Buffer.from(response.data);
    }
  }

  if (buffer && buffer.length > 0) {
    // Validate JPEG Signature (FF D8 FF)
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
      logger.info(TAG, 'Download completed');
      return buffer;
    } else {
       logger.warn(TAG, '[MEDIA] Buffer created but JPEG signature missing, proceeding anyway');
       logger.info(TAG, 'Download completed');
       return buffer;
    }
  }

  throw new Error('A mídia não pôde ser extraída do payload atual.');
}
