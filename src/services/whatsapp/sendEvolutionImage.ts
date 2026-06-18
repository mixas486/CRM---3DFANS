import { logger } from '../logging/logger';

const TAG = 'EVOLUTION';

export async function sendEvolutionImage(number: string, imageUrl: string, caption?: string): Promise<any> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !key || !instance) {
    throw new Error('Evolution credentials missing');
  }

  const cleanNumber = number.includes('@lid') ? number : number.replace(/[^\d]/g, '');

  const payload = {
    number: cleanNumber,
    mediatype: "image",
    media: imageUrl,
    caption: caption || ""
  };

  logger.info(TAG, `Sending image to ${cleanNumber}`);

  try {
    const response = await fetch(`${url}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    
    logger.info(TAG, 'WhatsApp image sent');
    return data;
  } catch (err) {
    logger.error(TAG, 'Failed to send image', err);
    throw err;
  }
}

export async function sendEvolutionText(number: string, text: string): Promise<any> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  const cleanNumber = number.includes('@lid') ? number : number.replace(/[^\d]/g, '');

  try {
    const response = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: cleanNumber,
        text,
        delay: 1200,
        linkPreview: false
      })
    });

    return await response.json();
  } catch (err) {
    logger.error(TAG, 'Failed to send text', err);
    throw err;
  }
}

export async function getEvolutionMedia(msgData: any): Promise<Buffer> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !key || !instance) {
    throw new Error('Evolution credentials missing');
  }

  try {
    const response = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: msgData })
    });
    
    const data = await response.json();
    if (data.base64) {
      return Buffer.from(data.base64, 'base64');
    }
    throw new Error('No base64 found in media response');
  } catch (err) {
    logger.error(TAG, 'Failed to get media from evolution', err);
    throw err;
  }
}

export async function sendEvolutionAudio(number: string, base64Audio: string): Promise<any> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !key || !instance) return;

  const cleanNumber = number.includes('@lid') ? number : number.replace(/[^\d]/g, '');

  try {
    const response = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: cleanNumber,
        audio: base64Audio, // Base64 without data URI prefix for Evolution API
        delay: 1200
      })
    });

    return await response.json();
  } catch (err) {
    logger.error(TAG, 'Failed to send audio', err);
    throw err;
  }
}

export async function sendPresence(number: string, presence: 'composing' | 'recording' | 'paused' = 'composing'): Promise<void> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !key || !instance) return;

  const cleanNumber = number.includes('@lid') ? number : number.replace(/[^\d]/g, '');

  try {
    await fetch(`${url}/chat/presenceUpdate/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: cleanNumber,
        delay: 0,
        presence
      })
    });
  } catch (err) {
    logger.warn(TAG, 'Presence update failed');
  }
}
