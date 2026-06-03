import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { Loader2, Zap, CheckCircle2, AlertTriangle, Play, RefreshCw, X, Sparkles, Terminal, Compass, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SyncWhatsAppModalProps {
  onClose: () => void;
}

interface ProgressState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  progress: number;
  startedAt?: number;
  updatedAt?: number;
  logs?: string[];
  error?: string;
}

export const SyncWhatsAppModal: React.FC<SyncWhatsAppModalProps> = ({ onClose }) => {
  const [progress, setProgress] = useState<ProgressState>({
    status: 'idle',
    total: 0,
    processed: 0,
    created: 0,
    updated: 0,
    failed: 0,
    progress: 0,
    logs: [],
    error: ''
  });
  
  const [loadingTrigger, setLoadingTrigger] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Time elapsed counter during runner active state
  useEffect(() => {
    let timer: any;
    if (progress.status === 'running') {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [progress.status]);

  // Read the realtime progress from Firestore system/sync_contacts_progress
  useEffect(() => {
    console.log('[Inbox Hydration] Subscribing to sync_contacts_progress...');
    const docRef = doc(db, 'system', 'sync_contacts_progress');
    
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ProgressState;
        console.log('[Inbox Hydration] Loaded sync_contacts_progress status update:', data.status, 'progress:', data.progress);
        setProgress(data);
      }
    }, (err) => {
      console.error('[Inbox Hydration] Failed to listen to sync progress in Firestore:', err);
      try {
        handleFirestoreError(err, OperationType.GET, 'system/sync_contacts_progress');
      } catch (mappedError) {
        // Safe check
      }
    });

    return () => unsub();
  }, []);

  // Trigger the actual sync backend endpoint
  const startSync = async () => {
    setLoadingTrigger(true);
    setProgress(prev => ({ ...prev, status: 'running', progress: 0 }));
    try {
      console.log('[WA Contacts Sync] Triggering backend sync-contacts POST request...');
      const response = await fetch('/api/evolution/sync-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao sincronizar contatos com o servidor.');
      }
      console.log('[WA Contacts Sync] Backend finished with response:', data);
    } catch (err: any) {
      console.error('[WA Contacts Sync] API trigger failed:', err);
      setProgress(prev => ({
        ...prev,
        status: 'failed',
        error: err.message || 'Erro inesperado na chamada do servidor.'
      }));
    } finally {
      setLoadingTrigger(false);
    }
  };

  // Helper to approximate time remaining 
  const getEtaString = () => {
    if (progress.status !== 'running' || progress.progress <= 5) return 'Calculando...';
    
    const total = progress.total || 1;
    const processed = progress.processed || 1;
    if (processed >= total) return 'Finalizando...';

    // calculating speed per contact processed
    const avgSecPerItem = elapsedSeconds / processed;
    const remaining = total - processed;
    const etaSecs = Math.round(remaining * avgSecPerItem);

    if (etaSecs < 60) return `${etaSecs}s restantes`;
    const mins = Math.floor(etaSecs / 60);
    const secs = etaSecs % 60;
    return `${mins}m ${secs}s restantes`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl"
      >
        {/* Glow Effects inside Modal */}
        <div className="absolute top-0 left-1/4 -translate-y-1/2 w-48 h-24 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 translate-y-1/2 w-48 h-24 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Close Button */}
        <button 
          onClick={onClose}
          disabled={progress.status === 'running' || loadingTrigger}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs uppercase p-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-800/60 pb-4 mb-6">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <RefreshCw size={22} className={progress.status === 'running' ? 'animate-spin' : ''} />
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              Sincronizar Contatos do WhatsApp
              {progress.status === 'running' && (
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </h3>
            <p className="text-zinc-400 text-xs">
              Alimente silenciosamente a inteligência do CRM puxando contatos e conversas da Evolution API para o Firestore.
            </p>
          </div>
        </div>

        {/* Body content based on state */}
        <div className="space-y-6">
          
          {progress.status === 'idle' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-800/40 border border-zinc-700/50 rounded-full flex items-center justify-center text-zinc-500">
                <Users size={32} />
              </div>
              <div className="max-w-md space-y-2">
                <p className="text-white font-bold text-sm">Pronto para iniciar sintonização inteligente</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  O sistema irá buscar e normalizar todos os números em formato E164, enriquecendo fotos de perfis, nomes, e pushName.
                </p>
              </div>
              <button
                onClick={startSync}
                disabled={loadingTrigger}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2 shadow-lg"
              >
                {loadingTrigger ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                Iniciar Sincronização Agora
              </button>
            </div>
          )}

          {progress.status === 'running' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              
              {/* Main Progress Indicator */}
              <div className="bg-zinc-950/40 border border-zinc-800/40 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Status Ativo</span>
                  <p className="text-white font-bold text-sm">Sincronizando contatos do WhatsApp...</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Tempo Restante</span>
                  <p className="text-indigo-400 font-mono font-black text-sm">{getEtaString()}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex select-none items-center justify-between text-xs font-mono font-bold text-zinc-400">
                  <span>Progresso Geral: {progress.processed} de {progress.total || '?'}</span>
                  <span className="text-indigo-400">{progress.progress}%</span>
                </div>
                <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/70 p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              </div>

              {/* Realtime Numbers (Grid) */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 text-center">
                  <span className="block text-[9px] uppercase font-black tracking-wide text-zinc-500 mb-0.5">Encontrados</span>
                  <span className="text-lg font-black text-indigo-400 font-mono">{progress.total}</span>
                </div>
                <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 text-center">
                  <span className="block text-[9px] uppercase font-black tracking-wide text-green-500 mb-0.5">Criados (Novos)</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">{progress.created}</span>
                </div>
                <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 text-center">
                  <span className="block text-[9px] uppercase font-black tracking-wide text-blue-500 mb-0.5">Atualizados</span>
                  <span className="text-lg font-black text-blue-400 font-mono">{progress.updated}</span>
                </div>
                <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-900 text-center">
                  <span className="block text-[9px] uppercase font-black tracking-wide text-rose-500 mb-0.5">Erros / Iguis</span>
                  <span className="text-lg font-black text-rose-400 font-mono">{progress.failed}</span>
                </div>
              </div>

            </div>
          )}

          {progress.status === 'completed' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 flex items-start gap-3.5">
                <CheckCircle2 className="text-emerald-400 flex-shrink-0 mt-0.5" size={24} />
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-sm">Sincronização concluída com sucesso!</h4>
                  <p className="text-xs text-zinc-300 leading-normal">
                    Todos os contatos do seu WhatsApp cadastrado foram perfeitamente mapeados, tratados com as regras DDI brasileiras em formato E164 e persistidos no Firestore.
                  </p>
                </div>
              </div>

              {/* Statistics Panel */}
              <div className="bg-zinc-950/30 border border-zinc-800 rounded-xl p-4 space-y-3">
                <h5 className="text-[10px] uppercase font-black tracking-widest text-zinc-500">Métricas Consolidadas</h5>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-3 bg-zinc-900/60 rounded-lg text-center border border-zinc-800/40">
                    <span className="block text-[9px] font-bold text-zinc-500">Total</span>
                    <span className="text-base font-bold text-white font-mono">{progress.total}</span>
                  </div>
                  <div className="p-3 bg-zinc-900/60 rounded-lg text-center border border-zinc-800/40">
                    <span className="block text-[9px] font-bold text-emerald-400">Inseridos</span>
                    <span className="text-base font-bold text-emerald-400 font-mono">{progress.created}</span>
                  </div>
                  <div className="p-3 bg-zinc-900/60 rounded-lg text-center border border-zinc-800/40">
                    <span className="block text-[9px] font-bold text-blue-400">Merged</span>
                    <span className="text-base font-bold text-blue-400 font-mono">{progress.updated}</span>
                  </div>
                  <div className="p-3 bg-zinc-900/60 rounded-lg text-center border border-zinc-800/40">
                    <span className="block text-[9px] font-bold text-rose-400">Erros</span>
                    <span className="text-base font-bold text-rose-400 font-mono">{progress.failed}</span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs uppercase font-black tracking-wider rounded-lg transition-colors"
                >
                  Fechar Painel
                </button>
                <button
                  onClick={startSync}
                  disabled={loadingTrigger}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs uppercase font-black tracking-wider rounded-lg transition-all flex items-center gap-1.5"
                >
                  {loadingTrigger ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 
                  Sincronizar Novamente
                </button>
              </div>

            </div>
          )}

          {progress.status === 'failed' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-5 flex items-start gap-3.5">
                <AlertTriangle className="text-rose-400 flex-shrink-0 mt-0.5" size={24} />
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-sm">Ocorreu uma falha na integridade da sincronização</h4>
                  <p className="text-xs text-zinc-300 leading-normal">
                    {progress.error || 'Verifique se o seu dispositivo do WhatsApp está adequadamente conectado à Evolution API e tente de novo.'}
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={startSync}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                >
                  <RefreshCw size={14} /> Tentar Novamente
                </button>
              </div>

            </div>
          )}

          {/* Logs terminal box */}
          {progress.logs && progress.logs.length > 0 && (
            <div className="space-y-2 animate-in fade-in duration-500">
              <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 flex items-center gap-1.5 font-mono">
                <Terminal size={12} /> Console de Sincronização em Tempo Real (Logs)
              </span>
              <div className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl p-3.5 font-mono text-[10px] text-zinc-400 h-32 overflow-y-auto select-text space-y-1 scrollbar-thin">
                {progress.logs.map((logStr, lIdx) => (
                  <div key={lIdx} className="leading-relaxed border-l-2 border-indigo-500/30 pl-2">
                    <span className="text-zinc-600">[{new Date().toLocaleTimeString()}]</span> {logStr}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </motion.div>
    </div>
  );
};
