import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, Zap, DollarSign, Activity, Calendar } from 'lucide-react';

const USD_TO_BRL = 5.70;

type PeriodPreset = 'today' | 'yesterday' | '7days' | '30days' | 'currentMonth' | 'custom';

interface DailyDoc {
  date: string;
  gemini_requests?: number;
  gemini_inputTokens?: number;
  gemini_outputTokens?: number;
  gemini_costUSD?: number;
  gemini_images?: number;
  openai_requests?: number;
  openai_inputTokens?: number;
  openai_outputTokens?: number;
  openai_costUSD?: number;
  dalle_images?: number;
  dalle_costUSD?: number;
  tts_requests?: number;
  tts_chars?: number;
  tts_costUSD?: number;
  elevenlabs_requests?: number;
  elevenlabs_chars?: number;
  elevenlabs_costUSD?: number;
  whisper_requests?: number;
  whisper_durationSeconds?: number;
  whisper_costUSD?: number;
  totalCostUSD?: number;
  totalCostBRL?: number;
}

function utcToday(): string {
  return new Date().toISOString().split('T')[0];
}

function utcYesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

function getDateRange(period: PeriodPreset, customFrom: string, customTo: string): { start: string; end: string } {
  const today = utcToday();
  switch (period) {
    case 'today':        return { start: today, end: today };
    case 'yesterday':    return { start: utcYesterday(), end: utcYesterday() };
    case '7days':        { const d = new Date(); d.setUTCDate(d.getUTCDate() - 6); return { start: d.toISOString().split('T')[0], end: today }; }
    case '30days':       { const d = new Date(); d.setUTCDate(d.getUTCDate() - 29); return { start: d.toISOString().split('T')[0], end: today }; }
    case 'currentMonth': { const d = new Date(); d.setUTCDate(1); return { start: d.toISOString().split('T')[0], end: today }; }
    case 'custom':       return { start: customFrom || today, end: customTo || today };
  }
}

function generateDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startStr + 'T00:00:00Z');
  const end   = new Date(endStr   + 'T00:00:00Z');
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatUSD(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function periodLabel(period: PeriodPreset, start: string, end: string): string {
  if (period === 'today')        return 'Hoje';
  if (period === 'yesterday')    return 'Ontem';
  if (period === '7days')        return 'Últimos 7 dias';
  if (period === '30days')       return 'Últimos 30 dias';
  if (period === 'currentMonth') return 'Mês atual';
  return `${shortDate(start)} → ${shortDate(end)}`;
}

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today',        label: 'Hoje' },
  { id: 'yesterday',    label: 'Ontem' },
  { id: '7days',        label: '7 Dias' },
  { id: '30days',       label: '30 Dias' },
  { id: 'currentMonth', label: 'Mês Atual' },
  { id: 'custom',       label: 'Personalizado' },
];

const StatCard: React.FC<{
  label: string; value: string; sub?: string; icon: React.ReactNode; accent: string;
}> = ({ label, value, sub, icon, accent }) => (
  <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
    <div className={`absolute inset-0 opacity-5 ${accent}`} />
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-white">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
      <div className={`rounded-xl p-2.5 ${accent} bg-opacity-20`}>{icon}</div>
    </div>
  </div>
);

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-zinc-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>◆ {p.name}: {formatBRL(p.value)}</p>
      ))}
    </div>
  );
};

const BreakdownCard: React.FC<{
  color: string; title: string; costBRL: string; costUSD: string;
  rows: { label: string; value: string }[];
  textColor: string;
}> = ({ color, title, costBRL, costUSD, rows, textColor }) => (
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
    <div className="mb-3 flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <h3 className="text-sm font-semibold text-white">{title}</h3>
    </div>
    <p className={`text-lg font-bold ${textColor}`}>{costBRL}</p>
    <p className="mt-0.5 text-xs text-zinc-500">{costUSD}</p>
    <div className="mt-3 space-y-1 text-xs text-zinc-400">
      {rows.map(r => (
        <div key={r.label} className="flex justify-between">
          <span>{r.label}</span>
          <span className="font-medium text-zinc-200">{r.value}</span>
        </div>
      ))}
    </div>
  </div>
);

export default function AIUsage() {
  const [docs, setDocs]           = useState<DailyDoc[]>([]);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState<PeriodPreset>('currentMonth');
  const [customFrom, setCustomFrom] = useState(utcToday());
  const [customTo,   setCustomTo]   = useState(utcToday());

  const { start, end } = getDateRange(period, customFrom, customTo);

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    const q = query(
      collection(db, 'ai_usage_daily'),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setDocs(snap.docs.map(d => d.data() as DailyDoc));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [period, start, end]);

  const totals = docs.reduce(
    (acc, d) => ({
      requests:            acc.requests            + (d.gemini_requests || 0) + (d.openai_requests || 0),
      inputTokens:         acc.inputTokens         + (d.gemini_inputTokens || 0) + (d.openai_inputTokens || 0),
      outputTokens:        acc.outputTokens        + (d.gemini_outputTokens || 0) + (d.openai_outputTokens || 0),
      geminiCostUSD:       acc.geminiCostUSD       + (d.gemini_costUSD || 0),
      openaiCostUSD:       acc.openaiCostUSD       + (d.openai_costUSD || 0),
      geminiReqs:          acc.geminiReqs          + (d.gemini_requests || 0),
      openaiReqs:          acc.openaiReqs          + (d.openai_requests || 0),
      geminiImages:        acc.geminiImages        + (d.gemini_images || 0),
      ttsRequests:         acc.ttsRequests         + (d.tts_requests || 0),
      ttsChars:            acc.ttsChars            + (d.tts_chars || 0),
      ttsCostUSD:          acc.ttsCostUSD          + (d.tts_costUSD || 0),
      elevenLabsRequests:  acc.elevenLabsRequests  + (d.elevenlabs_requests || 0),
      elevenLabsChars:     acc.elevenLabsChars     + (d.elevenlabs_chars || 0),
      elevenLabsCostUSD:   acc.elevenLabsCostUSD   + (d.elevenlabs_costUSD || 0),
      whisperRequests:     acc.whisperRequests     + (d.whisper_requests || 0),
      whisperDurationSecs: acc.whisperDurationSecs + (d.whisper_durationSeconds || 0),
      whisperCostUSD:      acc.whisperCostUSD      + (d.whisper_costUSD || 0),
    }),
    {
      requests: 0, inputTokens: 0, outputTokens: 0,
      geminiCostUSD: 0, openaiCostUSD: 0, geminiReqs: 0, openaiReqs: 0, geminiImages: 0,
      ttsRequests: 0, ttsChars: 0, ttsCostUSD: 0,
      elevenLabsRequests: 0, elevenLabsChars: 0, elevenLabsCostUSD: 0,
      whisperRequests: 0, whisperDurationSecs: 0, whisperCostUSD: 0,
    }
  );

  // Compute total directly from individual providers (avoids stale Firestore totalCostUSD)
  const totalCostUSD =
    totals.geminiCostUSD + totals.openaiCostUSD +
    totals.ttsCostUSD + totals.elevenLabsCostUSD + totals.whisperCostUSD;
  const totalCostBRL = totalCostUSD * USD_TO_BRL;

  const providerSlices = [
    { label: 'Gemini',      costUSD: totals.geminiCostUSD,      color: 'bg-indigo-500' },
    { label: 'OpenAI',      costUSD: totals.openaiCostUSD,      color: 'bg-emerald-500' },
    { label: 'OpenAI TTS',  costUSD: totals.ttsCostUSD,         color: 'bg-rose-500' },
    { label: 'ElevenLabs',  costUSD: totals.elevenLabsCostUSD,  color: 'bg-amber-400' },
    { label: 'Whisper',     costUSD: totals.whisperCostUSD,     color: 'bg-violet-400' },
  ].filter(s => s.costUSD > 0);

  const dateRange = generateDateRange(start, end);
  const chartData = dateRange.map(dateStr => {
    const d = docs.find(doc => doc.date === dateStr);
    return {
      date:       shortDate(dateStr),
      Gemini:     d ? parseFloat(((d.gemini_costUSD       || 0) * USD_TO_BRL).toFixed(4)) : 0,
      OpenAI:     d ? parseFloat(((d.openai_costUSD       || 0) * USD_TO_BRL).toFixed(4)) : 0,
      TTS:        d ? parseFloat(((d.tts_costUSD          || 0) * USD_TO_BRL).toFixed(4)) : 0,
      ElevenLabs: d ? parseFloat(((d.elevenlabs_costUSD   || 0) * USD_TO_BRL).toFixed(4)) : 0,
      Whisper:    d ? parseFloat(((d.whisper_costUSD      || 0) * USD_TO_BRL).toFixed(4)) : 0,
    };
  });

  const totalTokens = totals.inputTokens + totals.outputTokens;

  return (
    <div className="max-w-6xl space-y-6">

      {/* Header + filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Consumo de IA</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {periodLabel(period, start, end)} · Taxa: 1 USD = R$ {USD_TO_BRL.toFixed(2)}
            </p>
          </div>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {p.id === 'custom' && <Calendar size={11} />}
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range inputs */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <Calendar size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500">De</span>
            <input
              type="date"
              value={customFrom}
              max={customTo || utcToday()}
              onChange={e => setCustomFrom(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
            />
            <span className="text-xs text-zinc-500">até</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={utcToday()}
              onChange={e => setCustomTo(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-zinc-500">Carregando dados...</div>
      ) : docs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Activity size={32} className="opacity-40" />
          <p className="text-sm">Nenhum uso registrado neste período.</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Custo Total"
              value={formatBRL(totalCostBRL)}
              sub={formatUSD(totalCostUSD)}
              icon={<DollarSign size={18} className="text-emerald-400" />}
              accent="bg-emerald-500"
            />
            <StatCard
              label="Tokens Totais"
              value={formatTokens(totalTokens)}
              sub={`${formatTokens(totals.inputTokens)} in · ${formatTokens(totals.outputTokens)} out`}
              icon={<Zap size={18} className="text-indigo-400" />}
              accent="bg-indigo-500"
            />
            <StatCard
              label="Requisições"
              value={totals.requests.toLocaleString('pt-BR')}
              sub={`${totals.geminiReqs} Gemini · ${totals.openaiReqs} OpenAI`}
              icon={<Activity size={18} className="text-violet-400" />}
              accent="bg-violet-500"
            />
            <StatCard
              label="TTS (Áudios)"
              value={String(totals.ttsRequests + totals.elevenLabsRequests)}
              sub={`${formatBRL((totals.ttsCostUSD + totals.elevenLabsCostUSD) * USD_TO_BRL)} · ${((totals.ttsChars + totals.elevenLabsChars) / 1000).toFixed(1)}K chars`}
              icon={<TrendingUp size={18} className="text-rose-400" />}
              accent="bg-rose-500"
            />
          </div>

          {/* Daily chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-4 text-sm font-semibold text-zinc-300">Custo por Dia (R$)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  {[
                    { id: 'gemini',     color: '#6366f1' },
                    { id: 'openai',     color: '#10b981' },
                    { id: 'tts',        color: '#f43f5e' },
                    { id: 'elevenlabs', color: '#f59e0b' },
                    { id: 'whisper',    color: '#a78bfa' },
                  ].map(g => (
                    <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={g.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={g.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '' : `R$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa', paddingTop: 8 }} />
                <Area type="monotone" dataKey="Gemini"     stroke="#6366f1" strokeWidth={2} fill="url(#gemini)"     dot={false} />
                <Area type="monotone" dataKey="OpenAI"     stroke="#10b981" strokeWidth={2} fill="url(#openai)"     dot={false} />
                <Area type="monotone" dataKey="TTS"        stroke="#f43f5e" strokeWidth={2} fill="url(#tts)"        dot={false} />
                <Area type="monotone" dataKey="ElevenLabs" stroke="#f59e0b" strokeWidth={2} fill="url(#elevenlabs)" dot={false} />
                <Area type="monotone" dataKey="Whisper"    stroke="#a78bfa" strokeWidth={2} fill="url(#whisper)"    dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Provider breakdown */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <BreakdownCard
              color="bg-indigo-500" textColor="text-indigo-400" title="Gemini Texto"
              costBRL={formatBRL(totals.geminiCostUSD * USD_TO_BRL)} costUSD={formatUSD(totals.geminiCostUSD)}
              rows={[
                { label: 'Requisições', value: totals.geminiReqs.toLocaleString('pt-BR') },
                { label: 'Tokens in/out', value: `${formatTokens(totals.inputTokens)} / ${formatTokens(totals.outputTokens)}` },
                { label: 'Preço', value: '$0.075 / $0.30' },
              ]}
            />
            <BreakdownCard
              color="bg-emerald-500" textColor="text-emerald-400" title="GPT-4o-mini"
              costBRL={formatBRL(totals.openaiCostUSD * USD_TO_BRL)} costUSD={formatUSD(totals.openaiCostUSD)}
              rows={[
                { label: 'Requisições', value: totals.openaiReqs.toLocaleString('pt-BR') },
                { label: 'Preço', value: '$0.15 / $0.60' },
              ]}
            />
            <BreakdownCard
              color="bg-rose-500" textColor="text-rose-400" title="OpenAI TTS"
              costBRL={formatBRL(totals.ttsCostUSD * USD_TO_BRL)} costUSD={formatUSD(totals.ttsCostUSD)}
              rows={[
                { label: 'Áudios', value: totals.ttsRequests.toLocaleString('pt-BR') },
                { label: 'Caracteres', value: `${(totals.ttsChars / 1000).toFixed(1)}K` },
                { label: 'Preço', value: '$15/1M chars' },
              ]}
            />
            <BreakdownCard
              color="bg-amber-400" textColor="text-amber-400" title="ElevenLabs TTS"
              costBRL={formatBRL(totals.elevenLabsCostUSD * USD_TO_BRL)} costUSD={formatUSD(totals.elevenLabsCostUSD)}
              rows={[
                { label: 'Áudios', value: totals.elevenLabsRequests.toLocaleString('pt-BR') },
                { label: 'Caracteres', value: `${(totals.elevenLabsChars / 1000).toFixed(1)}K` },
                { label: 'Preço', value: '$300/1M chars' },
              ]}
            />
            <BreakdownCard
              color="bg-violet-400" textColor="text-violet-400" title="Whisper STT"
              costBRL={formatBRL(totals.whisperCostUSD * USD_TO_BRL)} costUSD={formatUSD(totals.whisperCostUSD)}
              rows={[
                { label: 'Transcrições', value: totals.whisperRequests.toLocaleString('pt-BR') },
                { label: 'Duração est.', value: `${Math.round(totals.whisperDurationSecs / 60)}min` },
                { label: 'Preço', value: '$0.006/min' },
              ]}
            />
            <BreakdownCard
              color="bg-amber-400" textColor="text-amber-400" title="Gemini Imagem"
              costBRL="Grátis*" costUSD="Preview gratuito"
              rows={[
                { label: 'Imagens geradas', value: totals.geminiImages.toLocaleString('pt-BR') },
                { label: 'Modelo', value: '2.0 Flash' },
                { label: 'Preço', value: '*Preview grátis' },
              ]}
            />
          </div>
          {/* Grand total banner */}
          <div className="rounded-2xl border border-zinc-700 bg-gradient-to-r from-zinc-900 to-zinc-900/60 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Total Geral — Todas as IAs</p>
                <p className="mt-1 text-3xl font-bold text-white">{formatBRL(totalCostBRL)}</p>
                <p className="mt-0.5 text-sm text-zinc-400">{formatUSD(totalCostUSD)}</p>
              </div>
              <div className="flex flex-col gap-2 min-w-0 sm:min-w-[260px]">
                {/* Stacked bar */}
                {totalCostUSD > 0 && (
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                    {providerSlices.map(s => (
                      <div
                        key={s.label}
                        className={`${s.color} h-full transition-all`}
                        style={{ width: `${(s.costUSD / totalCostUSD) * 100}%` }}
                        title={`${s.label}: ${formatBRL(s.costUSD * USD_TO_BRL)}`}
                      />
                    ))}
                  </div>
                )}
                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {providerSlices.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${s.color}`} />
                      <span className="text-[11px] text-zinc-400">{s.label}</span>
                      <span className="text-[11px] font-semibold text-zinc-200">
                        {((s.costUSD / totalCostUSD) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
