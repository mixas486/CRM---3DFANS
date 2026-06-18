import React, { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Cell,
} from 'recharts';
import {
  Send, MessageSquare, Users, Target, CheckCircle2,
  TrendingUp, TrendingDown, Bot, Shield, Clock, Trophy,
  ArrowUpRight, Sparkles, BarChart3, MessageCircle, RefreshCw,
  Zap, CalendarClock, Brain, Activity, Star, DollarSign,
} from 'lucide-react';
import { useContacts } from '../hooks/useContacts';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { Campaign, ContactStage } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : n.toString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtCurrency = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function genSpark(base: number, len = 7): number[] {
  return Array.from({ length: len }, (_, i) => Math.max(0, Math.round(base * (0.6 + Math.random() * 0.8) + i * base * 0.04)));
}

function genDailyData(base: number, days = 30) {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (days - 1 - i));
    const sent = Math.round(base * (0.5 + Math.random()));
    const replied = Math.round(sent * (0.12 + Math.random() * 0.18));
    const converted = Math.round(replied * (0.25 + Math.random() * 0.3));
    return { day: i < days - 7 ? MONTHS[d.getMonth()] : DAYS[d.getDay()], sent, replied, converted };
  });
}

function genHourlyData() {
  return Array.from({ length: 24 }, (_, h) => {
    const peak = h >= 8 && h <= 20;
    const rate = peak ? 0.35 + Math.random() * 0.5 : Math.random() * 0.2;
    return { hour: `${h}h`, rate: parseFloat((rate * 100).toFixed(1)), volume: Math.round(rate * 200) };
  });
}

function genRevenueData(months = 6) {
  const now = new Date();
  let acc = 8000;
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now); d.setMonth(d.getMonth() - (months - 1 - i));
    acc = acc * (1.05 + Math.random() * 0.15);
    return { month: MONTHS[d.getMonth()], revenue: Math.round(acc), deals: Math.round(acc / 350) };
  });
}

const STAGE_COLORS: Record<ContactStage, string> = {
  'Novo Lead': '#6366f1',
  'Interessado': '#0ea5e9',
  'Orçamento Enviado': '#f59e0b',
  'Negociação': '#8b5cf6',
  'Cliente': '#10b981',
  'Pós-venda': '#ec4899',
};

// ─── micro-components ────────────────────────────────────────────────────────

const MiniSparkline = ({ data, color }: { data: number[]; color: string }) => (
  <ResponsiveContainer width="100%" height={36}>
    <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
        fill={`url(#sg-${color.replace('#', '')})`} dot={false} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer>
);

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  spark?: number[];
  sparkColor?: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}

const KPICard = ({ icon, label, value, sub, delta, spark, sparkColor = '#6366f1', accent, accentBg, accentBorder }: KPICardProps) => (
  <div className={`relative overflow-hidden rounded-2xl border bg-[rgba(255,255,255,0.03)] backdrop-blur-xl p-5 flex flex-col gap-3 group hover:border-opacity-50 transition-all duration-300 ${accentBorder}`}
    style={{ borderColor: undefined }}>
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      style={{ background: `radial-gradient(ellipse at 80% 20%, ${sparkColor}18 0%, transparent 60%)` }} />
    <div className="flex items-start justify-between relative z-10">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${accentBg} ${accentBorder} ${accent}`}>
        {icon}
      </div>
      {delta !== undefined && (
        <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-lg border ${delta >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'}`}>
          {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(delta)}%
        </span>
      )}
    </div>
    <div className="relative z-10">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className="text-3xl font-black tracking-tighter text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-zinc-500 font-medium mt-1">{sub}</p>}
    </div>
    {spark && (
      <div className="relative z-10 -mb-1">
        <MiniSparkline data={spark} color={sparkColor} />
      </div>
    )}
  </div>
);

const SectionTitle = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
      {icon}
    </div>
    <div>
      <h2 className="text-lg font-bold text-white leading-none">{title}</h2>
      {subtitle && <p className="text-xs text-zinc-500 font-medium mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0f1e] border border-white/10 rounded-xl p-3 shadow-2xl text-xs">
      {label && <p className="text-zinc-400 font-bold mb-2">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-bold" style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.value > 1000 ? fmtCurrency(p.value) : p.value}</p>
      ))}
    </div>
  );
};

const PeriodTabs = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/5 text-xs font-bold">
    {['7d', '30d', '90d'].map(p => (
      <button key={p} onClick={() => onChange(p)}
        className={`px-3 py-1.5 rounded-lg transition-all ${value === p ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}>
        {p}
      </button>
    ))}
  </div>
);

const HealthGauge = ({ value, max = 100, label, color }: { value: number; max?: number; label: string; color: string }) => {
  const pct = Math.min(100, (value / max) * 100);
  const r = 40; const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ * 0.75;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="80" viewBox="0 0 100 80">
        <circle cx="50" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"
          strokeDasharray={`${circ * 0.75} ${circ}`} strokeDashoffset={circ * 0.125} strokeLinecap="round" />
        <circle cx="50" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.125} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.8s ease' }} />
        <text x="50" y="58" textAnchor="middle" fill="white" fontSize="16" fontWeight="900" fontFamily="monospace">
          {Math.round(pct)}%
        </text>
      </svg>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
    </div>
  );
};

// ─── main component ──────────────────────────────────────────────────────────

export const Analytics = () => {
  const { contacts } = useContacts();
  const [period, setPeriod] = useState('30d');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [messagesCount, setMessagesCount] = useState(0);
  const [aiRepliesCount, setAiRepliesCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Static generated data (stable per session)
  const dailyDataRef = useRef(genDailyData(80, 30));
  const hourlyDataRef = useRef(genHourlyData());
  const revenueDataRef = useRef(genRevenueData(6));

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system', 'sync_status'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setMessagesCount(d.messagesCount || 0);
        setAiRepliesCount(d.aiRepliesCount || 0);
        setLastUpdated(new Date());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, snap => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign)));
    });
    return () => unsub();
  }, []);

  // ── derived metrics ──────────────────────────────────────────────────────
  const totalContacts = contacts.length;
  const hotLeads = contacts.filter(c => (c.leadScore || 0) >= 60).length;
  const clients = contacts.filter(c => c.stage === 'Cliente').length;
  const convRate = totalContacts > 0 ? (clients / totalContacts) * 100 : 0;
  const aiAutoCount = contacts.filter(c => c.sdrStatus && c.sdrStatus !== 'human_required' && c.sdrStatus !== 'sdr_disabled').length;
  const needHuman = contacts.filter(c => c.sdrStatus === 'human_required' || c.needsReview).length;
  const totalEngaged = aiAutoCount + needHuman;
  const autonomousRate = totalEngaged > 0 ? (aiAutoCount / totalEngaged) * 100 : 0;
  const estimatedHrSaved = Math.round(aiRepliesCount * 3 / 60);

  const totalCampaignSent = campaigns.reduce((s, c) => s + (c.stats?.enviados || 0), 0);
  const totalReplied = campaigns.reduce((s, c) => s + (c.stats?.respondidos || 0), 0);
  const campaignReplyRate = totalCampaignSent > 0 ? (totalReplied / totalCampaignSent) * 100 : 0;
  const runningCampaigns = campaigns.filter(c => c.status === 'running').length;

  const stageCounts: Record<ContactStage, number> = {
    'Novo Lead': 0, 'Interessado': 0, 'Orçamento Enviado': 0,
    'Negociação': 0, 'Cliente': 0, 'Pós-venda': 0,
  };
  contacts.forEach(c => { if (c.stage in stageCounts) stageCounts[c.stage]++; });

  const stageData = (Object.entries(stageCounts) as [ContactStage, number][]).map(([stage, count]) => ({
    stage, count, color: STAGE_COLORS[stage],
    pct: totalContacts > 0 ? ((count / totalContacts) * 100).toFixed(1) : '0',
  }));

  const topCampaigns = [...campaigns]
    .filter(c => c.stats?.enviados > 0)
    .sort((a, b) => (b.stats?.respondidos || 0) - (a.stats?.respondidos || 0))
    .slice(0, 5);

  const totalDelivered = campaigns.reduce((s, c) => s + (c.stats?.entregues || 0), 0);
  const deliveryRate = totalCampaignSent > 0 ? (totalDelivered / totalCampaignSent) * 100 : 0;
  const readRate = totalDelivered > 0 ? Math.min(100, (totalReplied / totalDelivered) * 100 * 3) : 0;

  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const dailySlice = dailyDataRef.current.slice(-Math.min(periodDays, 30));

  // Estado geo (top cities from contacts)
  const cityMap: Record<string, number> = {};
  contacts.forEach(c => { if (c.cidade) cityMap[c.cidade] = (cityMap[c.cidade] || 0) + 1; });
  const topCities = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const revenueTotal = revenueDataRef.current.reduce((s, r) => s + r.revenue, 0);
  const revenueLast = revenueDataRef.current[revenueDataRef.current.length - 1]?.revenue || 0;
  const revenuePrev = revenueDataRef.current[revenueDataRef.current.length - 2]?.revenue || 0;
  const revenueGrowth = revenuePrev > 0 ? ((revenueLast - revenuePrev) / revenuePrev) * 100 : 0;

  const bestHour = hourlyDataRef.current.reduce((best, h) => h.rate > best.rate ? h : best, hourlyDataRef.current[0]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Ambient glows */}
      <div className="fixed top-0 left-[15%] w-[700px] h-[500px] bg-indigo-500/8 blur-[140px] rounded-full pointer-events-none -z-10" />
      <div className="fixed top-60 right-[5%] w-[500px] h-[400px] bg-sky-500/8 blur-[140px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-[40%] w-[400px] h-[300px] bg-violet-500/8 blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <BarChart3 size={16} className="text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Analytics</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-none">
            Analytics & Performance Center
          </h1>
          <p className="text-zinc-500 text-sm font-medium mt-2">
            Monitor campaigns, SDR performance, WhatsApp engagement, conversions and revenue in real time.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <PeriodTabs value={period} onChange={setPeriod} />
          <button onClick={() => setLastUpdated(new Date())}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
            <RefreshCw size={14} />
          </button>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ── 1. KPI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Users size={16} />} label="Total de Contatos" value={fmt(totalContacts)}
          sub={`${hotLeads} leads quentes`} delta={12} spark={genSpark(totalContacts, 7)}
          sparkColor="#6366f1" accent="text-indigo-400" accentBg="bg-indigo-500/10" accentBorder="border-indigo-500/20" />
        <KPICard icon={<Send size={16} />} label="Mensagens Enviadas" value={fmt(messagesCount)}
          sub="via WhatsApp" delta={8} spark={genSpark(messagesCount, 7)}
          sparkColor="#0ea5e9" accent="text-sky-400" accentBg="bg-sky-500/10" accentBorder="border-sky-500/20" />
        <KPICard icon={<MessageCircle size={16} />} label="Taxa de Resposta" value={fmtPct(campaignReplyRate)}
          sub={`${totalReplied} respostas`} delta={-3} spark={genSpark(totalReplied, 7)}
          sparkColor="#f59e0b" accent="text-amber-400" accentBg="bg-amber-500/10" accentBorder="border-amber-500/20" />
        <KPICard icon={<Target size={16} />} label="Taxa de Conversão" value={fmtPct(convRate)}
          sub={`${clients} clientes`} delta={5} spark={genSpark(clients, 7)}
          sparkColor="#10b981" accent="text-emerald-400" accentBg="bg-emerald-500/10" accentBorder="border-emerald-500/20" />
        <KPICard icon={<Bot size={16} />} label="Autonomia IA" value={fmtPct(autonomousRate)}
          sub={`${aiAutoCount} auto-atendidos`} delta={2} spark={genSpark(aiAutoCount, 7)}
          sparkColor="#8b5cf6" accent="text-violet-400" accentBg="bg-violet-500/10" accentBorder="border-violet-500/20" />
        <KPICard icon={<Clock size={16} />} label="Horas Economizadas" value={`~${estimatedHrSaved}h`}
          sub={`${aiRepliesCount} ações IA`} spark={genSpark(estimatedHrSaved, 7)}
          sparkColor="#ec4899" accent="text-pink-400" accentBg="bg-pink-500/10" accentBorder="border-pink-500/20" />
        <KPICard icon={<Activity size={16} />} label="Campanhas Ativas" value={runningCampaigns.toString()}
          sub={`${campaigns.length} total`} spark={genSpark(runningCampaigns, 7)}
          sparkColor="#f97316" accent="text-orange-400" accentBg="bg-orange-500/10" accentBorder="border-orange-500/20" />
        <KPICard icon={<DollarSign size={16} />} label="Receita Estimada" value={fmtCurrency(revenueLast)}
          sub="último mês" delta={Math.round(revenueGrowth)} spark={revenueDataRef.current.map(r => r.revenue)}
          sparkColor="#10b981" accent="text-emerald-400" accentBg="bg-emerald-500/10" accentBorder="border-emerald-500/20" />
      </div>

      {/* ── 2. CONVERSION FUNNEL + MESSAGES PERFORMANCE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <SectionTitle icon={<Target size={16} />} title="Funil de Conversão" subtitle="Distribuição de leads por estágio" />
          <div className="space-y-3">
            {stageData.map(({ stage, count, color, pct }) => (
              <div key={stage}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-zinc-300">{stage}</span>
                  <span className="text-xs font-black" style={{ color }}>{count} <span className="text-zinc-600 font-medium">({pct}%)</span></span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}60` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Leads', value: fmt(totalContacts), color: '#6366f1' },
              { label: 'Interessados', value: fmt(stageCounts['Interessado'] + stageCounts['Negociação']), color: '#0ea5e9' },
              { label: 'Clientes', value: fmt(clients), color: '#10b981' },
            ].map(item => (
              <div key={item.label} className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
                <p className="text-lg font-black" style={{ color: item.color }}>{item.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Messages performance */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <SectionTitle icon={<MessageSquare size={16} />} title="Performance de Mensagens" subtitle="Enviados · Respondidos · Convertidos" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={dailySlice} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradReplied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: '#52525b', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="sent" name="Enviados" stroke="#6366f1" strokeWidth={2} fill="url(#gradSent)" dot={false} />
              <Area type="monotone" dataKey="replied" name="Respondidos" stroke="#0ea5e9" strokeWidth={2} fill="url(#gradReplied)" dot={false} />
              <Bar dataKey="converted" name="Convertidos" fill="#10b981" opacity={0.7} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 3. SDR AI + WHATSAPP HEALTH ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SDR AI */}
        <div className="lg:col-span-2 bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <SectionTitle icon={<Brain size={16} />} title="SDR AI Performance" subtitle="Atendimentos autônomos vs. humanos" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Auto-atendidos', value: aiAutoCount, color: '#6366f1', icon: <Bot size={14} /> },
              { label: 'Para Humano', value: needHuman, color: '#f59e0b', icon: <Users size={14} /> },
              { label: 'Ações IA', value: aiRepliesCount, color: '#0ea5e9', icon: <Zap size={14} /> },
              { label: 'Autonomia', value: `${Math.round(autonomousRate)}%`, color: '#10b981', icon: <TrendingUp size={14} /> },
            ].map(item => (
              <div key={item.label} className="bg-white/5 border border-white/5 rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2" style={{ color: item.color }}>{item.icon}</div>
                <p className="text-xl font-black text-white">{typeof item.value === 'number' ? fmt(item.value) : item.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1.5">
                <span>Resolução Autônoma</span>
                <span className="text-indigo-400">{Math.round(autonomousRate)}%</span>
              </div>
              <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${autonomousRate}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', boxShadow: '0 0 10px #6366f160' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1.5">
                <span>Leads com Score Alto (≥60)</span>
                <span className="text-amber-400">{totalContacts > 0 ? fmtPct((hotLeads / totalContacts) * 100) : '0%'}</span>
              </div>
              <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: totalContacts > 0 ? `${(hotLeads / totalContacts) * 100}%` : '0%', background: 'linear-gradient(90deg, #f59e0b, #f97316)', boxShadow: '0 0 10px #f59e0b60' }} />
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Health */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <SectionTitle icon={<Shield size={16} />} title="WhatsApp Health" subtitle="Status da instância" />
          <div className="flex flex-col items-center gap-4">
            <HealthGauge value={deliveryRate} label="Entrega" color="#10b981" />
            <HealthGauge value={readRate} label="Leitura Est." color="#0ea5e9" />
            <HealthGauge value={Math.max(0, 100 - (campaigns.filter(c => c.status === 'error').length * 20))} label="Saúde Geral" color="#6366f1" />
          </div>
        </div>
      </div>

      {/* ── 4. CAMPAIGN RANKING + REVENUE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign ranking */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <SectionTitle icon={<Trophy size={16} />} title="Ranking de Campanhas" subtitle="Por número de respostas" />
          {topCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
              <Trophy size={28} className="mb-2 opacity-30" />
              <p className="text-sm font-medium">Sem dados ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topCampaigns.map((c, i) => {
                const rate = c.stats.enviados > 0 ? ((c.stats.respondidos || 0) / c.stats.enviados * 100).toFixed(1) : '0';
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={c.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-indigo-500/20 transition-all">
                    <span className="text-lg w-6 text-center">{medals[i] || `${i + 1}.`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{c.nome}</p>
                      <p className="text-xs text-zinc-500 font-medium">{fmt(c.stats.enviados)} enviados · {c.stats.respondidos || 0} respostas</p>
                    </div>
                    <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg flex-shrink-0">
                      {rate}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Revenue */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-6">
            <SectionTitle icon={<DollarSign size={16} />} title="Revenue Analytics" subtitle="Estimativa de receita mensal" />
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-zinc-500 font-medium">Total 6m</p>
              <p className="text-lg font-black text-emerald-400">{fmtCurrency(revenueTotal)}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={revenueDataRef.current} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: '#52525b', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Receita" stroke="#10b981" strokeWidth={2} fill="url(#gradRev)" dot={false} />
              <Bar dataKey="deals" name="Negócios" fill="#6366f1" opacity={0.6} radius={[2, 2, 0, 0]} yAxisId={undefined} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 5. GEOGRAPHIC + HOURLY RESPONSE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Geographic */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <SectionTitle icon={<Star size={16} />} title="Concentração Geográfica" subtitle="Leads por cidade" />
          {topCities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
              <Activity size={28} className="mb-2 opacity-30" />
              <p className="text-sm font-medium">Dados insuficientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topCities.map(([city, count], i) => {
                const maxCount = topCities[0][1];
                const pct = (count / maxCount) * 100;
                const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4'];
                return (
                  <div key={city}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-zinc-500 w-4">{i + 1}.</span>
                        <span className="text-sm font-bold text-zinc-200">{city}</span>
                      </div>
                      <span className="text-xs font-black" style={{ color: colors[i] }}>{count}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: colors[i], boxShadow: `0 0 6px ${colors[i]}50` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hourly response rate */}
        <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-1">
            <SectionTitle icon={<Clock size={16} />} title="Melhores Horários" subtitle="Taxa de resposta estimada por hora" />
            <div className="text-right flex-shrink-0 ml-2">
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Pico</p>
              <p className="text-sm font-black text-amber-400">{bestHour.hour}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyDataRef.current} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="hour" tick={{ fill: '#52525b', fontSize: 8, fontWeight: 700 }} axisLine={false} tickLine={false}
                interval={2} />
              <YAxis tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="rate" name="Taxa %" radius={[2, 2, 0, 0]}>
                {hourlyDataRef.current.map((entry, index) => (
                  <Cell key={index}
                    fill={entry.hour === bestHour.hour ? '#f59e0b' : entry.rate > 40 ? '#6366f1' : entry.rate > 25 ? '#0ea5e9' : '#1e293b'}
                    opacity={entry.rate > 10 ? 1 : 0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 6. AI INSIGHTS PANEL ── */}
      <div className="bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-white/5 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none" />
        <SectionTitle icon={<Sparkles size={16} />} title="AI Insights" subtitle="Análise inteligente dos seus dados em tempo real" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          {[
            {
              icon: <TrendingUp size={16} />,
              color: '#10b981',
              title: 'Crescimento de Base',
              body: totalContacts > 50
                ? `Sua base tem ${fmt(totalContacts)} contatos. Taxa de conversão de ${fmtPct(convRate)} indica ${convRate > 10 ? 'boa performance' : 'oportunidade de melhoria'} no funil.`
                : 'Adicione mais contatos para gerar insights de crescimento mais precisos.',
            },
            {
              icon: <Bot size={16} />,
              color: '#6366f1',
              title: 'Eficiência da IA',
              body: aiRepliesCount > 0
                ? `A IA já realizou ${fmt(aiRepliesCount)} ações, economizando ~${estimatedHrSaved}h de trabalho manual. ${autonomousRate > 70 ? 'Excelente taxa de autonomia!' : 'Considere ativar mais contatos no SDR.'}`
                : 'Ative o SDR AI para começar a automatizar atendimentos.',
            },
            {
              icon: <CalendarClock size={16} />,
              color: '#f59e0b',
              title: 'Melhor Janela de Envio',
              body: `Pico de resposta detectado às ${bestHour.hour} com estimativa de ${bestHour.rate.toFixed(1)}% de taxa. ${runningCampaigns > 0 ? `${runningCampaigns} campanha(s) ativa(s) agora.` : 'Nenhuma campanha rodando no momento.'}`,
            },
            {
              icon: <Target size={16} />,
              color: '#0ea5e9',
              title: 'Qualidade do Pipeline',
              body: `${hotLeads} leads com score ≥60. ${needHuman > 0 ? `${needHuman} contatos aguardam atenção humana.` : 'Todos os contatos estão bem gerenciados.'} Taxa de resposta em campanhas: ${fmtPct(campaignReplyRate)}.`,
            },
            {
              icon: <DollarSign size={16} />,
              color: '#ec4899',
              title: 'Revenue Momentum',
              body: `Estimativa mensal de ${fmtCurrency(revenueLast)}. ${revenueGrowth >= 0 ? `Crescimento de ${fmtPct(revenueGrowth)} vs. mês anterior.` : `Queda de ${fmtPct(Math.abs(revenueGrowth))} — revise sua estratégia.`}`,
            },
            {
              icon: <ArrowUpRight size={16} />,
              color: '#8b5cf6',
              title: 'Próxima Ação Recomendada',
              body: needHuman > 5
                ? `${needHuman} contatos precisam de atenção humana. Priorize-os no Inbox para não perder conversões.`
                : hotLeads > 10
                ? `${hotLeads} leads quentes identificados. Lance uma campanha segmentada para maximizar conversões.`
                : 'Expanda sua base de contatos e ative campanhas para acelerar o crescimento.',
            },
          ].map(insight => (
            <div key={insight.title}
              className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-opacity-30 transition-all group"
              style={{ borderColor: `${insight.color}20` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ color: insight.color, backgroundColor: `${insight.color}15` }}>
                  {insight.icon}
                </div>
                <p className="text-xs font-black text-white">{insight.title}</p>
              </div>
              <p className="text-xs text-zinc-400 font-medium leading-relaxed">{insight.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
