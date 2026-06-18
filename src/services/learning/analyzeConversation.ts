import { generateAIResponse } from "../../server/aiProviders";
import { logger } from "../logging/logger";

const TAG = 'CONV_ANALYZER';

export type OutcomeType = 'sale' | 'engaged' | 'lost';

export interface ConversationAnalysis {
  whatWorked: string;
  keyMessages: Array<{
    message: string;
    whyItWorked: string;
  }>;
  objections: string[];
  objectionHandling: string;
  tone: string;
  successScore: number;
  tags: string[];
}

const OUTCOME_LABEL: Record<OutcomeType, string> = {
  sale: 'VENDA REALIZADA (cliente chegou ao checkout)',
  engaged: 'CLIENTE ENGAJADO (está negociando ativamente)',
  lost: 'CLIENTE PERDIDO (parou de responder ou desistiu)',
};

export async function analyzeConversation(
  messages: Array<{ fromMe: boolean; text?: string }>,
  outcome: OutcomeType
): Promise<ConversationAnalysis | null> {
  try {
    const filtered = messages.filter(m => m.text && m.text.trim().length > 2);
    if (filtered.length < 4) return null;

    const conversationText = filtered
      .map(m => `${m.fromMe ? 'LAURA' : 'CLIENTE'}: ${m.text}`)
      .join('\n');

    const { response } = await generateAIResponse(
      `Analise esta conversa de venda de miniaturas 3D personalizadas:\n\nRESULTADO: ${OUTCOME_LABEL[outcome]}\n\nCONVERSA:\n${conversationText}\n\nRetorne SOMENTE JSON válido, sem markdown nem explicações.`,
      `Você é um analista de vendas especialista. Extraia insights desta conversa no formato JSON exato:
{
  "whatWorked": "resumo do que funcionou bem nesta conversa",
  "keyMessages": [
    {"message": "trecho exato ou resumido da mensagem que funcionou", "whyItWorked": "por que essa mensagem foi eficaz"}
  ],
  "objections": ["objeção levantada pelo cliente 1", "objeção 2"],
  "objectionHandling": "como as objeções foram contornadas",
  "tone": "tom predominante usado (ex: empolgante, acolhedor, direto)",
  "successScore": 75,
  "tags": ["tag relevante 1", "tag 2"]
}
successScore é 0-100 baseado no quão bem foi a conversa para o vendedor.`,
      0.2
    );

    if (!response) return null;

    const cleaned = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(cleaned) as ConversationAnalysis;
  } catch (err) {
    logger.error(TAG, 'Failed to analyze conversation', err);
    return null;
  }
}
