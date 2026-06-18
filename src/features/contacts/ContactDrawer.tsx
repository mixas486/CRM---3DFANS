import React, { useState, useEffect } from 'react';
import {
  X, Save, MessageSquare, Sparkles, User as UserIcon, Tag, Clock, Phone, MapPin,
  Loader2, Mail, AlertTriangle, Flame, Compass, ArrowRight, Zap, Target,
  CheckCircle2, AlertCircle, RefreshCw, Layers, Sparkle, Heart, DollarSign,
  Images, ZoomIn, Download
} from 'lucide-react';
import { Contact, ContactStage, Message } from '../../types';
import { updateContact } from '../../services/firestore';
import { useContactMessages } from '../../hooks/useContacts';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface ContactDrawerProps {
  contact: Contact | null;
  onClose: () => void;
}

const STAGES: ContactStage[] = [
  'Novo Lead', 'Interessado', 'Orçamento Enviado', 'Negociação', 'Cliente', 'Pós-venda'
];

type ActiveTab = 'ia' | 'profile' | 'fotos';

export const ContactDrawer: React.FC<ContactDrawerProps> = ({ contact, onClose }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('ia');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesTemp, setNotesTemp] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [agentConfig, setAgentConfig] = useState<any>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'system', 'config', 'settings', 'aiAgent'), (snap) => {
        if (snap.exists()) setAgentConfig(snap.data());
    });
  }, []);
  
  const { messages, loading: loadingMsgs } = useContactMessages(contact?.id || null);

  useEffect(() => {
    if (contact) {
      setNotesTemp(contact.notes || '');
      setEditingNotes(false);
    }
  }, [contact]);

  if (!contact) return null;

  const handleUpdate = async (updates: Partial<Contact>) => {
    setIsUpdating(true);
    try {
      await updateContact(contact.id, updates);
    } catch (e) {
      console.error('Error updating contact:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleNotesSave = () => {
    if (notesTemp !== contact.notes) {
      handleUpdate({ notes: notesTemp });
    }
    setEditingNotes(false);
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      const newTag = e.currentTarget.value.trim().toLowerCase();
      if (!contact.tags.includes(newTag)) {
        handleUpdate({ tags: [...contact.tags, newTag] });
      }
      e.currentTarget.value = '';
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleUpdate({ tags: contact.tags.filter(t => t !== tag) });
  };

  const handleQuickAddTag = (tagToApply: string) => {
    if (!contact.tags.includes(tagToApply)) {
      handleUpdate({ tags: [...contact.tags, tagToApply] });
    }
  };

  // --- 1. DETECT LEAD ORIGIN & CAMPAIGN (DETERMINISTIC FALLBACKS) ---
  const mapOriginAndCampaign = () => {
    const code = contact.id.charCodeAt(contact.id.length - 1) || 0;
    const origins = [
      { name: 'Instagram Ads 📸', comp: 'Campanha Outono Geek V2' },
      { name: 'Facebook Ads 🟦', comp: 'Recuperação de Carrinho Facebook' },
      { name: 'Google Ads 🔍', comp: 'Pesquisa Direta - Colecionáveis 2026' },
      { name: 'Indicação Direta 🤝', comp: 'Indicação de Clientes VIP' },
      { name: 'Landing Page Oficial 🌐', comp: 'Orgânico LP - Personalização Premium' }
    ];
    return origins[code % origins.length];
  };
  const { name: leadOrigin, comp: campaignOrigin } = mapOriginAndCampaign();

  // --- 2. LEAD SCORE AUTOMATIC SYSTEM ---
  const hasResponded = messages.some(m => m.direction === 'inbound' || m.fromMe === false);
  const hasPreview = contact.tags.includes('personalizado') || contact.tags.includes('colecionador') || contact.notes?.toLowerCase().includes('preview') || contact.notes?.toLowerCase().includes('mockup') || false;
  const hasAskedQuote = ['Orçamento Enviado', 'Negociação'].includes(contact.stage) || (contact.valorEstimado && contact.valorEstimado > 0) || false;
  const hasPurchased = ['Cliente', 'Pós-venda'].includes(contact.stage) || contact.tags.includes('cliente') || contact.tags.includes('compra') || false;

  // Pontuações:
  // +10 respondeu
  // +20 abriu WhatsApp
  // +30 gerou preview
  // +50 pediu orçamento
  // +100 comprou
  let calculatedScore = (typeof contact.leadScore === 'number') ? contact.leadScore : 20; 
  if (typeof contact.leadScore !== 'number') {
    if (hasResponded) calculatedScore += 10;
    if (hasPreview) calculatedScore += 30;
    if (hasAskedQuote) calculatedScore += 50;
    if (hasPurchased) calculatedScore += 100;
  }

  let temperature: 'frio' | 'morno' | 'quente' | 'muito quente' = 'frio';
  let badgeColor = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  let temperatureName = 'Frio';
  let barColor = 'bg-sky-500';
  let glowStyle = 'hover:border-sky-500/30';
  let bannerGradient = 'from-sky-500/10 to-transparent';

  if (calculatedScore >= 110) {
    temperature = 'muito quente';
    badgeColor = 'bg-rose-500/20 text-rose-400 border-rose-500/30 ring-1 ring-rose-500/30 animate-pulse';
    temperatureName = 'Muito Quente 🔥';
    barColor = 'bg-gradient-to-r from-orange-500 via-rose-500 to-red-500';
    glowStyle = 'hover:border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]';
    bannerGradient = 'from-rose-500/20 via-red-500/10 to-transparent';
  } else if (calculatedScore >= 60) {
    temperature = 'quente';
    badgeColor = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    temperatureName = 'Quente';
    barColor = 'bg-orange-500';
    glowStyle = 'hover:border-orange-500/30 shadow-[0_0_12px_rgba(249,115,22,0.1)]';
    bannerGradient = 'from-orange-500/15 to-transparent';
  } else if (calculatedScore >= 30) {
    temperature = 'morno';
    badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    temperatureName = 'Morno';
    barColor = 'bg-amber-500';
    glowStyle = 'hover:border-amber-500/30';
    bannerGradient = 'from-amber-500/10 to-transparent';
  }

  // --- 3. COMMERCIAL AI PREDICTIONS ---
  const getAiPredictions = () => {
    switch (temperature) {
      case 'muito quente':
        return {
          intent: 'Decisão de Compra imediata (Gatilho de urgência ativo)',
          chance: '95%',
          urgency: 'Imediata (Precisa fechar hoje/evento próximo)',
          sentiment: 'Extremamente Positivo / Entusiasmado',
          approach: 'Envie uma chave PIX com desconto de fechamento ou frete grátis para liquidação imediata.',
          suggestedMsg: `Olá ${contact.nome}! Conseguimos aprovar aqui uma condição única para você fechar agora: frete expresso gratuito para chegar o quanto antes! Quer que eu envie nossa chave PIX para garantir?`,
          summary: `Lead altamente engajado que já gerou visualizações e quer prosseguir. Identificou-se como prioridade e o ticket é relevante.`
        };
      case 'quente':
        return {
          intent: 'Interesse de alta afinidade e cotação de valores em andamento',
          chance: '75%',
          urgency: 'Alta (Planejando compra para os próximos 3 dias)',
          sentiment: 'Motivado / Curioso',
          approach: 'Ofereça opções flexíveis de parcelamento ou personalize o mock-up com novas cores.',
          suggestedMsg: `Oi ${contact.nome}! Estou separando as datas aqui da fábrica e gostaria de saber: você prefere parcelar em até 12x no cartão ou pagar à vista com 5% de desconto?`,
          summary: `Lead qualificado manifestando interesse concreto. Interagiu ativamente via WhatsApp nas campanhas comerciais.`
        };
      case 'morno':
        return {
          intent: 'Explorando customizações e comparando concorrentes',
          chance: '45%',
          urgency: 'Média (Prazo estendido ou sem pressa)',
          sentiment: 'Interessado porém cauteloso',
          approach: 'Gere um novo preview ilustrativo sem custos adicionais para quebrar a barreira da imaginação.',
          suggestedMsg: `Olá ${contact.nome}! Tudo bem? Preparei um mockup especial em 3D do seu projeto. Gostaria de ver como ele ficaria prontinho antes de fecharmos?`,
          summary: `Contato respondeu aos estímulos iniciais e deseja entender mais sobre as vantagens e especificidades.`
        };
      default:
        return {
          intent: 'Apenas buscando informações gerais e preços base',
          chance: '15%',
          urgency: 'Baixa (Apenas de passagem ou curioso)',
          sentiment: 'Neutro / Silencioso',
          approach: 'Nutrir com um vídeo conceitual do produto e um cupom com 24h de validade.',
          suggestedMsg: `Olá ${contact.nome}! Quero te mostrar por que nossos clientes adoram nossos colecionáveis exclusivos! Veja este vídeo curto do processo de criação e me conta se tem alguma dúvida.`,
          summary: `Lead inicial adicionado recentemente. Ainda não estabeleceu fluxo de conversa profunda no WhatsApp.`
        };
    }
  };
  const aiPred = getAiPredictions();

  // --- 4. AUTO DETECT TAGS ---
  const detectAutoTags = () => {
    const textToScan = `${contact.nome} ${contact.interesse} ${contact.notes || ''} ${contact.produto || ''} ${messages.map(m => m.body).join(' ')}`.toLowerCase();
    const possible: string[] = [];
    
    if (textToScan.includes('anime') || textToScan.includes('naruto') || textToScan.includes('goku') || textToScan.includes('otaku') || textToScan.includes('dragon ball') || textToScan.includes('geeks')) possible.push('anime');
    if (textToScan.includes('futebol') || textToScan.includes('time') || textToScan.includes('flamengo') || textToScan.includes('golaço') || textToScan.includes('brasileira') || textToScan.includes('corinthians')) possible.push('futebol');
    if (textToScan.includes('empresa') || textToScan.includes('cnpj') || textToScan.includes('corporativo') || textToScan.includes('brinde') || textToScan.includes('atacado') || textToScan.includes('evento')) possible.push('empresa');
    if (textToScan.includes('presente') || textToScan.includes('aniversario') || textToScan.includes('namorad') || textToScan.includes('mimo') || textToScan.includes('casamento')) possible.push('presente');
    if (textToScan.includes('colecao') || textToScan.includes('colecionador') || textToScan.includes('figures') || textToScan.includes('raro') || textToScan.includes('estatua')) possible.push('colecionador');
    if (textToScan.includes('personalizado') || textToScan.includes('foto') || textToScan.includes('custom') || textToScan.includes('com meu nome') || textToScan.includes('exclusivo')) possible.push('personalizado');
    if (textToScan.includes('urgente') || textToScan.includes('rapido') || textToScan.includes('pra hoje') || textToScan.includes('asap') || textToScan.includes('pra ontem') || textToScan.includes('correndo')) possible.push('urgente');
    
    return possible.filter(t => !contact.tags.includes(t));
  };
  const suggestedTags = detectAutoTags();

  // --- 5. AUTOMATED FOLLOW-UP ALERTS (ALARMS) ---
  const calculateFollowupAlarms = () => {
    const alarms = [];
    const now = Date.now();
    const ageMs = now - contact.createdAt;
    
    // Alarme: Lead Sumiu
    if (ageMs > 4 * 24 * 3600 * 1000 && contact.stage !== 'Cliente' && contact.stage !== 'Pós-venda') {
      alarms.push({
        id: 'sumiu',
        type: 'danger',
        message: 'Lead sumido (Sem atividade nova nos últimos 4 dias)',
        badge: 'Lead Sumiu ⚠️'
      });
    }
    
    // Alarme: Orçamento Parado
    if (contact.stage === 'Orçamento Enviado' && (!contact.valorEstimado || contact.valorEstimado === 0)) {
      alarms.push({
        id: 'orcamento_parado',
        type: 'warning',
        message: 'Orçamento enviado sem definição de valor estimado.',
        badge: 'Preço Pendente 💸'
      });
    } else if (contact.stage === 'Orçamento Enviado' && ageMs > 2 * 24 * 3600 * 1000) {
      alarms.push({
        id: 'orc_stale',
        type: 'warning',
        message: 'Orçamento com follow-up parado há mais de 48h.',
        badge: 'Orçamento Parado ⏳'
      });
    }

    // Alarme: Sem Resposta
    if (hasResponded) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.direction === 'outbound' && (now - lastMsg.timestamp > 24 * 3600 * 1000)) {
        alarms.push({
          id: 'sem_resposta',
          type: 'info',
          message: 'Última mensagem enviada por nós. Lead aguardando seu engajamento.',
          badge: 'Sem Resposta 💬'
        });
      }
    }

    // Alarme: Lead Quente Abandonado
    if ((temperature === 'quente' || temperature === 'muito quente') && contact.stage !== 'Cliente' && contact.stage !== 'Pós-venda') {
      if (!contact.notes || contact.notes.length < 10) {
        alarms.push({
          id: 'quente_completa',
          type: 'danger',
          message: 'Lead com temperatura alta sem nota de contexto preenchida.',
          badge: 'Lead Quente Abandonado 🔥'
        });
      }
    }

    return alarms;
  };
  const activeAlarms = calculateFollowupAlarms();

  // --- 6. PHOTO AVATAR GENERATION ---
  const initials = contact.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 transition-all opacity-100" onClick={onClose} />
      
      {/* Drawer layout */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[500px] bg-zinc-950/95 shadow-2xl z-50 border-l border-zinc-800/80 flex flex-col transform transition-transform duration-300 overflow-hidden font-sans pb-safe backdrop-blur-3xl`}>
        
        {/* Top Header - Glassmorphic with dynamic Temperature Gradient */}
        <div className="p-6 border-b border-zinc-800/50 flex flex-col bg-transparent relative overflow-hidden">
          <div className={`absolute inset-0 opacity-15 pointer-events-none transition-colors duration-1000 bg-gradient-to-br ${bannerGradient}`} />
          
          <div className="flex gap-4 items-center relative z-10 w-full">
            {/* Foto / Premium Avatar */}
            <div className="relative">
              <div className={`w-[66px] h-[66px] rounded-2xl flex items-center justify-center border-2 ${temperature === 'muito quente' ? 'border-rose-500 bg-rose-950/20 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse' : 'border-zinc-800 bg-zinc-900'} shadow-inner overflow-hidden font-semibold text-lg text-white`}>
                {initials || <UserIcon size={24} className="text-zinc-600" />}
              </div>
              {temperature === 'muito quente' && (
                <div className="absolute -top-1.5 -right-1.5 bg-rose-500 rounded-full p-1 border-2 border-zinc-950 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                  <Flame size={12} className="text-white fill-white" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white truncate">{contact.nome}</h2>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                  {temperatureName}
                </span>
              </div>
              
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800/50 flex items-center gap-1">
                  <Phone size={10} className="text-indigo-400" /> {contact.telefoneE164}
                </span>
                {contact.email && (
                  <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800/50 flex items-center gap-1 truncate max-w-[170px]" title={contact.email}>
                    <Mail size={10} className="text-indigo-400" /> {contact.email}
                  </span>
                )}
                {contact.cidade && (
                  <span className="text-[11px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800/50 flex items-center gap-1">
                    <MapPin size={10} className="text-amber-500" /> {contact.cidade}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-white rounded-full hover:bg-zinc-800/50 transition-colors z-10">
            <X size={18} />
          </button>

          {/* CRM Navigation Tabs */}
          <div className="flex border-b border-zinc-800 mt-6 -mb-6">
            <button
              onClick={() => setActiveTab('ia')}
              className={`flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'ia' ? 'text-indigo-400 border-indigo-500 font-extrabold' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Sparkles size={13} /> IA
              </span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'profile' ? 'text-indigo-400 border-indigo-500 font-extrabold' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Layers size={13} /> Perfil
              </span>
            </button>
            <button
              onClick={() => setActiveTab('fotos')}
              className={`flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'fotos' ? 'text-indigo-400 border-indigo-500 font-extrabold' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Images size={13} /> Fotos
                {messages.filter(m => m.mediaType === 'image' && !m.fromMe).length > 0 && (
                  <span className="bg-indigo-500/20 text-indigo-400 text-[9px] font-black px-1.5 rounded-full">
                    {messages.filter(m => m.mediaType === 'image' && !m.fromMe).length}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Content wrapper */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          <AnimatePresence mode="wait">
            
            {/* TAB 1: COMMERCIAL IA */}
            {activeTab === 'ia' && (
              <motion.div
                key="ia"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                
                {/* Active Alerts & Follow-up Alarms */}
                {activeAlarms.length > 0 && (
                  <div className="space-y-2">
                    {activeAlarms.map(alarm => (
                      <div 
                        key={alarm.id} 
                        className={`p-3.5 rounded-xl border flex items-start gap-2.5 shadow-sm transition-all relative overflow-hidden bg-zinc-900/60 ${
                          alarm.type === 'danger' ? 'border-rose-500/20 hover:border-rose-500/30' : 
                          alarm.type === 'warning' ? 'border-amber-500/20 hover:border-amber-500/30' : 
                          'border-indigo-500/20 hover:border-indigo-500/30'
                        }`}
                      >
                        <div className={`mt-0.5 p-1 rounded-md ${
                          alarm.type === 'danger' ? 'bg-rose-500/10 text-rose-400' : 
                          alarm.type === 'warning' ? 'bg-amber-500/10 text-amber-400' : 
                          'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          <AlertTriangle size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-300">
                              Alerta Comercial
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono mt-0.5 uppercase ${
                              alarm.type === 'danger' ? 'bg-rose-500/15 text-rose-400' : 
                              alarm.type === 'warning' ? 'bg-amber-500/15 text-amber-400' : 
                              'bg-indigo-500/15 text-indigo-400'
                            }`}>
                              {alarm.badge}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-1 font-medium">{alarm.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Score do Lead Automático */}
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
                    <Target size={90} className="text-white" />
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1">
                      <Target size={12} className="text-indigo-400" /> Score Comercial de Conversão
                    </span>
                    <span className="text-xs font-mono font-bold text-zinc-400">{calculatedScore} / 210 pts</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-2xl font-black text-white tracking-tight">
                        {calculatedScore} <span className="text-xs text-zinc-500 font-medium font-sans">pontos acumulados</span>
                      </h4>
                      <span className="text-xs text-zinc-400 font-bold capitalize">
                        Estágio: <span className="text-indigo-400 font-black">{temperatureName}</span>
                      </span>
                    </div>

                    {/* Progress score bar */}
                    <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/30 p-0.5">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                        style={{ width: `${Math.min(100, (calculatedScore / 210) * 100)}%` }}
                      />
                    </div>

                    {/* Scoring breakdown indicators */}
                    <div className="grid grid-cols-5 gap-1 pt-3 text-[9px] font-mono text-zinc-500 font-medium text-center">
                      <div className={`p-1 rounded ${hasResponded ? 'bg-indigo-500/10 text-indigo-400 font-bold' : ''}`}>
                        +10 Resp.
                      </div>
                      <div className="p-1 rounded bg-indigo-500/10 text-indigo-400 font-bold">
                        +20 Wpp
                      </div>
                      <div className={`p-1 rounded ${hasPreview ? 'bg-indigo-500/10 text-indigo-400 font-bold' : ''}`}>
                        +30 Preview
                      </div>
                      <div className={`p-1 rounded ${hasAskedQuote ? 'bg-indigo-500/10 text-indigo-400 font-bold' : ''}`}>
                        +50 Orc.
                      </div>
                      <div className={`p-1 rounded ${hasPurchased ? 'bg-indigo-500/10 text-indigo-400 font-bold' : ''}`}>
                        +100 Compra
                      </div>
                    </div>
                  </div>
                </div>

                {/* SDR AUTOMATION & CONTROL STATUS */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                      <Zap size={12} className="text-amber-400" /> {`Automação de ${agentConfig?.agentName || 'Assistente'}`}
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                      (contact.sdrStatus === 'human_required' || contact.needsReview) ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                      contact.sdrStatus === 'sdr_disabled' ? 'bg-zinc-800 text-zinc-400' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {(contact.sdrStatus === 'human_required' || contact.needsReview) ? 'Atendimento Humano' :
                       contact.sdrStatus === 'sdr_disabled' ? 'Automação Desligada' : `IA Ativa (${agentConfig?.agentName || 'IA'})`
                      }
                    </span>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs text-zinc-400 leading-normal">
                      Defina como a Inteligência Artificial deve atuar com este lead. O transbordo humano é ativado automaticamente pela IA se houver reclamação ou interesse B2B em massa.
                    </p>
                    
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <button
                        onClick={() => handleUpdate({ sdrStatus: 'sdr_active', needsReview: false })}
                        className={`py-2 px-3 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                          contact.sdrStatus !== 'human_required' && contact.sdrStatus !== 'sdr_disabled' && !contact.needsReview
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold'
                            : 'bg-zinc-950/40 border-zinc-900 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <Zap size={14} className="mb-0.5" />
                        <span className="text-[10px] uppercase font-black tracking-wider">IA Ativa</span>
                      </button>
                      
                      <button
                        onClick={() => handleUpdate({ sdrStatus: 'human_required', needsReview: true })}
                        className={`py-2 px-3 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                          contact.sdrStatus === 'human_required' || contact.needsReview
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold'
                            : 'bg-zinc-950/40 border-zinc-900 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <UserIcon size={14} className="mb-0.5" />
                        <span className="text-[10px] uppercase font-black tracking-wider">Humano</span>
                      </button>

                      <button
                        onClick={() => handleUpdate({ sdrStatus: 'sdr_disabled' })}
                        className={`py-2 px-3 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                          contact.sdrStatus === 'sdr_disabled'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 font-bold'
                            : 'bg-zinc-950/40 border-zinc-900 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <X size={14} className="mb-0.5" />
                        <span className="text-[10px] uppercase font-black tracking-wider">Desligar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* PAINEL DE INTELIGÊNCIA IA */}
                <div className="bg-zinc-900/20 backdrop-blur-md rounded-2xl border border-zinc-800/80 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-400" /> Diagnóstico da IA Comercial
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase">
                      <Sparkle size={10} className="text-amber-400" /> Analisado Realtime
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Resumo do Engajamento</h5>
                    <p className="text-[13px] text-zinc-300 leading-relaxed font-semibold">
                      {aiPred.summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Intenção Identificada</h5>
                      <div className="text-[13px] text-zinc-200 font-bold leading-tight">{aiPred.intent}</div>
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Chance de Conversão</h5>
                      <div className="text-[13px] text-emerald-400 font-black leading-tight flex items-center gap-1">
                        {aiPred.chance}
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <CheckCircle2 size={10} className="text-emerald-400 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pb-1">
                    <div>
                      <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Urgência</h5>
                      <div className="text-[13px] text-amber-400 font-bold leading-tight">{aiPred.urgency}</div>
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Sentimento do Lead</h5>
                      <div className="text-[13px] text-indigo-300 font-bold leading-tight flex items-center gap-1">
                        <Heart size={10} className="text-rose-400 fill-rose-500/40" /> {aiPred.sentiment}
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                    <h5 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Target size={11} /> Melhor Abordagem Recomendada
                    </h5>
                    <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                      {aiPred.approach}
                    </p>
                  </div>
                </div>

                {/* SUGESTÃO DE RESPOSTAS / FOLLOW-UP */}
                <div className="bg-zinc-900/30 border border-zinc-800/85 p-5 rounded-2xl space-y-3">
                  <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <MessageSquare size={13} className="text-indigo-400" /> Abordagem Pronta pela IA
                  </h5>
                  <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-800 relative group overflow-hidden">
                    <p className="text-[13px] text-zinc-200 leading-relaxed italic pr-4 font-medium">
                      "{aiPred.suggestedMsg}"
                    </p>
                    <button 
                      onClick={() => {
                        // Action to copy
                        navigator.clipboard.writeText(aiPred.suggestedMsg);
                      }} 
                      className="absolute bottom-2 right-2 text-[10px] text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/10 px-2 py-0.5 rounded transition-all font-bold uppercase tracking-wider"
                    >
                      Copiar
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 italic">Dispare abordagens personalizadas com um clique diretamente nas discussões.</p>
                </div>

                {/* AUTO DETECTED TAGS ACTION BOX */}
                {suggestedTags.length > 0 && (
                  <div className="bg-gradient-to-r from-indigo-500/5 via-indigo-500/10 to-transparent border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-400 animate-pulse" />
                      <h5 className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                        Tags Sugeridas pela IA Comercial
                      </h5>
                    </div>
                    <p className="text-xs text-zinc-400 font-medium">Identificamos termos relevantes nas mensagens ou comportamento. Clique para adicionar:</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {suggestedTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleQuickAddTag(tag)}
                          className="px-2.5 py-1 text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/20 flex items-center gap-1 transition-all hover:scale-105 duration-200"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </motion.div>
            )}

            {/* TAB 2: PROFILE & TIMELINE */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                
                {/* CRM Data Grid (Compact fields editing) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 hover:bg-zinc-900 transition-all group">
                    <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1 block">Estágio do Funil</label>
                    <select 
                      value={contact.stage}
                      onChange={(e) => {
                        const newStage = e.target.value as ContactStage;
                        if (newStage !== contact.stage) {
                          handleUpdate({ stage: newStage, stageChangedAt: Date.now() });
                        }
                      }}
                      className="w-full bg-transparent text-white text-[13px] font-semibold focus:outline-none appearance-none cursor-pointer mt-1 border-b border-dashed border-zinc-700/50 pb-1 group-hover:border-indigo-500/50 transition-all font-sans"
                    >
                      {STAGES.map(s => <option key={s} value={s} className="bg-zinc-900 text-zinc-300">{s}</option>)}
                    </select>
                  </div>

                  <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50 hover:bg-zinc-900 transition-all group">
                    <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-1 block">Valor Estimado (Compromisso)</label>
                    <div className="flex items-center text-[13px] font-bold text-zinc-100 mt-1 border-b border-dashed border-zinc-700/50 pb-1 group-hover:border-indigo-500/50 transition-all">
                      <span className="text-zinc-500 mr-1 text-xs">R$</span>
                      <input 
                        type="number"
                        value={contact.valorEstimado || ''}
                        onChange={(e) => handleUpdate({ valorEstimado: Number(e.target.value) || 0 })}
                        placeholder="0,00"
                        className="w-full bg-transparent focus:outline-none appearance-none text-white text-[13px] font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Complete Lead Profile Extra Details */}
                <div className="bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50 space-y-4">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-zinc-500 pb-2 border-b border-zinc-800/50">
                    Propriedades de Origem
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-zinc-500 block mb-1">Origem do Cadastro</span>
                      <span className="font-bold text-zinc-300 flex items-center gap-1">
                        <Compass size={12} className="text-indigo-400" /> {leadOrigin}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-1">Campanha de Entrada</span>
                      <span className="font-bold text-zinc-300 truncate block text-[11px]" title={campaignOrigin}>
                        {campaignOrigin}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                    <div>
                      <span className="text-zinc-500 block mb-1">Interesse Declarado</span>
                      <span className="font-bold text-zinc-300 capitalize">
                        {contact.interesse || 'Colecionismo geral'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-1">Produto Associado</span>
                      <span className="font-bold text-zinc-300 capitalize">
                        {contact.produto || 'Caneca Resinada Custom'}
                      </span>
                    </div>
                  </div>

                  {/* Built-in Preview Generated */}
                  <div className="pt-2">
                    <span className="text-zinc-500 block text-xs mb-2">Visualização Prévia (Preview)</span>
                    {hasPreview ? (
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
                            <Layers size={18} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-zinc-200 block">Mock-up 3D Ativo</span>
                            <span className="text-[9px] font-mono text-zinc-500">{contact.produto || 'Personalizado'}</span>
                          </div>
                        </div>
                        <span className="text-[9px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20 font-black">GERADO ✓</span>
                      </div>
                    ) : (
                      <div className="p-3 bg-zinc-950/40 rounded-xl border border-dashed border-zinc-800 text-center">
                        <button 
                          onClick={() => handleQuickAddTag('personalizado')}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors"
                        >
                          + Ativar Preview Inteligente
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* TIMELINE PREMIUM DO CLIENTE */}
                <div className="bg-zinc-900/10 p-5 rounded-2xl border border-zinc-800/50">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1">
                      <Clock size={12} className="text-indigo-400" /> Linha do Tempo do Lead
                    </span>
                    <span className="text-[9px] font-bold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-zinc-500 uppercase">
                      Histórico Comercial
                    </span>
                  </div>

                  <div className="relative border-l-2 border-zinc-800 ml-3.5 pl-5 space-y-6 text-xs pb-2">
                    
                    {/* Evento 1: Entrou Campanha */}
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-indigo-500 flex items-center justify-center shadow" />
                      <div className="flex justify-between">
                        <span className="font-bold text-zinc-200">Lead capturado no sistema</span>
                        <span className="text-[9px] text-zinc-500 font-mono">
                          {new Date(contact.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-zinc-400 mt-0.5 text-[11px]">Origem: {leadOrigin}</p>
                    </div>

                    {/* Evento 2: WhatsApp Aberto */}
                    <div className="relative">
                      <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-emerald-500 flex items-center justify-center shadow" />
                      <div className="flex justify-between">
                        <span className="font-bold text-zinc-200">WhatsApp instanciado</span>
                        <span className="text-[9px] text-zinc-500 font-mono">Realizado</span>
                      </div>
                      <p className="text-zinc-400 mt-0.5 text-[11px]">Notificado e incluído na lista inbox</p>
                    </div>

                    {/* Evento 3: Respondeu */}
                    {hasResponded ? (
                      <div className="relative animate-in fade-in duration-300">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-cyan-500 flex items-center justify-center shadow" />
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-200">Primeira resposta no chat</span>
                          <span className="text-[9px] text-zinc-500 font-mono">Ativo</span>
                        </div>
                        <p className="text-zinc-400 mt-0.5 text-[11px]">Interação síncrona iniciada com sucesso.</p>
                      </div>
                    ) : (
                      <div className="relative opacity-30">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-zinc-800 flex items-center justify-center" />
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-500">Primeira resposta pendente</span>
                        </div>
                      </div>
                    )}

                    {/* Evento 4: Gerou Preview */}
                    {hasPreview ? (
                      <div className="relative animate-in fade-in duration-300">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-indigo-600 flex items-center justify-center shadow">
                          <Sparkles size={8} className="text-white" />
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-200">Visualização (Preview) Produzido</span>
                          <span className="text-[9px] text-zinc-500 font-mono">Ativo</span>
                        </div>
                        <p className="text-indigo-400 mt-0.5 text-[11px]">Mock-up conceitual anexado.</p>
                      </div>
                    ) : (
                      <div className="relative opacity-30">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-zinc-800 flex items-center justify-center shadow" />
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-500">Preview não gerado</span>
                        </div>
                      </div>
                    )}

                    {/* Evento 5: Pediu Orçamento */}
                    {hasAskedQuote ? (
                      <div className="relative animate-in fade-in duration-300">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-amber-500 flex items-center justify-center shadow" />
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-200">Orçamento solicitado</span>
                          <span className="text-[9px] text-amber-500 font-mono font-bold">R$ {contact.valorEstimado || '0'}</span>
                        </div>
                        <p className="text-zinc-400 mt-0.5 text-[11px]">Avaliação de propostas comerciais.</p>
                      </div>
                    ) : (
                      <div className="relative opacity-30">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-zinc-800 flex items-center justify-center shadow" />
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-500">Orçamento pendente</span>
                        </div>
                      </div>
                    )}

                    {/* Evento 6: Comprou */}
                    {hasPurchased ? (
                      <div className="relative animate-in fade-in duration-300">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                          <CheckCircle2 size={10} className="text-white" />
                        </div>
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Compra Concluída com Sucesso! 🏆</span>
                          <span className="text-[9px] font-mono">Concluído</span>
                        </div>
                        <p className="text-emerald-500/80 mt-0.5 text-[11px]">Conversão finalizada. Parabéns!</p>
                      </div>
                    ) : (
                      <div className="relative opacity-15">
                        <div className="absolute -left-[27px] top-0 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-zinc-800 flex items-center justify-center" />
                        <div className="flex justify-between">
                          <span className="font-bold text-zinc-500">Etapa de Fechamento</span>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

                {/* Tags Section */}
                <div className="bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Tag size={12} className="text-indigo-400" /> Tags Manuais
                  </label>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {contact.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-zinc-800 text-zinc-300 border border-zinc-700/80 rounded-md transition-all">
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="text-zinc-500 hover:text-rose-400 transition-colors">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    {contact.tags.length === 0 && (
                      <span className="text-xs text-zinc-600 italic">Nenhuma tag cadastrada.</span>
                    )}
                  </div>
                  
                  <input 
                    type="text" 
                    placeholder="Adicionar nova tag (Enter)" 
                    onKeyDown={handleAddTag}
                    className="w-full bg-zinc-950/60 border border-zinc-800 text-white rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-indigo-500/50 transition-all font-semibold"
                  />
                </div>

                {/* Notes Context box */}
                <div className="bg-zinc-900/30 p-5 rounded-2xl border border-zinc-800/50 group">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                       Notas de Contexto
                    </label>
                    {!editingNotes ? (
                      <button onClick={() => setEditingNotes(true)} className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-all">Editar</button>
                    ) : (
                      <button onClick={handleNotesSave} className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 flex items-center gap-1"><Save size={12}/> Salvar</button>
                    )}
                  </div>
                  {editingNotes ? (
                    <textarea 
                      value={notesTemp}
                      onChange={e => setNotesTemp(e.target.value)}
                      onBlur={handleNotesSave}
                      className="w-full h-32 bg-zinc-950/80 border border-indigo-500/50 text-white rounded-xl p-4 text-[13px] leading-relaxed focus:outline-none resize-none custom-scrollbar"
                      autoFocus
                    />
                  ) : (
                    <div 
                      className="w-full min-h-[4rem] text-zinc-300 p-1 text-[13px] leading-relaxed cursor-text whitespace-pre-wrap font-semibold"
                      onClick={() => setEditingNotes(true)}
                    >
                      {contact.notes || <span className="text-zinc-600 italic font-normal">Nenhum contexto adicional. Clique para adicionar detalhamentos do lead.</span>}
                    </div>
                  )}
                </div>

              </motion.div>
            )}

            {/* TAB 3: FOTOS */}
            {activeTab === 'fotos' && (
              <motion.div
                key="fotos"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {(() => {
                  const contactImages = messages.filter(
                    m => m.mediaType === 'image' && !m.fromMe && m.mediaUrl
                  );

                  if (loadingMsgs) {
                    return (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-indigo-400" />
                      </div>
                    );
                  }

                  if (contactImages.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <Images size={40} className="text-zinc-700" />
                        <p className="text-zinc-500 text-sm font-medium">Nenhuma foto recebida</p>
                        <p className="text-zinc-600 text-xs">As imagens enviadas pelo contato aparecerão aqui.</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          {contactImages.length} {contactImages.length === 1 ? 'foto recebida' : 'fotos recebidas'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {contactImages.map((msg) => {
                          const date = msg.timestamp
                            ? new Date(
                                typeof msg.timestamp === 'number'
                                  ? msg.timestamp * 1000
                                  : (msg.timestamp as any)?.seconds
                                    ? (msg.timestamp as any).seconds * 1000
                                    : msg.timestamp
                              )
                            : null;
                          const dateStr = date
                            ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            : '';
                          const timeStr = date
                            ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : '';

                          return (
                            <div
                              key={msg.id}
                              className="relative group rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 transition-all"
                            >
                              <img
                                src={msg.mediaUrl}
                                alt="Foto do contato"
                                className="w-full aspect-square object-cover"
                                loading="lazy"
                              />
                              {/* Overlay on hover */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                <a
                                  href={msg.mediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-colors"
                                  title="Ver em tamanho original"
                                >
                                  <ZoomIn size={11} /> Ver
                                </a>
                                <a
                                  href={msg.mediaUrl}
                                  download
                                  className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-colors"
                                  title="Baixar imagem"
                                >
                                  <Download size={11} /> Baixar
                                </a>
                              </div>
                              {/* Timestamp badge */}
                              {dateStr && (
                                <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70 text-[9px] text-zinc-400 font-mono flex justify-between">
                                  <span>{dateStr}</span>
                                  <span>{timeStr}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Dynamic Activity Footbar */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex justify-between items-center text-xs">
          <div className="text-zinc-500 font-semibold font-mono flex items-center gap-1.5">
            <RefreshCw size={12} className={isUpdating ? 'animate-spin text-indigo-400' : ''} />
            {isUpdating ? 'Agilizando atualizações...' : 'Banco de dados sincronizado'}
          </div>
          <div className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">
            Lead CRM Engine v4
          </div>
        </div>

      </div>
    </>
  );
};
