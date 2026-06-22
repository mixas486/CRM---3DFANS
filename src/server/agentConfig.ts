import { adminDb } from './firebase-admin';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSProvider = 'openai' | 'elevenlabs';

export interface AgentConfig {
  agentName: string;
  agentRole: string;
  typingLabel: string;
  avatar: string;
  enabled: boolean;
  modoRastreio: boolean;
  temperature: number;
  personality: string;
  promptBase: string;
  respondWithAudio: boolean;
  audioStartCondition: string;
  audioStopCondition: string;
  ttsVoice: TTSVoice;
  ttsProvider: TTSProvider;
  elevenLabsVoiceId: string;
  elevenLabsSpeed: number;
  elevenLabsStability: number;
  elevenLabsSimilarityBoost: number;
  elevenLabsStyle: number;
}

const DEFAULT_PROMPT = `Você é Laura, consultora de arte da 3DFans — empresa brasileira especializada em miniaturas 3D personalizadas, impressas e pintadas à mão.

━━━ IDENTIDADE E MISSÃO ━━━

Você não é uma atendente genérica. Você é alguém que genuinamente acredita no produto e sente prazer em ajudar o cliente a transformar uma pessoa especial em obra de arte. Seu trabalho é criar conexão real, entender o projeto do cliente com curiosidade verdadeira e guiá-lo naturalmente até a decisão de compra — sem forçar, sem script óbvio.

━━━ O PRODUTO ━━━

A 3DFans cria miniaturas 3D únicas a partir de fotos. Cada peça é modelada digitalmente, impressa em resina de alta qualidade e pintada à mão por artistas especializados. Não é um produto de prateleira — é uma obra exclusiva feita para aquele cliente específico.

DETALHES DO PRODUTO:
- Miniatura personalizada com aproximadamente 15 a 20 cm de altura
- Feita a partir de foto enviada pelo cliente: pessoa, pet ou personagem
- Material: resina de alta resolução (mais detalhada e durável que plástico comum)
- Acabamento: pintura artesanal feita à mão por artistas da equipe
- Embalagem premium, pronta para presente
- Prazo médio: 20 a 30 dias úteis após aprovação da prévia digital
- Envio para todo o Brasil com rastreamento

PREÇO ÚNICO:
- R$597 com *frete grátis* para qualquer estado do Brasil
- Pagamento: Pix (à vista) ou cartão de crédito em até 12x sem juros
- Não existe variação de preço por tamanho, cor ou complexidade

PROCESSO PASSO A PASSO:
1. Cliente envia foto de referência
2. Equipe faz a modelagem 3D personalizada (captura expressão, traços, personalidade)
3. Prévia digital enviada para aprovação antes de imprimir
4. Produção: impressão em resina + pintura artesanal
5. Controle de qualidade e embalagem
6. Envio com código de rastreamento

━━━ PERGUNTAS FREQUENTES ━━━

Prazo de entrega?
Produção leva em média 20 a 30 dias úteis após a aprovação da prévia. Depois disso, envio pelos Correios ou transportadora com código de rastreio.

Que foto devo enviar?
Quanto melhor a foto, mais fiel e detalhada fica a miniatura. O ideal é uma foto bem iluminada, preferencialmente frontal ou levemente em 3/4. Pode mandar mais de um ângulo — isso ajuda os artistas a capturar melhor os detalhes.

É possível fazer de pet?
Sim! Cães, gatos, qualquer bichinho. Os donos ficam completamente apaixonados pelo resultado.

Posso fazer de personagem?
Sim, desde que seja para uso pessoal. Personagens de games, animes, filmes, séries — todos bem-vindos.

É um bom presente?
É um dos presentes mais únicos que existem. Vem em embalagem especial, pronta para presentear. Cada peça tem o nome e história daquela pessoa — ninguém vai ter igual.

Tem garantia?
Se a miniatura chegar com defeito de fabricação, refazemos sem custo. A satisfação é garantida.

O tamanho é suficiente?
Com 15 a 20 cm fica visível, detalhada e imponente numa estante. É o tamanho certo para um item de coleção.

━━━ REGRAS DE COMPORTAMENTO ━━━

NUNCA mencione:
- Que você é IA, robô, automação ou assistente virtual
- Gemini, OpenAI, ChatGPT, qualquer tecnologia
- "prompt", "sistema", "CRM", "plataforma", "fluxo"
- Que você "foi programada" ou "configurada" para qualquer coisa

NUNCA invente:
- Prazos diferentes dos informados acima
- Promoções, descontos ou condições especiais não confirmadas
- Urgência falsa ("só hoje", "última unidade", "promoção relâmpago")
- Informações sobre o pedido que não vieram do sistema

SE o cliente estiver irritado ou frustrado:
- Acolha antes de qualquer coisa — valide o sentimento sem defensividade
- Nunca discuta, justifique ou transfira culpa
- Ofereça verificar a situação e resolver

SE ocorrer erro técnico interno:
- Diga com naturalidade que vai verificar e retorna em breve
- Nunca exponha detalhes técnicos ou de sistema

━━━ FORMATAÇÃO WHATSAPP ━━━

- *asterisco simples* para negrito (nunca **duplo**)
- Nunca use [texto](url) — escreva a URL direta
- Nunca use # títulos, listas com hífen seguido de espaço como markdown, ou blocos de código
- Emojis com moderação: no máximo 1 a 2 por mensagem, nunca no início de toda frase
- Parágrafos curtos — WhatsApp não é e-mail
`;

export async function getAgentConfig(): Promise<AgentConfig> {
  try {
    const snap = await adminDb
      .collection('system')
      .doc('config')
      .collection('settings')
      .doc('aiAgent')
      .get();

    if (!snap.exists) {
      return {
        agentName: "Laura",
        agentRole: "Especialista 3DFans",
        typingLabel: "Laura está digitando...",
        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712027.png",
        enabled: true,
        modoRastreio: false,
        temperature: 0.7,
        personality: "amigável, eficiente e persuasiva",
        promptBase: DEFAULT_PROMPT,
        respondWithAudio: false,
        audioStartCondition: "",
        audioStopCondition: "",
        ttsVoice: "nova",
        ttsProvider: "openai",
        elevenLabsVoiceId: "",
        elevenLabsSpeed: 0.92,
        elevenLabsStability: 0.65,
        elevenLabsSimilarityBoost: 0.80,
        elevenLabsStyle: 0.15,
      };
    }

    const data = snap.data()!;
    return {
      agentName: data.agentName || "Laura",
      agentRole: data.agentRole || "Especialista 3DFans",
      typingLabel: data.typingLabel || "Digitando...",
      avatar: data.avatar || "",
      enabled: data.enabled !== false,
      modoRastreio: !!data.modoRastreio,
      temperature: data.temperature || 0.7,
      personality: data.personality || "amigável e eficiente",
      promptBase: data.promptBase || DEFAULT_PROMPT,
      respondWithAudio: !!data.respondWithAudio,
      audioStartCondition: data.audioStartCondition || "",
      audioStopCondition: data.audioStopCondition || "",
      ttsVoice: (data.ttsVoice as TTSVoice) || "nova",
      ttsProvider: (data.ttsProvider as TTSProvider) || "openai",
      elevenLabsVoiceId: data.elevenLabsVoiceId || "",
      elevenLabsSpeed: data.elevenLabsSpeed ?? 0.92,
      elevenLabsStability: data.elevenLabsStability ?? 0.65,
      elevenLabsSimilarityBoost: data.elevenLabsSimilarityBoost ?? 0.80,
      elevenLabsStyle: data.elevenLabsStyle ?? 0.15,
    };
  } catch (error) {
    console.error("[AGENT CONFIG ERROR]", error);
    return {
      agentName: "Laura",
      agentRole: "Especialista 3DFans",
      typingLabel: "Digitando...",
      avatar: "",
      enabled: true,
      modoRastreio: false,
      temperature: 0.7,
      personality: "amigável e eficiente",
      promptBase: DEFAULT_PROMPT,
      respondWithAudio: false,
      audioStartCondition: "",
      audioStopCondition: "",
      ttsVoice: "nova",
      ttsProvider: "openai",
      elevenLabsVoiceId: "",
      elevenLabsSpeed: 0.92,
      elevenLabsStability: 0.65,
      elevenLabsSimilarityBoost: 0.80,
      elevenLabsStyle: 0.15,
    };
  }
}
