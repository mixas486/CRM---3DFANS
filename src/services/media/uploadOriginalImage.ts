import axios from 'axios';
import admin from 'firebase-admin';
import { logger } from '../logging/logger';

console.log('[MEDIA] Upload service ready');

const TAG = 'MEDIA';
const BUCKET_NAME = process.env.GCS_BUCKET || 'dfans-site.firebasestorage.app';

interface UploadParams {
  buffer: Buffer;
  contactId: string;
  mimeType: string;
  customerPhone?: string;
}

export async function uploadOriginalImageToStorage({
  buffer,
  contactId,
  mimeType,
  customerPhone
}: UploadParams): Promise<{ publicUrl: string; storagePath: string } | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = Date.now();

  const extension = mimeType.split('/')[1] || 'jpg';
  const storagePath = `uploads/originals/${year}/${month}/${contactId}/original_${timestamp}.${extension}`;
  const encodedPath = encodeURIComponent(storagePath);

  try {
    logger.info(TAG, 'Upload started', { storagePath, contactId });

    // Get access token from the already-initialized firebase-admin app
    const tokenResult = await admin.app().options.credential!.getAccessToken();
    const accessToken = tokenResult.access_token;

    if (!accessToken) {
      throw new Error('Failed to obtain access token from firebase-admin credentials');
    }

    // Upload via GCS JSON API — pure HTTP, no streams
    await axios.post(
      `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodedPath}`,
      buffer,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
          'Content-Length': buffer.length,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000
      }
    );

    // Make file public
    await axios.post(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o/${encodedPath}/acl`,
      { entity: 'allUsers', role: 'READER' },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`;
    logger.info(TAG, 'Upload completed', { publicUrl });

    return { publicUrl, storagePath };
  } catch (err: any) {
    logger.error(TAG, 'Upload failed', err?.response?.data || err?.message || err);
    return null;
  }
}
