import React, { useState, useEffect } from 'react';
import { Users, MessageSquare, BarChart2, Activity, PlayCircle, Clock, Sparkles, Brain, Cpu, TrendingUp } from 'lucide-react';
import { useContacts } from '../hooks/useContacts';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export const Dashboard = () => {
    const { contacts } = useContacts();
    const [aiRepliesCount, setAiRepliesCount] = useState<number>(0);

    useEffect(() => {
        const docRef = doc(db, 'system', 'sync_status');
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setAiRepliesCount(snap.data().aiRepliesCount || 0);
            }
        }, (err) => {
            console.error('Error loading sync_status:', err);
            try {
                handleFirestoreError(err, OperationType.GET, 'system/sync_status');
            } catch (mappedError) {
                // Ignore or handle
            }
        });
        return () => unsub();
    }, []);

    // Dynamically filter actual hot leads (scored >= 60 points)
    const hotLeadsCount = contacts.filter(c => (c.leadScore || 0) >= 60).length;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            {/* Background ambient light */}
            <div className="fixed top-0 left-[20%] w-[600px] h-[400px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
            <div className="fixed top-40 right-[10%] w-[400px] h-[300px] bg-sky-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />

            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
                  Visão Geral <Sparkles className="text-indigo-400 animate-pulse" size={24} />
              </h2>
              <p className="text-zinc-400 text-sm font-medium">Métricas de CRM turbinadas com Inteligência Artificial e WhatsApp Engine.</p>
            </div>

            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-indigo-500/30 transition-all shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
                        <Users size={64} className="text-indigo-400" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-indigo-500/0 via-indigo-500 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                                <Users className="text-indigo-400" size={18} />
                            </div>
                            <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">Total Base</h3>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tighter drop-shadow-sm">{contacts.length}</p>
                    </div>
                </div>

                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-teal-500/30 transition-all shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
                        <MessageSquare size={64} className="text-teal-400" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-teal-500/0 via-teal-500 to-teal-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shadow-inner">
                                <MessageSquare className="text-teal-400" size={18} />
                            </div>
                            <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">Mensagens</h3>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tighter drop-shadow-sm">24.5k</p>
                    </div>
                </div>

                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-all shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
                        <Activity size={64} className="text-amber-400" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                             <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-inner">
                                <Activity className="text-amber-400" size={18} />
                            </div>
                            <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">Leads Quentes (IA)</h3>
                        </div>
                        <p className="text-4xl font-black text-amber-100 tracking-tighter drop-shadow-sm">{hotLeadsCount}</p>
                    </div>
                </div>

                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-sky-500/30 transition-all shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
                        <Brain size={64} className="text-sky-400" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-sky-500/0 via-sky-500 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                             <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-inner">
                                <Brain className="text-sky-400" size={18} />
                            </div>
                            <h3 className="font-bold text-zinc-400 text-xs uppercase tracking-widest">Ações da IA</h3>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tighter drop-shadow-sm">{aiRepliesCount}</p>
                    </div>
                </div>
            </div>

            {/* Detailed AI Section & Campaigns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-8">
                {/* AI Performance Box */}
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
                                    <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex items-center gap-1"><TrendingUp size={12}/> +14%</span>
                                </div>
                                <div className="flex items-end gap-2">
                                    <span className="text-3xl font-black text-white tracking-tighter">78%</span>
                                    <span className="text-zinc-500 text-sm mb-1 font-medium">dos chamados</span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 hover:bg-zinc-900 transition-colors">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Tempo Economizado</span>
                                    <span className="text-xl font-black text-white block">142 hr</span>
                                </div>
                                <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 hover:bg-zinc-900 transition-colors">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">Precisão Intenção</span>
                                    <span className="text-xl font-black text-indigo-400 block">94.2%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-6 lg:p-8">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            Campanhas Ativas
                        </h3>
                        <button className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">Ver todas</button>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-500/30 transition-all hover:bg-zinc-900 group">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  <PlayCircle className="text-indigo-400" size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white text-[15px]">Recuperação de Carrinho</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-zinc-500 font-medium">2.140 leads</p>
                                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                        <p className="text-xs text-emerald-500 font-medium">Alta Conversão</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 shadow-sm flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                                    Rodando
                                </span>
                            </div>
                        </div>
                        
                        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-amber-500/30 transition-all hover:bg-zinc-900 group">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                                  <Clock className="text-amber-400" size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white text-[15px]">Oferta Base Fria</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-zinc-500 font-medium">14.000 leads</p>
                                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                        <p className="text-xs text-indigo-400 font-medium">Lote 1/4</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20 shadow-sm">
                                    Agendada
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
