import React, { useState, useMemo, useEffect } from 'react';
import { useContacts } from '../hooks/useContacts';
import { Contact, Campaign } from '../types';
import { 
  Loader2, Sparkles, Play, Users, CheckCircle2, AlertCircle, 
  Pause, RefreshCw, ArrowLeft, Clock, BarChart3, Check, 
  Settings2, Activity, Send
} from 'lucide-react';
import { getSettings } from '../services/firestore';
import { 
  collection, doc, setDoc, query, where, orderBy, limit, 
  onSnapshot, writeBatch, getDocs, deleteDoc, updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export const Campaigns: React.FC = () => {
  const { contacts, loading: contactsLoading } = useContacts();
  
  // Creation States
  const [campaignName, setCampaignName] = useState(() => {
    const d = new Date();
    return `Campanha - ${d.getDate()}/${d.getMonth() + 1} às ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [templateText, setTemplateText] = useState('');
  const [availableTemplates, setAvailableTemplates] = useState<{name: string, body: string}[]>([]);
  
  // UI States
  const [isCreating, setIsCreating] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [campaignList, setCampaignList] = useState<Campaign[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Active Campaign Realtime Subscriptions
  const [activeCampaign, setActiveCampaign] = useState<any | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Previews State
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previews, setPreviews] = useState<{ contact: Contact, variation: string }[]>([]);

  // Sandbox Alert and Confirmation States
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  // Fetch Templates on Mount & Subscribe to recent campaigns list
  useEffect(() => {
    getSettings().then(s => {
      if (s && s.templates) {
        setAvailableTemplates(s.templates);
      }
    }).catch(e => console.error(e));

    // Realtime Campaign List Subscription
    const cQuery = query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'), limit(15));
    const unsubList = onSnapshot(cQuery, (snap) => {
      const list: Campaign[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Campaign);
      });
      setCampaignList(list);

      // Auto-attach to the first 'running' campaign if one exists on database load
      const running = list.find(c => c.status === 'running' || c.status === 'paused');
      if (running && !activeCampaignId) {
        setActiveCampaignId(running.id);
      }
    }, (err) => {
      console.error("Error subscribing to campaign list:", err);
      try {
        handleFirestoreError(err, OperationType.GET, 'campaigns');
      } catch (mappedError) {
        // Safe check
      }
    });

    return () => unsubList();
  }, []);

  // Subscribe to details of active campaigning
  useEffect(() => {
    if (!activeCampaignId) {
      setActiveCampaign(null);
      setCampaignLogs([]);
      return;
    }

    setLogsLoading(true);
    
    // Subscribe to campaign doc
    const campaignDocRef = doc(db, 'campaigns', activeCampaignId);
    const unsubDoc = onSnapshot(campaignDocRef, (snap) => {
      if (snap.exists()) {
        setActiveCampaign({ id: snap.id, ...snap.data() });
      }
    }, (err) => {
      console.error("Error subscribing to active campaign:", err);
      try {
        handleFirestoreError(err, OperationType.GET, `campaigns/${activeCampaignId}`);
      } catch (mappedError) {
        // Safe check
      }
    });

    // Subscribe to logs stream
    const logsQuery = query(
      collection(db, 'campaign_logs'),
      where('campaignId', '==', activeCampaignId),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      const logs: any[] = [];
      snap.forEach((d) => {
        logs.push(d.data());
      });
      setCampaignLogs(logs);
      setLogsLoading(false);
    }, (err) => {
      console.error("Logs subscription error:", err);
      setLogsLoading(false);
      try {
        handleFirestoreError(err, OperationType.GET, 'campaign_logs');
      } catch (mappedError) {
        // Safe check
      }
    });

    return () => {
      unsubDoc();
      unsubLogs();
    };
  }, [activeCampaignId]);

  // Determine eligible current leads
  const audience = useMemo(() => {
    return contacts.filter(c => c.optIn && !c.needsReview && c.status === 'active');
  }, [contacts]);

  // Generate matrix variations preview (Client Side Mock/Request to API)
  const handlePreview = async () => {
    setErrorMessage(null);
    if (!templateText.trim()) {
      setErrorMessage('Escreva a mensagem matriz primeiro.');
      return;
    }
    if (audience.length === 0) {
      setErrorMessage('Nenhum contato elegível ativo (opt-in verdadeiro e sem necessidade de revisão).');
      return;
    }

    setIsGeneratingPreview(true);
    const sample = audience.slice(0, 3);
    const generated: typeof previews = [];

    try {
      console.log('[Frontend Campaign Preview] Generating preview for 3 recipients...');
      for (const contact of sample) {
        const replaceFallback = templateText
          .replace(/{{nome}}/g, contact.nome)
          .replace(/{{produto}}/g, contact.produto || contact.interesse || 'nossos produtos');
        generated.push({ contact, variation: replaceFallback });
      }
      setPreviews(generated);
      console.log('[Frontend Campaign Preview] Preview generation complete.');
    } catch (err: any) {
      console.error('[Frontend Campaign Preview] Preview generation error:', err);
      setErrorMessage('Erro ao gerar previews: ' + err.message);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Trigger modal confirmation state instead of native confirm() dialog
  const handleStartCampaign = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    
    if (!templateText.trim()) {
      setErrorMessage('Digite a mensagem matriz antes de iniciar.');
      return;
    }
    if (!campaignName.trim()) {
      setErrorMessage('Nomeie sua campanha.');
      return;
    }
    if (audience.length === 0) {
      setErrorMessage('Sua audiência filtrada possui 0 contatos elegíveis.');
      return;
    }

    // Trigger dialog modal state
    console.log('[Frontend Campaign] Start clicked, showing iframe-safe confirmation modal.');
    setShowConfirmSend(true);
  };

  // Launch campaign from frontend, persisting details and drafting backend queue workers
  const executeStartCampaign = async () => {
    setShowConfirmSend(false);
    setErrorMessage(null);
    setIsCreating(true);

    console.log('[Frontend Campaign] Beginning execution of start campaign...');
    console.log('[Frontend Campaign] Campaign Visual Identifier:', campaignName);
    console.log('[Frontend Campaign] Total Audience Size:', audience.length);

    try {
      const campaignId = 'camp_' + Date.now();
      
      // 1. Create campaign document (preparing state to avoid race condition with the backend worker)
      console.log(`[Frontend Campaign] Writing master campaign document in Firestore under ID: ${campaignId} with status 'preparing'`);
      const campaignRef = doc(db, 'campaigns', campaignId);
      const campaignData = {
        id: campaignId,
        nome: campaignName,
        templateText: templateText,
        status: 'preparing',
        startedAt: Date.now(),
        startedBy: 'Michel G.',
        createdAt: Date.now(),
        stats: {
          enviados: 0,
          entregues: 0,
          falhas: 0,
          lido: 0,
          respondidos: 0,
          aguardando: audience.length
        }
      };

      await setDoc(campaignRef, campaignData);
      console.log(`[Frontend Campaign] Main campaign document prepared and successfully saved.`);

      // 2. Hydrate Queue sequentially using chunks (max 500 per batch)
      const CHUNK_SIZE = 400;
      let totalQueueCreated = 0;
      
      for (let i = 0; i < audience.length; i += CHUNK_SIZE) {
        const chunk = audience.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        
        console.log(`[Frontend Campaign] Populating queue chunk: items ${i} to ${i + chunk.length}`);
        
        chunk.forEach((contact) => {
          const queueRef = doc(db, 'campaign_queue', campaignId + '_' + contact.id);
          batch.set(queueRef, {
            id: campaignId + '_' + contact.id,
            campaignId,
            contactId: contact.id,
            nome: contact.nome,
            telefoneE164: contact.telefoneE164,
            status: 'aguardando',
            createdAt: Date.now()
          });
        });

        await batch.commit();
        totalQueueCreated += chunk.length;
        console.log(`[Frontend Campaign] Chunk batch commit of ${chunk.length} items succeeded.`);
      }

      console.log(`[Frontend Campaign] Hydration complete. Saved ${totalQueueCreated} total recipient queue records.`);

      // 3. Write initial tracking log record
      console.log(`[Frontend Campaign] Writing initial tracking log for user visual visibility...`);
      const logRef = doc(collection(db, 'campaign_logs'));
      await setDoc(logRef, {
        id: logRef.id,
        campaignId,
        contactId: 'system',
        nome: 'Campanha',
        telefoneE164: 'CRM',
        status: 'enviado',
        message: `Fila de disparos com ${audience.length} contatos cadastrada no servidor. Iniciando worker de envio em lote realtime...`,
        timestamp: Date.now()
      });
      console.log(`[Frontend Campaign] Tracking log successfully saved in Firestore.`);

      // 4. Finally activate campaign by switching status to 'running' (safe from backend worker race conditions)
      console.log(`[Frontend Campaign] All queue batches successfully committed. Activating campaign now...`);
      await updateDoc(campaignRef, { status: 'running' });
      console.log(`[Frontend Campaign] Campaign successfully activated! status is now: 'running'`);

      // Reset states and register active campaign UI frame
      setActiveCampaignId(campaignId);
      setTemplateText('');
      setPreviews([]);
      setSuccessMessage(`Campanha "${campaignName}" iniciada com sucesso! ${totalQueueCreated} disparos enfileirados.`);
      
      // Clear success banner dynamically
      setTimeout(() => setSuccessMessage(null), 8000);
    } catch (err: any) {
      console.error('[Frontend Campaign] Catastrophic write error in database:', err);
      setErrorMessage('Erro de escrita no banco de dados Firestore: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Process manual controls directly in database states
  const togglePauseResume = async () => {
    if (!activeCampaign) return;
    const nextStatus = activeCampaign.status === 'running' ? 'paused' : 'running';
    
    try {
      console.log(`[Frontend Campaign] Toggling campaign status from ${activeCampaign.status} to ${nextStatus}`);
      await updateDoc(doc(db, 'campaigns', activeCampaignId!), {
        status: nextStatus
      });
      
      // Log action
      const logRef = doc(collection(db, 'campaign_logs'));
      await setDoc(logRef, {
        id: logRef.id,
        campaignId: activeCampaignId!,
        contactId: 'system',
        nome: 'Administrador',
        telefoneE164: 'CRM',
        status: nextStatus === 'paused' ? 'paused' : 'enviado',
        message: `A campanha foi ${nextStatus === 'paused' ? 'PAUSADA' : 'RETOMADA'} pelo usuário administrador comercial.`,
        timestamp: Date.now()
      });
      
      setSuccessMessage(`Campanha ${nextStatus === 'paused' ? 'pausada' : 'retomada'} com sucesso.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('[Frontend Campaign] Toggle status error:', err);
      setErrorMessage('Não foi possível alterar status da campanha: ' + err.message);
    }
  };

  // Custom visual confirm modal for cancelling
  const cancelCampaign = async () => {
    console.log('[Frontend Campaign] Cancel campaign clicked, showing confirmation modal dialog.');
    setShowConfirmCancel(true);
  };

  const executeCancelCampaign = async () => {
    setShowConfirmCancel(false);
    if (!activeCampaignId) return;

    try {
      console.log(`[Frontend Campaign] Forcing cancel/compile status for campaign: ${activeCampaignId}`);
      await updateDoc(doc(db, 'campaigns', activeCampaignId!), {
        status: 'completed'
      });

      // Write cancel logger
      const logRef = doc(collection(db, 'campaign_logs'));
      await setDoc(logRef, {
        id: logRef.id,
        campaignId: activeCampaignId!,
        contactId: 'system',
        nome: 'Administrador',
        telefoneE164: 'CRM',
        status: 'completed',
        message: 'Campanha de disparos suspensa e cancelada pelo painel administrativo comercial.',
        timestamp: Date.now()
      });

      setSuccessMessage('Campanha interrompida com sucesso.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('[Frontend Campaign] Cancellation database write error:', err);
      setErrorMessage('Falha ao tentar cancelar os disparos restantes: ' + err.message);
    }
  };

  // Calculations for Premium Live Interface Metrics
  const calculatedStats = useMemo(() => {
    if (!activeCampaign) return { taxDelivery: 0, taxReply: 0, percentComplete: 0, waiting: 0 };
    const { enviados, entregues, respondidos, falhas } = activeCampaign.stats || { enviados: 0, entregues: 0, respondidos: 0, falhas: 0 };
    
    const totalEnrolled = activeCampaign.stats.aguardando + enviados + falhas;
    const processed = enviados + falhas;
    const percentComplete = totalEnrolled > 0 ? Math.round((processed / totalEnrolled) * 100) : 0;
    
    const taxDelivery = enviados > 0 ? Math.round((entregues / enviados) * 100) : 0;
    const taxReply = enviados > 0 ? Math.round((respondidos / enviados) * 100) : 0;

    return {
      taxDelivery,
      taxReply,
      percentComplete,
      waiting: activeCampaign.stats.aguardando || 0
    };
  }, [activeCampaign]);

  return (
    <div className="space-y-6">
      {/* Custom Alerts */}
      {errorMessage && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl flex items-center justify-between gap-3 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs hover:text-white px-2">fechar</button>
        </div>
      )}
      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-xl flex items-center justify-between gap-3 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs hover:text-white px-2">fechar</button>
        </div>
      )}

      {/* Header and Quick Switcher Row */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="text-emerald-500 animate-pulse" size={24} />
            Gerenciador de Campanhas Ativas
          </h2>
          <p className="text-zinc-400 mt-1 text-sm">
            Configure disparos automatizados de WhatsApp com IA de conversão em segundo plano persistente.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-805 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2"
          >
            Histórico ({campaignList.length})
          </button>

          {activeCampaignId && (
            <button 
              onClick={() => setActiveCampaignId(null)}
              className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-2"
            >
              Criar Novo Disparo
            </button>
          )}
        </div>
      </div>

      {/* History Slide Panel */}
      {showHistory && (
        <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-4 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <h4 className="text-white font-semibold text-sm">Últimos Registros de Massa</h4>
            <span className="text-xs text-zinc-500">Mostrando até 15 campanhas</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaignList.map((c) => {
              const total = (c.stats?.enviados || 0) + (c.stats?.falhas || 0) + (c.stats?.aguardando || 0);
              return (
                <div 
                  key={c.id} 
                  onClick={() => {
                    setActiveCampaignId(c.id);
                    setShowHistory(false);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer hover:border-zinc-700 hover:bg-zinc-900 transition-all ${
                    activeCampaignId === c.id 
                    ? 'border-indigo-500 bg-indigo-950/20' 
                    : 'border-zinc-850 bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-semibold text-white truncate max-w-[170px]">{c.nome}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      c.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse' :
                      c.status === 'paused' ? 'bg-amber-400/10 text-amber-400 border border-amber-500/20' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {c.status === 'running' ? 'Executando' : 
                       c.status === 'paused' ? 'Pausada' : 
                       'Concluída'}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-500 mb-2 truncate">{c.templateText}</p>
                  
                  <div className="flex justify-between items-center text-[10px] text-zinc-400 border-t border-zinc-900 pt-2">
                    <span>Audiência: {total}</span>
                    <span>Progresso: {c.stats?.enviados || 0}/{total}</span>
                  </div>
                </div>
              );
            })}

            {campaignList.length === 0 && (
              <div className="col-span-full py-8 text-center text-zinc-600 text-sm">
                Nenhum disparo anterior registrado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Sandbox Layout: CREATOR or DISPLAY LIVE WORKER TELEMETRY */}
      {!activeCampaignId ? (
        /* ==================== CREATOR VIEW ==================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Creator Configuration Sheet */}
          <div className="lg:col-span-7 bg-zinc-900 border border-zinc-850 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings2 className="text-indigo-400" size={18} />
                Fase 1: Configuração Base
              </h3>
            </div>

            {/* Campaign Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">ID Visual / Nome Identificador</label>
              <input 
                type="text"
                placeholder="Ex: Campanha de Black Friday - Leads Ativos"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Template Selector & Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Mensagem Matriz (Template de Disparo)</label>
                
                {availableTemplates.length > 0 && (
                  <select 
                    onChange={e => {
                      const match = availableTemplates.find(t => t.name === e.target.value);
                      if (match) setTemplateText(match.body);
                    }}
                    className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none"
                  >
                    <option value="">Escolher Template...</option>
                    {availableTemplates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                )}
              </div>

              <textarea
                className="w-full h-56 p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm placeholder-zinc-600 resize-none font-mono"
                placeholder="Ex: Olá {{nome}}, notamos seu interesse no produto {{produto}}... Temos ótimas condições de frete!"
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
              />

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-zinc-500 pt-1">
                <span>Parâmetros dinâmicos aceitos: <strong className="text-zinc-400">{'{{nome}}'}</strong> e <strong className="text-zinc-400">{'{{produto}}'}</strong></span>
                <button 
                  onClick={handlePreview}
                  disabled={isGeneratingPreview || !templateText}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60 rounded-lg transition-colors font-medium cursor-pointer"
                >
                  Confirmar Marcação
                </button>
              </div>
            </div>

            {/* Local Replacement Preview */}
            {previews.length > 0 && (
              <div className="pt-3 space-y-2.5 border-t border-zinc-850 animate-fadeIn">
                <h5 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} /> Amostras Rápidas Substituídas
                </h5>
                <div className="space-y-2">
                  {previews.map((p, idx) => (
                    <div key={idx} className="p-3 bg-[#005c4b]/10 border border-[#005c4b]/30 rounded-xl text-xs space-y-1">
                      <span className="text-[10px] text-zinc-500 select-none">Destinatário: {p.contact.nome} ({p.contact.id})</span>
                      <p className="text-zinc-300 font-sans leading-relaxed whitespace-pre-wrap">{p.variation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Target list & Iniciar Disparo button */}
          <div className="lg:col-span-5 bg-zinc-900 border border-zinc-850 rounded-2xl p-6 flex flex-col justify-between self-stretch">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="text-indigo-400" size={18} />
                Fase 2: Audiência Registrada
              </h3>

              <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl space-y-3.5">
                <div className="flex justify-between items-center text-sm border-b border-zinc-900 pb-2">
                  <span className="text-zinc-400">Total Leads no CRM:</span>
                  <strong className="text-white">{contacts.length}</strong>
                </div>

                <div className="flex justify-between items-center text-sm border-b border-zinc-900 pb-2">
                  <span className="text-zinc-400">Contatos Opt-In Ativos:</span>
                  <strong className="text-emerald-400">
                    {contacts.filter(c => c.optIn && c.status === 'active').length}
                  </strong>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-400">Menos "Revisão Necessária":</span>
                  <strong className="text-indigo-400 font-bold text-base bg-indigo-500/10 px-2 py-0.5 rounded-lg">
                    {audience.length} Elegíveis
                  </strong>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/40 rounded-xl border border-zinc-850 text-xs text-zinc-500 leading-relaxed space-y-2">
                <h5 className="font-semibold text-zinc-400">Métricas Antiban do Servidor:</h5>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Randomização de tempo de tráfego entre disparos.</li>
                  <li>Reescrita de redundâncias via rede de IA generativa.</li>
                  <li>Suspensão programável caso limite diário atinja marca de bloqueio.</li>
                </ul>
              </div>
            </div>

            <button
              onClick={handleStartCampaign}
              disabled={isCreating || audience.length === 0 || !templateText}
              className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed select-none"
            >
              {isCreating ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Registrando Campanha...
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" /> Iniciar Disparo Realtime
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* ==================== ACTIVE DASHBOARD TELEMETRY VIEW ==================== */
        <div className="space-y-6">
          
          {/* Quick Info bar of loaded campaign */}
          <div className="bg-zinc-900 border border-zinc-850 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white mb-0.5">{activeCampaign?.nome || 'Buscando dados...'}</h3>
                {activeCampaign && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${
                    activeCampaign.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    activeCampaign.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {activeCampaign.status === 'running' ? '● Em Andamento' : 
                     activeCampaign.status === 'paused' ? '⏸ Pausada' : 
                     '✓ Execução Concluída'}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-mono">ID: {activeCampaignId}</p>
            </div>

            {/* Server Controls Action Group */}
            {activeCampaign && activeCampaign.status !== 'completed' && activeCampaign.status !== 'error' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePauseResume}
                  className={`px-4.5 py-2.5 border rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                    activeCampaign.status === 'running' 
                    ? 'border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400' 
                    : 'border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {activeCampaign.status === 'running' ? (
                    <>
                      <Pause size={16} /> Pausar Transmissão
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" /> Retomar Transmissão
                    </>
                  )}
                </button>

                <button
                  onClick={cancelCampaign}
                  className="px-4.5 py-2.5 border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                >
                  Interromper
                </button>
              </div>
            )}
          </div>

          {/* Real-time statistics Bento Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            
            {/* Sent */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Disparados (IA)</span>
              <strong className="text-3xl font-extrabold text-white block">{activeCampaign?.stats?.enviados || 0}</strong>
              <span className="text-[10px] text-zinc-500 block">Encaminhados à rede</span>
            </div>

            {/* Waiting queue remainder */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Aguardando Fila</span>
              <strong className="text-3xl font-extrabold text-white block">{calculatedStats.waiting}</strong>
              <span className="text-[10px] text-zinc-500 block">Contatos na agulha</span>
            </div>

            {/* Failures */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Falhas</span>
              <strong className={`text-3xl font-extrabold block ${
                (activeCampaign?.stats?.falhas || 0) > 0 ? 'text-red-400' : 'text-zinc-500'
              }`}>{activeCampaign?.stats?.falhas || 0}</strong>
              <span className="text-[10px] text-zinc-500 block">Erros de envio ou opt-out</span>
            </div>

            {/* Delivered (Hook synced) */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Taxa Entrega</span>
              <strong className="text-3xl font-extrabold text-indigo-400 block">{calculatedStats.taxDelivery}%</strong>
              <span className="text-[10px] text-zinc-500 block">{activeCampaign?.stats?.entregues || 0} confirmados</span>
            </div>

            {/* Responses rate (Replied) */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Taxa Conversão</span>
              <strong className="text-3xl font-extrabold text-emerald-400 block">{calculatedStats.taxReply}%</strong>
              <span className="text-[10px] text-zinc-400 font-semibold block">{activeCampaign?.stats?.respondidos || 0} respostas</span>
            </div>

            {/* Progress Completion Rate */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Conclusão Geral</span>
              <strong className="text-3xl font-extrabold text-white block">{calculatedStats.percentComplete}%</strong>
              <span className="text-[10px] text-zinc-500 block">Tempo real</span>
            </div>
          </div>

          {/* Combined Progress Bar & Live Ticker Log Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Visual Progress Graph / Detail Column */}
            <div className="lg:col-span-4 bg-zinc-900 border border-zinc-850 rounded-2xl p-6 space-y-6">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 size={15} className="text-indigo-400" />
                Matriz de Desempenho
              </h4>

              {/* Progress visual bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-zinc-400">
                  <span>Porcentagem completa:</span>
                  <span className="font-bold text-white">{calculatedStats.percentComplete}%</span>
                </div>
                <div className="w-full bg-zinc-950 rounded-full h-3.5 border border-zinc-800 overflow-hidden">
                  <div 
                    className="bg-indigo-500 h-full transition-all duration-500 ease-out"
                    style={{ width: `${calculatedStats.percentComplete}%` }}
                  />
                </div>
              </div>

              {/* Matrix original prompt summary */}
              <div className="space-y-2 pt-2 border-t border-zinc-850">
                <span className="text-xs text-zinc-500 block">Mensagem original veiculada:</span>
                <div className="p-3.5 bg-zinc-950 rounded-xl text-xs text-zinc-400 leading-relaxed max-h-36 overflow-y-auto font-sans border border-zinc-850 whitespace-pre-wrap">
                  {activeCampaign?.templateText}
                </div>
              </div>

              {/* Estimated ending clock */}
              {activeCampaign?.status === 'running' && (
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center gap-3">
                  <Clock size={18} className="text-indigo-400 animate-pulse" />
                  <div className="text-xs">
                    <span className="text-zinc-500 block font-semibold uppercase tracking-wide">Fim Estimado</span>
                    <strong className="text-zinc-300 font-medium">
                      ~ {Math.round((calculatedStats.waiting * 25) / 60)} min restantes
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Server Side Real-time Logs Feed ticker */}
            <div className="lg:col-span-8 bg-zinc-900 border border-zinc-850 rounded-2xl p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-850">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Activity size={15} className="text-emerald-400 animate-pulse" />
                  Monitor de Logs em Tempo Real (Fila do Servidor)
                </h4>
                <span className="text-[10px] bg-zinc-950 font-mono text-zinc-500 pr-2 pl-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  Conexão ativa
                </span>
              </div>

              <div className="h-[320px] overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
                {campaignLogs.map((log, idx) => {
                  const dateStr = new Date(log.timestamp).toLocaleTimeString();
                  return (
                    <div 
                      key={idx} 
                      className={`p-3.5 rounded-xl border flex flex-col gap-1.5 transition-all animate-fadeIn ${
                        log.status === 'falhou' ? 'bg-red-500/5 border-red-500/15 text-red-250' :
                        log.status === 'lido' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-250' :
                        log.status === 'paused' ? 'bg-amber-400/5 border-amber-400/15' :
                        'bg-zinc-950/60 border-zinc-850'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] font-sans">
                        <span className="font-semibold text-zinc-400 truncate max-w-[150px]">
                          {log.nome} ({log.telefoneE164})
                        </span>
                        <div className="flex items-center gap-1.5 text-zinc-500 select-none">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            log.status === 'enviado' ? 'bg-indigo-500/15 text-indigo-400' :
                            log.status === 'delivered' ? 'bg-indigo-600/10 text-indigo-400' :
                            log.status === 'lido' ? 'bg-emerald-500/15 text-emerald-400' :
                            log.status === 'falhou' ? 'bg-red-500/10 text-red-400' :
                            'bg-zinc-800 text-zinc-400'
                          }`}>
                            {log.status}
                          </span>
                          <span>•</span>
                          <span>{dateStr}</span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-350 leading-relaxed font-sans font-normal">
                        {log.message}
                      </p>

                      {log.sentBody && (
                        <div className="p-2.5 bg-zinc-950/80 rounded-lg text-[11px] text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap select-all max-h-24 overflow-y-auto">
                          {log.sentBody}
                        </div>
                      )}
                    </div>
                  );
                })}

                {campaignLogs.length === 0 && !logsLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-sm py-16">
                    Aguardando primeiros disparos serem processados pelo worker...
                  </div>
                )}

                {logsLoading && (
                  <div className="h-full flex flex-col items-center justify-center text-indigo-400 text-sm py-16">
                    <Loader2 size={24} className="animate-spin mb-2" />
                    Carregando histórico do servidor...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Send Realtime Modal Backdrop */}
      {showConfirmSend && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-400">
              <Play size={20} fill="currentColor" className="shrink-0" />
              <h3 className="text-lg font-bold tracking-tight">Confirmar Disparo Realtime</h3>
            </div>
            
            <p className="text-sm text-zinc-300 leading-relaxed">
              Você está prestes a autorizar o disparo em massa para <strong className="text-white font-bold">{audience.length} contatos elegíveis</strong>.
            </p>
            
            <div className="p-3.5 bg-zinc-950 rounded-xl border border-zinc-850 space-y-1 text-xs">
              <span className="text-zinc-500 block">ID Visual da Campanha:</span>
              <strong className="text-zinc-300 font-semibold">{campaignName}</strong>
            </div>

            <p className="text-[11px] text-zinc-500 leading-normal">
              Este lote será processado de forma 100% autônoma pelo servidor em segundo plano. Você poderá acompanhar a transmissão de logs em tempo real neste painel.
            </p>

            <div className="flex items-center gap-3 pt-2 text-sm">
              <button
                onClick={executeStartCampaign}
                disabled={isCreating}
                className="flex-grow py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Processando...
                  </>
                ) : (
                  'Sim, Iniciar Disparo'
                )}
              </button>
              <button
                onClick={() => setShowConfirmSend(false)}
                disabled={isCreating}
                className="px-4 py-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-xl transition-all font-medium cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cancel Modal Backdrop */}
      {showConfirmCancel && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fadeIn backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={20} className="shrink-0" />
              <h3 className="text-lg font-bold tracking-tight">Interromper Campanha?</h3>
            </div>
            
            <p className="text-sm text-zinc-300 leading-relaxed">
              Deseja realmente cancelar todos os disparos restantes e pendentes para esta campanha? Esa ação suspenderá a fila imediatamente no servidor.
            </p>

            <div className="flex items-center gap-3 pt-2 text-sm">
              <button
                onClick={executeCancelCampaign}
                className="flex-grow py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all cursor-pointer"
              >
                Sim, Cancelar Campanha
              </button>
              <button
                onClick={() => setShowConfirmCancel(false)}
                className="px-4 py-3 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-xl transition-all font-medium cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
