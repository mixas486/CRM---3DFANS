import React, { useState, useEffect, useRef } from 'react';
import { getSettings, updateSettings, subscribeToSettings } from '../services/firestore';
import { createInstanceItem, getConnectionState, connectInstance, logoutInstance, syncHistory, setWebhook } from '../services/evolution';
import { subscribeToSyncStatus, SyncStatus } from '../services/inbox';
import { Settings as SettingsType, Template } from '../types';
import { Save, Server, Shield, BrainCircuit, MessageSquareText, Plus, Trash2, Edit2, Loader2, RefreshCw, QrCode, PowerOff, PlusCircle, MapPin, Zap, Volume2, Play } from 'lucide-react';

const DISPATCH_SOUNDS = [
  { id: 1,  label: 'Sino suave',        url: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' },
  { id: 2,  label: 'Ping digital',      url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { id: 3,  label: 'Pop mensagem',      url: 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3' },
  { id: 4,  label: 'Notificação leve',  url: 'https://assets.mixkit.co/active_storage/sfx/2959/2959-preview.mp3' },
  { id: 5,  label: 'Alerta suave',      url: 'https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3' },
  { id: 6,  label: 'Caixa registradora',url: 'https://assets.mixkit.co/active_storage/sfx/1427/1427-preview.mp3' },
  { id: 7,  label: 'Teclado click',     url: 'https://assets.mixkit.co/active_storage/sfx/2832/2832-preview.mp3' },
  { id: 8,  label: 'Bolha',             url: 'https://assets.mixkit.co/active_storage/sfx/2961/2961-preview.mp3' },
  { id: 9,  label: 'Fanfarra curta',    url: 'https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3' },
  { id: 10, label: 'Whoosh',            url: 'https://assets.mixkit.co/active_storage/sfx/2886/2886-preview.mp3' },
  { id: 11, label: 'Acorde positivo',   url: 'https://assets.mixkit.co/active_storage/sfx/2222/2222-preview.mp3' },
  { id: 12, label: 'Sem som',           url: '' },
] as const;
import { runGeoMigration } from '../utils/geoMigration';
import { runChatAnalyticsMigration } from '../utils/crmMigration';
import { QRCodeSVG } from 'qrcode.react';

export const Settings = () => {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const [localSettings, setLocalSettings] = useState<SettingsType | null>(null);

  // Connection State
  const [connState, setConnState] = useState<any>(null);
  const [connLoading, setConnLoading] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [instanceNotFound, setInstanceNotFound] = useState(false);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const [migratingGeo, setMigratingGeo] = useState(false);
  const [migratingAnalytics, setMigratingAnalytics] = useState(false);

  const handleRunGeoMigration = async () => {
    setMigratingGeo(true);
    try {
        const count = await runGeoMigration();
        setSuccessMsg(`Migração concluída! ${count} contatos atualizados.`);
        setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e: any) {
        setError('Erro na migração: ' + e.message);
    } finally {
        setMigratingGeo(false);
    }
  };

  const handleRunAnalyticsMigration = async () => {
    setMigratingAnalytics(true);
    try {
        const count = await runChatAnalyticsMigration();
        setSuccessMsg(`Migração concluída! ${count} chats atualizados.`);
        setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e: any) {
        setError('Erro na migração: ' + e.message);
    } finally {
        setMigratingAnalytics(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToSyncStatus((status) => {
      if (status) {
        if (status.status === 'syncing' && status.updatedAt && (Date.now() - status.updatedAt > 15000)) {
           setSyncStatus({ ...status, status: 'idle' });
           return;
        }
      }
      setSyncStatus(status);
    });
    const interval = setInterval(() => {
      setSyncStatus(current => {
         if (current && current.status === 'syncing' && current.updatedAt && (Date.now() - current.updatedAt > 15000)) {
            return { ...current, status: 'idle' };
         }
         return current;
      });
    }, 5000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleSyncHistory = async () => {
    if (syncStatus?.status === 'syncing' || syncingHistory) return;
    
    setSyncingHistory(true);
    try {
      await syncHistory();
      setSuccessMsg('Sincronização iniciada com sucesso! O progresso será exibido abaixo em tempo real.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e: any) {
      setError(e.message || 'Erro ao sincronizar histórico');
    } finally {
      setSyncingHistory(false);
    }
  };

  const handleSetWebhook = async () => {
    setConfiguringWebhook(true);
    try {
        await setWebhook();
        setSuccessMsg('Webhook da Evolution API configurado com sucesso! (Eventos: Upsert, Update)');
        setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e: any) {
        setError(e.message || 'Erro ao configurar webhook');
    } finally {
        setConfiguringWebhook(false);
    }
  };

  const fetchConnection = async () => {
      setConnLoading(true);
      setError('');
      try {
          const state = await getConnectionState();
          setConnState(state?.instance);
          setInstanceNotFound(false);
          // Only clear QR if we are actually connected or if we aren't polling
          if (state?.instance?.state === 'open') {
              setQrCodeData(null); 
              if (pollInterval.current) {
                  clearInterval(pollInterval.current);
                  pollInterval.current = null;
              }
          }
      } catch (e: any) {
          const msg = e.message || '';
          if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
              setInstanceNotFound(true);
              setConnState(null);
          } else {
              setError(msg || 'Erro ao checar conexão da Evolution API');
              setConnState(null);
          }
      } finally {
          setConnLoading(false);
      }
  };

  const handleCreateInstance = async () => {
      setConnLoading(true);
      setError('');
      try {
          await createInstanceItem();
          setSuccessMsg('Instância criada! Clique em Gerar QR Code para conectar.');
          setTimeout(() => setSuccessMsg(''), 4000);
          await fetchConnection();
      } catch (e: any) {
          setError(e.message || 'Erro ao criar instância');
      } finally {
          setConnLoading(false);
      }
  };

  const handleConnect = async () => {
      setConnLoading(true);
      setError('');
      try {
          try {
              const createRes = await createInstanceItem();
              console.log("[Create Instance Response]", createRes);
              if (createRes?.qrcode?.base64) {
                  setQrCodeData(createRes.qrcode.base64);
                  startPolling();
                  setConnLoading(false);
                  setInstanceNotFound(false);
                  return;
              } else if (createRes?.qrcode?.code) {
                  setQrCodeData(createRes.qrcode.code);
                  startPolling();
                  setConnLoading(false);
                  setInstanceNotFound(false);
                  return;
              } else if (createRes?.base64) {
                  setQrCodeData(createRes.base64);
                  startPolling();
                  setConnLoading(false);
                  setInstanceNotFound(false);
                  return;
              } else if (createRes?.code) {
                  setQrCodeData(createRes.code);
                  startPolling();
                  setConnLoading(false);
                  setInstanceNotFound(false);
                  return; 
              }
          } catch (createErr: any) {
              console.log("[Create Instance Error]", createErr.message);
          }

          const res = await connectInstance();
          console.log("[QR Code Response]", res);
          if (res?.base64) {
              setQrCodeData(res.base64);
              startPolling();
          } else if (res?.qrcode?.base64) {
              setQrCodeData(res.qrcode.base64);
              startPolling();
          } else if (res?.code) {
              setQrCodeData(res.code); 
              startPolling();
          } else {
              const state = await getConnectionState();
              setConnState(state?.instance);
              if (state?.instance?.state === 'open') {
                  setSuccessMsg('WhatsApp já está conectado!');
                  setTimeout(() => setSuccessMsg(''), 3000);
              } else {
                  setError('Não foi possível gerar o QR — instância não criada ou resposta vazia.');
              }
          }
          setInstanceNotFound(false);
      } catch (e: any) {
          setError(e.message || 'Erro ao gerar QR Code. Tente novamente.');
      } finally {
          setConnLoading(false);
      }
  };

  const startPolling = () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
      pollInterval.current = setInterval(() => {
          fetchConnection();
      }, 3000);
  };

  useEffect(() => {
      return () => {
          if (pollInterval.current) clearInterval(pollInterval.current);
      };
  }, []);

  const handleLogout = async () => {
      setConnLoading(true);
      setError('');
      try {
          await logoutInstance();
          setConnState(null);
          setQrCodeData(null);
          setSuccessMsg('WhatsApp desconectado.');
          setTimeout(() => setSuccessMsg(''), 3000);
          await fetchConnection();
      } catch(e: any) {
          setError(e.message || 'Erro ao desconectar');
      } finally {
          setConnLoading(false);
      }
  };

  // Template Editing State
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);

  useEffect(() => {
    fetchConnection(); // Fetch initial connection state

    const unsub = subscribeToSettings((data) => {
      setSettings(data as SettingsType);
      if (!localSettings) { // Only set local first time
        setLocalSettings(data as SettingsType);
      }
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!localSettings) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      // Validate Basic constraints
      if (localSettings.delayMinMs < 1000) throw new Error("Delay mínimo deve ser pelo menos 1000ms");
      if (localSettings.delayMaxMs < localSettings.delayMinMs) throw new Error("Delay máximo deve ser maior que o mínimo");
      
      await updateSettings(localSettings);
      setSuccessMsg('Configurações salvas com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateSave = () => {
     if (!editingTemplate) return;
     if (!editingTemplate.name || !editingTemplate.body) {
         alert("Nome e corpo são obrigatórios");
         return;
     }

     if (localSettings) {
         let newTemplates = [...(localSettings.templates || [])];
         const exists = newTemplates.findIndex(t => t.id === editingTemplate.id);
         if (exists >= 0) {
             newTemplates[exists] = editingTemplate;
         } else {
             newTemplates.push(editingTemplate);
         }
         setLocalSettings({ ...localSettings, templates: newTemplates });
         setEditingTemplate(null);
         setIsAddingTemplate(false);
     }
  };

  const handleTemplateDelete = (id: string) => {
      if (!localSettings) return;
      
      setLocalSettings({
          ...localSettings,
          templates: (localSettings.templates || []).filter(t => t.id !== id)
      });
      
  };

  if (loading) {
      return (
          <div className="flex-1 flex justify-center items-center h-full">
              <Loader2 size={32} className="animate-spin text-zinc-500" />
          </div>
      );
  }

  if (!localSettings) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between sticky top-0 z-10 bg-zinc-950/80 backdrop-blur pb-4 pt-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">Configurações (Fase 8)</h2>
          <p className="text-zinc-400 text-sm">Gerencie conexões, segurança de disparos e IA.</p>
        </div>
        <div className="flex items-center gap-4">
            {error && <span className="text-red-400 text-sm">{error}</span>}
            {successMsg && <span className="text-green-400 text-sm font-medium">{successMsg}</span>}
            <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-lg disabled:opacity-50"
            >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar Tudo
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
        {/* Connection */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Server className="text-indigo-400" size={20} />
                WhatsApp (Evolution API)
            </h3>
            <p className="text-xs text-zinc-400 mb-4 pb-4 border-b border-zinc-800">
                A URL, API Key e Instância são lidas das variáveis de ambiente (.env) para maior segurança.
                As configurações abaixo refletem o modo atual.
            </p>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Status da Instância</label>
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                            {instanceNotFound ? (
                                <div className="flex items-center gap-2 text-sm text-red-400">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    Instância não encontrada (Necessário criar)
                                </div>
                            ) : (
                            <div className="flex flex-col gap-1 text-sm text-zinc-300">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${connState?.state === 'open' ? 'bg-green-500' : connState?.state === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                                    {connState?.state === 'open' ? 'Conectado' : connState?.state === 'connecting' ? 'Conectando...' : 'Desconectado'}
                                </div>
                                {connState?.ownerJid && (
                                    <span className="text-xs text-zinc-500">Número: {connState.ownerJid.split('@')[0]}</span>
                                )}
                            </div>
                            )}
                            <div className="flex flex-wrap gap-2 justify-end">
                                <button 
                                    onClick={fetchConnection} 
                                    className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded flex items-center gap-1 transition-colors"
                                    title="Atualizar status"
                                >
                                    <RefreshCw size={12} className={connLoading ? 'animate-spin' : ''} /> Status
                                </button>
                                
                                {instanceNotFound ? (
                                    <button 
                                        onClick={handleCreateInstance}
                                        disabled={connLoading}
                                        className="text-xs px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                    >
                                        {connLoading ? <Loader2 size={12} className="animate-spin" /> : <PlusCircle size={12} />} 
                                        Criar Instância
                                    </button>
                                ) : (
                                  <>
                                    {connState?.state === 'open' ? (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={handleSetWebhook}
                                                disabled={configuringWebhook}
                                                className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                                title="Configura os eventos do webhook recomendados"
                                            >
                                                <Zap size={12} className={configuringWebhook ? "animate-spin" : ""} /> Configurar Webhook
                                            </button>
                                            <button 
                                                onClick={handleSyncHistory}
                                                disabled={syncStatus?.status === 'syncing' || syncingHistory}
                                                className="text-xs px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                                            >
                                                <RefreshCw size={12} className={(syncStatus?.status === 'syncing' || syncingHistory) ? "animate-spin" : ""} /> Sincronizar WhatsApp
                                            </button>
                                            <button 
                                                onClick={handleLogout}
                                                className="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <PowerOff size={12} /> Desconectar
                                            </button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={handleConnect}
                                            className="text-xs px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded flex items-center gap-1 transition-colors"
                                        >
                                            <QrCode size={12} /> {connState?.state === 'connecting' ? 'Mostrar QR Code' : 'Gerar QR Code'}
                                        </button>
                                    )}
                                  </>
                                )}
                            </div>
                        </div>

                        {/* Real-time Sync Progress Board */}
                        {syncStatus && (syncStatus.status === 'syncing' || syncStatus.chatsCount > 0 || syncStatus.messagesCount > 0) && (
                            <div className="mt-3 p-4 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {syncStatus.status === 'syncing' ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin text-indigo-400" />
                                                <span className="text-xs font-semibold text-indigo-300">Sincronizando Histórico WhatsApp...</span>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="text-xs font-semibold text-emerald-400 font-sans">Histórico de WhatsApp Sincronizado</span>
                                            </>
                                        )}
                                    </div>
                                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase ${syncStatus.status === 'syncing' ? 'bg-indigo-500/20 text-indigo-300 animate-pulse' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                        {syncStatus.status === 'syncing' ? 'Sincronizando' : 'Sincronizado'}
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg">
                                        <div className="text-lg font-bold text-white font-mono">{syncStatus.chatsCount || 0}</div>
                                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">Chats</div>
                                    </div>
                                    <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg">
                                        <div className="text-lg font-bold text-white font-mono">{syncStatus.contactsCount || 0}</div>
                                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">Contatos</div>
                                    </div>
                                    <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg">
                                        <div className="text-lg font-bold text-white font-mono">{syncStatus.messagesCount || 0}</div>
                                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">Mensagens</div>
                                    </div>
                                </div>

                                {syncStatus.status === 'syncing' && (
                                    <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                                        <div className="bg-indigo-500 h-1 rounded-full w-full animate-pulse" />
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {qrCodeData && (
                            <div className="mt-2 p-4 bg-white rounded-lg flex flex-col items-center gap-2 border-2 border-indigo-500 text-center">
                                <p className="text-zinc-600 text-xs font-semibold">Escaneie o QR Code no seu WhatsApp <br/>(Aparelhos Conectados)</p>
                                {qrCodeData.startsWith('data:image') || qrCodeData.length > 500 ? (
                                    <img src={qrCodeData.startsWith('data:image') ? qrCodeData : `data:image/png;base64,${qrCodeData}`} alt="WhatsApp QR Code" className="w-48 h-48" />
                                ) : (
                                    <QRCodeSVG value={qrCodeData} size={192} />
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleConnect}
                                        className="mt-2 px-3 py-1 bg-zinc-600 hover:bg-zinc-700 text-white rounded text-xs transition-colors"
                                    >
                                        Atualizar QR
                                    </button>
                                    <button
                                        onClick={fetchConnection}
                                        className="mt-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs transition-colors"
                                    >
                                        Já escaneei
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* OpenAI */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <BrainCircuit className="text-indigo-400" size={20} />
                OpenAI (Variador)
            </h3>
            <p className="text-xs text-zinc-400 mb-4 pb-4 border-b border-zinc-800">
                A chave (API Key) está segura no Backend (.env) e NUNCA é renderizada aqui.
            </p>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Modelo de Variação</label>
                    <select
                        value={localSettings.openAiModel}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, openAiModel: e.target.value } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                        <option value="gpt-4o-mini">gpt-4o-mini (Recomendado, baixo custo)</option>
                        <option value="gpt-4o">gpt-4o (Alta qualidade, mais caro)</option>
                        <option value="gpt-3.5-turbo">gpt-3.5-turbo (Legado)</option>
                    </select>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 mt-4 text-xs text-zinc-400">
                    O modelo escolhido é usado na Fase 4.6 para gerar variações textuais de mensagens antes do disparo da campanha.
                </div>
            </div>
        </div>

        {/* Security & Delays */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 md:col-span-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Shield className="text-amber-400" size={20} />
                Limites de Disparo & Segurança (Crítico)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Delay Mínimo (ms)</label>
                    <input
                        type="number"
                        min="1000"
                        value={localSettings.delayMinMs}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, delayMinMs: parseInt(e.target.value) || 0 } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
               </div>
               <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Delay Máximo (ms)</label>
                    <input
                        type="number"
                        min={localSettings.delayMinMs}
                        value={localSettings.delayMaxMs}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, delayMaxMs: parseInt(e.target.value) || 0 } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
               </div>
               <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Limite Diário (Global)</label>
                    <input
                        type="number"
                        min="1"
                        value={localSettings.dailyLimit}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, dailyLimit: parseInt(e.target.value) || 0 } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
               </div>
               <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Aquecimento (Warmup Limit)</label>
                    <input
                        type="number"
                        min="1"
                        value={localSettings.warmupLimit}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, warmupLimit: parseInt(e.target.value) || 0 } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
               </div>
               <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Pausa a cada X (Batch)</label>
                    <input
                        type="number"
                        min="0"
                        placeholder="Ex: 10"
                        value={localSettings.batchSize || ''}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, batchSize: parseInt(e.target.value) || 0 } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
               </div>
               <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tempo de Pausa (ms)</label>
                    <input
                        type="number"
                        min="0"
                        placeholder="Ex: 60000"
                        value={localSettings.batchPauseMs || ''}
                        onChange={e => setLocalSettings(prev => prev ? { ...prev, batchPauseMs: parseInt(e.target.value) || 0 } : null)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-800 space-y-4">
               <div className="flex items-center justify-between">
                 <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                   <input
                     type="checkbox"
                     checked={localSettings.enableDispatchSound}
                     onChange={(e) => setLocalSettings(prev => prev ? { ...prev, enableDispatchSound: e.target.checked } : null)}
                     className="w-4 h-4 rounded appearance-none border border-zinc-500 checked:bg-indigo-500 checked:border-indigo-500 focus:ring-indigo-500/50 bg-zinc-800 cursor-pointer flex-shrink-0
                          checked:after:content-[''] checked:after:block checked:after:w-1.5 checked:after:h-2.5 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-white checked:after:transform checked:after:rotate-45 checked:after:ml-1"
                   />
                   <Volume2 size={15} className="text-indigo-400" />
                   Alarme Sonoro de Disparo
                 </label>
                 {localSettings.dispatchSoundUrl && (
                   <button
                     onClick={() => { new Audio(localSettings.dispatchSoundUrl).play().catch(() => {}); }}
                     className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors"
                   >
                     <Play size={12} /> Testar selecionado
                   </button>
                 )}
               </div>

               {localSettings.enableDispatchSound && (
                 <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                   {DISPATCH_SOUNDS.map(s => {
                     const isSelected = (localSettings.dispatchSoundUrl || '') === s.url;
                     return (
                       <div
                         key={s.id}
                         onClick={() => setLocalSettings(prev => prev ? { ...prev, dispatchSoundUrl: s.url } : null)}
                         className={`relative group flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all text-center gap-2 ${
                           isSelected
                             ? 'border-indigo-500 bg-indigo-500/15 text-white'
                             : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                         }`}
                       >
                         {s.url ? (
                           <button
                             onClick={e => { e.stopPropagation(); new Audio(s.url).play().catch(() => {}); }}
                             className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-zinc-800 rounded hover:bg-indigo-600 text-zinc-400 hover:text-white"
                           >
                             <Play size={9} />
                           </button>
                         ) : null}
                         <Volume2 size={18} className={isSelected ? 'text-indigo-400' : 'text-zinc-600'} />
                         <span className="text-[10px] font-medium leading-tight">{s.label}</span>
                         {isSelected && <span className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                       </div>
                     );
                   })}
                 </div>
               )}

               <div>
                 <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 ml-1">URL personalizada (MP3/WAV)</label>
                 <input
                   type="text"
                   value={localSettings.dispatchSoundUrl || ''}
                   onChange={e => setLocalSettings(prev => prev ? { ...prev, dispatchSoundUrl: e.target.value } : null)}
                   placeholder="https://.../sound.mp3"
                   className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                 />
               </div>

               {/* ── Alerta sonoro de resposta ── */}
               <div className="pt-5 border-t border-zinc-800/60 space-y-4">
                 <div className="flex items-center justify-between">
                   <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                     <input
                       type="checkbox"
                       checked={localSettings.enableReplySound ?? false}
                       onChange={e => setLocalSettings(prev => prev ? { ...prev, enableReplySound: e.target.checked } : null)}
                       className="w-4 h-4 rounded appearance-none border border-zinc-500 checked:bg-emerald-500 checked:border-emerald-500 focus:ring-emerald-500/50 bg-zinc-800 cursor-pointer flex-shrink-0
                            checked:after:content-[''] checked:after:block checked:after:w-1.5 checked:after:h-2.5 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-white checked:after:transform checked:after:rotate-45 checked:after:ml-1"
                     />
                     <Volume2 size={15} className="text-emerald-400" />
                     Alerta Sonoro de Resposta (contato respondeu)
                   </label>
                   {localSettings.replySoundUrl && (
                     <button
                       onClick={() => { new Audio(localSettings.replySoundUrl!).play().catch(() => {}); }}
                       className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors"
                     >
                       <Play size={12} /> Testar selecionado
                     </button>
                   )}
                 </div>

                 {localSettings.enableReplySound && (
                   <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                     {DISPATCH_SOUNDS.map(s => {
                       const isSelected = (localSettings.replySoundUrl || '') === s.url;
                       return (
                         <div
                           key={s.id}
                           onClick={() => setLocalSettings(prev => prev ? { ...prev, replySoundUrl: s.url } : null)}
                           className={`relative group flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all text-center gap-2 ${
                             isSelected
                               ? 'border-emerald-500 bg-emerald-500/15 text-white'
                               : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                           }`}
                         >
                           {s.url ? (
                             <button
                               onClick={e => { e.stopPropagation(); new Audio(s.url).play().catch(() => {}); }}
                               className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 bg-zinc-800 rounded hover:bg-emerald-600 text-zinc-400 hover:text-white"
                             >
                               <Play size={9} />
                             </button>
                           ) : null}
                           <Volume2 size={18} className={isSelected ? 'text-emerald-400' : 'text-zinc-600'} />
                           <span className="text-[10px] font-medium leading-tight">{s.label}</span>
                           {isSelected && <span className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                         </div>
                       );
                     })}
                   </div>
                 )}

                 {localSettings.enableReplySound && (
                   <div>
                     <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 ml-1">URL personalizada (MP3/WAV)</label>
                     <input
                       type="text"
                       value={localSettings.replySoundUrl || ''}
                       onChange={e => setLocalSettings(prev => prev ? { ...prev, replySoundUrl: e.target.value } : null)}
                       placeholder="https://.../reply-alert.mp3"
                       className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                     />
                   </div>
                 )}
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-800">
               <label className="flex items-center gap-2 text-sm text-zinc-300 ml-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.pauseOnHighFailureRate}
                    onChange={(e) => setLocalSettings(prev => prev ? { ...prev, pauseOnHighFailureRate: e.target.checked } : null)}
                    className="w-4 h-4 rounded appearance-none border border-zinc-500 checked:bg-indigo-500 checked:border-indigo-500 focus:ring-indigo-500/50 bg-zinc-800 cursor-pointer flex-shrink-0
                         checked:after:content-[''] checked:after:block checked:after:w-1.5 checked:after:h-2.5 checked:after:border-r-2 checked:after:border-b-2 checked:after:border-white checked:after:transform checked:after:rotate-45 checked:after:ml-1"
                  />
                  Pausar campanha automaticamente se taxa de falha exceder 5%
               </label>
               <p className="text-xs text-zinc-500 ml-7 mt-1 max-w-2xl">
                 A proteção de aquecimento assegura que números novos comecem com o limite reduzido. 
                 A variação de mensagem via IA e um delay generoso minimizam blocks, 
                 mas nunca ignore a regra primordial: enviar apenas para usuários <strong>Opt-in</strong>.
               </p>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-800">
               <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Manutenção de Dados</label>
               <button 
                  onClick={handleRunGeoMigration}
                  disabled={migratingGeo}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50 mb-2"
               >
                   {migratingGeo ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                   {migratingGeo ? 'Migrando...' : 'Rodar Migração Geográfica'}
               </button>
               <button 
                  onClick={handleRunAnalyticsMigration}
                  disabled={migratingAnalytics}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
               >
                   {migratingAnalytics ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                   {migratingAnalytics ? 'Migrando...' : 'Rodar Migração de Analytics'}
               </button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-zinc-800">
               <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Palavras-chave de Opt-out (Vírgula)</label>
               <input
                    type="text"
                    value={localSettings.optOutKeywords.join(', ')}
                    onChange={e => setLocalSettings(prev => prev ? { ...prev, optOutKeywords: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) } : null)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="sair, parar, cancelar"
               />
               <p className="text-xs text-zinc-500 mt-1">
                 Se o contato enviar qualquer destas palavras, o flag <strong>Opt-in</strong> será revogado.
               </p>
            </div>
        </div>

        {/* Templates */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <MessageSquareText className="text-indigo-400" size={20} />
                    Templates (Matrizes)
                </h3>
                <button 
                  onClick={() => {
                      setEditingTemplate({ id: Date.now().toString(), name: '', type: 'promocao', body: '' });
                      setIsAddingTemplate(true);
                  }}
                  className="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                >
                    <Plus size={16} /> Novo
                </button>
            </div>

            {editingTemplate && (
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl mb-4 space-y-4">
                    <h4 className="text-sm font-semibold text-white">{isAddingTemplate ? 'Adicionar Template' : 'Editar Template'}</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Nome</label>
                            <input
                                type="text"
                                value={editingTemplate.name}
                                onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})}
                                className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tipo</label>
                            <select
                                value={editingTemplate.type}
                                onChange={e => setEditingTemplate({...editingTemplate, type: e.target.value})}
                                className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            >
                                <option value="promocao">Promoção</option>
                                <option value="followup">Follow-up</option>
                                <option value="recuperacao">Recuperação</option>
                                <option value="lancamento">Lançamento</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Conteúdo</label>
                        <textarea
                            value={editingTemplate.body}
                            onChange={e => setEditingTemplate({...editingTemplate, body: e.target.value})}
                            rows={4}
                            placeholder="Use {{nome}}, {{produto}}..."
                            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none font-mono"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => { setEditingTemplate(null); setIsAddingTemplate(false); }}
                            className="px-3 py-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleTemplateSave}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {isAddingTemplate ? 'Adicionar' : 'Atualizar Local'}
                        </button>
                    </div>
                </div>
            )}

            {!localSettings.templates || localSettings.templates.length === 0 ? (
                <div className="py-6 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                    Nenhum template cadastrado.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {localSettings.templates.map(t => (
                        <div key={t.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 group">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-semibold text-white text-sm">{t.name}</h4>
                                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{t.type}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingTemplate(t); setIsAddingTemplate(false); }} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                                        <Edit2 size={14} />
                                    </button>
                                    <button onClick={() => handleTemplateDelete(t.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-zinc-400 line-clamp-2">{t.body}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
