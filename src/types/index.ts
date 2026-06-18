export type ContactStage =
  | 'Novo Lead'
  | 'Interessado'
  | 'Orçamento Enviado'
  | 'Negociação'
  | 'Cliente'
  | 'Pós-venda';

export interface ContactFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Contact {
  id: string;
  nome: string;
  telefoneRaw: string;
  telefoneE164: string;
  phoneE164?: string;
  email: string;
  cidade: string;
  estado?: string;
  ddd?: string;
  interesse: string;
  produto: string;
  tags: string[];
  stage: ContactStage;
  status: 'active' | 'archived';
  optIn: boolean;
  needsReview: boolean;
  valorEstimado?: number;
  leadScore?: number;
  sdrStatus?: string;
  intentDetected?: string;
  stageChangedAt?: number;
  lastContactAt: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastCampaignAt?: number | null;
  repliedAfterOutbound?: boolean;
  notes: string;
  createdAt: number;
  folderId?: string;
}

export interface Campaign {
  id: string;
  nome: string;
  templateText: string;
  audienceFilter?: {
    tags?: string[];
    stages?: ContactStage[];
  };
  status: 'draft' | 'running' | 'paused' | 'completed' | 'error' | 'scheduled';
  scheduledStartAt?: number | null;
  enableImageReply?: boolean;
  sendImageWithMessage?: boolean;
  imageReplyApiUrl?: string;
  enableAutoReply?: boolean;
  autoReplyText?: string;
  autoReplyImageUrl?: string;
  batchPauseUntil?: number | null;
  batchPauseDuration?: number;
  startedAt?: number;
  startedBy?: string;
  stats: {
    enviados: number;
    entregues: number;
    falhas: number;
    respondidos: number;
    ignorados?: number;
    lido?: number;
    aguardando?: number;
  };
  createdAt: number;
}

export interface Message {
  id: string;
  contactId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  mimeType?: string;
  fromMe?: boolean;
  timestamp: number;
  createdAt?: number;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  chatId?: string;
  remoteJid?: string;
  instance?: string;
  instanceId?: string;
}

export interface Template {
  id: string;
  name: string;
  type: string;
  body: string;
}

export interface Settings {
  evolutionUrl: string;
  instanceName: string;
  delayMinMs: number;
  delayMaxMs: number;
  dailyLimit: number;
  warmupLimit: number;
  pauseOnHighFailureRate: boolean;
  batchSize?: number;
  batchPauseMs?: number;
  enableDispatchSound?: boolean;
  dispatchSoundUrl?: string;
  enableReplySound?: boolean;
  replySoundUrl?: string;
  openAiModel: string;
  optOutKeywords: string[];
  templates: Template[];
}
