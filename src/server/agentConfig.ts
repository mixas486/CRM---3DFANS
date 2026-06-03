import { serverDb } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

export interface AgentConfig {
  agentName: string;
  agentRole: string;
  typingLabel: string;
  avatar: string;
  enabled: boolean;
  temperature: number;
  personality: string;
  promptBase: string;
}

export async function getAgentConfig(): Promise<AgentConfig> {
  try {
    const configRef = doc(serverDb, 'system', 'config', 'settings', 'aiAgent');
    const snap = await getDoc(configRef);

    if (!snap.exists()) {
      return {
        agentName: 'Laura',
        agentRole: 'Especialista 3DFans',
        typingLabel: 'Laura está digitando...',
        avatar: 'https://cdn-icons-png.flaticon.com/512/4712/4712027.png',
        enabled: true,
        temperature: 0.7,
        personality: 'amigável, eficiente e persuasiva',
        promptBase: 'Você é um assistente humano e prestativo.'
      };
    }

    const data = snap.data();
    return {
      agentName: data.agentName || 'Laura',
      agentRole: data.agentRole || 'Especialista 3DFans',
      typingLabel: data.typingLabel || 'Digitando...',
      avatar: data.avatar || '',
      enabled: data.enabled !== false,
      temperature: data.temperature || 0.7,
      personality: data.personality || 'amigável e eficiente',
      promptBase: data.promptBase || ''
    };
  } catch (error) {
    console.error('[AGENT CONFIG ERROR]', error);
    return {
      agentName: 'Laura',
      agentRole: 'Especialista 3DFans',
      typingLabel: 'Digitando...',
      avatar: '',
      enabled: true,
      temperature: 0.7,
      personality: 'amigável e eficiente',
      promptBase: ''
    };
  }
}
