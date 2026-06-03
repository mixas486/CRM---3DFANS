import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Clean basic formatting
export const cleanPhone = (phone: string): string => {
  return phone.replace(/[\s\-\(\)\+]/g, '');
};

// Returns { isDiscarded, needsReview, reason, normalized }
export const analyzeAndNormalizePhone = (phoneRaw: string): { 
  e164: string | null; 
  status: 'valid' | 'review' | 'discard'; 
  reason?: string 
} => {
  let cleaned = cleanPhone(phoneRaw);
  
  if (!cleaned) return { e164: null, status: 'discard', reason: 'Vazio' };
  
  // Repeated digits check
  if (/^(\d)\1{5,}$/.test(cleaned)) {
    return { e164: null, status: 'discard', reason: 'Dígitos repetidos' };
  }

  // Meaningless sequences like 123123123
  if (/^(123){2,}|(12345){2,}/.test(cleaned)) {
    return { e164: null, status: 'discard', reason: 'Sequência inválida' };
  }

  // If already full international brazilian: 55 + 11 digits = 13 digits
  if (cleaned.startsWith('55') && cleaned.length === 13) {
    // Keep as is
  } else if (cleaned.startsWith('0')) {
    // Remove leading zeros for area code
    cleaned = cleaned.replace(/^0+/, '');
  }

  if (cleaned.length < 10 || cleaned.length > 13) {
      if (!cleaned.startsWith('00')) {
        return { e164: null, status: 'discard', reason: 'Tamanho inválido' };
      }
  }

  // Suspicious international numbers starting with 00 (common misformatting)
  let status: 'valid' | 'review' = 'valid';
  let parseInput = cleaned;
  
  if (cleaned.startsWith('00')) {
    parseInput = '+' + cleaned.substring(2);
    status = 'review';
  } else if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    // Assume BR
    parseInput = '+55' + cleaned;
  } else if (cleaned.startsWith('55')) {
    parseInput = '+' + cleaned;
  }

  const phoneNumber = parsePhoneNumberFromString(parseInput);
  
  if (phoneNumber && phoneNumber.isValid()) {
    if (phoneNumber.country !== 'BR') {
      status = 'review';
    }
    return { 
      e164: phoneNumber.format('E.164'), 
      status, 
      reason: status === 'review' ? 'Internacional suspeito' : undefined 
    };
  }

  return { e164: null, status: 'discard', reason: 'Inválido na libphonenumber' };
};

export const isClearlyInvalidName = (name: string): boolean => {
  if (!name || name.trim().length === 0) return true;
  
  const cleanName = name.trim().toLowerCase();
  
  // Single char except specific cases
  if (cleanName.length < 2) return true;
  
  // Exact match blocks for common placeholder junk
  if (['aaaa', 'sem', 'kkk', 'n/d', 'nd', 'teste', 'desconhecido', '-'].includes(cleanName)) return true;

  // Too much repetition
  if (/(.)\1{4,}/.test(cleanName)) return true; // e.g. "aaaaa"

  return false;
};

const DDD_TO_STATE: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

export const getStateFromPhone = (e164: string | null): string => {
  if (!e164 || !e164.startsWith('+55') || e164.length < 13) return '';
  const ddd = e164.substring(3, 5);
  return DDD_TO_STATE[ddd] || '';
};
