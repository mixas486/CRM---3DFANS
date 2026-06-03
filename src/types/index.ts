export type ContactStage =
  | 'Novo Lead'
  | 'Interessado'
  | 'Orçamento Enviado'
  | 'Negociação'
  | 'Cliente'
  | 'Pós-venda';

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
  notes: string;
  createdAt: number;
}

export interface Campaign {
  id: string;
  nome: string;
  templateText: string;
  audienceFilter?: {
    tags?: string[];
    stages?: ContactStage[];
  };
  status: 'draft' | 'running' | 'paused' | 'completed' | 'error';
  startedAt?: number;
  startedBy?: string;
  stats: {
    enviados: number;
    entregues: number;
    falhas: number;
    respondidos: number;
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
  mediaUrl?: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received';
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
  openAiModel: string;
  optOutKeywords: string[];
  templates: Template[];
}
