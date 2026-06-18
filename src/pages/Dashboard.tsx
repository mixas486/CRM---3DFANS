import React, { useState, useEffect } from 'react';
import { Users, MessageSquare, Activity, Brain, Cpu, TrendingUp, PlayCircle, Clock, Sparkles, PauseCircle, CheckCircle2, AlertCircle, CalendarClock } from 'lucide-react';
import { useContacts } from '../hooks/useContacts';
import { db } from '../lib/firebase';
import { doc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { Campaign } from '../types';
import { useNavigate } from 'react-router-dom';

const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
};

const CAMPAIGN_STATUS_CONFIG: Record<Campaign['status'], { label: string; color: string; badgeClass: string; icon: React.ReactNode }> = {
    running:   { label: 'Rodando',   color: 'emerald', badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> },
    paused:    { label: 'Pausada',   color: 'amber',   badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',     icon: <PauseCircle size={12} /> },
    draft:     { label: 'Rascunho',  color: 'zinc',    badgeClass: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',         icon: null },
    completed: { label: 'Concluída', color: 'sky',     badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20',           icon: <CheckCircle2 size={12} /> },
    error:     { label: 'Erro',      color: 'rose',    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',         icon: <AlertCircle size={12} /> },
    scheduled: { label: 'Agendada',  color: 'violet',  badgeClass: 'text-violet-400 bg-violet-500/10 border-violet-500/20',   icon: <CalendarClock size={12} /> },
};

const STATUS_ORDER: Record<Campaign['status'], number> = { running: 0, scheduled: 1, paused: 2, draft: 3, completed: 4, error: 5 };

export const Dashboard = () => {
    const { contacts } = useContacts();
    const navigate = useNavigate();
    const [messagesCount, setMessagesCount] = useState<number>(0);
    const [aiRepliesCount, setAiRepliesCount] = useState<number>(0);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system', 'sync_status'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setMessagesCount(data.messagesCount || 0);
                setAiRepliesCount(data.aiRepliesCount || 0);
            }
        }, (err) => {
            console.error('Error loading sync_status:', err);
            try { handleFirestoreError(err, OperationType.GET, 'system/sync_status'); } catch (_) {}
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'), limit(10));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign));
            list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
            setCampaigns(list.slice(0, 3));
        }, (err) => {
            console.error('Error loading campaigns:', err);
            try { handleFirestoreError(err, OperationType.GET, 'campaigns'); } catch (_) {}
        });
        return () => unsub();
    }, []);

    // Real metrics derived from contacts
    const hotLeadsCount = contacts.filter(c => (c.leadScore || 0) >= 60).length;
    const needHumanCount = contacts.filter(c => c.sdrStatus === 'human_required' || c.needsReview).length;
    const aiAutoCount = contacts.filter(c => c.sdrStatus !== 'human_required' && c.sdrStatus !== 'sdr_disabled' && !!c.sdrStatus).length;
    const totalEngaged = aiAutoCount + needHumanCount;
    const autonomousRate = totalEngaged > 0 ? Math.round((aiAutoCount / totalEngaged) * 100) : null;
    const estimatedHrSaved = Math.round(aiRepliesCount * 3 / 60);
    const clientCount = contacts.filter(c => c.stage === 'Cliente').length;
    const conversionRate = contacts.length > 0 ? ((clientCount / contacts.length) * 100).toFixed(1) : null;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            <div className="fixed top-0 left-[20%] w-[600px] h-[400px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
            <div className="fixed top-40 right-[10%] w-[400px] h-[300px] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />

            <div>
                <h2 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
                    Visão Geral <Sparkles className="text-indigo-400 animate-pulse" size={24} />
                </h2>
                <p className="text-zinc-400 text-sm font-medium">Métricas de CRM turbinadas com Inteligência Artificial e WhatsApp Engine.</p>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard
                    hoverBorder="hover:border-indigo-500/30" iconText="text-indigo-400"
                    iconBg="bg-indigo-500/10" iconBorder="border-indigo-500/20"
                    barGradient="bg-gradient-to-r from-indigo-500/0 via-indigo-500 to-indigo-500/0"
                    icon={<Users size={18} />} bgIcon={<Users size={64} />}
                    label="Total Base" value={contacts.length.toString()}
                />
                <StatCard
                    hoverBorder="hover:border-teal-500/30" iconText="text-teal-400"
                    iconBg="bg-teal-500/10" iconBorder="border-teal-500/20"
                    barGradient="bg-gradient-to-r from-teal-500/0 via-teal-500 to-teal-500/0"
                    icon={<MessageSquare size={18} />} bgIcon={<MessageSquare size={64} />}
                    label="Mensagens" value={formatCount(messagesCount)}
                />
                <StatCard
                    hoverBorder="hover:border-amber-500/30" iconText="text-amber-400"
                    iconBg="bg-amber-500/10" iconBorder="border-amber-500/20"
                    barGradient="bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0"
                    icon={<Activity size={18} />} bgIcon={<Activity size={64} />}
                    label="Leads Quentes (IA)" value={hotLeadsCount.toString()} valueClass="text-amber-100"
                />
                <StatCard
                    hoverBorder="hover:border-sky-500/30" iconText="text-sky-400"
                    iconBg="bg-sky-500/10" iconBorder="border-sky-500/20"
                    barGradient="bg-gradient-to-r from-sky-500/0 via-sky-500 to-sky-500/0"
                    icon={<Brain size={18} />} bgIcon={<Brain size={64} />}
                    label="Ações da IA" value={aiRepliesCount.toString()}
                />
            </div>

            {/* AI Performance + Campaigns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-8">
                {/* AI Performance */}
                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-6 lg:p-8 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/15 blur-[50px] rounded-full pointer-events-none" />
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            Desempenho da Inteligência <Cpu size={20} className="text-indigo-400" />
                        </h3>
                        <p className="text-sm text-zinc-400 font-medium max-w-sm mb-6">Métricas de precisão, economia de tempo e eficiência nos atendimentos autônomos.</p>

                        <div className="space-y-4">
                            <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 hover:bg-zinc-900 transition-colors">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Resolução Autônoma</span>
                                    {autonomousRate !== null && (
                                        <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                            <TrendingUp size={12} /> {aiAutoCount} contatos
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-end gap-2">
                                    {autonomousRate !== null ? (
                                        <>
                                            <span className="text-3xl font-black text-white tracking-tighter">{autonomousRate}%</span>
                                            <span className="text-zinc-500 text-sm mb-1 font-medium">dos atendimentos</span>
                                        </>
                                    ) : (
                                        <span className="text-zinc-500 text-sm font-medium">Sem dados suficientes</span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 hover:bg-zinc-900 transition-colors">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Tempo Economizado</span>
                                    <span className="text-xl font-black text-white block">
                                        {estimatedHrSaved > 0 ? `~${estimatedHrSaved} hr` : '—'}
                                    </span>
                                </div>
                                <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 hover:bg-zinc-900 transition-colors">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Taxa de Conversão</span>
                                    <span className="text-xl font-black text-indigo-400 block">
                                        {conversionRate !== null ? `${conversionRate}%` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Campaigns */}
                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-6 lg:p-8">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-white">Campanhas Ativas</h3>
                        <button
                            onClick={() => navigate('/campaigns')}
                            className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Ver todas
                        </button>
                    </div>

                    {campaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
                            <PlayCircle size={28} className="mb-2 opacity-40" />
                            <p className="text-sm font-medium">Nenhuma campanha encontrada</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {campaigns.map(campaign => {
                                const cfg = CAMPAIGN_STATUS_CONFIG[campaign.status] ?? CAMPAIGN_STATUS_CONFIG.draft;
                                const Icon = campaign.status === 'running' ? PlayCircle : campaign.status === 'paused' ? PauseCircle : Clock;
                                const iconColor = campaign.status === 'running' ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                                    : campaign.status === 'paused' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                    : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
                                const totalSent = campaign.stats?.enviados ?? 0;
                                return (
                                    <div key={campaign.id} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-500/30 transition-all hover:bg-zinc-900 group">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center group-hover:scale-105 transition-transform ${iconColor}`}>
                                                <Icon size={24} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white text-[15px]">{campaign.nome}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <p className="text-xs text-zinc-500 font-medium">{totalSent > 0 ? `${formatCount(totalSent)} leads` : 'Sem envios'}</p>
                                                    {campaign.stats?.respondidos > 0 && (
                                                        <>
                                                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                                            <p className="text-xs text-emerald-500 font-medium">{campaign.stats.respondidos} respostas</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg border shadow-sm flex items-center gap-1.5 ${cfg.badgeClass}`}>
                                            {cfg.icon}
                                            {cfg.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface StatCardProps {
    hoverBorder: string;
    iconText: string;
    iconBg: string;
    iconBorder: string;
    barGradient: string;
    icon: React.ReactNode;
    bgIcon: React.ReactNode;
    label: string;
    value: string;
    valueClass?: string;
}

const StatCard = ({ hoverBorder, iconText, iconBg, iconBorder, barGradient, icon, bgIcon, label, value, valueClass }: StatCardProps) => (
    <div className={`bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 relative overflow-hidden group ${hoverBorder} transition-all shadow-[0_0_20px_rgba(0,0,0,0.3)]`}>
        <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ${iconText}`}>
            {bgIcon}
        </div>
        <div className={`absolute inset-x-0 bottom-0 h-1 ${barGradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
                <div className={`w-9 h-9 rounded-xl ${iconBg} border ${iconBorder} flex items-center justify-center shadow-inner ${iconText}`}>
                    {icon}
                </div>
                <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">{label}</h3>
            </div>
            <p className={`text-4xl font-black tracking-tighter drop-shadow-sm ${valueClass ?? 'text-white'}`}>{value}</p>
        </div>
    </div>
);
