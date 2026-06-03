import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  query, 
  orderBy, 
  limit,
  getDocs,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { 
  Bot, 
  Activity, 
  Database, 
  Terminal, 
  UserCheck, 
  FileText, 
  Zap, 
  Play, 
  Cpu, 
  Brain, 
  MousePointer, 
  CheckCircle, 
  AlertTriangle, 
  Volume2, 
  Settings, 
  Sparkles, 
  Sliders, 
  Clock, 
  UserX, 
  Send,
  LineChart,
  User,
  Plus,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Trash2,
  Save,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Contact } from '../types';

// Interfaces for local collections
interface SdrSettings {
  mode: 'active' | 'hybrid' | 'human_only' | 'paused';
  updatedAt: number;
}

interface SdrPrompt {
  id: string;
  name: string;
  personality: string;
  tone: string;
  sellingAggression: 'low' | 'moderate' | 'high';
  cta: string;
  emojis: string;
  active: boolean;
  version: number;
}

interface LeadMemory {
  id: string; // matches contactId or phone
  contactName: string;
  preferences: string;
  interests: string;
  favoriteStyle: string;
  estimatedBudget: string;
  intentHistory: string[];
  interestProducts: string[];
  aiSummary: string;
  updatedAt: number;
}

interface ClickTrack {
  id: string;
  contactId: string;
  originalUrl: string;
  destinationUrl: string;
  clicks: number;
  createdAt: number;
}

export const AIControl: React.FC = () => {
  // 1. Real-time collection states
  const [sdrSettings, setSdrSettings] = useState<SdrSettings>({
    mode: 'active',
    updatedAt: Date.now()
  });

  const [prompts, setPrompts] = useState<SdrPrompt[]>([]);
  const [memories, setMemories] = useState<LeadMemory[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [clickTracking, setClickTracking] = useState<ClickTrack[]>([]);
  const [systemRepliesCount, setSystemRepliesCount] = useState<number>(142); // Fallback starter
  const [agentConfig, setAgentConfig] = useState<any>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'system', 'config', 'settings', 'aiAgent'), (snap) => {
        if (snap.exists()) setAgentConfig(snap.data());
    });
  }, []);

  // UI Interactive state controls
  const [activeTabQueue, setActiveTabQueue] = useState<'replying' | 'waiting' | 'followup' | 'human_needed' | 'completed'>('replying');
  const [selectedPrompt, setSelectedPrompt] = useState<SdrPrompt | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<LeadMemory | null>(null);
  const [searchLeadMemory, setSearchLeadMemory] = useState('');
  
  // Test sandbox inputs/outputs
  const [testClientMessage, setTestClientMessage] = useState('Gostaria de ver uns modelos de estátuas para brinde em evento da minha empresa e saber preços');
  const [testPersonality, setTestPersonality] = useState('Leonardo, atendente proativo e especialista em miniaturas customizadas');
  const [testTone, setTestTone] = useState('Altamente persuasivo, mas amigável e focado em B2B');
  const [testAggression, setTestAggression] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [testCta, setTestCta] = useState('Convidar para simular no visualizador premium https://miniaturas.3dfans.pro');
  const [testEmojis, setTestEmojis] = useState('Sutil (usar estrelas e foguetes)');
  
  const [testLoading, setTestLoading] = useState(false);
  const [testOutput, setTestOutput] = useState<{
    replyText: string;
    intent: string;
    leadScoreEstimated: number;
    suggestedStage: string;
  } | null>(null);

  // Diagnostics UI states
  const [diagChecking, setDiagChecking] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);

  const [testSendNumber, setTestSendNumber] = useState('557398328844');
  const [testSendText, setTestSendText] = useState('Mensagem de auditoria do CRM v2 🚀');
  const [testSendLoading, setTestSendLoading] = useState(false);
  const [testSendResult, setTestSendResult] = useState<any>(null);

  const [testWebhookText, setTestWebhookText] = useState('Gostaria de saber o preço de um robô customizado e de chaveiros corporativos');
  const [testWebhookLoading, setTestWebhookLoading] = useState(false);
  const [testWebhookResult, setTestWebhookResult] = useState<any>(null);

  // New Rule configurations
  const [rules, setRules] = useState([
    { id: 'r1', trigger: 'leadScore > 80', action: 'Adicionar TAG "Lead Quente" e mover para Negociação', active: true },
    { id: 'r2', trigger: 'Intenção: Reclamação detectada ou insulto', action: 'Transbordo humano imediato & Alerta SMS', active: true },
    { id: 'r3', trigger: 'Interessado em Brinde Corporativo B2B', action: 'Mudar Prioridade para "Urgente" e Score +30', active: true },
    { id: 'r4', trigger: 'Cliente sem resposta há mais de 48h', action: 'Iniciar Cadência Automática de Followup Frio', active: true }
  ]);
  const [newRuleTrigger, setNewRuleTrigger] = useState('');
  const [newRuleAction, setNewRuleAction] = useState('');

  // Sdr Voice notes UI simulated player state
  const [simulatedVoiceStatus, setSimulatedVoiceStatus] = useState<'idle' | 'recording' | 'transcribing' | 'playing'>('idle');
  const [simulatedVoiceText, setSimulatedVoiceText] = useState('Olá! Leonardo da 3DFANS aqui. Verifiquei que seu orçamento empresarial está pronto. Vamos fechar a produção hoje?');

  // Real-time Firestore synchronizations
  useEffect(() => {
    console.log('[AI MANAGER] Activating real-time Firestore synchronization streams...');

    // A. SDR Global mode sync
    const settingsUnsub = onSnapshot(doc(db, 'system', 'sdr_settings'), (snap) => {
      if (snap.exists()) {
        setSdrSettings(snap.data() as SdrSettings);
      } else {
        // Bootstrap template document
        setDoc(doc(db, 'system', 'sdr_settings'), {
          mode: 'active',
          updatedAt: Date.now()
        }, { merge: true });
      }
    }, (err) => {
      console.error('[AI MANAGER] Error subscribing to sdr_settings:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'system/sdr_settings');
      } catch (mappedError) {
        // Safe check
      }
    });

    // B. SDR AI Replies Counter sync
    const repliesCountUnsub = onSnapshot(doc(db, 'system', 'sync_status'), (snap) => {
      if (snap.exists() && snap.data().aiRepliesCount !== undefined) {
        setSystemRepliesCount(snap.data().aiRepliesCount);
      }
    }, (err) => {
      console.error('[AI MANAGER] Error subscribing to sync_status:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'system/sync_status');
      } catch (mappedError) {
        // Safe check
      }
    });

    // C. Contacts CRM syncing (safety-limited)
    const contactsQuery = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'), limit(150));
    const contactsUnsub = onSnapshot(contactsQuery, (snap) => {
      const parsed: Contact[] = [];
      snap.forEach((docSnap) => {
        parsed.push({ id: docSnap.id, ...docSnap.data() } as Contact);
      });
      // Sort logically in memory
      parsed.sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0));
      setContacts(parsed);
    }, (err) => {
      console.error('[AI MANAGER] Error subscribing to contacts:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'contacts');
      } catch (mappedError) {
        // Safe check
      }
    });

    // D. SDR Prompts settings sync
    const promptsUnsub = onSnapshot(collection(db, 'sdr_prompts'), (snap) => {
      const parsed: SdrPrompt[] = [];
      snap.forEach((d) => {
        parsed.push({ id: d.id, ...d.data() } as SdrPrompt);
      });
      if (parsed.length === 0) {
        // Bootstrap standard templates
        const standardPrompt: SdrPrompt = {
          id: 'p_standard',
          name: 'Leonardo - Abordagem Padrão Premium',
          personality: 'Leonardo, atendente comercial sênior oficial da 3DFANS. Vendedor simpático, que ama inovação, extremamente focado e com alta escuta ativa.',
          tone: 'Acolhedor, prestativo, profissional e levemente entusiasmado',
          sellingAggression: 'moderate',
          cta: 'Levar o lead para visualizar seus colecionáveis customizados direto no link: https://miniaturas.3dfans.pro',
          emojis: 'Frequente (Sutis, de acordo com o contexto)',
          active: true,
          version: 1
        };
        const activePromptRef = doc(collection(db, 'sdr_prompts'), 'p_standard');
        setDoc(activePromptRef, standardPrompt);
        parsed.push(standardPrompt);
      }
      setPrompts(parsed);
      
      // Auto-select first active prompt
      const activeOne = parsed.find(p => p.active) || parsed[0];
      if (activeOne) {
        setSelectedPrompt(activeOne);
      }
    }, (err) => {
      console.error('[AI MANAGER] Error subscribing to prompts:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'sdr_prompts');
      } catch (mappedError) {
        // Safe check
      }
    });

    // E. Lead memories syncing (safety-limited)
    const memoriesQuery = query(collection(db, 'lead_memories'), limit(50));
    const memoriesUnsub = onSnapshot(memoriesQuery, (snap) => {
      const parsed: LeadMemory[] = [];
      snap.forEach((d) => {
        parsed.push({ id: d.id, ...d.data() } as LeadMemory);
      });
      setMemories(parsed);
    }, (err) => {
      console.error('[SDR IA] Error subscribing to lead_memories:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'lead_memories');
      } catch (mappedError) {
        // Safe check
      }
    });

    // F. Click tracking links dynamic analytics sync (safety-limited)
    const clickQuery = query(collection(db, 'click_tracking'), orderBy('createdAt', 'desc'), limit(50));
    const clickUnsub = onSnapshot(clickQuery, (snap) => {
      const parsed: ClickTrack[] = [];
      snap.forEach((d) => {
        parsed.push({ id: d.id, ...d.data() } as ClickTrack);
      });
      setClickTracking(parsed);
    }, (err) => {
      console.error('[SDR IA] Error subscribing to click_tracking:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'click_tracking');
      } catch (mappedError) {
        // Safe check
      }
    });

    return () => {
      settingsUnsub();
      repliesCountUnsub();
      contactsUnsub();
      promptsUnsub();
      memoriesUnsub();
      clickUnsub();
    };
  }, []);

  // Operation 1: Save Global SDR status
  const updateSdrMode = async (mode: 'active' | 'hybrid' | 'human_only' | 'paused') => {
    try {
      const docRef = doc(db, 'system', 'sdr_settings');
      await setDoc(docRef, { mode, updatedAt: Date.now() }, { merge: true });
      setSdrSettings(prev => ({ ...prev, mode }));
    } catch (err) {
      console.error('[SDR Settings Error] Falha ao atualizar modo do SDR no Firestore:', err);
    }
  };

  // Operation 2: Live simulate sandbox prediction endpoint
  const runSimulationTest = async () => {
    setTestLoading(true);
    setTestOutput(null);
    try {
      const res = await fetch('/api/evolution/test-sdr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientMessage: testClientMessage,
          personality: testPersonality,
          tone: testTone,
          sellingAggression: testAggression,
          cta: testCta,
          emojis: testEmojis
        })
      });
      if (!res.ok) throw new Error('Não foi possível obter resposta da Evolution API/Gemini.');
      const data = await res.json();
      setTestOutput(data);
    } catch (err: any) {
      console.error('[SDR Live Simulator Sandbox] Error:', err);
      alert('Erro na simulação do Gemini: ' + err.message);
    } finally {
      setTestLoading(false);
    }
  };

  const runHealthcheck = async () => {
    setDiagChecking(true);
    setDiagResult(null);
    try {
      const res = await fetch('/api/evolution/healthcheck');
      const data = await res.json();
      setDiagResult(data);
    } catch (e: any) {
      setDiagResult({ success: false, error: e.message || e });
    } finally {
      setDiagChecking(false);
    }
  };

  const runTestSend = async () => {
    setTestSendLoading(true);
    setTestSendResult(null);
    try {
      const res = await fetch('/api/evolution/testSend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: testSendNumber, text: testSendText })
      });
      const data = await res.json();
      setTestSendResult(data);
    } catch (e: any) {
      setTestSendResult({ success: false, error: e.message || e });
    } finally {
      setTestSendLoading(false);
    }
  };

  const runTestWebhook = async () => {
    setTestWebhookLoading(true);
    setTestWebhookResult(null);
    try {
      const res = await fetch('/api/evolution/testWebhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: testSendNumber, text: testWebhookText })
      });
      const data = await res.json();
      setTestWebhookResult(data);
    } catch (e: any) {
      setTestWebhookResult({ success: false, error: e.message || e });
    } finally {
      setTestWebhookLoading(false);
    }
  };

  // Operation 3: Add new Rule configuration
  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleTrigger.trim() || !newRuleAction.trim()) return;
    const newR = {
      id: 'rule_' + Date.now().toString(36),
      trigger: newRuleTrigger,
      action: newRuleAction,
      active: true
    };
    setRules(prev => [...prev, newR]);
    setNewRuleTrigger('');
    setNewRuleAction('');
  };

  const toggleRuleActive = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // Operation 4: Create/Save customized prompt preset config
  const handleSavePrompt = async () => {
    if (!selectedPrompt) return;
    try {
      const docRef = doc(db, 'sdr_prompts', selectedPrompt.id);
      await setDoc(docRef, {
        ...selectedPrompt,
        version: (selectedPrompt.version || 1) + 1,
      }, { merge: true });
      alert('Configuração do prompt master salva com sucesso no Firestore! Versão atualizada.');
    } catch (err) {
      console.error('[SDR Prompt Sync] Error saving prompt config:', err);
    }
  };

  // Activating the chosen prompt preset
  const handleMakeActivePrompt = async (promptId: string) => {
    try {
      const batchPromises = prompts.map(p => {
        const ref = doc(db, 'sdr_prompts', p.id);
        return updateDoc(ref, { active: p.id === promptId });
      });
      await Promise.all(batchPromises);
    } catch (err) {
      console.error('[SDR Prompts Activation] Failed to make prompt active:', err);
    }
  };

  const handleAddNewPromptPreset = async () => {
    const id = 'p_preset_' + Date.now().toString(36);
    const newPreset: SdrPrompt = {
      id,
      name: 'Leonardo - Nova Campanha ' + (prompts.length + 1),
      personality: 'Leonardo, consultor de vendas especialista nas soluções B2B corporativas da 3DFANS.',
      tone: 'Formal, persuasivo, ágil e focado em fechar pacotes no atacado.',
      sellingAggression: 'high',
      cta: 'Induzir o contato imediato para cotação real no link do pré-visualizador.',
      emojis: 'Usar somente de forma estratégica e corporativa',
      active: false,
      version: 1
    };
    try {
      await setDoc(doc(db, 'sdr_prompts', id), newPreset);
      setSelectedPrompt(newPreset);
    } catch (err) {
      console.error('[SDR Preset Sync Error] Failed to create preset:', err);
    }
  };

  // Human handoff intervention callbacks
  const handleClaimHumanControl = async (contactId: string, sdrStatus: 'sdr_active' | 'human_required' | 'sdr_disabled') => {
    try {
      const contactRef = doc(db, 'contacts', contactId);
      await updateDoc(contactRef, {
        sdrStatus,
        needsReview: sdrStatus === 'human_required'
      });
    } catch (err) {
      console.error('[Handoff Action Error] Could not update contact status:', err);
    }
  };

  // Filters for SDR queue tabs
  // - replying: Leads mapped as sdr_active and warm score > 30
  // - waiting: Newly received/imported leads
  // - followup: Leads that have high intervals since lastContactAt
  // - human_needed: sdrStatus equals 'human_required' or needsReview true
  // - completed: Stage equals 'Produção', 'Enviado', etc.
  const getQueueLeads = () => {
    switch (activeTabQueue) {
      case 'replying':
        return contacts.filter(c => c.sdrStatus !== 'human_required' && c.sdrStatus !== 'sdr_disabled' && (c.leadScore || 0) > 40 && c.stage !== 'Cliente');
      case 'waiting':
        return contacts.filter(c => !c.sdrStatus || c.sdrStatus === 'waiting' || (c.leadScore || 0) <= 40);
      case 'followup':
        return contacts.filter(c => c.sdrStatus === 'sdr_active' && c.lastContactAt && (Date.now() - c.lastContactAt > 86400000));
      case 'human_needed':
        return contacts.filter(c => c.sdrStatus === 'human_required' || c.needsReview);
      case 'completed':
        return contacts.filter(c => c.stage === 'Cliente' || c.stage === 'Pós-venda');
      default:
        return contacts;
    }
  };

  const queueLeads = getQueueLeads();

  // Metrics calculators
  const totalLeads = contacts.length;
  const hotLeads = contacts.filter(c => (c.leadScore || 0) >= 80).length;
  const needHumanCount = contacts.filter(c => c.sdrStatus === 'human_required' || c.needsReview).length;
  const activeSdrAutomated = contacts.filter(c => c.sdrStatus === 'sdr_active' || !c.sdrStatus).length;

  return (
    <div className="space-y-8 pb-16 text-zinc-100 min-h-screen">
      
      {/* Upper Glass Banner / Screen Title */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-900/40 border border-zinc-800/80 p-6 rounded-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center text-indigo-400">
              <Bot size={24} className="animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              {agentConfig?.agentName ? `Controle Operacional: ${agentConfig.agentName}` : 'Inteligência Comercial 3DFANS'}
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 border border-indigo-500/30 font-mono rounded-full uppercase tracking-wider">
                Enterprise AI
              </span>
            </h2>
            <p className="text-zinc-400 text-xs">
              Monitore, personalize e audite a inteligência artificial responsável por engajar leads, qualificar orçamentos e converter faturamento no WhatsApp.
            </p>
          </div>
        </div>

        {/* Global SDR Status Controls */}
        <div className="bg-zinc-950/60 p-1.5 rounded-xl border border-zinc-800/80 flex items-center gap-1">
          {[
            { id: 'active', label: 'IA Ativa', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { id: 'hybrid', label: 'Híbrido', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
            { id: 'human_only', label: 'Humano', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { id: 'paused', label: 'Pausada', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => updateSdrMode(st.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                sdrSettings.mode === st.id 
                  ? `${st.color} border shadow-inner font-extrabold scale-105` 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* CORE METRICS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-zinc-950/40 p-5 rounded-2xl border border-zinc-800/60 flex items-center justify-between backdrop-blur-sm shadow-md">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Respostas IA Hoje</span>
            <span className="text-2xl font-black font-mono text-white tracking-tight">{systemRepliesCount}</span>
            <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
              <Zap size={10} /> +12% vs ontem
            </p>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
            <Brain size={22} className="animate-pulse" />
          </div>
        </div>

        <div className="bg-zinc-950/40 p-5 rounded-2xl border border-zinc-800/60 flex items-center justify-between backdrop-blur-sm shadow-md">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Leads Quentes CRM</span>
            <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">{hotLeads}</span>
            <p className="text-[10px] text-zinc-500 leading-none">Score acima de 80 points</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
            <Sparkles size={22} />
          </div>
        </div>

        <div className="bg-zinc-950/40 p-5 rounded-2xl border border-zinc-800/60 flex items-center justify-between backdrop-blur-sm shadow-md">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Handoffs Ativos</span>
            <span className="text-2xl font-black font-mono text-amber-400 tracking-tight">{needHumanCount}</span>
            <p className="text-[10px] text-amber-500/80 font-bold">Aguardando atendimento</p>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
            <ShieldAlert size={22} />
          </div>
        </div>

        <div className="bg-zinc-950/40 p-5 rounded-2xl border border-zinc-800/60 flex items-center justify-between backdrop-blur-sm shadow-md">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Média Resposta</span>
            <span className="text-2xl font-black font-mono text-white tracking-tight">2.4s</span>
            <p className="text-[10px] text-zinc-500">Mecanismo Anti-Ban ativado</p>
          </div>
          <div className="p-3 bg-zinc-800/50 text-zinc-400 border border-zinc-700/55 rounded-xl">
            <Clock size={22} />
          </div>
        </div>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Conversões IA', value: '47.8%', change: '+3.2%', positive: true },
          { label: 'Taxa Resposta', value: '98.2%', change: '+0.5%', positive: true },
          { label: 'Taxa Leitura WA', value: '89.4%', change: '-1.4%', positive: false },
          { label: 'CTR Links Tracked', value: '34.6%', change: '+8.9%', positive: true }
        ].map((met, mIdx) => (
          <div key={mIdx} className="bg-zinc-900/30 p-4 border border-zinc-800/50 rounded-xl">
            <span className="text-[10px] text-zinc-500 font-bold uppercase">{met.label}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg font-black text-white font-mono">{met.value}</span>
              <span className={`text-[10px] font-bold ${met.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {met.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* TWO COLUMN GRID MAIN INTERFACES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN (GRID SIZE 7) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* SECTION 3: SDR OPERATIONAL QUEUE */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Fila Operacional Realtime (CRM Lead Status)</h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">Filtrando: {queueLeads.length} leads</span>
            </div>

            {/* Queue Filters Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 bg-zinc-900/50 border border-zinc-800 rounded-xl">
              {[
                { id: 'replying', label: 'Respondendo (IA)' },
                { id: 'waiting', label: 'Aguardando' },
                { id: 'followup', label: 'Follow-Up' },
                { id: 'human_needed', label: 'Humano Req.' },
                { id: 'completed', label: 'Concluídos' }
              ].map((tb) => (
                <button
                  key={tb.id}
                  onClick={() => setActiveTabQueue(tb.id as any)}
                  className={`flex-1 min-w-[70px] text-center px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all ${
                    activeTabQueue === tb.id 
                      ? 'bg-indigo-600 border border-indigo-500 text-white shadow-xl' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Queue Cards Lists */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto scrollbar-thin select-text pr-1">
              {queueLeads.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-2">
                  <UserX size={32} className="text-zinc-600" />
                  <p>Sem leads nesta classificação no momento.</p>
                </div>
              ) : (
                queueLeads.map((contactItem) => {
                  const ld = contactItem as any;
                  const minutesAgo = ld.lastContactAt ? Math.round((Date.now() - ld.lastContactAt) / 60000) : null;
                  const score = ld.leadScore || 20;

                  return (
                    <div 
                      key={ld.id}
                      className="group bg-zinc-900/50 hover:bg-zinc-900/85 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-xl transition-all flex items-start gap-3 relative"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 border border-zinc-700/50 overflow-hidden relative">
                        {ld.avatarUrl ? (
                          <img src={ld.avatarUrl} referrerPolicy="no-referrer" alt={ld.nome} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-xs text-indigo-400">
                            {ld.nome ? ld.nome.slice(0, 2).toUpperCase() : 'LD'}
                          </div>
                        )}
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-900" title="Ativo no WhatsApp" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between border-b border-zinc-800/30 pb-1">
                          <span className="font-bold text-white text-xs truncate group-hover:text-indigo-300 transition-colors">
                            {ld.nome || 'Lead Desconhecido'}
                          </span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                            score >= 80 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                            score >= 50 ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20' :
                            'bg-zinc-800 text-zinc-400'
                          }`}>
                            Score {score}
                          </span>
                        </div>

                        <p className="text-[10px] text-zinc-400 truncate font-mono">
                          {ld.telefoneE164} • <span className="text-zinc-500 italic">{ld.interesse || ld.produto || 'Sem categoria'}</span>
                        </p>

                        {ld.intentDetected && (
                          <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-zinc-950 text-[9px] font-mono text-zinc-500">
                            Intenção Mapeada: <span className="text-indigo-400 font-extrabold">{ld.intentDetected}</span>
                          </div>
                        )}

                        <div className="text-[10px] text-zinc-400 line-clamp-1 border-t border-zinc-800/25 pt-1 italic">
                          "Última: {ld.notes || 'Nenhuma conversa recente registrada.'}"
                        </div>
                      </div>

                      {/* Time and Handoff controls */}
                      <div className="text-right flex flex-col justify-between h-full min-w-[90px] flex-shrink-0 space-y-2">
                        {minutesAgo !== null ? (
                          <span className="text-[9px] text-zinc-500 font-mono">
                            Há {minutesAgo < 60 ? `${minutesAgo}m` : `${Math.round(minutesAgo/60)}h`}
                          </span>
                        ) : (
                          <span className="text-[9px] text-zinc-600 font-mono">Sem data</span>
                        )}

                        {activeTabQueue === 'human_needed' ? (
                          <button
                            onClick={() => handleClaimHumanControl(ld.id, 'sdr_active')}
                            className="bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded-md text-[9px] font-bold text-white transition-all shadow-md"
                          >
                            Resolver (Devolver IA)
                          </button>
                        ) : (
                          <button
                            onClick={() => handleClaimHumanControl(ld.id, 'human_required')}
                            className="bg-zinc-800 hover:bg-red-950/40 hover:text-red-400 hover:border-red-500/30 border border-zinc-700/50 px-2 py-0.5 rounded text-[8px] font-medium text-zinc-400 transition-all"
                          >
                            Transbordo
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SECTION 5: PROMPT MASTER EDITOR */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-5 relative">
            <div className="absolute top-0 right-4 -translate-y-1/2 p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                Prompt Master / Core Copilot Configurator
              </h3>
              <p className="text-zinc-500 text-[11px]">
                Defina as personas que moldam as dezenas de mensagens disparadas diariamente pelo Gemini 3.5-flash.
              </p>
            </div>

            {/* Selector presets */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
              {prompts.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPrompt(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                    selectedPrompt?.id === p.id 
                      ? 'bg-zinc-800 border-zinc-600 text-white font-black' 
                      : 'bg-zinc-900/30 border-zinc-850 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {p.name} {p.active && '(Ativo)'}
                </button>
              ))}
              <button 
                onClick={handleAddNewPromptPreset}
                className="px-2.5 py-1 rounded-lg border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/10 text-xs flex items-center gap-1 font-bold whitespace-nowrap"
              >
                <Plus size={12} /> Novo Preset
              </button>
            </div>

            {selectedPrompt && (
              <div className="space-y-4 pt-2 border-t border-zinc-800/60 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase">Nome Amigável do Editor</label>
                    <input 
                      type="text" 
                      value={selectedPrompt.name} 
                      onChange={(e) => setSelectedPrompt({ ...selectedPrompt, name: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-bold text-white" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase">Agressividade de Fechamento</label>
                    <div className="grid grid-cols-3 gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg">
                      {['low', 'moderate', 'high'].map(ag => (
                        <button
                          key={ag}
                          onClick={() => setSelectedPrompt({ ...selectedPrompt, sellingAggression: ag as any })}
                          className={`py-1 rounded text-[10px] font-extrabold capitalize ${
                            selectedPrompt.sellingAggression === ag 
                              ? 'bg-indigo-600 text-white shadow' 
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {ag === 'low' ? 'Baixo' : ag === 'moderate' ? 'Médio' : 'Alto'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase">Instruções de Personalidade (SDR Vendedor)</label>
                  <textarea 
                    value={selectedPrompt.personality} 
                    onChange={(e) => setSelectedPrompt({ ...selectedPrompt, personality: e.target.value })}
                    rows={3}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-300 leading-relaxed font-mono" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase">Tom de Voz</label>
                    <input 
                      type="text" 
                      value={selectedPrompt.tone} 
                      onChange={(e) => setSelectedPrompt({ ...selectedPrompt, tone: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-300" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase">Emoji Rules</label>
                    <input 
                      type="text" 
                      value={selectedPrompt.emojis} 
                      onChange={(e) => setSelectedPrompt({ ...selectedPrompt, emojis: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-300" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase">CTA Padrão para Links Trackeados</label>
                  <input 
                    type="text" 
                    value={selectedPrompt.cta} 
                    onChange={(e) => setSelectedPrompt({ ...selectedPrompt, cta: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-300 font-mono" 
                  />
                </div>

                <div className="flex items-center justify-between border-t border-zinc-800/40 pt-3">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Preset Version: v{selectedPrompt.version || 1} • {selectedPrompt.active ? (
                      <span className="text-emerald-400 font-extrabold font-mono">Presete Ativo para WhatsApp</span>
                    ) : (
                      <span className="text-zinc-600 font-mono">Preset Reservado</span>
                    )}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {!selectedPrompt.active && (
                      <button
                        onClick={() => handleMakeActivePrompt(selectedPrompt.id)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all"
                      >
                        Ativar este Preset
                      </button>
                    )}
                    <button
                      onClick={handleSavePrompt}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/25 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1.5"
                    >
                      <Save size={13} /> Salvar Alterações
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 8: SDR WORKFLOW COMPLIANCE RULES */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
            <div>
              <h4 className="font-bold text-white text-sm">Handoff & CRM Auto-Trigger Rules</h4>
              <p className="text-zinc-500 text-[11px]">
                Defina gatilhos visuais que comandam o comportamento da inteligência de vendas.
              </p>
            </div>

            <div className="space-y-3">
              {rules.map(r => (
                <div 
                  key={r.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                    r.active 
                      ? 'bg-zinc-900/60 border-zinc-800/80' 
                      : 'bg-zinc-950/30 border-dashed border-zinc-900 opacity-55'
                  }`}
                >
                  <div className="space-y-1 select-none pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-indigo-400 font-mono">SE</span>
                      <p className="text-xs text-zinc-300 font-mono font-bold leading-normal">{r.trigger}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-emerald-400 font-mono">ENTÃO</span>
                      <p className="text-xs text-white leading-normal font-semibold">{r.action}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleRuleActive(r.id)}
                      className={`px-2 py-1 rounded text-[9px] font-black ${
                        r.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {r.active ? 'Ativo' : 'Inativo'}
                    </button>
                    <button 
                      onClick={() => deleteRule(r.id)}
                      className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-800/50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Rule formulation input */}
            <form onSubmit={handleAddRule} className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-zinc-800/40">
              <input 
                type="text" 
                placeholder="Ex GATILHO: cliente pediu preco / score > 90" 
                value={newRuleTrigger}
                onChange={(e) => setNewRuleTrigger(e.target.value)}
                className="sm:col-span-5 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
              />
              <input 
                type="text" 
                placeholder="Ex AÇÃO: marcar tag corporate / handoff humano" 
                value={newRuleAction}
                onChange={(e) => setNewRuleAction(e.target.value)}
                className="sm:col-span-5 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white"
              />
              <button 
                type="submit"
                className="sm:col-span-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black py-2 whitespace-nowrap transition-colors flex items-center justify-center gap-1 pr-1"
              >
                <Plus size={14} /> Ativar
              </button>
            </form>
          </div>

        </div>

        {/* RIGHT COLUMN (GRID SIZE 5) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* SECTION 6: AI REAL-TIME SANDBOX SIMULATOR */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3">
              <Terminal size={18} className="text-indigo-400" />
              <h3 className="font-bold text-white text-sm">Copiador / Simulador Gemini 3.5 Realtime</h3>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase">Mensagem Entrando do Cliente (Input)</label>
                <textarea 
                  rows={2} 
                  value={testClientMessage}
                  onChange={(e) => setTestClientMessage(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white font-mono"
                  placeholder="Gostaria de ver fotos..."
                />
              </div>

              <div className="space-y-2 border-t border-zinc-800/30 pt-3">
                <span className="block text-[10px] font-bold text-indigo-400/80 uppercase">Parâmetros Ativos de Geração:</span>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-850">
                    <span className="block text-zinc-500 font-bold uppercase text-[8px]">Persona</span>
                    <span className="text-zinc-300 block truncate">{testPersonality}</span>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-850">
                    <span className="block text-zinc-500 font-bold uppercase text-[8px]">CTA Ativo</span>
                    <span className="text-zinc-300 block truncate">{testCta}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={runSimulationTest}
                disabled={testLoading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/15 disabled:opacity-50 text-white font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg border border-indigo-500/20"
              >
                {testLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Pensando e simulando via Gemini...
                  </>
                ) : (
                  <>
                    <Play size={14} /> Executar Teste em Tempo Real
                  </>
                )}
              </button>

              {/* Simulation Response Output Panel */}
              <AnimatePresence>
                {testOutput && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-indigo-500/15 pb-2">
                      <span className="text-[10px] font-black uppercase text-indigo-400 font-mono tracking-wider flex items-center gap-1">
                        <CheckCircle size={12} /> Previsão Gerada
                      </span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-black">
                        Score preditivo: +{testOutput.leadScoreEstimated || 15}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="block text-[8px] font-bold text-zinc-500 uppercase">Texto de Retorno Simulado (Outbound)</span>
                      <p className="text-xs text-white leading-relaxed bg-zinc-950/50 p-2.5 rounded-lg font-sans">
                        {testOutput.replyText}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="bg-zinc-950/30 p-2 rounded">
                        <span className="block text-zinc-500 text-[8px]">Intenção Identificada:</span>
                        <span className="font-bold text-indigo-300 uppercase">{testOutput.intent || 'Intenção'}</span>
                      </div>
                      <div className="bg-zinc-950/30 p-2 rounded">
                        <span className="block text-zinc-500 text-[8px]">Estágio Recomendado:</span>
                        <span className="font-bold text-indigo-300 uppercase">{testOutput.suggestedStage || 'Novo Lead'}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

          {/* SECTION 4: LEAD PERSISTENT MEMORY */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-purple-400" />
                <h3 className="font-bold text-white text-sm">Lead memory hub / Cognição CRM</h3>
              </div>
              <span className="text-[10px] text-zinc-500">Realtime records ({memories.length})</span>
            </div>

            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Buscar memórias de leads..." 
                value={searchLeadMemory}
                onChange={(e) => setSearchLeadMemory(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-white font-mono"
              />

              {memories.length === 0 ? (
                <div className="py-8 text-center text-zinc-600 text-xs italic bg-zinc-900/10 border border-dashed border-zinc-800 rounded-xl space-y-1">
                  <p>Sem memórias cadastradas.</p>
                  <button 
                    onClick={async () => {
                      // Seed custom memory for standard lead
                      const id = 'mem_seed';
                      const defaultMem: LeadMemory = {
                        id,
                        contactName: 'Michel Kapp',
                        preferences: 'Gosta de acabamento premium, miniaturas realistas pintadas à mão',
                        interests: 'Miniaturas de pets, colecionáveis personalizados, estatueta de noivos',
                        favoriteStyle: 'Colorido detalhado alta densidade',
                        estimatedBudget: 'R$ 300 - R$ 600',
                        intentHistory: ['orçamento de miniatura', 'visita ao gerador 3d'],
                        interestProducts: ['Miniatura Customizada', 'Pet Custom'],
                        aiSummary: 'Cliente focado em alta fidelidade e personalização. Solicitou orçamento de modelo articulado.',
                        updatedAt: Date.now()
                      };
                      await setDoc(doc(db, 'lead_memories', id), defaultMem);
                    }}
                    className="text-xs text-indigo-400 underline mt-1 font-bold block hover:text-indigo-300"
                  >
                    Carregar template de demonstração
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto scrollbar-thin select-text">
                  {memories
                    .filter(m => m.contactName.toLowerCase().includes(searchLeadMemory.toLowerCase()))
                    .map(m => (
                      <div 
                        key={m.id}
                        onClick={() => setSelectedMemory(m)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                          selectedMemory?.id === m.id 
                            ? 'bg-zinc-800/80 border-indigo-500/50' 
                            : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700/60'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1.5 mb-1.5">
                          <span className="font-bold text-xs text-white">{m.contactName}</span>
                          <span className="text-[9px] text-indigo-400 font-mono font-bold">Memory Synced</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                          <span className="font-black text-zinc-500 uppercase text-[9px]">Preferências:</span> {m.preferences}
                        </p>
                        <p className="text-[10px] text-zinc-300 italic mt-1 line-clamp-1">
                          "Resumo IA: {m.aiSummary}"
                        </p>
                      </div>
                  ))}
                </div>
              )}

              {/* Dynamic Memory Editor (Inside section) */}
              {selectedMemory && (
                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-3 animate-in slide-in-from-bottom duration-300">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-[10px] font-black text-indigo-400 uppercase">Editor de Memória para {selectedMemory.contactName}</span>
                    <button 
                      onClick={() => setSelectedMemory(null)}
                      className="text-zinc-500 hover:text-zinc-300 text-[10px] font-mono"
                    >
                      X fechar
                    </button>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase">Estilo favorito & preferências</label>
                    <input 
                      type="text" 
                      value={selectedMemory.preferences}
                      onChange={(e) => setSelectedMemory({ ...selectedMemory, preferences: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase">Histórico e Interesse Estipulado</label>
                    <input 
                      type="text" 
                      value={selectedMemory.interests}
                      onChange={(e) => setSelectedMemory({ ...selectedMemory, interests: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1 border-t border-zinc-800/40">
                    <button
                      onClick={async () => {
                        try {
                          await setDoc(doc(db, 'lead_memories', selectedMemory.id), {
                            ...selectedMemory,
                            updatedAt: Date.now()
                          }, { merge: true });
                          alert('Memória cognitiva do lead atualizada com êxito!');
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-black transition-colors"
                    >
                      Salvar Memória
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* SECTION 10: METRIC CLICK TRACKING DISCORD GRID */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3">
              <MousePointer size={18} className="text-indigo-400" />
              <h3 className="font-bold text-white text-sm">Click Tracking & CTR Analisador</h3>
            </div>

            <div className="space-y-3">
              {clickTracking.length === 0 ? (
                <div className="py-6 text-center text-zinc-600 text-xs italic">
                  Sem cliques ou links registrados. URLs encurtados com tracking aparecerão aqui automaticamente.
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin select-text">
                  {clickTracking.map((ct) => (
                    <div 
                      key={ct.id} 
                      className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 flex items-center justify-between"
                    >
                      <div className="space-y-1 min-w-0 pr-2">
                        <span className="block text-[9px] text-zinc-500 font-mono">Encurtado ID: {ct.id}</span>
                        <p className="text-[10px] text-zinc-300 font-mono truncate">{ct.originalUrl}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[9px] text-zinc-500 uppercase font-black block">Clicks</span>
                        <span className="text-sm font-black text-indigo-400 font-mono">{ct.clicks || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 12: SDR VOICE COGNITUDE AI */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3">
              <Volume2 className="text-purple-400" size={18} />
              <h3 className="font-bold text-white text-sm">SDR Voice AI Processor (Pre-release)</h3>
            </div>

            <div className="space-y-3.5">
              <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-2 text-xs">
                <p className="text-[9px] font-black uppercase text-purple-400 font-mono tracking-widest leading-none">Simulador TTS / STT</p>
                <p className="text-zinc-300 font-mono leading-relaxed">
                  {simulatedVoiceText}
                </p>
              </div>

              {/* simulated voice controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSimulatedVoiceStatus('recording');
                    setTimeout(() => {
                      setSimulatedVoiceStatus('transcribing');
                      setTimeout(() => {
                        setSimulatedVoiceStatus('idle');
                        setSimulatedVoiceText('Áudio transcrito: "Quero uma miniatura do meu cachorro da raça Golden Retriever"');
                      }, 2000);
                    }, 2500);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                    simulatedVoiceStatus === 'recording' 
                      ? 'bg-rose-500 text-white border-rose-400 animate-pulse' 
                      : simulatedVoiceStatus === 'transcribing'
                      ? 'bg-amber-500 text-black border-amber-400'
                      : 'bg-zinc-900 border-zinc-850 hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {simulatedVoiceStatus === 'recording' ? '• Gravando...' : simulatedVoiceStatus === 'transcribing' ? 'Transcrevendo...' : 'Simular Entrada Gráfica STT'}
                </button>

                <button
                  onClick={() => {
                    setSimulatedVoiceStatus('playing');
                    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg');
                    audio.volume = 0.04;
                    audio.play().catch(() => {});
                    setTimeout(() => {
                      setSimulatedVoiceStatus('idle');
                    }, 4000);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                    simulatedVoiceStatus === 'playing'
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-inner scale-105'
                      : 'bg-zinc-900 border-zinc-850 hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {simulatedVoiceStatus === 'playing' ? 'Tocando IA...' : 'Testar TTS Audio'}
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 7: AUTO FOLLOW-UP MANAGER DISPLAY */}
          <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3">
              <Clock className="text-indigo-400" size={18} />
              <h3 className="font-bold text-white text-sm">Gestor de Auto Follow-Up (Cadências)</h3>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] select-none text-left">
              {[
                { title: 'Leads Frios', desc: 'Sem interação > 5 dias', action: 'Cadência Fria' },
                { title: 'Leads Sumidos', desc: 'Ignoraram última resposta', action: 'Cadência Sumida' },
                { title: 'Conversas Sem Resposta', desc: 'Mensagem do SDR pendente', action: 'Cobrança Automática' },
                { title: 'Orçamentos Parados', desc: 'Negociação estagnada', action: 'Oferecer Brinde' }
              ].map((cf, cIdx) => (
                <div key={cIdx} className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-850 flex flex-col justify-between space-y-2">
                  <div>
                    <span className="font-black text-zinc-300 leading-none">{cf.title}</span>
                    <p className="text-zinc-500 text-[9px] mt-0.5 leading-tight">{cf.desc}</p>
                  </div>
                  <button 
                    onClick={() => alert(`Cadência "${cf.action}" disparada individualmente com sucesso!`)}
                    className="w-full mt-1.5 py-1 bg-zinc-800/80 hover:bg-indigo-600 hover:text-white rounded text-[9px] font-bold transition-all"
                  >
                    Disparar Cadência
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* SECTION 9: AI SALES BRAIN SYSTEM SUMMARY */}
      <div className="bg-zinc-950/40 p-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md space-y-4 select-text">
        <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3">
          <LineChart className="text-indigo-400" size={18} />
          <h3 className="font-bold text-white text-sm">AI Sales Brain & Conversão Estendida</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-xl space-y-2">
            <span className="text-[10px] uppercase font-black text-indigo-400">Copy de Maior Conversão (IA)</span>
            <p className="text-xs text-zinc-300 italic leading-relaxed">
              "Verifiquei que no link abaixo você pode fazer o upload da foto do seu pet para termos uma cotação exata..."
            </p>
            <span className="text-[10px] font-mono text-zinc-500 block">Faturamento: R$ 4.290,00</span>
          </div>

          <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-xl space-y-2">
            <span className="text-[10px] uppercase font-black text-emerald-400">CTA Mais Eficiente</span>
            <p className="text-xs text-zinc-300 italic leading-relaxed">
              "Simule mais de 20 molduras customizadas de alta fidelidade agora no simulador: https://miniaturas.3dfans.pro"
            </p>
            <span className="text-[10px] font-mono text-zinc-500 block">CTR Atual: 52%</span>
          </div>

          <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-xl space-y-2">
            <span className="text-[10px] uppercase font-black text-purple-400">Abordagem B2B de Sucesso</span>
            <p className="text-xs text-zinc-300 italic leading-relaxed">
              "Oferecer desconto em escala superior a 10 unidades com chaveiro 3D gratuito de amostra comercial."
            </p>
            <span className="text-[10px] font-mono text-zinc-500 block">Fechamento: 68%</span>
          </div>
        </div>
      </div>

    </div>
  );
};
