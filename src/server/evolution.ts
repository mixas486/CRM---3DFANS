/**
 * Sends a text message via Evolution API.
 * 
 * @param number - Phone number (E.164) or Business LID (e.g. 270033905316003@lid)
 * @param text - Message text to send
 * @throws Error if credentials not configured or number format invalid
 */
export const sendEvolutionMessage = async (number: string, text: string, quotedMsgId?: string) => {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  
  if (!url || !key || !instance) {
    throw new Error('Evolution API credentials not configured: EVOLUTION_API_URL, EVOLUTION_API_KEY, and EVOLUTION_INSTANCE must be set in .env');
  }
  
  // Normalize and validate number
  if (!number || typeof number !== 'string') {
    throw new Error(`[Evolution] Invalid number type: ${typeof number}`);
  }

  if (number.includes('@g.us') || number.includes('@broadcast')) {
    throw new Error(`[Evolution] BLOCKED group/broadcast identifier: ${number}`);
  }

  let finalNumber = number;

  // If it's a @lid, send exactly as is (Evolution/Baileys supports it natively)
  if (!number.includes('@lid')) {
    // Regular phone number: clean up and validate
    const cleanNumber = number
      .replace('@s.whatsapp.net', '')
      .replace(/[^\d+]/g, '');

    if (!cleanNumber || cleanNumber.length < 10) {
      throw new Error(`[Evolution] Invalid phone number after cleanup: ${number} -> ${cleanNumber}`);
    }

    finalNumber = cleanNumber;
    if (finalNumber.startsWith('+')) {
      finalNumber = finalNumber.substring(1);
    }
  }

  console.log(`[Evolution Send] Sending to: ${finalNumber} (original: ${number})`);
  
  const baseUrl = url.replace(/\/$/, '');

  const payload: any = {
    number: finalNumber,
    text: text,
    delay: 1200,
    linkPreview: false,
    options: {
      checkNumber: false,
      verifyNumber: false
    }
  };

  if (quotedMsgId) {
    payload.quoted = {
      key: {
        id: quotedMsgId
      }
    };
    console.log(`[Evolution Send] Quoting message ID: ${quotedMsgId}`);
  }

  // Some Evolution API versions accept checkNumber at the root
  payload.checkNumber = false;
  payload.verifyNumber = false;

  const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send message: ${response.status} ${errorText}`);
  }
  return response.json();
};

/**
 * Sends an image message via Evolution API.
 */
export const sendEvolutionImage = async (number: string, imageUrl: string, caption?: string, quotedMsgId?: string) => {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  
  if (!url || !key || !instance) {
    throw new Error('Evolution API credentials not configured');
  }

  let finalNumber = number;
  if (!number.includes('@lid')) {
    const cleanNumber = number.replace('@s.whatsapp.net', '').replace(/[^\d+]/g, '');
    finalNumber = cleanNumber.startsWith('+') ? cleanNumber.substring(1) : cleanNumber;
  }

  const baseUrl = url.replace(/\/$/, '');

  const payload: any = {
    number: finalNumber,
    mediaMessage: {
      mediatype: "image",
      caption: caption || "",
      media: imageUrl
    },
    options: {
      checkNumber: false,
      verifyNumber: false
    }
  };

  if (quotedMsgId) {
    payload.quoted = {
      key: { id: quotedMsgId }
    };
  }

  console.log('[EVOLUTION IMAGE PAYLOAD]', JSON.stringify(payload, null, 2));

  const response = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resData = await response.json();
  console.log('[EVOLUTION IMAGE RESPONSE]', JSON.stringify(resData, null, 2));

  if (!response.ok) {
    const errorText = JSON.stringify(resData);
    console.error('[EVOLUTION MEDIA ERROR]', errorText);
    throw new Error(`Failed to send image: ${response.status} ${errorText}`);
  }
  return resData;
};

/**
 * Sends a presence update (composing/typing) via Evolution API.
 * 
 * @param number - Phone number (E.164) or Business LID
 * @param presence - 'composing' | 'recording' | 'paused'
 */
export const sendEvolutionPresence = async (number: string, presence: 'composing' | 'recording' | 'paused' = 'composing') => {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  
  if (!url || !key || !instance) return;
  
  const baseUrl = url.replace(/\/$/, '');
  
  try {
    const cleanNumber = number.includes('@lid') ? number : number.replace(/[^\d]/g, '');
    
    await fetch(`${baseUrl}/chat/presenceUpdate/${instance}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: cleanNumber,
        delay: 0,
        presence: presence
      })
    });
  } catch (err) {
    console.warn('[Evolution Presence Error]', err);
  }
};
