export function sanitizeWhatsAppJid(input?: string): string | null {
  if (!input) return null;

  const normalized = String(input).trim();

  // If it's already a lid or group/broadcast, keep it as is for identification
  if (
    normalized.includes('@lid') ||
    normalized.includes('@g.us') ||
    normalized.includes('@broadcast') ||
    normalized.includes('@newsletter')
  ) {
    return normalized;
  }

  const digits = normalized.replace(/\D/g, '');

  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

export function extractWhatsAppIdentity(body: any) {
  // Primary source of truth is ALWAYS remoteJid from the message key if available
  const rawRemoteJid = body?.data?.key?.remoteJid || body?.key?.remoteJid || body?.remoteJid || '';
  const senderPhone = body?.sender || body?.data?.participant || body?.data?.key?.participant || '';

  let resolvedSafe: string | null = null;
  
  // 1. Try rawRemoteJid first
  if (rawRemoteJid) {
      resolvedSafe = sanitizeWhatsAppJid(rawRemoteJid);
      console.log('[Identity] remoteJid found:', rawRemoteJid, '->', resolvedSafe);
  }

  // 2. ONLY if no remoteJid was resolved, try sender
  if (!resolvedSafe && senderPhone) {
      resolvedSafe = sanitizeWhatsAppJid(senderPhone);
      console.log('[Identity] remoteJid missing, using sender:', senderPhone, '->', resolvedSafe);
  }

  // Final remoteJid for conversation identity
  const remoteJid = resolvedSafe || rawRemoteJid || '';

  const result = {
    realPhone: resolvedSafe,
    jid: resolvedSafe,
    numericPhone: resolvedSafe ? resolvedSafe.replace(/\D/g, '') : '',
    phoneE164: resolvedSafe ? resolvedSafe.replace(/\D/g, '') : '',
    sender: senderPhone,
    remoteJid: remoteJid,
    isGroup: !!remoteJid.includes('@g.us'),
    isLid: !!remoteJid.includes('@lid'),
    isValid: !!remoteJid,
  };

  console.log('[CONVERSATION RESOLVED]', {
    incomingRemoteJid: rawRemoteJid,
    incomingSender: senderPhone,
    finalIdentity: result.remoteJid,
    isLid: result.isLid
  });

  return result;
}
