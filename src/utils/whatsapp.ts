import { extractWhatsAppIdentity } from './whatsappIdentity';

export function extractWhatsAppPhone(body?: any): string | null {
  if (!body) return null;
  const inputObj = typeof body === 'string' ? { sender: body, remoteJid: body } : body;
  const identity = extractWhatsAppIdentity(inputObj);
  return identity.isValid ? identity.phoneE164 : null;
}
