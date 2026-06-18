import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useContacts } from '../hooks/useContacts';
import { useLocation } from 'react-router-dom';
import { Contact, Campaign, ContactFolder } from '../types';
import {
  Loader2, Sparkles, Play, Users, CheckCircle2, AlertCircle,
  Pause, RefreshCw, ArrowLeft, Clock, BarChart3, Check,
  Settings2, Activity, Send, FolderOpen, ChevronDown, X, Shield, Image, MessageCircle,
  CalendarClock, CalendarCheck2
} from 'lucide-react';
import { getSettings, subscribeToFolders } from '../services/firestore';
import { 
  collection, doc, setDoc, query, where, orderBy, limit, 
  onSnapshot, writeBatch, getDocs, deleteDoc, updateDoc
} from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { motion } from 'framer-motion';
import { BanRiskMeter } from '../components/BanRiskMeter';

export const Campaigns: React.FC = () => {
  const { contacts, loading: contactsLoading } = useContacts();
  const location = useLocation();
  const preSelectedIds: string[] | undefined = (location.state as any)?.selectedIds;

  // Folder state
  const [folders, setFolders] = useState<ContactFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToFolders(setFolders, console.error);
    return unsub;
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node))
        setFolderDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Creation States
  const [campaignName, setCampaignName] = useState(() => {
    const d = new Date();
    return `Campanha - ${d.getDate()}/${d.getMonth() + 1} às ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [templateText, setTemplateText] = useState('');
  const [availableTemplates, setAvailableTemplates] = useState<{name: string, body: string}[]>([]);
  const [enableImageReply, setEnableImageReply] = useState(false);
  const [sendImageWithMessage, setSendImageWithMessage] = useState(false);
  const [imageReplyApiUrl, setImageReplyApiUrl] = useState('https://miniaturas.3dfans.pro/api/image-by-phone/');
  const [enableAutoReply, setEnableAutoReply] = useState(false);
  const [autoReplyText, setAutoReplyText] = useState('');
  const [autoReplyImageUrl, setAutoReplyImageUrl] = useState('');
  
  // UI States
  const [isCreating, setIsCreating] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [campaignList, setCampaignList] = useState<Campaign[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Active Campaign Realtime Subscriptions
  const [activeCampaign, setActiveCampaign] = useState<any | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Scheduling — creation form
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // Scheduling — active campaign resume
  const [showScheduleResume, setShowScheduleResume] = useState(false);
  const [scheduleResumeAt, setScheduleResumeAt] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Auto-reply editor for active campaign
  const [showAutoReplyEditor, setShowAutoReplyEditor] = useState(false);
  const [editEnableAutoReply, setEditEnableAutoReply] = useState(false);
  const [editAutoReplyText, setEditAutoReplyText] = useState('');
  const [editAutoReplyImageUrl, setEditAutoReplyImageUrl] = useState('');
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  // Previews State
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previews, setPreviews] = useState<{ contact: Contact, variation: string }[]>([]);

  // Sandbox Alert and Confirmation States
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  // Notifications and Sound
  const [settings, setSettings] = useState<any>(null);
  const lastProcessedId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastRespondidosRef = useRef<number>(0);
  const autoPauseRef = useRef(false);

  // Sync editors when a different campaign is loaded
  useEffect(() => {
    if (!activeCampaign) return;
    setEditEnableAutoReply(activeCampaign.enableAutoReply ?? false);
    setEditAutoReplyText(activeCampaign.autoReplyText ?? '');
    setEditAutoReplyImageUrl(activeCampaign.autoReplyImageUrl ?? '');
    setShowAutoReplyEditor(false);
    setShowScheduleResume(false);
    setScheduleResumeAt('');
  }, [activeCampaign?.id]);

  // Handle Dispatch Sound and Toast
  useEffect(() => {
    if (!campaignLogs.length || !settings?.enableDispatchSound) return;
    
    const latestLog = campaignLogs[0];
    if (latestLog.status === 'enviado' && latestLog.id !== lastProcessedId.current && latestLog.contactId !== 'system') {
        lastProcessedId.current = latestLog.id;
        
        // Play sound
        if (settings.dispatchSoundUrl) {
            if (!audioRef.current || audioRef.current.src !== settings.dispatchSoundUrl) {
                audioRef.current = new Audio(settings.dispatchSoundUrl);
            }
            audioRef.current.play().catch((e: any) => console.warn('Sound blocked by browser', e));
        }

        // Ephemeral toast logic
        setSuccessMessage(`Mensagem enviada para ${latestLog.nome}`);
        const timer = setTimeout(() => setSuccessMessage(null), 3000);
        return () => clearTimeout(timer);
    }
  }, [campaignLogs, settings]);

  // Handle Reply Sound — fires when stats.respondidos increases
  useEffect(() => {
    const current = activeCampaign?.stats?.respondidos ?? 0;
    if (current > lastRespondidosRef.current) {
      if (settings?.enableReplySound && settings?.replySoundUrl) {
        if (!replyAudioRef.current || replyAudioRef.current.src !== settings.replySoundUrl) {
          replyAudioRef.current = new Audio(settings.replySoundUrl);
        }
        replyAudioRef.current.play().catch((e: any) => console.warn('Reply sound blocked', e));
      }
    }
    lastRespondidosRef.current = current;
  }, [activeCampaign?.stats?.respondidos]);

  // Fetch Templates on Mount & Subscribe to recent campaigns list
  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
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

      // Auto-attach to the first active/scheduled campaign if one exists on database load
      const running = list.find(c => c.status === 'running' || c.status === 'paused' || c.status === 'scheduled');
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
    const eligible = contacts.filter(c => c.optIn && !c.needsReview && c.status === 'active');
    if (preSelectedIds && preSelectedIds.length > 0) {
      const idSet = new Set(preSelectedIds);
      return eligible.filter(c => idSet.has(c.id));
    }
    if (selectedFolderId) {
      return eligible.filter(c => c.folderId === selectedFolderId);
    }
    return eligible;
  }, [contacts, preSelectedIds, selectedFolderId]);

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
      const scheduledTs = scheduleEnabled && scheduledAt ? new Date(scheduledAt).getTime() : null;
      const campaignData = {
        id: campaignId,
        nome: campaignName,
        templateText: templateText,
        enableImageReply,
        sendImageWithMessage,
        imageReplyApiUrl: (enableImageReply || sendImageWithMessage) ? imageReplyApiUrl : '',
        enableAutoReply,
        autoReplyText: enableAutoReply ? autoReplyText : '',
        autoReplyImageUrl: enableAutoReply ? autoReplyImageUrl : '',
        scheduledStartAt: scheduledTs,
        status: 'preparing',
        startedAt: scheduledTs ?? Date.now(),
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

      // 4. Activate or schedule
      const finalStatus = scheduledTs ? 'scheduled' : 'running';
      console.log(`[Frontend Campaign] All queue batches successfully committed. Setting campaign status to '${finalStatus}'...`);
      await updateDoc(campaignRef, { status: finalStatus });
      console.log(`[Frontend Campaign] Campaign status is now: '${finalStatus}'`);

      // Reset states and register active campaign UI frame
      setActiveCampaignId(campaignId);
      setTemplateText('');
      setPreviews([]);
      setScheduleEnabled(false);
      setScheduledAt('');
      setSuccessMessage(
        scheduledTs
          ? `Campanha "${campaignName}" agendada para ${new Date(scheduledTs).toLocaleString('pt-BR')}!`
          : `Campanha "${campaignName}" iniciada com sucesso! ${totalQueueCreated} disparos enfileirados.`
      );
      
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

  const saveScheduleResume = async () => {
    if (!activeCampaignId || !scheduleResumeAt) return;
    setSavingSchedule(true);
    try {
      const ts = new Date(scheduleResumeAt).getTime();
      await updateDoc(doc(db, 'campaigns', activeCampaignId), {
        status: 'paused',
        scheduledStartAt: ts,
      });
      const logRef = doc(collection(db, 'campaign_logs'));
      await setDoc(logRef, {
        id: logRef.id,
        campaignId: activeCampaignId,
        contactId: 'system',
        nome: 'Agendamento',
        telefoneE164: 'CRM',
        status: 'paused',
        message: `Retomada agendada para ${new Date(ts).toLocaleString('pt-BR')}.`,
        timestamp: Date.now()
      });
      setSuccessMessage('Retomada agendada com sucesso.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setShowScheduleResume(false);
    } catch (err: any) {
      setErrorMessage('Erro ao agendar retomada: ' + err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const cancelSchedule = async () => {
    if (!activeCampaignId) return;
    try {
      const hasSent = (activeCampaign?.stats?.enviados ?? 0) > 0;
      await updateDoc(doc(db, 'campaigns', activeCampaignId), {
        scheduledStartAt: null,
        status: hasSent ? 'paused' : 'draft',
      });
      setSuccessMessage('Agendamento cancelado.');
      setTimeout(() => setSuccessMessage(null), 3000);
      if (!hasSent) setActiveCampaignId(null);
    } catch (err: any) {
      setErrorMessage('Erro ao cancelar agendamento: ' + err.message);
    }
  };

  const startNow = async () => {
    if (!activeCampaignId) return;
    try {
      await updateDoc(doc(db, 'campaigns', activeCampaignId), {
        status: 'running',
        scheduledStartAt: null,
      });
    } catch (err: any) {
      setErrorMessage('Erro ao iniciar: ' + err.message);
    }
  };

  const saveAutoReply = async () => {
    if (!activeCampaignId) return;
    setSavingAutoReply(true);
    try {
      await updateDoc(doc(db, 'campaigns', activeCampaignId), {
        enableAutoReply: editEnableAutoReply,
        autoReplyText: editEnableAutoReply ? editAutoReplyText.trim() : '',
        autoReplyImageUrl: editEnableAutoReply ? editAutoReplyImageUrl.trim() : '',
      });
      setSuccessMessage('Resposta automática salva com sucesso.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setShowAutoReplyEditor(false);
    } catch (err: any) {
      setErrorMessage('Erro ao salvar resposta automática: ' + err.message);
    } finally {
      setSavingAutoReply(false);
    }
  };

  // Calculations for Premium Live Interface Metrics
  const calculatedStats = useMemo(() => {
    if (!activeCampaign) return { taxDelivery: 0, taxReply: 0, percentComplete: 0, waiting: 0, ignored: 0 };
    const { enviados, entregues, respondidos, falhas, ignorados } = activeCampaign.stats || { enviados: 0, entregues: 0, respondidos: 0, falhas: 0, ignorados: 0 };
    
    const totalEnrolled = (activeCampaign.stats.aguardando || 0) + enviados + falhas;
    const processed = enviados + falhas;
    const percentComplete = totalEnrolled > 0 ? Math.round((processed / totalEnrolled) * 100) : 0;
    
    const taxDelivery = enviados > 0 ? Math.round((entregues / enviados) * 100) : 0;
    const taxReply = enviados > 0 ? Math.round((respondidos / enviados) * 100) : 0;

    return {
      taxDelivery,
      taxReply,
      percentComplete,
      waiting: activeCampaign.stats.aguardando || 0,
      ignored: activeCampaign.stats.ignorados || 0
    };
  }, [activeCampaign]);

  const lastSentAt = useMemo(() => {
    const entry = campaignLogs.find(l => l.contactId !== 'system' && (l.status === 'enviado' || l.status === 'falhou'));
    return entry?.timestamp ?? null;
  }, [campaignLogs]);

  const banRiskScore = useMemo(() => {
    if (!activeCampaign?.stats || activeCampaign.status === 'completed') return 0;
    const { enviados = 0, falhas = 0, entregues = 0, respondidos = 0 } = activeCampaign.stats;

    // Factor 1: failure rate (0-50 pts) — strongest signal
    const totalProcessed = enviados + falhas;
    const failRate = totalProcessed > 3 ? falhas / totalProcessed : 0;
    const failScore = Math.min(50, failRate * 250); // 20% failures → 50 pts

    // Factor 2: low delivery rate (0-20 pts)
    const deliveryRate = enviados > 5 ? entregues / enviados : 1;
    const deliveryScore = Math.min(20, (1 - Math.max(0, deliveryRate)) * 40);

    // Factor 3: send speed from recent logs (0-15 pts)
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    const recentSent = campaignLogs.filter(l =>
      l.timestamp > twoMinAgo &&
      l.contactId !== 'system' &&
      (l.status === 'enviado' || l.status === 'falhou')
    ).length;
    const speedScore = Math.min(15, Math.max(0, (recentSent - 4) / 6 * 15));

    // Factor 4: low response rate (0-15 pts) — spam signal when nobody replies
    // Only applies after enough messages sent; good engagement reduces risk
    const replyRate = enviados >= 10 ? respondidos / enviados : null;
    const replyScore = replyRate === null ? 0
      : replyRate >= 0.15 ? 0                                    // ≥15% replies → no risk
      : Math.min(15, (0.15 - replyRate) / 0.15 * 15);           // 0% replies → 15 pts

    return Math.min(100, Math.round(failScore + deliveryScore + speedScore + replyScore));
  }, [activeCampaign, campaignLogs]);

  // Auto-pause when ban risk is critical
  useEffect(() => {
    if (banRiskScore < 85) {
      autoPauseRef.current = false;
      return;
    }
    if (activeCampaign?.status !== 'running' || autoPauseRef.current || !activeCampaignId) return;
    autoPauseRef.current = true;

    updateDoc(doc(db, 'campaigns', activeCampaignId), { status: 'paused' }).then(async () => {
      const logRef = doc(collection(db, 'campaign_logs'));
      await setDoc(logRef, {
        id: logRef.id,
        campaignId: activeCampaignId,
        contactId: 'system',
        nome: 'Sistema Antiban',
        telefoneE164: 'CRM',
        status: 'paused',
        message: `Campanha pausada automaticamente. Risco de banimento: ${banRiskScore}%. Aguarde antes de retomar.`,
        timestamp: Date.now()
      });
      setSuccessMessage(`⚠️ Pausa automática — risco de banimento em ${banRiskScore}%.`);
      setTimeout(() => setSuccessMessage(null), 10000);
    }).catch(console.error);
  }, [banRiskScore, activeCampaign?.status, activeCampaignId]);

  return (
    <div className="space-y-6">
      {/* Batch Pause Modal with Progress Bar */}
      {activeCampaign?.batchPauseUntil && (
        <BatchPauseOverlay 
            until={activeCampaign.batchPauseUntil} 
            duration={activeCampaign.batchPauseDuration || 60000} 
        />
      )}

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
                      c.status === 'paused' && c.scheduledStartAt ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' :
                      c.status === 'paused' ? 'bg-amber-400/10 text-amber-400 border border-amber-500/20' :
                      c.status === 'scheduled' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {c.status === 'running' ? 'Executando' :
                       c.status === 'scheduled' ? 'Agendada' :
                       c.status === 'paused' && c.scheduledStartAt ? 'Agendada' :
                       c.status === 'paused' ? 'Pausada' :
                       c.status === 'draft' ? 'Rascunho' :
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
        <div className="space-y-6">
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

            {/* Image Options */}
            <div className={`rounded-xl border p-4 space-y-4 transition-colors ${(enableImageReply || sendImageWithMessage) ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-zinc-800 bg-zinc-950'}`}>
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                <Image size={13} className="text-indigo-400" /> Imagem Personalizada por Contato
              </div>

              {/* Option 1: Send image WITH the message */}
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 font-medium">Enviar imagem junto com a mensagem</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">A imagem do contato é enviada como mídia com o texto da mensagem como legenda. O destinatário vê a imagem, não um link.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSendImageWithMessage(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${sendImageWithMessage ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${sendImageWithMessage ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>

              {/* Option 2: Send image when client REPLIES */}
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 font-medium">Enviar imagem quando o cliente responder</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Se o contato responder a campanha, o sistema envia automaticamente a imagem personalizada dele.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableImageReply(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${enableImageReply ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enableImageReply ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>

              {/* Shared API URL (shown when either is enabled) */}
              {(enableImageReply || sendImageWithMessage) && (
                <div className="space-y-1.5 pt-1 border-t border-indigo-500/20">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">URL da API de imagens</label>
                  <input
                    type="text"
                    value={imageReplyApiUrl}
                    onChange={e => setImageReplyApiUrl(e.target.value)}
                    placeholder="https://miniaturas.3dfans.pro/api/image-by-phone/"
                    className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
                  />
                  <p className="text-[10px] text-zinc-600">
                    O sistema chamará <span className="text-zinc-400 font-mono">{(imageReplyApiUrl || '…').replace(/\/$/, '')}/{'{telefone}'}</span> e enviará a imagem retornada.
                  </p>
                </div>
              )}
            </div>

            {/* Auto-Reply Section */}
            <div className={`rounded-xl border p-4 space-y-4 transition-colors ${enableAutoReply ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-950'}`}>
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                <MessageCircle size={13} className="text-emerald-400" /> Resposta Automática ao Retorno
              </div>

              <label className="flex items-center justify-between cursor-pointer gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 font-medium">Enviar mensagem quando o contato responder</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Uma mensagem configurável é enviada automaticamente assim que o contato responder à campanha. Suporta links e imagem.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableAutoReply(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${enableAutoReply ? 'bg-emerald-600' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enableAutoReply ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>

              {enableAutoReply && (
                <div className="space-y-3 pt-1 border-t border-emerald-500/20">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                      Mensagem de resposta <span className="text-zinc-600 normal-case">(links são renderizados automaticamente)</span>
                    </label>
                    <textarea
                      value={autoReplyText}
                      onChange={e => setAutoReplyText(e.target.value)}
                      placeholder={"Ex: Olá! Obrigado por responder. Acesse nosso catálogo completo em https://exemplo.com/catalogo 🎉"}
                      rows={4}
                      className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 text-white rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none font-sans placeholder-zinc-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                      Imagem <span className="text-zinc-600 normal-case">(opcional — enviada como mídia com a mensagem como legenda)</span>
                    </label>
                    <CampaignImageUpload value={autoReplyImageUrl} onChange={setAutoReplyImageUrl} />
                  </div>
                </div>
              )}
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

              {/* Folder selector */}
              <div className="relative" ref={folderDropdownRef}>
                <button
                  onClick={() => setFolderDropdownOpen(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-950 text-sm text-zinc-300 hover:border-indigo-500 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen size={15} className="text-indigo-400" />
                    {selectedFolderId
                      ? folders.find(f => f.id === selectedFolderId)?.name ?? 'Pasta'
                      : preSelectedIds?.length
                        ? `${preSelectedIds.length} contatos pré-selecionados`
                        : 'Todos os elegíveis'}
                  </span>
                  <span className="flex items-center gap-1">
                    {selectedFolderId && (
                      <span
                        onClick={e => { e.stopPropagation(); setSelectedFolderId(null); }}
                        className="p-0.5 hover:text-rose-400 transition-colors"
                      ><X size={12} /></span>
                    )}
                    <ChevronDown size={14} className="text-zinc-500" />
                  </span>
                </button>
                {folderDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 w-full">
                    <button
                      onClick={() => { setSelectedFolderId(null); setFolderDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-zinc-800 ${!selectedFolderId ? 'text-indigo-400' : 'text-zinc-400'}`}
                    >
                      <Users size={14} /> Todos os elegíveis
                    </button>
                    {folders.length > 0 && <div className="border-t border-zinc-800 my-1" />}
                    {folders.map(f => {
                      const count = contacts.filter(c => c.folderId === f.id && c.optIn && !c.needsReview && c.status === 'active').length;
                      return (
                        <button
                          key={f.id}
                          onClick={() => { setSelectedFolderId(f.id); setFolderDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-zinc-800 ${selectedFolderId === f.id ? 'text-indigo-400' : 'text-zinc-300'}`}
                        >
                          <span className="flex items-center gap-2">
                            <FolderOpen size={14} className="text-indigo-400" /> {f.name}
                          </span>
                          <span className="text-xs text-zinc-500">{count} elegíveis</span>
                        </button>
                      );
                    })}
                    {folders.length === 0 && (
                      <p className="px-3 py-2 text-xs text-zinc-600">Nenhuma pasta criada ainda.</p>
                    )}
                  </div>
                )}
              </div>

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
                  <span className="text-zinc-400">{selectedFolderId ? `Pasta "${folders.find(f=>f.id===selectedFolderId)?.name}"` : 'Menos "Revisão Necessária"'}:</span>
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

            {/* Schedule toggle */}
            <div className={`p-4 rounded-xl border space-y-3 transition-colors ${scheduleEnabled ? 'border-violet-500/40 bg-violet-500/5' : 'border-zinc-800 bg-zinc-950/50'}`}>
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 font-medium flex items-center gap-2">
                    <CalendarClock size={14} className="text-violet-400 flex-shrink-0" />
                    Agendar início
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">A campanha inicia automaticamente na data/hora configurada.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleEnabled(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scheduleEnabled ? 'bg-violet-600' : 'bg-zinc-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>

              {scheduleEnabled && (
                <div className="space-y-1.5 pt-1 border-t border-violet-500/20">
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">Data e hora do disparo</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    className="w-full bg-zinc-900 border border-violet-500/40 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 [color-scheme:dark]"
                  />
                  {scheduledAt && (
                    <p className="text-[11px] text-violet-400">
                      Disparo em {new Date(scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleStartCampaign}
              disabled={isCreating || audience.length === 0 || !templateText || (scheduleEnabled && !scheduledAt)}
              className={`w-full mt-2 py-4 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-base cursor-pointer disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed select-none ${
                scheduleEnabled && scheduledAt
                  ? 'bg-violet-600 hover:bg-violet-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {isCreating ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Registrando Campanha...
                </>
              ) : scheduleEnabled && scheduledAt ? (
                <>
                  <CalendarClock size={18} /> Agendar Disparo
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" /> Iniciar Disparo Realtime
                </>
              )}
            </button>
          </div>
        </div>
        <BanRiskMeter
          defaultVolume={audience.length}
          defaultIntervalSeconds={settings ? Math.round(((settings.delayMinMs ?? 20000) + (settings.delayMaxMs ?? 45000)) / 2 / 1000) : 32}
          defaultColdPct={audience.length > 0 ? Math.round(audience.filter(c => c.stage === 'Novo Lead').length / audience.length * 100) : 20}
          defaultMediaPct={sendImageWithMessage ? 100 : 0}
          defaultVariationPct={templateText.includes('{{nome}}') && templateText.includes('{{produto}}') ? 8 : templateText.includes('{{') ? 20 : 90}
        />
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
                    activeCampaign.status === 'scheduled' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20 animate-pulse' :
                    activeCampaign.status === 'paused' && activeCampaign.scheduledStartAt ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' :
                    activeCampaign.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {activeCampaign.status === 'running' ? '● Em Andamento' :
                     activeCampaign.status === 'scheduled' ? '⏰ Aguardando Início' :
                     activeCampaign.status === 'paused' && activeCampaign.scheduledStartAt ? '⏰ Retomada Agendada' :
                     activeCampaign.status === 'paused' ? '⏸ Pausada' :
                     '✓ Execução Concluída'}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-mono">ID: {activeCampaignId}</p>
            </div>

            {/* Server Controls Action Group */}
            {activeCampaign && activeCampaign.status !== 'completed' && activeCampaign.status !== 'error' && (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {/* Scheduled: Iniciar Agora + Cancelar */}
                  {activeCampaign.status === 'scheduled' ? (
                    <>
                      <button
                        onClick={startNow}
                        className="px-4 py-2.5 border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
                      >
                        <Play size={15} fill="currentColor" /> Iniciar Agora
                      </button>
                      <button
                        onClick={cancelSchedule}
                        className="px-4 py-2.5 border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
                      >
                        <X size={14} /> Cancelar Agendamento
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Paused with schedule: show cancel schedule */}
                      {activeCampaign.status === 'paused' && activeCampaign.scheduledStartAt && (
                        <button
                          onClick={cancelSchedule}
                          className="px-4 py-2.5 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
                        >
                          <X size={14} /> Cancelar Agendamento
                        </button>
                      )}

                      <button
                        onClick={togglePauseResume}
                        className={`px-4 py-2.5 border rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                          activeCampaign.status === 'running'
                            ? 'border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                            : 'border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {activeCampaign.status === 'running' ? (
                          <><Pause size={15} /> Pausar</>
                        ) : (
                          <><Play size={15} fill="currentColor" /> Retomar</>
                        )}
                      </button>

                      {/* Schedule resume button */}
                      <button
                        onClick={() => setShowScheduleResume(v => !v)}
                        className={`px-4 py-2.5 border rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                          showScheduleResume
                            ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                            : 'border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10 text-violet-400'
                        }`}
                      >
                        <CalendarClock size={15} /> Agendar
                      </button>

                      <button
                        onClick={cancelCampaign}
                        className="px-4 py-2.5 border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                      >
                        Interromper
                      </button>
                    </>
                  )}
                </div>

                {/* Schedule resume panel */}
                {showScheduleResume && activeCampaign.status !== 'scheduled' && (
                  <div className="flex items-center gap-2 p-3 bg-violet-950/30 border border-violet-500/25 rounded-xl w-full">
                    <CalendarCheck2 size={15} className="text-violet-400 flex-shrink-0" />
                    <input
                      type="datetime-local"
                      value={scheduleResumeAt}
                      onChange={e => setScheduleResumeAt(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      className="flex-1 bg-zinc-900 border border-violet-500/30 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/50 [color-scheme:dark]"
                    />
                    <button
                      onClick={saveScheduleResume}
                      disabled={savingSchedule || !scheduleResumeAt}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5"
                    >
                      {savingSchedule ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                      Confirmar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Real-time statistics Bento Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            
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

            {/* Ignored (Cooldown) */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Ignorados (Cooldown)</span>
              <strong className={`text-3xl font-extrabold block ${
                calculatedStats.ignored > 0 ? 'text-amber-400' : 'text-zinc-500'
              }`}>{calculatedStats.ignored}</strong>
              <span className="text-[10px] text-zinc-500 block">Interação &lt; 7 dias</span>
            </div>

            {/* Delivered (Hook synced) */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Taxa Entrega</span>
              <strong className="text-3xl font-extrabold text-indigo-400 block">{calculatedStats.taxDelivery}%</strong>
              <span className="text-[10px] text-zinc-500 block">{activeCampaign?.stats?.entregues || 0} confirmados</span>
            </div>

            {/* Responses rate (Replied) */}
            <div className="bg-emerald-950/30 border border-emerald-500/20 p-5 rounded-2xl space-y-1 col-span-1">
              <span className="text-emerald-500 text-xs font-semibold uppercase tracking-wider block flex items-center gap-1">
                <CheckCircle2 size={12} /> Taxa de Resposta
              </span>
              <strong className={`text-3xl font-extrabold block ${calculatedStats.taxReply > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {calculatedStats.taxReply}%
              </strong>
              <span className="text-[10px] text-emerald-400/70 font-semibold block">
                {activeCampaign?.stats?.respondidos || 0} / {activeCampaign?.stats?.enviados || 0} responderam
              </span>
            </div>

            {/* Progress Completion Rate */}
            <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-2xl space-y-1">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider block">Conclusão Geral</span>
              <strong className="text-3xl font-extrabold text-white block">{calculatedStats.percentComplete}%</strong>
              <span className="text-[10px] text-zinc-500 block">Tempo real</span>
            </div>
          </div>

          {/* Ban Risk Score Bar */}
          {(activeCampaign?.status === 'running' || activeCampaign?.status === 'paused') && (
            <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
              banRiskScore >= 85 ? 'bg-red-500/10 border-red-500/30' :
              banRiskScore >= 65 ? 'bg-orange-500/10 border-orange-500/30' :
              banRiskScore >= 40 ? 'bg-amber-500/10 border-amber-500/20' :
              'bg-zinc-900 border-zinc-850'
            }`}>
              <Shield size={18} className={`flex-shrink-0 ${
                banRiskScore >= 85 ? 'text-red-400' :
                banRiskScore >= 65 ? 'text-orange-400' :
                banRiskScore >= 40 ? 'text-amber-400' :
                'text-emerald-400'
              }`} />
              <div className="flex-shrink-0 min-w-[130px]">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Risco de Banimento</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {banRiskScore >= 85 ? 'CRÍTICO — campanha pausada automaticamente' :
                   banRiskScore >= 65 ? 'ALTO — desacelere os envios' :
                   banRiskScore >= 40 ? 'MODERADO — monitorando' :
                   'BAIXO — operação normal'}
                </p>
              </div>
              <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    banRiskScore >= 85 ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
                    banRiskScore >= 65 ? 'bg-gradient-to-r from-orange-600 to-orange-400' :
                    banRiskScore >= 40 ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
                    'bg-gradient-to-r from-emerald-700 to-emerald-500'
                  }`}
                  style={{ width: `${banRiskScore}%` }}
                />
              </div>
              <span className={`text-lg font-extrabold flex-shrink-0 w-12 text-right ${
                banRiskScore >= 85 ? 'text-red-400' :
                banRiskScore >= 65 ? 'text-orange-400' :
                banRiskScore >= 40 ? 'text-amber-400' :
                'text-emerald-400'
              }`}>{banRiskScore}%</span>
            </div>
          )}

          {/* Auto-Reply Configuration Panel */}
          <div className={`rounded-2xl border transition-colors ${showAutoReplyEditor ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-zinc-900 border-zinc-850'}`}>
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <MessageCircle size={17} className={editEnableAutoReply && !showAutoReplyEditor ? 'text-emerald-400' : 'text-zinc-500'} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Resposta Automática</p>
                  {!showAutoReplyEditor && (
                    <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                      {activeCampaign?.enableAutoReply
                        ? `Ativa — ${activeCampaign?.autoReplyText?.slice(0, 60) || ''}${(activeCampaign?.autoReplyText?.length ?? 0) > 60 ? '…' : ''}`
                        : 'Desativada — clique para configurar'}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowAutoReplyEditor(v => !v)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  showAutoReplyEditor
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20'
                }`}
              >
                {showAutoReplyEditor ? 'Fechar' : 'Configurar'}
              </button>
            </div>

            {showAutoReplyEditor && (
              <div className="px-4 pb-5 space-y-4 border-t border-emerald-500/20 pt-4">
                {/* Toggle */}
                <label className="flex items-center justify-between cursor-pointer gap-3">
                  <div>
                    <p className="text-sm text-zinc-300 font-medium">Ativar resposta automática</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Quando o contato responder à campanha, esta mensagem é enviada automaticamente.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditEnableAutoReply(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${editEnableAutoReply ? 'bg-emerald-600' : 'bg-zinc-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editEnableAutoReply ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>

                {editEnableAutoReply && (
                  <div className="space-y-3 pt-1 border-t border-zinc-800">
                    {/* Text */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                        Mensagem <span className="normal-case text-zinc-600">(links são renderizados automaticamente)</span>
                      </label>
                      <textarea
                        value={editAutoReplyText}
                        onChange={e => setEditAutoReplyText(e.target.value)}
                        placeholder={"Ex: Obrigado por responder! Acesse nosso catálogo em https://exemplo.com/catalogo"}
                        rows={4}
                        className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 text-white rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none font-sans placeholder-zinc-600"
                      />
                    </div>

                    {/* Image upload */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                        Imagem <span className="normal-case text-zinc-600">(opcional — enviada como mídia com a mensagem como legenda)</span>
                      </label>
                      <CampaignImageUpload value={editAutoReplyImageUrl} onChange={setEditAutoReplyImageUrl} />
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={saveAutoReply}
                    disabled={savingAutoReply || (editEnableAutoReply && !editAutoReplyText.trim())}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {savingAutoReply ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Salvar configuração
                  </button>
                  {activeCampaign?.status === 'running' && (
                    <p className="text-[11px] text-amber-400/70">
                      Pause a campanha para editar sem interrupções
                    </p>
                  )}
                </div>
              </div>
            )}
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

              {/* Response rate bar */}
              <div className="space-y-2 pt-2 border-t border-zinc-850">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    Taxa de Resposta
                  </span>
                  <span className={`font-bold ${calculatedStats.taxReply > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>
                    {calculatedStats.taxReply}%
                  </span>
                </div>
                <div className="w-full bg-zinc-950 rounded-full h-2.5 border border-zinc-800 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-700 ease-out"
                    style={{ width: `${calculatedStats.taxReply}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>{activeCampaign?.stats?.respondidos || 0} responderam</span>
                  <span>de {activeCampaign?.stats?.enviados || 0} enviados</span>
                </div>
              </div>

              {/* Dispatch interval countdown */}
              {activeCampaign?.status === 'running' && lastSentAt && settings && (
                <DispatchCountdown
                  lastSentAt={lastSentAt}
                  delayMinMs={settings.delayMinMs || 30000}
                  delayMaxMs={settings.delayMaxMs || 90000}
                />
              )}

              {/* Image & auto-reply config badges */}
              {(activeCampaign?.sendImageWithMessage || activeCampaign?.enableImageReply || activeCampaign?.enableAutoReply) && (
                <div className="space-y-1.5">
                  {activeCampaign?.sendImageWithMessage && (
                    <div className="flex items-center gap-2 p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                      <Image size={13} className="text-indigo-400 flex-shrink-0" />
                      <span>Imagem personalizada enviada com cada mensagem</span>
                    </div>
                  )}
                  {activeCampaign?.enableImageReply && (
                    <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
                      <Image size={13} className="text-emerald-400 flex-shrink-0" />
                      <span>Gatilho ativo — imagem enviada quando o contato responder</span>
                    </div>
                  )}
                  {activeCampaign?.enableAutoReply && (
                    <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
                      <MessageCircle size={13} className="text-emerald-400 flex-shrink-0" />
                      <span className="truncate">
                        Resposta automática ativa
                        {activeCampaign?.autoReplyImageUrl ? ' · com imagem' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Matrix original prompt summary */}
              <div className="space-y-2 pt-2 border-t border-zinc-850">
                <span className="text-xs text-zinc-500 block">Mensagem original veiculada:</span>
                <div className="p-3.5 bg-zinc-950 rounded-xl text-xs text-zinc-400 leading-relaxed max-h-36 overflow-y-auto font-sans border border-zinc-850 whitespace-pre-wrap">
                  {activeCampaign?.templateText}
                </div>
              </div>

              {/* Scheduled start countdown */}
              {activeCampaign?.status === 'scheduled' && activeCampaign?.scheduledStartAt && (
                <ScheduledCountdown scheduledStartAt={activeCampaign.scheduledStartAt} label="Início Agendado" />
              )}

              {/* Scheduled resume countdown */}
              {activeCampaign?.status === 'paused' && activeCampaign?.scheduledStartAt && (
                <ScheduledCountdown scheduledStartAt={activeCampaign.scheduledStartAt} label="Retomada Agendada" />
              )}

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

            {/* Terminal Log Monitor */}
            <div className="lg:col-span-8 flex flex-col">
              <div className="bg-[#060a06] border border-[#1a2a1a]/80 rounded-xl overflow-hidden flex flex-col shadow-[0_0_50px_rgba(0,255,80,0.03),inset_0_1px_0_rgba(0,255,80,0.04)]">

                {/* Title bar */}
                <div className="flex items-center justify-between px-4 py-2 bg-[#0b0f0b] border-b border-[#151f15]">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/70" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/70" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/70" />
                    </div>
                    <span className="text-[10px] font-mono text-green-900 tracking-widest uppercase select-none">
                      dispatch-monitor — 3dfans@crm:~
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      activeCampaign?.status === 'running'
                        ? 'bg-green-400 animate-pulse shadow-[0_0_6px_#4ade80]'
                        : activeCampaign?.status === 'paused' ? 'bg-yellow-400' : 'bg-zinc-700'
                    }`} />
                    <span className={`text-[10px] font-mono font-bold tracking-widest ${
                      activeCampaign?.status === 'running' ? 'text-green-400'
                        : activeCampaign?.status === 'paused' ? 'text-yellow-400' : 'text-zinc-600'
                    }`}>
                      {activeCampaign?.status === 'running' ? 'LIVE'
                        : activeCampaign?.status === 'paused' ? 'PAUSED' : 'IDLE'}
                    </span>
                  </div>
                </div>

                {/* Terminal body */}
                <div className="relative h-[360px] overflow-hidden">
                  {/* Scanlines overlay */}
                  <div
                    className="pointer-events-none absolute inset-0 z-10 opacity-[0.022]"
                    style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 1px,#000 1px,#000 2px)' }}
                  />
                  {/* Edge vignette */}
                  <div
                    className="pointer-events-none absolute inset-0 z-10"
                    style={{ boxShadow: 'inset 0 0 70px rgba(0,0,0,0.55)' }}
                  />

                  <div className="h-full overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-[1.75] custom-scrollbar">

                    {/* Static boot banner */}
                    <div className="text-green-500/20 text-[10px] mb-3 pb-2 border-b border-green-500/[0.08] select-none">
                      <div>╔════════════════════════════════════════════════════╗</div>
                      <div>║  3DFANS CRM-OS v2.4  ◉  DISPATCH ENGINE  ACTIVE   ║</div>
                      <div>║  FIREBASE REALTIME: CONNECTED  ◉  STREAM: OK       ║</div>
                      <div>╚════════════════════════════════════════════════════╝</div>
                    </div>

                    {logsLoading && (
                      <div className="text-cyan-400/50 animate-pulse">
                        $ FETCHING LOG STREAM FROM FIRESTORE...
                      </div>
                    )}

                    {!logsLoading && campaignLogs.length === 0 && (
                      <div className="space-y-0.5">
                        <div className="text-yellow-500/50">$ WORKER READY. AWAITING FIRST DISPATCH...</div>
                        <div className="text-zinc-700">  Queue monitor active. Workers initialized.</div>
                        <div className="text-green-400/40 animate-pulse mt-1 select-none">▌</div>
                      </div>
                    )}

                    {[...campaignLogs].reverse().map((log, idx) => {
                      const isSystem  = log.contactId === 'system';
                      const isFailed  = log.status === 'falhou';
                      const isPaused  = log.status === 'paused';
                      const isCompleted = log.status === 'completed';
                      const isRead    = log.status === 'lido';
                      const isSent    = log.status === 'enviado' && !isSystem;

                      const timeStr = new Date(log.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      });

                      // Tag icon + label + colours
                      let tagIcon: string, tagLabel: string;
                      let tagClass: string, pipeClass: string, msgClass: string;

                      if (isFailed) {
                        tagIcon = '✗'; tagLabel = 'FALHA';
                        tagClass = 'text-red-400'; pipeClass = 'text-red-800/50'; msgClass = 'text-red-300/75';
                      } else if (isPaused) {
                        tagIcon = '⏸'; tagLabel = 'PAUSA';
                        tagClass = 'text-yellow-400'; pipeClass = 'text-yellow-800/40'; msgClass = 'text-yellow-200/65';
                      } else if (isCompleted) {
                        tagIcon = '■'; tagLabel = 'FIM';
                        tagClass = 'text-zinc-500'; pipeClass = 'text-zinc-700/40'; msgClass = 'text-zinc-500';
                      } else if (isSystem) {
                        tagIcon = '●'; tagLabel = 'SYS';
                        tagClass = 'text-cyan-400'; pipeClass = 'text-cyan-800/40'; msgClass = 'text-cyan-200/60';
                      } else if (isRead) {
                        tagIcon = '◎'; tagLabel = 'LIDO';
                        tagClass = 'text-green-300'; pipeClass = 'text-green-800/45'; msgClass = 'text-green-200/60';
                      } else {
                        tagIcon = '✓'; tagLabel = 'ENVIADO';
                        tagClass = 'text-green-400'; pipeClass = 'text-green-900/55'; msgClass = 'text-zinc-500/70';
                      }

                      const isGenericSentMsg = isSent &&
                        (log.message === 'Mensagem enviada via Evolution API.' || log.message?.startsWith('Mensagem enviada'));

                      return (
                        <div key={idx} className="mb-1.5 group">

                          {/* ── Line 1: timestamp · tag · contact ── */}
                          <div className="flex items-center gap-0 flex-wrap leading-snug">
                            <span className="text-green-950/80 select-none text-[10.5px]">[{timeStr}]</span>
                            <span className="text-zinc-800 select-none mx-1">·</span>
                            <span className={`${tagClass} font-bold text-[11px] tracking-wide`}>
                              {tagIcon} {tagLabel}
                            </span>
                            <span className="text-zinc-800 select-none mx-1">·</span>
                            {isSystem ? (
                              <span className="text-cyan-500/65 font-semibold">SYSTEM</span>
                            ) : (
                              <>
                                <span className="text-white font-bold">{log.nome}</span>
                                <span className="text-zinc-600 ml-1.5 text-[10.5px]">{log.telefoneE164}</span>
                              </>
                            )}
                            {/* Inline success pill */}
                            {isSent && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold tracking-widest uppercase text-green-500/50 bg-green-500/5 border border-green-500/12 px-1.5 py-px rounded select-none">
                                ✓ success
                              </span>
                            )}
                            {isFailed && (
                              <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold tracking-widest uppercase text-red-500/60 bg-red-500/5 border border-red-500/15 px-1.5 py-px rounded select-none">
                                ✗ error
                              </span>
                            )}
                          </div>

                          {/* ── Line 2: message / status ── */}
                          {log.message && (
                            isGenericSentMsg ? (
                              <div className="flex items-center gap-2 leading-none ml-3 mt-0.5">
                                <span className={`${pipeClass} select-none flex-shrink-0 text-[13px]`}>│</span>
                                <span className="text-green-600/50 text-[10.5px]">Entregue via</span>
                                <span className="text-green-500/55 text-[9.5px] font-bold tracking-widest bg-green-500/5 border border-green-500/10 px-1.5 py-px rounded">
                                  EVOLUTION API
                                </span>
                                <span className="text-green-500/30 text-[10px]">◆</span>
                              </div>
                            ) : (
                              <div className="flex gap-2 leading-snug ml-1">
                                <span className={`${pipeClass} select-none ml-2 flex-shrink-0`}>│</span>
                                <span className={msgClass}>{log.message}</span>
                              </div>
                            )
                          )}

                          {/* ── Line 3: sent body (mensagem real enviada) ── */}
                          {log.sentBody && (
                            <div className="flex gap-1.5 leading-snug ml-3 mt-0.5">
                              <span className="text-zinc-700 select-none flex-shrink-0">└─</span>
                              <span className="text-yellow-300/50 italic text-[10.5px] line-clamp-2 whitespace-pre-wrap">
                                {log.sentBody}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Blinking cursor */}
                    {!logsLoading && campaignLogs.length > 0 && (
                      <div className="text-green-400/50 animate-pulse mt-1 select-none leading-none">▌</div>
                    )}
                  </div>
                </div>
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

const ScheduledCountdown = ({ scheduledStartAt, label }: { scheduledStartAt: number; label: string }) => {
  const [msLeft, setMsLeft] = React.useState(() => Math.max(0, scheduledStartAt - Date.now()));

  React.useEffect(() => {
    const iv = setInterval(() => setMsLeft(Math.max(0, scheduledStartAt - Date.now())), 1000);
    return () => clearInterval(iv);
  }, [scheduledStartAt]);

  const totalSecs = Math.floor(msLeft / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  const parts = d > 0
    ? `${d}d ${h}h ${m}m`
    : h > 0
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;

  return (
    <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl flex items-center gap-3">
      <CalendarClock size={18} className="text-violet-400 animate-pulse flex-shrink-0" />
      <div className="text-xs min-w-0">
        <span className="text-zinc-500 block font-semibold uppercase tracking-wide">{label}</span>
        <strong className="text-violet-300 font-mono text-base">{msLeft <= 0 ? 'Iniciando...' : parts}</strong>
        <span className="text-zinc-600 block text-[10px] mt-0.5">
          {new Date(scheduledStartAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      </div>
    </div>
  );
};

const CampaignImageUpload = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) => {
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `campaign-assets/${Date.now()}-${safeName}`;
      const fileRef = storageRef(storage, path);
      const snapshot = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(snapshot.ref);
      onChange(url);
    } catch (err: any) {
      setUploadError('Erro no upload: ' + (err?.message || 'tente novamente'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="relative rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900">
          <img src={value} alt="preview" className="w-full max-h-52 object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-black/90 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFile}
        disabled={disabled || uploading}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {uploading
            ? <><Loader2 size={12} className="animate-spin" /> Enviando...</>
            : <><Image size={12} /> Fazer upload</>}
        </button>
        <span className="text-[11px] text-zinc-600">ou cole a URL abaixo</span>
      </div>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://exemplo.com/imagem.jpg"
        disabled={uploading}
        className="w-full bg-zinc-950 border border-zinc-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono placeholder-zinc-600 disabled:opacity-50"
      />

      {uploadError && <p className="text-[11px] text-red-400">{uploadError}</p>}
      {value && !uploadError && (
        <p className="text-[10px] text-zinc-600">
          {value.includes('storage.googleapis') || value.includes('firebasestorage')
            ? '✓ Hospedada no Firebase Storage'
            : 'URL externa'}
        </p>
      )}
    </div>
  );
};

const DispatchCountdown = ({
  lastSentAt,
  delayMinMs,
  delayMaxMs,
}: {
  lastSentAt: number;
  delayMinMs: number;
  delayMaxMs: number;
}) => {
  const [elapsed, setElapsed] = React.useState(() => Date.now() - lastSentAt);

  React.useEffect(() => {
    const iv = setInterval(() => setElapsed(Date.now() - lastSentAt), 250);
    return () => clearInterval(iv);
  }, [lastSentAt]);

  const pct = Math.min(100, (elapsed / delayMaxMs) * 100);
  const secsRemaining = Math.max(0, Math.round((delayMaxMs - elapsed) / 1000));
  const minMarkerPct = Math.min(100, (delayMinMs / delayMaxMs) * 100);

  const inWindow = elapsed >= delayMinMs && elapsed < delayMaxMs;
  const pastMax = elapsed >= delayMaxMs;

  return (
    <div className="space-y-2 pt-3 border-t border-zinc-850">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 font-medium flex items-center gap-1.5">
          <Clock size={12} className="text-indigo-400" />
          Intervalo entre disparos
        </span>
        <span className={`font-semibold ${
          pastMax ? 'text-amber-400 animate-pulse' :
          inWindow ? 'text-yellow-400' :
          'text-zinc-400'
        }`}>
          {pastMax
            ? 'Aguardando servidor...'
            : inWindow
              ? `Envio iminente (~${secsRemaining}s)`
              : `Próximo em ~${secsRemaining}s`}
        </span>
      </div>

      <div className="relative h-2.5 bg-zinc-800 rounded-full overflow-visible border border-zinc-700">
        {/* Min delay marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-zinc-500 z-10 rounded-full"
          style={{ left: `${minMarkerPct}%` }}
          title={`Mínimo: ${delayMinMs / 1000}s`}
        />
        {/* Fill */}
        <div
          className={`h-full rounded-full transition-all duration-250 ${
            pastMax
              ? 'bg-amber-500'
              : inWindow
                ? 'bg-yellow-500'
                : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>0s</span>
        <span className="text-zinc-500 -ml-4">mín. {delayMinMs / 1000}s</span>
        <span>máx. {delayMaxMs / 1000}s</span>
      </div>
    </div>
  );
};

const BatchPauseOverlay = ({ until, duration }: { until: number, duration: number }) => {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, until - Date.now()));
  
  useEffect(() => {
    const interval = setInterval(() => {
      const next = Math.max(0, until - Date.now());
      setTimeLeft(next);
      if (next === 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [until]);

  const progress = Math.min(100, 100 - (timeLeft / duration) * 100);
  const secondsLeft = (timeLeft / 1000).toFixed(0);

  if (timeLeft <= 0) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-indigo-500/30 rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl shadow-indigo-500/20"
      >
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping" />
          <div className="relative bg-zinc-800 rounded-full w-full h-full flex items-center justify-center border border-indigo-500/50">
            <Clock className="text-indigo-400 animate-pulse" size={32} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white tracking-tight">Pausa de Segurança Ativa</h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Estamos simulando um comportamento humano para proteger seu número.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Resfriamento</span>
            <span className="text-2xl font-mono font-bold text-white">{secondsLeft}s</span>
          </div>
          <div className="h-3 bg-zinc-950 rounded-full border border-zinc-800 overflow-hidden p-0.5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
              className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.5)]"
            />
          </div>
          <p className="text-[9px] text-zinc-500 uppercase font-medium tracking-tighter">O disparo será retomado automaticamente</p>
        </div>
      </motion.div>
    </div>
  );
};
