/**
 * WhatsApp JID Normalizer
 * Handles all WhatsApp ID formats from Evolution API
 * Enterprise-grade normalization with full observability
 */

interface NormalizationResult {
  isValid: boolean;
  normalizedId: string;
  originalId: string;
  type: 'whatsapp' | 'lid' | 'group' | 'broadcast' | 'invalid';
  reason?: string;
}

/**
 * Normalize WhatsApp JID to clean phone number
 * Handles all Evolution API formats
 * 
 * Valid formats:
 * - 5511999999999@s.whatsapp.net -> 5511999999999
 * 
 * Invalid formats (ignored):
 * - 35004084162802@lid (LID - Linked Device)
 * - group@g.us (Group chats)
 * - status@broadcast (Status broadcasts)
 */
export function normalizeWhatsAppId(jid: string): NormalizationResult {
  if (!jid || typeof jid !== 'string') {
    console.log('[JID] Invalid input type', { jid, type: typeof jid });
    return {
      isValid: false,
      normalizedId: '',
      originalId: jid || '',
      type: 'invalid',
      reason: 'Empty or invalid input'
    };
  }

  const trimmedJid = jid.trim();
  
  // Check for LID (Linked Device ID)
  if (trimmedJid.includes('@lid')) {
    console.log('[JID] Ignored LID sender', { jid: trimmedJid });
    return {
      isValid: false,
      normalizedId: '',
      originalId: trimmedJid,
      type: 'lid',
      reason: 'LID (Linked Device) not supported'
    };
  }

  // Check for group chat
  if (trimmedJid.includes('@g.us')) {
    console.log('[JID] Ignored group sender', { jid: trimmedJid });
    return {
      isValid: false,
      normalizedId: '',
      originalId: trimmedJid,
      type: 'group',
      reason: 'Group chats not supported'
    };
  }

  // Check for status broadcast
  if (trimmedJid.includes('status@broadcast')) {
    console.log('[JID] Ignored broadcast sender', { jid: trimmedJid });
    return {
      isValid: false,
      normalizedId: '',
      originalId: trimmedJid,
      type: 'broadcast',
      reason: 'Status broadcasts not supported'
    };
  }

  // Handle valid WhatsApp format: xxxxx@s.whatsapp.net
  if (trimmedJid.includes('@s.whatsapp.net')) {
    const phoneNumber = trimmedJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    
    // Validate phone number (minimum 10 digits for international format)
    if (phoneNumber.length < 10) {
      console.log('[JID] Invalid phone number length', { jid: trimmedJid, extracted: phoneNumber });
      return {
        isValid: false,
        normalizedId: '',
        originalId: trimmedJid,
        type: 'invalid',
        reason: `Phone number too short: ${phoneNumber.length} digits`
      };
    }

    console.log('[JID] Valid WhatsApp sender', { 
      original: trimmedJid, 
      normalized: phoneNumber 
    });
    
    return {
      isValid: true,
      normalizedId: phoneNumber,
      originalId: trimmedJid,
      type: 'whatsapp'
    };
  }

  // Handle plain phone numbers (no @ symbol)
  if (!trimmedJid.includes('@')) {
    const phoneNumber = trimmedJid.replace(/\D/g, '');
    
    if (phoneNumber.length >= 10) {
      console.log('[JID] Valid plain phone number', { 
        original: trimmedJid, 
        normalized: phoneNumber 
      });
      
      return {
        isValid: true,
        normalizedId: phoneNumber,
        originalId: trimmedJid,
        type: 'whatsapp'
      };
    }
  }

  // Unknown format
  console.log('[JID] Unknown format', { jid: trimmedJid });
  return {
    isValid: false,
    normalizedId: '',
    originalId: trimmedJid,
    type: 'invalid',
    reason: 'Unknown JID format'
  };
}

/**
 * Check if JID should be ignored completely
 * Used for early filtering in webhook pipeline
 */
export function shouldIgnoreJid(jid: string): boolean {
  if (!jid) return true;
  
  const ignoredPatterns = [
    '@lid',
    '@g.us',
    'status@broadcast',
    '@broadcast',
    '@newsletter'
  ];
  
  return ignoredPatterns.some(pattern => jid.includes(pattern));
}

/**
 * Extract clean phone number from any WhatsApp format
 * Returns null if invalid
 */
export function extractPhoneFromJid(jid: string): string | null {
  const result = normalizeWhatsAppId(jid);
  return result.isValid ? result.normalizedId : null;
}

/**
 * Convert phone number to WhatsApp JID format
 */
export function phoneToJid(phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@s.whatsapp.net`;
}

/**
 * Validate if a phone number is a valid Brazilian E164 format
 */
export function isValidBrazilianWhatsApp(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Brazilian numbers: 55 + 2 digit area code + 8 or 9 digit number
  // Total: 12 or 13 digits starting with 55
  if (!cleanPhone.startsWith('55')) {
    return false;
  }
  
  if (cleanPhone.length !== 12 && cleanPhone.length !== 13) {
    return false;
  }
  
  // Area code validation (11-99, but some are invalid)
  const areaCode = cleanPhone.substring(2, 4);
  const validAreaCodes = [
    '11', '12', '13', '14', '15', '16', '17', '18', '19', // São Paulo
    '21', '22', '24', // Rio de Janeiro
    '27', '28', // Espírito Santo
    '31', '32', '33', '34', '35', '37', '38', // Minas Gerais
    '41', '42', '43', '44', '45', '46', // Paraná
    '47', '48', '49', // Santa Catarina
    '51', '53', '54', '55', // Rio Grande do Sul
    '61', // Distrito Federal
    '62', '64', // Goiás
    '63', // Tocantins
    '65', '66', // Mato Grosso
    '67', // Mato Grosso do Sul
    '68', // Acre
    '69', // Rondônia
    '71', '73', '74', '75', '77', // Bahia
    '79', // Sergipe
    '81', '87', // Pernambuco
    '82', // Alagoas
    '83', // Paraíba
    '84', // Rio Grande do Norte
    '85', '88', // Ceará
    '86', '89', // Piauí
    '91', '93', '94', // Pará
    '92', '97', // Amazonas
    '95', // Roraima
    '96', // Amapá
    '98', '99' // Maranhão
  ];
  
  if (!validAreaCodes.includes(areaCode)) {
    return false;
  }
  
  // Mobile numbers should start with 9 (for 9-digit) or be 8 digits
  const localNumber = cleanPhone.substring(4);
  if (localNumber.length === 9 && !localNumber.startsWith('9')) {
    return false;
  }
  
  return true;
}

export default normalizeWhatsAppId;