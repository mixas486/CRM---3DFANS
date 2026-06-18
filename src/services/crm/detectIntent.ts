import { logger } from '../logging/logger';

const TAG = 'CRM';

export type Intent = 
  | 'greeting' 
  | 'asks_price' 
  | 'wants_preview' 
  | 'confirm_preview'
  | 'asks_deadline' 
  | 'asks_shipping' 
  | 'asks_material' 
  | 'negotiating' 
  | 'wants_discount' 
  | 'ready_to_buy' 
  | 'unknown';

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  
  if (/^(sim|vamos|bora|quero|fechado|ok|pode fazer)$/i.test(t)) return 'confirm_preview';
  if (/comprar|fechar|link|pagamento|pagar|pix/i.test(t)) return 'ready_to_buy';
  if (/desconto|barato|abaixa/i.test(t)) return 'wants_discount';
  if (/quanto|valor|preço|r\$|custar/i.test(t)) return 'asks_price';
  if (/miniatura|boneco|mascote|faz|orçamento|desse|gera/i.test(t)) return 'wants_preview';
  if (/tempo|dia|prazo|demora|chega/i.test(t)) return 'asks_deadline';
  if (/frete|envio|entrega|onde/i.test(t)) return 'asks_shipping';
  if (/material|resina|feito|plástico/i.test(t)) return 'asks_material';
  if (/consegue|melhorar|pode|fazer/i.test(t)) return 'negotiating';
  if (/oi|olá|bom dia|boa tarde|boa noite/i.test(t)) return 'greeting';
  
  return 'unknown';
}
