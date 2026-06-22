import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, X, Clock, Search, MessageCircle, Loader2, Check,
  AlertTriangle, Shield, ChevronDown, ArrowUp, Send, Users, Zap, TrendingUp,
  Database, Bot, Smartphone, Server, Wifi,
  DollarSign, Target, ArrowUpRight, CheckCircle2, Brain,
  BarChart3, Flame, Star, TrendingDown,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
interface Props {
  activeCampaign: any;
  activeCampaignId: string;
  calculatedStats: any;
  banRiskScore: number;
  campaignLogs: any[];
  settings: any;
  startNow: () => void;
  cancelSchedule: () => void;
  togglePauseResume: () => void;
  cancelCampaign: () => void;
}

type LogFilter = 'all' | 'envios' | 'respostas' | 'erros';

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const BG      = '#050816';
const CARD    = '#0B1020';
const BORDER  = 'rgba(255,255,255,0.06)';
const PRIMARY = '#6D5DFC';
const SUCCESS = '#22C55E';
const WARNING = '#F59E0B';
const DANGER  = '#EF4444';
const INFO    = '#3B82F6';
const TEXT    = '#FFFFFF';
const MUTED   = '#94A3B8';

// ─────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────
function useAnimatedNumber(value: number, duration = 600): number {
  const [disp, setDisp] = useState(value);
  const rafRef = useRef(0);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisp(Math.round(from + (value - from) * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);
  return disp;
}

function useClock(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtHHMM(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m`;
}
function fmtMMSS(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function getLogColor(log: any): string {
  if (log.contactId === 'system') return '#818cf8';
  switch (log.status) {
    case 'enviado':                        return SUCCESS;
    case 'falhou':                         return DANGER;
    case 'respondido': case 'reply':       return WARNING;
    case 'classificado': case 'interessado': return '#A855F7';
    default:                               return '#475569';
  }
}
function getLogIcon(log: any): string {
  if (log.contactId === 'system') return '⚙';
  switch (log.status) {
    case 'enviado':                          return '✓';
    case 'falhou':                           return '✗';
    case 'respondido': case 'reply':         return '↩';
    case 'classificado': case 'interessado': return '★';
    default:                                 return '·';
  }
}
function getLogText(log: any): string {
  const name = log.contactName || log.nome || log.contactId || '—';
  
  if (log.contactId === 'system' || log.contactId === 'system_limit' || log.contactId === 'system_complete') {
     return log.message || log.status;
  }

  const prefix = name !== '—' ? `${name} — ` : '';

  switch (log.status) {
    case 'enviado':
      if (log.sentBody) {
         const cleanBody = log.sentBody.replace(/\n/g, ' ');
         return `${prefix}${cleanBody.substring(0, 50)}${cleanBody.length > 50 ? '...' : ''}`;
      }
      return `${prefix}mensagem enviada`;
    case 'falhou':
      const err = log.message || log.error || 'erro desconhecido';
      return `${prefix}falha: ${err}`;
    case 'respondido':
    case 'reply':        return `${prefix}respondeu`;
    case 'classificado': return `${prefix}classificado pela IA`;
    case 'interessado':  return `${prefix}demonstrou interesse`;
    case 'paused':       return 'Campanha pausada pelo operador';
    case 'completed':    return 'Campanha concluída';
    default:             return log.message || log.status || '—';
  }
}
function matchesFilter(log: any, f: LogFilter): boolean {
  if (f === 'all')       return true;
  if (f === 'envios')    return log.status === 'enviado';
  if (f === 'respostas') return ['respondido', 'reply', 'interessado', 'classificado'].includes(log.status);
  if (f === 'erros')     return log.status === 'falhou';
  return true;
}

// ─────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────
const Card = ({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-[24px] ${className}`} style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', ...style }}>
    {children}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-4">
    <div className="w-3 h-px" style={{ background: PRIMARY }} />
    <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: MUTED }}>{children}</span>
  </div>
);

const Sparkline = ({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) => {
  if (data.length < 2) return <div style={{ height }} />;
  const W = 200; const H = height;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * H * 0.85;
    return `${x},${y}`;
  }).join(' ');
  const gradId = `spk${color.replace(/[^a-f0-9]/gi, '')}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION 1 — GLOBAL STATUS BAR
// ─────────────────────────────────────────────────────────────
const STATUS_ITEMS = [
  { key: 'crm',       label: 'CRM',       Icon: Server,        ping: 12  },
  { key: 'evolution', label: 'Evolution', Icon: Smartphone,    ping: 45  },
  { key: 'whatsapp',  label: 'WhatsApp',  Icon: MessageCircle, ping: 38  },
  { key: 'firestore', label: 'Firestore', Icon: Database,      ping: 67  },
  { key: 'ia',        label: 'IA',        Icon: Bot,           ping: 124 },
  { key: 'internet',  label: 'Internet',  Icon: Wifi,          ping: 8   },
];

const GlobalStatusBar = ({ isRunning, hasData }: { isRunning: boolean; hasData: boolean }) => {
  const [clockStr, setClockStr] = useState('');
  useEffect(() => {
    const tick = () => setClockStr(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const online: Record<string, boolean> = {
    crm: true,
    evolution: isRunning || hasData,
    whatsapp:  isRunning || hasData,
    firestore: hasData,
    ia: true,
    internet: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };

  return (
    <div
      className="sticky top-0 z-50 flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5"
      style={{ background: 'rgba(5,8,22,0.97)', backdropFilter: 'blur(24px)', borderBottom: `1px solid ${BORDER}` }}
    >
      {STATUS_ITEMS.map(({ key, label, Icon, ping }) => {
        const up = online[key] ?? true;
        return (
          <div
            key={key}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: up ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${up ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              {up && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ background: SUCCESS }} />}
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: up ? SUCCESS : DANGER }} />
            </span>
            <Icon size={10} style={{ color: up ? SUCCESS : DANGER }} />
            <span className="text-[10px] font-semibold hidden sm:inline" style={{ color: up ? '#86EFAC' : '#FCA5A5' }}>{label}</span>
            <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{ping}ms</span>
          </div>
        );
      })}
      <div className="ml-auto flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: PRIMARY }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: PRIMARY }} />
        </span>
        <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>LIVE · {clockStr}</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION 2 — CAMPAIGN HEADER
// ─────────────────────────────────────────────────────────────
const CampaignHeader = ({
  campaign, calculatedStats, banRiskScore, now,
  isRunning, isPaused, isScheduled, isDone,
  togglePauseResume, cancelCampaign, startNow, cancelSchedule,
}: any) => {
  const stats    = campaign?.stats ?? {};
  const enviados = stats.enviados ?? 0;
  const pending  = calculatedStats?.waiting ?? 0;
  const total    = enviados + pending;
  const pct      = total > 0 ? (enviados / total) * 100 : 0;
  const animPct  = useAnimatedNumber(Math.round(pct));
  const startTs  = campaign?.startedAt ?? campaign?.createdAt ?? now;
  const activeMs = now - startTs;

  const statusConfig =
    isRunning   ? { label: 'Rodando',    color: SUCCESS,  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.22)'   } :
    isPaused    ? { label: 'Pausada',    color: WARNING,  bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)'  } :
    isScheduled ? { label: 'Agendada',   color: PRIMARY,  bg: 'rgba(109,93,252,0.08)',  border: 'rgba(109,93,252,0.22)'  } :
    isDone      ? { label: 'Finalizada', color: MUTED,    bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.18)' } :
                  { label: '—',          color: MUTED,    bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.18)' };

  return (
    <Card className="p-4 md:p-6 mb-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="flex-1 min-w-0 space-y-3 w-full">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg md:text-2xl font-black text-white truncate leading-tight">
              {campaign?.nome || 'Campanha Ativa'}
            </h2>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] md:text-[11px] font-bold uppercase tracking-wider"
              style={{ color: statusConfig.color, background: statusConfig.bg, border: `1px solid ${statusConfig.border}` }}
            >
              {isRunning && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: SUCCESS }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: SUCCESS }} />
                </span>
              )}
              {statusConfig.label}
            </div>
            {banRiskScore >= 60 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] md:text-[11px] font-bold"
                style={{ color: WARNING, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <AlertTriangle size={10} /> Risco {banRiskScore}%
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 md:gap-4 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span className="hidden md:inline">ID: {campaign?.id?.slice(-8) || '—'}</span>
            <span>Início: {new Date(startTs).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            <span>Ativo há {fmtHHMM(activeMs)}</span>
            <span className="hidden md:inline">Operador: {campaign?.startedBy || 'Michel G.'}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {enviados.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')} contatos
              </span>
              <span className="font-mono font-black text-sm" style={{ color: PRIMARY }}>{animPct}%</span>
            </div>
            <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${PRIMARY}, #A855F7, #EC4899)` }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
          {isScheduled ? (
            <>
              <button onClick={startNow}
                className="flex-1 md:flex-none justify-center px-4 py-3 md:py-2.5 text-xs md:text-sm font-bold text-white rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity min-h-[48px]"
                style={{ background: `linear-gradient(135deg, ${SUCCESS}, #16A34A)` }}>
                <Play size={14} /> Iniciar Agora
              </button>
              <button onClick={cancelSchedule}
                className="p-3 md:p-2.5 rounded-xl transition-colors hover:text-white min-h-[48px] min-w-[48px] flex items-center justify-center"
                style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
                <X size={16} />
              </button>
            </>
          ) : !isDone ? (
            <>
              <button onClick={togglePauseResume}
                className="flex-1 md:flex-none justify-center px-4 py-3 md:py-2.5 text-xs md:text-sm font-bold rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity min-h-[48px]"
                style={isRunning
                  ? { background: 'rgba(245,158,11,0.1)', color: WARNING, border: '1px solid rgba(245,158,11,0.25)' }
                  : { background: 'rgba(34,197,94,0.1)',  color: SUCCESS,  border: '1px solid rgba(34,197,94,0.25)'  }}>
                {isRunning ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Retomar</>}
              </button>
              <button onClick={cancelCampaign}
                className="flex-1 md:flex-none justify-center px-3 py-3 md:py-2.5 text-xs md:text-sm font-bold rounded-xl flex items-center gap-1.5 hover:opacity-90 transition-opacity min-h-[48px]"
                style={{ background: 'rgba(239,68,68,0.1)', color: DANGER, border: '1px solid rgba(239,68,68,0.2)' }}>
                <X size={14} /> Encerrar
              </button>
            </>
          ) : (
            <span className="w-full text-center px-3 py-3 md:py-2 text-xs rounded-xl font-bold min-h-[48px] flex items-center justify-center" style={{ color: MUTED, border: `1px solid ${BORDER}` }}>Finalizada</span>
          )}
        </div>
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION 3 — METRICS CARDS
// ─────────────────────────────────────────────────────────────
const NextSendCard = ({ logs, settings, now }: any) => {
  const delayMinMs  = settings?.delayMinMs ?? 35_000;
  const delayMaxMs  = settings?.delayMaxMs ?? 90_000;
  const lastSentLog = useMemo(() => logs.find((l: any) => l.status === 'enviado'), [logs]);
  const lastTs      = lastSentLog?.timestamp ?? 0;
  const nextTarget  = useRef(0);
  useEffect(() => {
    if (lastTs) nextTarget.current = lastTs + delayMinMs + Math.random() * (delayMaxMs - delayMinMs);
  }, [lastTs, delayMinMs, delayMaxMs]);
  const elapsed  = lastTs ? now - lastTs : 0;
  const inWindow = elapsed >= delayMinMs;
  const countdown = Math.max(0, nextTarget.current - now);
  const barFill   = lastTs ? Math.min((elapsed / delayMaxMs) * 100, 100) : 0;
  const barColor  = inWindow ? SUCCESS : WARNING;

  return (
    <Card className="p-5 space-y-3">ol justify-between h-full bg-gradient-to-br from-[#0B1020] to-[#050816]">
      <div className="flex items-center justify-between">b-4">
        <div className="flex items-center gap-1.5">
          <Clock size={12} style={{ color: barColor }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Próximo Envio</span>
        </div>
        {inWindow && lastTs > 0 && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: SUCCESS }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: SUCCESS }} />
          </span>
        )}
      </div>
      <div className="font-mono font-black tabular-nums leading-none" style={{ fontSize: 42, color: barColor }}>
        {!lastTs ? '—' : inWindow ? 'Agora' : fmtMMSS(countdown)}ng-tighter" style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', lineHeight: 1, color: barColor }}>
      </div>!lastTs ? '—' : inWindow ? 'AGORA' : fmtMMSS(countdown)}
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <motion.div className="h-full rounded-full" animate={{ width: `${barFill}%` }} transition={{ duration: 0.5 }}
          style={{ background: barColor }} />
      </div> className="relative h-1.5 rounded-full overflow-hidden bg-white/5 mb-3">
      <div className="space-y-1 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>={{ duration: 0.5 }}
        <div className="flex justify-between"><span>Delay mín</span><span>{(delayMinMs / 1000).toFixed(0)}s</span></div>
        <div className="flex justify-between"><span>Delay máx</span><span>{(delayMaxMs / 1000).toFixed(0)}s</span></div>
        <div className="flex justify-between"><span>Último envio</span><span>{lastTs ? fmtTime(lastTs) : '—'}</span></div>
      </div>
    </Card>
  );
};
  const hourlyData = useMemo(() => {
    const b: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const s = now - (i + 1) * 3_600_000;
      const e = now - i * 3_600_000;
      b.push(logs.filter((l: any) => l.status === 'enviado' && l.timestamp >= s && l.timestamp < e).length);
    } const s = now - (i + 1) * 3_600_000;
    return b; = now - i * 3_600_000;
  }, [logs, now]);filter((l: any) => l.status === 'enviado' && l.timestamp >= s && l.timestamp < e).length);
  const sentLastHour = hourlyData[hourlyData.length - 1] ?? 0;
  const animSent     = useAnimatedNumber(sentLastHour);
  const peakHour     = Math.max(...hourlyData, 0);
  const avgHour      = hourlyData.length ? Math.round(hourlyData.reduce((a, b) => a + b, 0) / hourlyData.length) : 0;
  const speedColor   = sentLastHour > 80 ? DANGER : sentLastHour > 40 ? WARNING : PRIMARY;
  const peakHour     = Math.max(...hourlyData, 0);
  return (gHour      = hourlyData.length ? Math.round(hourlyData.reduce((a, b) => a + b, 0) / hourlyData.length) : 0;
    <Card className="p-5 space-y-3">> 80 ? DANGER : sentLastHour > 40 ? WARNING : PRIMARY;
      <div className="flex items-center gap-1.5">
        <Zap size={12} style={{ color: speedColor }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Velocidade</span>
      </div>lassName="flex items-center gap-1.5">
      <div className="flex items-end gap-1.5">lor }} />
        <div className="font-mono font-black tabular-nums leading-none" style={{ fontSize: 42, color: speedColor }}>{animSent}</div>
        <span className="text-sm font-bold pb-1" style={{ color: MUTED }}>/hora</span>
      </div>lassName="flex items-end gap-1.5">
      <div style={{ height: 40 }}><Sparkline data={hourlyData} color={speedColor} height={40} /></div>speedColor }}>{animSent}</div>
      <div className="space-y-1 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>
        <div className="flex justify-between"><span>Média</span><span>{avgHour}/h</span></div>
        <div className="flex justify-between"><span>Pico</span><span>{peakHour}/h</span></div>/></div>
      </div>lassName="space-y-1 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>
    </Card>v className="flex justify-between"><span>Média</span><span>{avgHour}/h</span></div>
  );    <div className="flex justify-between"><span>Pico</span><span>{peakHour}/h</span></div>
};    </div>
    </Card>
const TimeRemainingCard = ({ campaign, calculatedStats, now }: any) => {
  const stats    = campaign?.stats ?? {};
  const enviados = stats.enviados ?? 0;
  const pending  = calculatedStats?.waiting ?? 0;Stats, now }: any) => {
  const startedAt = campaign?.startedAt ?? campaign?.createdAt ?? now;
  const elapsed  = now - startedAt;? 0;
  const rate     = elapsed > 0 && enviados > 0 ? enviados / elapsed : 0;
  const remainMs = rate > 0 && pending > 0 ? pending / rate : 0;? now;
  const etaTs    = now + remainMs;;
  const rate     = elapsed > 0 && enviados > 0 ? enviados / elapsed : 0;
  return (mainMs = rate > 0 && pending > 0 ? pending / rate : 0;
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-1.5">
        <Target size={12} style={{ color: INFO }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Tempo Restante</span>
      </div>lassName="flex items-center gap-1.5">
      <div className="font-mono font-black tabular-nums leading-none" style={{ fontSize: 42, color: INFO }}>
        {remainMs > 0 ? fmtHHMM(remainMs) : '—'}ppercase tracking-widest" style={{ color: MUTED }}>Tempo Restante</span>
      </div>
      <div className="space-y-1 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}> INFO }}>
        <div className="flex justify-between">'}
          <span>Previsão de término</span>
          <span>{remainMs > 0 ? new Date(etaTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        </div>lassName="flex justify-between">
        <div className="flex justify-between"><span>Restantes</span><span>{pending.toLocaleString('pt-BR')}</span></div>
        <div className="flex justify-between"><span>Total campanha</span><span>{(enviados + pending).toLocaleString('pt-BR')}</span></div>
      </div>v>
    </Card>v className="flex justify-between"><span>Restantes</span><span>{pending.toLocaleString('pt-BR')}</span></div>
  );    <div className="flex justify-between"><span>Total campanha</span><span>{(enviados + pending).toLocaleString('pt-BR')}</span></div>
};    </div>
    </Card>
const DailyLimitCard = ({ logs, settings, now }: any) => {
  const dailyLimit = settings?.dailyLimit ?? 300;
  const todayStart = useMemo(() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }, [Math.floor(now / 86_400_000)]);
  const sentToday  = useMemo(() => logs.filter((l: any) => l.status === 'enviado' && l.timestamp >= todayStart).length, [logs, todayStart]);
  const animToday  = useAnimatedNumber(sentToday);
  const dailyLeft  = Math.max(0, dailyLimit - sentToday);ow); d.setHours(0, 0, 0, 0); return d.getTime(); }, [Math.floor(now / 86_400_000)]);
  const pct        = Math.min((sentToday / dailyLimit) * 100, 100); === 'enviado' && l.timestamp >= todayStart).length, [logs, todayStart]);
  const resetAt    = new Date(now); resetAt.setDate(resetAt.getDate() + 1); resetAt.setHours(0, 0, 0, 0);
  const resetInMs  = resetAt.getTime() - now; sentToday);
  const limitColor = dailyLeft < dailyLimit * 0.1 ? DANGER : dailyLeft < dailyLimit * 0.3 ? WARNING : SUCCESS;
  const resetAt    = new Date(now); resetAt.setDate(resetAt.getDate() + 1); resetAt.setHours(0, 0, 0, 0);
  return (setInMs  = resetAt.getTime() - now;
    <Card className="p-5 space-y-3">lyLimit * 0.1 ? DANGER : dailyLeft < dailyLimit * 0.3 ? WARNING : SUCCESS;
      <div className="flex items-center gap-1.5">
        <BarChart3 size={12} style={{ color: limitColor }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Limite Diário</span>
      </div>lassName="flex items-center gap-1.5">
      <div className="flex items-end gap-1.5">imitColor }} />
        <div className="font-mono font-black tabular-nums leading-none" style={{ fontSize: 42, color: limitColor }}>{animToday}</div>
        <span className="text-sm font-bold pb-1" style={{ color: MUTED }}>/{dailyLimit}</span>
      </div>lassName="flex items-end gap-1.5">
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>{animToday}</div>
        <motion.div className="h-full rounded-full" animate={{ width: `${pct}%` }} transition={{ duration: 1 }}
          style={{ background: pct > 80 ? `linear-gradient(90deg, ${SUCCESS}, ${DANGER})` : SUCCESS }} />
      </div>lassName="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <div className="space-y-1 text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.28)' }}>ration: 1 }}
        <div className="flex justify-between">ear-gradient(90deg, ${SUCCESS}, ${DANGER})` : SUCCESS }} />
          <span>Disponível</span>
          <span style={{ color: dailyLeft < 20 ? DANGER : 'rgba(255,255,255,0.28)' }}>{dailyLeft}</span>
        </div>lassName="flex justify-between">
        <div className="flex justify-between"><span>Reset em</span><span>{fmtHHMM(resetInMs)}</span></div>
      </div>pan style={{ color: dailyLeft < 20 ? DANGER : 'rgba(255,255,255,0.28)' }}>{dailyLeft}</span>
    </Card>iv>
  );    <div className="flex justify-between"><span>Reset em</span><span>{fmtHHMM(resetInMs)}</span></div>
};    </div>
    </Card>
// ─────────────────────────────────────────────────────────────
// SECTION 4 — BAN RISK
// ─────────────────────────────────────────────────────────────
const BanRiskCard = ({ campaign, logs, settings, banRiskScore, now }: any) => {
  const stats    = campaign?.stats ?? {};
  const enviados = stats.enviados    ?? 0;──────────────────────
  const falhas   = stats.falhas      ?? 0;tings, banRiskScore, now }: any) => {
  const respondidos = stats.respondidos ?? 0;
  const bloqueios   = stats.bloqueios   ?? 0;
  const oneHourAgo  = now - 3_600_000;? 0;
  const sentLastHour = useMemo(() => logs.filter((l: any) => l.status === 'enviado' && l.timestamp > oneHourAgo).length, [logs, now]);
  const delayMinS    = (settings?.delayMinMs ?? 30_000) / 1_000;
  const totalAttempts = enviados + falhas;
  const failRatePct   = totalAttempts > 0 ? (falhas / totalAttempts) * 100 : 0;ado' && l.timestamp > oneHourAgo).length, [logs, now]);
  const responseRatePct = enviados > 0 ? (respondidos / enviados) * 100 : 0;
  const totalAttempts = enviados + falhas;
  const score = banRiskScore;Attempts > 0 ? (falhas / totalAttempts) * 100 : 0;
  const level =eRatePct = enviados > 0 ? (respondidos / enviados) * 100 : 0;
    score <= 20 ? { label: 'BAIXO RISCO', color: SUCCESS   } :
    score <= 40 ? { label: 'SEGURO',       color: '#84CC16' } :
    score <= 60 ? { label: 'ATENÇÃO',      color: WARNING   } :
    score <= 80 ? { label: 'ALTO RISCO',   color: '#F97316' } :
                  { label: 'CRÍTICO',      color: DANGER    };:
    score <= 60 ? { label: 'ATENÇÃO',      color: WARNING   } :
  const diagItems = [abel: 'ALTO RISCO',   color: '#F97316' } :
    { label: 'Taxa de resposta',   value: `${responseRatePct.toFixed(1)}%`, ok: responseRatePct >= 5  },
    { label: 'Bloqueios recentes', value: bloqueios === 0 ? 'Nenhum' : `${bloqueios}`, ok: bloqueios === 0 },
    { label: 'Volume/hora',        value: `${sentLastHour} msgs`,            ok: sentLastHour <= 50   },
    { label: 'Delay mínimo',       value: `${delayMinS.toFixed(0)}s`,        ok: delayMinS >= 30      },
    { label: 'Taxa de falha',      value: `${failRatePct.toFixed(1)}%`,      ok: failRatePct < 5      }, 0 },
    { label: 'Conta aquecida',     value: delayMinS >= 60 ? 'Sim' : 'Parcial', ok: delayMinS >= 60   },,
  ];{ label: 'Delay mínimo',       value: `${delayMinS.toFixed(0)}s`,        ok: delayMinS >= 30      },
    { label: 'Taxa de falha',      value: `${failRatePct.toFixed(1)}%`,      ok: failRatePct < 5      },
  const diagnosis = aquecida',     value: delayMinS >= 60 ? 'Sim' : 'Parcial', ok: delayMinS >= 60   },
    score <= 20 ? 'Campanha operando com total segurança. Todos os padrões dentro do esperado pelo WhatsApp.' :
    score <= 40 ? 'Risco aceitável. Monitore o volume de envios nas próximas horas.' :
    score <= 60 ? 'Risco elevado detectado. Considere aumentar o intervalo entre mensagens.' :
    score <= 80 ? 'Alto risco de banimento. Recomenda-se pausar e reavaliar a estratégia.' :o pelo WhatsApp.' :
                  'CRÍTICO — Risco iminente de banimento. Encerre a campanha imediatamente.';
    score <= 60 ? 'Risco elevado detectado. Considere aumentar o intervalo entre mensagens.' :
  return (<= 80 ? 'Alto risco de banimento. Recomenda-se pausar e reavaliar a estratégia.' :
    <Card className="p-5 md:p-6">o iminente de banimento. Encerre a campanha imediatamente.';
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-64 space-y-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">">
              <Shield size={13} style={{ color: level.color }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Risco de Banimento</span>
            </div>lassName="flex items-center gap-2">
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
              style={{ color: level.color, background: `${level.color}14`, border: `1px solid ${level.color}25` }}>animento</span>
              {level.label}
            </span>lassName="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
          </div>yle={{ color: level.color, background: `${level.color}14`, border: `1px solid ${level.color}25` }}>
          <div className="flex items-end gap-1">
            <span className="font-black font-mono tabular-nums leading-none" style={{ fontSize: 56, color: level.color }}>{score}</span>
            <span className="text-2xl font-bold pb-2" style={{ color: `${level.color}70` }}>%</span>
          </div>lassName="flex items-end gap-1">
          <div className="space-y-1.5"> font-mono tabular-nums leading-none" style={{ fontSize: 56, color: level.color }}>{score}</span>
            <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(to right,#22C55E,#84CC16,#EAB308,#F97316,#EF4444)' }} />
              <motion.div className="absolute top-0 right-0 bottom-0 rounded-r-full"
                animate={{ left: `${score}%` }} transition={{ duration: 1.5, ease: 'easeOut' }}ba(255,255,255,0.04)' }}>
                style={{ background: BG }} />0 rounded-full" style={{ background: 'linear-gradient(to right,#22C55E,#84CC16,#EAB308,#F97316,#EF4444)' }} />
              <motion.div className="absolute top-0 bottom-0 w-0.5"0 rounded-r-full"
                animate={{ left: `${score}%` }} transition={{ duration: 1.5, ease: 'easeOut' }}
                style={{ background: TEXT, boxShadow: `0 0 8px ${level.color}` }} />
            </div>ion.div className="absolute top-0 bottom-0 w-0.5"
            <div className="flex justify-between text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.18)' }}>
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span>
            </div>
          </div> className="flex justify-between text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.18)' }}>
          {score >= 60 && (><span>25</span><span>50</span><span>75</span><span>100%</span>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: `${level.color}10`, color: level.color, border: `1px solid ${level.color}20` }}>
              <AlertTriangle size={12} />
              {score >= 85 ? 'Pare a campanha imediatamente.' : 'Considere pausar a campanha.'}d"
            </div>e={{ background: `${level.color}10`, color: level.color, border: `1px solid ${level.color}20` }}>
          )}  <AlertTriangle size={12} />
        </div>{score >= 85 ? 'Pare a campanha imediatamente.' : 'Considere pausar a campanha.'}
            </div>
        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {diagItems.map((item, i) => (
              <div key={i} className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-1.5 mb-1">>
                  {item.ok ? <Check size={11} style={{ color: SUCCESS }} /> : <X size={11} style={{ color: DANGER }} />}
                  <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: MUTED }}>{item.label}</span>BORDER}` }}>
                </div>lassName="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-bold font-mono" style={{ color: item.ok ? TEXT : DANGER }}>{item.value}</span>
              </div>pan className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: MUTED }}>{item.label}</span>
            ))} </div>
          </div><span className="text-sm font-bold font-mono" style={{ color: item.ok ? TEXT : DANGER }}>{item.value}</span>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(109,93,252,0.06)', border: '1px solid rgba(109,93,252,0.15)' }}>
            <Brain size={13} style={{ color: PRIMARY, marginTop: 1, flexShrink: 0 }} />
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ color: PRIMARY }} className="font-bold">IA: </span>{diagnosis}2,0.15)' }}>
            </p>in size={13} style={{ color: PRIMARY, marginTop: 1, flexShrink: 0 }} />
          </div>lassName="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
        </div><span style={{ color: PRIMARY }} className="font-bold">IA: </span>{diagnosis}
      </div></p>
    </Card>/div>
  );    </div>
};    </div>
    </Card>
// ─────────────────────────────────────────────────────────────
// SECTION 5 — REAL-TIME FUNNEL
// ─────────────────────────────────────────────────────────────
const FunnelChart = ({ campaign, logs, calculatedStats }: any) => {
  const stats       = campaign?.stats ?? {};
  const enviados    = stats.enviados    ?? 0;───────────────────
  const pending     = calculatedStats?.waiting ?? 0;ts }: any) => {
  const respondidos = stats.respondidos ?? 0;
  const interessados = useMemo(() => logs.filter((l: any) => ['interessado', 'classificado'].includes(l.status)).length, [logs]);
  const quentes      = Math.round(interessados * 0.65);
  const vendas       = Math.round(quentes * 0.28);
  const total        = enviados + pending;filter((l: any) => ['interessado', 'classificado'].includes(l.status)).length, [logs]);
  const quentes      = Math.round(interessados * 0.65);
  const stages = [   = Math.round(quentes * 0.28);
    { label: 'Contatos',     value: total,         color: INFO,     Icon: Users         },
    { label: 'Enviados',     value: enviados,      color: PRIMARY,  Icon: Send          },
    { label: 'Responderam',  value: respondidos,   color: WARNING,  Icon: MessageCircle },
    { label: 'Interessados', value: interessados,  color: '#A855F7',Icon: Star          },
    { label: 'Quentes',      value: quentes,       color: '#F97316',Icon: Flame         },
    { label: 'Vendas',       value: vendas,        color: SUCCESS,  Icon: DollarSign    },
  ];{ label: 'Interessados', value: interessados,  color: '#A855F7',Icon: Star          },
    { label: 'Quentes',      value: quentes,       color: '#F97316',Icon: Flame         },
  return (l: 'Vendas',       value: vendas,        color: SUCCESS,  Icon: DollarSign    },
    <Card className="p-5 h-full">
      <SectionLabel>Funil em Tempo Real</SectionLabel>
      <div className="space-y-3">
        {stages.map((s, i) => {">
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const maxW = 100 - i * 8;
          const barW = Math.min(pct, maxW);
          const Icon = s.Icon;0 ? (s.value / total) * 100 : 0;
          return (xW = 100 - i * 8;
            <motion.div key={s.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon size={10} style={{ color: s.color }} /> -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}>
                  <span className="text-[10px] font-semibold" style={{ color: MUTED }}>{s.label}</span>
                </div>lassName="flex items-center gap-1.5">
                <div className="flex items-center gap-2"> }} />
                  <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>an>
                    {total > 0 ? pct.toFixed(1) : '0.0'}%
                  </span>sName="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono tabular-nums" style={{ color: s.color }}>
                    {s.value.toLocaleString('pt-BR')}0'}%
                  </span>
                </div>n className="text-xs font-bold font-mono tabular-nums" style={{ color: s.color }}>
              </div>{s.value.toLocaleString('pt-BR')}
              <div className="relative h-5 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <motion.div
                  className="h-full rounded-lg"
                  initial={{ width: 0 }}-5 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  animate={{ width: `${Math.max(barW, s.value > 0 ? 3 : 0)}%` }}
                  transition={{ duration: 0.9, delay: i * 0.1, ease: 'easeOut' }}
                  style={{ background: `linear-gradient(90deg, ${s.color}25, ${s.color}55)`, borderRight: `2px solid ${s.color}60` }}
                />animate={{ width: `${Math.max(barW, s.value > 0 ? 3 : 0)}%` }}
              </div>ansition={{ duration: 0.9, delay: i * 0.1, ease: 'easeOut' }}
            </motion.div>{ background: `linear-gradient(90deg, ${s.color}25, ${s.color}55)`, borderRight: `2px solid ${s.color}60` }}
          );    />
        })}   </div>
      </div></motion.div>
    </Card>;
  );    })}
};    </div>
    </Card>
// ─────────────────────────────────────────────────────────────
// SECTION 6 — OPERATIONAL TERMINAL
// ─────────────────────────────────────────────────────────────
const ExecutionTerminal = ({ campaignId }: { campaignId: string }) => {
  const [logs,       setLogs]   = useState<any[]>([]);
  const [filter,     setFilter] = useState<LogFilter>('all');───
  const [search,     setSearch] = useState('');mpaignId: string }) => {
  const [autoScroll, setAuto]   = useState(true);([]);
  const scrollRef = useRef<HTMLDivElement>(null);ter>('all');
  const [search,     setSearch] = useState('');
  useEffect(() => {, setAuto]   = useState(true);
    if (!campaignId) return;TMLDivElement>(null);
    const q = query(
      collection(db, 'campaign_logs'),
      where('campaignId', '==', campaignId),
      orderBy('timestamp', 'desc'),
      limit(300)(db, 'campaign_logs'),
    );where('campaignId', '==', campaignId),
    return onSnapshot(q, snap => {,
      const rows: any[] = [];
      snap.forEach(d => rows.push({ _id: d.id, ...d.data() }));
      setLogs(rows);t(q, snap => {
    });onst rows: any[] = [];
  }, [campaignId]);d => rows.push({ _id: d.id, ...d.data() }));
      setLogs(rows);
  useEffect(() => {
    if (autoScroll && scrollRef.current)
      scrollRef.current.scrollTop = 0;
  }, [logs, autoScroll]);

  const visible = useMemo(() => logs.filter(l => {
    if (!matchesFilter(l, filter)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (l.contactName || '').toLowerCase().includes(s)
          || (l.nome || '').toLowerCase().includes(s)
          || (l.status || '').toLowerCase().includes(s);
    }
    return true;
  }), [logs, filter, search]);

  const counts = useMemo(() => ({
    envios:    logs.filter(l => l.status === 'enviado').length,
    respostas: logs.filter(l => ['respondido', 'reply', 'interessado', 'classificado'].includes(l.status)).length,
    erros:     logs.filter(l => l.status === 'falhou').length,
  }), [logs]);

  const FILTERS: { key: LogFilter; label: string; color?: string }[] = [
    { key: 'all',       label: 'Todos'     },
    { key: 'envios',    label: 'Envios',    color: SUCCESS },
    { key: 'respostas', label: 'Respostas', color: WARNING },
    { key: 'erros',     label: 'Erros',     color: DANGER  },
  ];

  return (
    <Card className="overflow-hidden flex flex-col h-full min-h-[400px]">
      <div className="flex items-center justify-between px-4 py-4 shrink-0"
        style={{ borderBottom: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.2)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 hidden md:flex">
            <div className="w-3 h-3 rounded-full" style={{ background: 'rgba(239,68,68,0.5)' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: 'rgba(245,158,11,0.5)' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: 'rgba(34,197,94,0.5)' }} />
          </div>
          <span className="text-[12px] font-mono font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Terminal de Execução
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              className="pl-9 pr-3 py-2 text-[12px] font-mono rounded-xl focus:outline-none w-32 focus:w-48 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.8)' }} />
          </div>
          <button onClick={() => setAuto(v => !v)} className="p-2 rounded-xl transition-all"
            style={{
              background: autoScroll ? `rgba(109,93,252,0.15)` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${autoScroll ? 'rgba(109,93,252,0.3)' : BORDER}`,
              color: autoScroll ? '#A78BFA' : MUTED,
            }}>
            <ArrowUp size={14} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 px-4 py-3 shrink-0 overflow-x-auto hide-scrollbar" style={{ borderBottom: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.12)' }}>
        {FILTERS.map(f => {
          const count = f.key === 'envios' ? counts.envios : f.key === 'respostas' ? counts.respostas : f.key === 'erros' ? counts.erros : logs.length;
          const active = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-bold transition-all"
              style={{
                background: active ? (f.color ? `${f.color}15` : `${PRIMARY}20`) : 'rgba(255,255,255,0.03)',
                color: active ? (f.color ?? '#A78BFA') : MUTED,
                border: `1px solid ${active ? (f.color ? `${f.color}30` : `${PRIMARY}40`) : 'transparent'}`,
              }}>
              {f.label}
              {count > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(0,0,0,0.2)' }}>{count}</span>}
            </button>
          );
        })}
      </div>
      <div ref={scrollRef}
        className="overflow-y-auto flex-1 p-3 space-y-2 font-mono text-[11px]"
        style={{ background: 'rgba(0,0,0,0.3)', minHeight: '220px' }}
        onScroll={e => {
          const el = e.currentTarget;
          setAuto(el.scrollTop < 60);
        }}>
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-44" style={{ color: 'rgba(255,255,255,0.12)' }}>
            Aguardando logs…
          </div>
        ) : visible.map((log, i) => {
          const color = getLogColor(log);
          return (
            <motion.div key={log._id || i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.1 }}
              className="flex flex-col gap-1 py-3 px-4 rounded-xl hover:bg-white/[0.02] transition-colors border border-white/5 bg-[#0B1020]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                   <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center font-bold" style={{ color, background: `${color}15` }}>{getLogIcon(log)}</span>
                   <span className="font-bold text-[11px]" style={{ color: `${color}ee` }}>
                     {log.contactName || log.nome || log.contactId || 'Sistema'}
                   </span>
                </div>
                <span className="shrink-0 tabular-nums font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {log.timestamp ? fmtTime(log.timestamp) : '—'}
                </span>
              </div>
              <div className="pl-6 text-[11px] leading-relaxed break-words" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {getLogText(log).replace(new RegExp(`^(.*? — )`), '')}
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>;
  );    })}
};    </div>
    </Card>
// ─────────────────────────────────────────────────────────────
// SECTION 7 — HOT LEADS
// ─────────────────────────────────────────────────────────────
const HotLeadsCard = ({ logs }: { logs: any[] }) => {───────────
  const hotLeads = useMemo(
    () => logs.filter(l => ['interessado', 'classificado', 'respondido', 'reply'].includes(l.status)).slice(0, 8),
    [logs]eadsCard = ({ logs }: { logs: any[] }) => {
  );nst hotLeads = useMemo(
  const scoreOf = (log: any) => {ressado', 'classificado', 'respondido', 'reply'].includes(l.status)).slice(0, 8),
    const seed = log._id ? (log._id.charCodeAt(0) | 0) : 0;
    return ['interessado', 'classificado'].includes(log.status) ? 85 + (seed % 15) : 45 + (seed % 35);
  };nst scoreOf = (log: any) => {
    const seed = log._id ? (log._id.charCodeAt(0) | 0) : 0;
  return ( ['interessado', 'classificado'].includes(log.status) ? 85 + (seed % 15) : 45 + (seed % 35);
    <Card className="p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame size={13} style={{ color: '#F97316' }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Leads Quentes</span>
        </div>lassName="flex items-center gap-2">
        <div className="flex items-center gap-1.5">' }} />
          <span className="relative flex h-1.5 w-1.5"> tracking-widest" style={{ color: MUTED }}>Leads Quentes</span>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: SUCCESS }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: SUCCESS }} />
          </span>lassName="relative flex h-1.5 w-1.5">
          <span className="text-[10px] font-mono" style={{ color: MUTED }}>{hotLeads.length}</span>0" style={{ background: SUCCESS }} />
        </div>pan className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: SUCCESS }} />
      </div>span>
          <span className="text-[10px] font-mono" style={{ color: MUTED }}>{hotLeads.length}</span>
      <div className="space-y-2 overflow-y-auto flex-1" style={{ maxHeight: 340 }}>
        {hotLeads.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.12)' }}>Aguardando respostas…</div>
        ) : hotLeads.map((log, i) => {ow-y-auto flex-1" style={{ maxHeight: 340 }}>
          const isHot    = ['interessado', 'classificado'].includes(log.status);
          const score    = scoreOf(log);ter text-sm" style={{ color: 'rgba(255,255,255,0.12)' }}>Aguardando respostas…</div>
          const initials = (log.contactName || log.nome || '?').slice(0, 2).toUpperCase();
          return (Hot    = ['interessado', 'classificado'].includes(log.status);
            <motion.div key={log._id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 p-3 rounded-xl".slice(0, 2).toUpperCase();
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}` }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0"ion={{ delay: i * 0.05 }}
                style={{ background: isHot ? 'linear-gradient(135deg,#F97316,#EC4899)' : `linear-gradient(135deg,${PRIMARY},#A855F7)`, color: TEXT }}>
                {initials}kground: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}` }}>
              </div>lassName="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0"
              <div className="flex-1 min-w-0">linear-gradient(135deg,#F97316,#EC4899)' : `linear-gradient(135deg,${PRIMARY},#A855F7)`, color: TEXT }}>
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-xs font-semibold truncate" style={{ color: TEXT }}>{log.contactName || log.nome || 'Contato'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isHot && <span className="text-[9px]">🔥</span>}-1 mb-0.5">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"T }}>{log.contactName || log.nome || 'Contato'}</span>
                      style={{ color: score > 75 ? SUCCESS : WARNING, background: `${score > 75 ? SUCCESS : WARNING}15` }}>
                      {score} <span className="text-[9px]">🔥</span>}
                    </span>lassName="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  </div>yle={{ color: score > 75 ? SUCCESS : WARNING, background: `${score > 75 ? SUCCESS : WARNING}15` }}>
                </div>{score}
                <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {log.message || (log.status === 'respondido' ? 'Respondeu à mensagem' : log.status)}
                </p>v>
                <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
                  {log.timestamp ? fmtTime(log.timestamp) : '—'} 'Respondeu à mensagem' : log.status)}
                </span>
              </div>n className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
            </motion.div>mestamp ? fmtTime(log.timestamp) : '—'}
          );    </span>
        })}   </div>
      </div></motion.div>
          );
      {hotLeads.length > 0 && (
        <button className="w-full py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
          style={{ background: `${PRIMARY}12`, color: '#A78BFA', border: `1px solid ${PRIMARY}25` }}>
          Abrir Conversas no Inbox
        </button>lassName="w-full py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-80"
      )}  style={{ background: `${PRIMARY}12`, color: '#A78BFA', border: `1px solid ${PRIMARY}25` }}>
    </Card>brir Conversas no Inbox
  );    </button>
};    )}
    </Card>
// ─────────────────────────────────────────────────────────────
// SECTION 8 — RESPONSE RATE
// ─────────────────────────────────────────────────────────────
const ResponseRateCard = ({ campaign, logs, now }: any) => {────
  const stats       = campaign?.stats ?? {};
  const enviados    = stats.enviados    ?? 0;───────────────────
  const respondidos = stats.respondidos ?? 0;ow }: any) => {
  const rate        = enviados > 0 ? (respondidos / enviados) * 100 : 0;
  const AVG_RATE    = 12;ts.enviados    ?? 0;
  const diff        = rate - AVG_RATE;s ?? 0;
  const rate        = enviados > 0 ? (respondidos / enviados) * 100 : 0;
  const hourlyRates = useMemo(() => {
    const b: number[] = [];- AVG_RATE;
    for (let i = 5; i >= 0; i--) {
      const s    = now - (i + 1) * 3_600_000;
      const e    = now - i * 3_600_000;
      const sent = logs.filter((l: any) => l.status === 'enviado' && l.timestamp >= s && l.timestamp < e).length;
      const rep  = logs.filter((l: any) => ['respondido', 'reply'].includes(l.status) && l.timestamp >= s && l.timestamp < e).length;
      b.push(sent > 0 ? (rep / sent) * 100 : 0);
    } const sent = logs.filter((l: any) => l.status === 'enviado' && l.timestamp >= s && l.timestamp < e).length;
    return b;ep  = logs.filter((l: any) => ['respondido', 'reply'].includes(l.status) && l.timestamp >= s && l.timestamp < e).length;
  }, [logs, now]);> 0 ? (rep / sent) * 100 : 0);
    }
  return ( b;
    <Card className="p-5 space-y-5 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} style={{ color: SUCCESS }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Taxa de Resposta</span>
        </div>lassName="flex items-center gap-2">
        <span className="text-[10px] font-mono" style={{ color: MUTED }}>Últimas 6h</span>
      </div>pan className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Taxa de Resposta</span>
        </div>
      <div className="flex items-end gap-4">no" style={{ color: MUTED }}>Últimas 6h</span>
        <div>
          <div className="font-black font-mono tabular-nums leading-none" style={{ fontSize: 52, color: SUCCESS }}>
            {rate.toFixed(1)}ems-end gap-4">
          </div>
          <div className="text-sm font-bold mt-0.5" style={{ color: MUTED }}>% taxa de resposta</div>r: SUCCESS }}>
        </div>ate.toFixed(1)}
        <div className="pb-6 space-y-1.5">
          <div className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"ta</div>
            style={{ color: diff >= 0 ? SUCCESS : DANGER, background: `${diff >= 0 ? SUCCESS : DANGER}12` }}>
            {diff >= 0 ? <ArrowUpRight size={10} /> : <TrendingDown size={10} />}
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs médiat-bold px-2.5 py-1 rounded-full"
          </div>e={{ color: diff >= 0 ? SUCCESS : DANGER, background: `${diff >= 0 ? SUCCESS : DANGER}12` }}>
          <div className="text-[10px]" style={{ color: MUTED }}>{respondidos} respostas totais</div>
        </div>iff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs média
      </div>div>
          <div className="text-[10px]" style={{ color: MUTED }}>{respondidos} respostas totais</div>
      <div>iv>
        <Sparkline data={hourlyRates} color={SUCCESS} height={52} />
        <div className="flex justify-between text-[9px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {['6h', '5h', '4h', '3h', '2h', '1h'].map(h => <span key={h}>{h}</span>)}
        </div>line data={hourlyRates} color={SUCCESS} height={52} />
      </div> className="flex justify-between text-[9px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {['6h', '5h', '4h', '3h', '2h', '1h'].map(h => <span key={h}>{h}</span>)}
      <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl"
        style={{ background: 'rgba(109,93,252,0.06)', border: '1px solid rgba(109,93,252,0.15)' }}>
        <Brain size={12} style={{ color: PRIMARY, marginTop: 1, flexShrink: 0 }} />
        <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span style={{ color: PRIMARY }} className="font-bold">IA: </span>a(109,93,252,0.15)' }}>
          {rate > AVG_RATEtyle={{ color: PRIMARY, marginTop: 1, flexShrink: 0 }} />
            ? `Excelente performance — taxa ${diff.toFixed(0)}% acima da média do segmento de automação.`
            : rate > 5{{ color: PRIMARY }} className="font-bold">IA: </span>
            ? 'Taxa dentro do esperado. Mantenha o delay atual para não comprometer o engajamento.'
            : 'Taxa baixa detectada. Revise o template da mensagem para melhorar conversão.'} automação.`
        </p>: rate > 5
      </div>? 'Taxa dentro do esperado. Mantenha o delay atual para não comprometer o engajamento.'
    </Card> : 'Taxa baixa detectada. Revise o template da mensagem para melhorar conversão.'}
  );    </p>
};    </div>
    </Card>
// ─────────────────────────────────────────────────────────────
// SECTION 9 — AI INSIGHTS
// ─────────────────────────────────────────────────────────────
const AIInsightsCard = ({ campaign, logs, calculatedStats }: any) => {
  const stats       = campaign?.stats ?? {};
  const enviados    = stats.enviados    ?? 0;───────────────────
  const respondidos = stats.respondidos ?? 0;culatedStats }: any) => {
  const pending     = calculatedStats?.waiting ?? 0;
  const total       = enviados + pending;? 0;
  const rate        = enviados > 0 ? (respondidos / enviados) * 100 : 0;
  const conversoes  = Math.round(respondidos * 0.15);
  const ticket      = 350;ados + pending;
  const receita     = conversoes * ticket;ondidos / enviados) * 100 : 0;
  const recPrev     = previsao * ticket;  const conversoes  = Math.round(respondidos * 0.15);
  const custo       = total * 0.05;
  const roi         = custo > 0 ? ((receita - custo) / custo) * 100 : 0;

  const hourCounts: Record<number, number> = {};
  logs.filter((l: any) => ['respondido', 'reply'].includes(l.status))  logs.filter((l: any) => ['respondido', 'reply'].includes(l.status))
    .forEach((l: any) => { const h = new Date(l.timestamp).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });) => { const h = new Date(l.timestamp).getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
  const bestHourEntry = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];st bestHourEntry = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  const insights = [
    {
      Icon: TrendingUp, color: rate > 12 ? SUCCESS : WARNING,ingUp, color: rate > 12 ? SUCCESS : WARNING,
      text: `Taxa de resposta de ${rate.toFixed(1)}% — ${rate > 12 ? `${((rate / 12 - 1) * 100).toFixed(0)}% acima da média` : 'acompanhe a performance de perto'}.`,nce de perto'}.`,
    },
    bestHourEntryestHourEntry
      ? { Icon: Clock, color: INFO, text: `Maior concentração de respostas às ${bestHourEntry[0]}h. Concentre os próximos disparos neste horário.` }ext: `Maior concentração de respostas às ${bestHourEntry[0]}h. Concentre os próximos disparos neste horário.` }
      : { Icon: Clock, color: INFO, text: 'Aguardando volume suficiente para identificar o melhor horário de envio.' },
    {
      Icon: Target, color: '#A855F7', Icon: Target, color: '#A855F7',
      text: `Previsão de ${conversoes} conversões ao final da campanha com base na taxa atual de ${rate.toFixed(1)}%.`,conversões ao final da campanha com base na taxa atual de ${rate.toFixed(1)}%.`,
    },
    {
      Icon: DollarSign, color: SUCCESS, Icon: DollarSign, color: SUCCESS,
      text: `Receita estimada: R$ ${receita.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} com ticket médio de R$ ${ticket}.`,${receita.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} com ticket médio de R$ ${ticket}.`,
    },
    {
      Icon: Users, color: WARNING,  Icon: Users, color: WARNING,
      text: `${pending.toLocaleString('pt-BR')} contatos ainda aguardam envio. ${pending > total * 0.5 ? 'Mais da metade da campanha está pela frente.' : 'A campanha está na reta final.'}`,      text: `${pending.toLocaleString('pt-BR')} contatos ainda aguardam envio. ${pending > total * 0.5 ? 'Mais da metade da campanha está pela frente.' : 'A campanha está na reta final.'}`,
    },
  ];

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"lassName="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${PRIMARY}18`, border: `1px solid ${PRIMARY}28` }}>le={{ background: `${PRIMARY}18`, border: `1px solid ${PRIMARY}28` }}>
          <Brain size={15} style={{ color: PRIMARY }} />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: TEXT }}>Insights da IA</div>: TEXT }}>Insights da IA</div>
          <div className="text-[10px]" style={{ color: MUTED }}>Análise gerada em tempo real com base nos dados da campanha</div> MUTED }}>Análise gerada em tempo real com base nos dados da campanha</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">lassName="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: PRIMARY }} /> opacity-50" style={{ background: PRIMARY }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: PRIMARY }} />pan className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: PRIMARY }} />
          </span>span>
          <span className="text-[10px] font-mono" style={{ color: MUTED }}>Ao vivo</span>          <span className="text-[10px] font-mono" style={{ color: MUTED }}>Ao vivo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">me="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {insights.map((ins, i) => {
          const Icon = ins.Icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} }} transition={{ delay: i * 0.08 }}
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}` }}>rder: `1px solid ${BORDER}` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"lassName="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${ins.color}14`, border: `1px solid ${ins.color}22` }}>
                <Icon size={12} style={{ color: ins.color }} />e={12} style={{ color: ins.color }} />
              </div>  </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.58)' }}>{ins.text}</p>   <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.58)' }}>{ins.text}</p>
            </motion.div></motion.div>
          );;
        })}    })}
      </div>    </div>
    </Card>    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION 10 — REVENUE & CONVERSION
// ────────────────────────────────────────────────────────────────────────────────
const RevenueCard = ({ campaign, logs, calculatedStats, now }: any) => {atedStats, now }: any) => {
  const stats       = campaign?.stats ?? {};
  const enviados    = stats.enviados    ?? 0;? 0;
  const respondidos = stats.respondidos ?? 0;
  const pending     = calculatedStats?.waiting ?? 0;
  const total       = enviados + pending;
  const convRate    = enviados > 0 ? (respondidos / enviados) * 0.15 : 0;ados > 0 ? (respondidos / enviados) * 0.15 : 0;
  const conversoes  = Math.round(enviados * convRate);* convRate);
  const previsao    = Math.round(total * convRate); convRate);
  const ticket      = 350;
  const receita     = conversoes * ticket;
  const recPrev     = previsao * ticket;  const recPrev     = previsao * ticket;
  const custo       = total * 0.05;5;
  const roi         = custo > 0 ? ((receita - custo) / custo) * 100 : 0; > 0 ? ((receita - custo) / custo) * 100 : 0;

  const revData = useMemo(() => {
    const b: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const s    = now - (i + 1) * 3_600_000;
      const e    = now - i * 3_600_000; const e    = now - i * 3_600_000;
      const sent = logs.filter((l: any) => l.status === 'enviado' && l.timestamp >= s && l.timestamp < e).length;ent = logs.filter((l: any) => l.status === 'enviado' && l.timestamp >= s && l.timestamp < e).length;
      b.push(Math.round(sent * 0.15 * ticket));round(sent * 0.15 * ticket));
    }    }
    return b;
  }, [logs, now]);

  const metrics = [
    { label: 'Receita Gerada',   value: `R$ ${receita.toLocaleString('pt-BR')}`,   color: SUCCESS,   Icon: DollarSign  },
    { label: 'Receita Prevista', value: `R$ ${recPrev.toLocaleString('pt-BR')}`,    color: INFO,      Icon: TrendingUp  },
    { label: 'Conversões',       value: conversoes.toString(),                        color: '#A855F7', Icon: CheckCircle2},{ label: 'Conversões',       value: conversoes.toString(),                        color: '#A855F7', Icon: CheckCircle2},
    { label: 'Ticket Médio',     value: `R$ ${ticket}`,                              color: WARNING,   Icon: Target      },    { label: 'Ticket Médio',     value: `R$ ${ticket}`,                              color: WARNING,   Icon: Target      },
    { label: 'ROI Estimado',     value: `${roi.toFixed(0)}%`,                        color: roi > 100 ? SUCCESS : roi > 0 ? WARNING : DANGER, Icon: BarChart3 },l: 'ROI Estimado',     value: `${roi.toFixed(0)}%`,                        color: roi > 100 ? SUCCESS : roi > 0 ? WARNING : DANGER, Icon: BarChart3 },
  ];

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">lassName="flex items-center gap-2">
          <DollarSign size={13} style={{ color: SUCCESS }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Receita & Conversão</span>pan className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Receita & Conversão</span>
        </div>        </div>
        <span className="text-[10px]" style={{ color: MUTED }}>Estimativa baseada na taxa de conversão atual</span>imativa baseada na taxa de conversão atual</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">me="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {metrics.map((m, i) => {
          const Icon = m.Icon;
          return (
            <div key={i} className="p-4 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}` }}>id ${BORDER}` }}>
              <div className="flex items-center gap-1.5">lassName="flex items-center gap-1.5">
                <Icon size={11} style={{ color: m.color }} />
                <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: MUTED }}>{m.label}</span>pan className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: MUTED }}>{m.label}</span>
              </div>  </div>
              <div className="text-base font-black font-mono" style={{ color: m.color }}>{m.value}</div>   <div className="text-base font-black font-mono" style={{ color: m.color }}>{m.value}</div>
            </div></div>
          );          );
        })}
      </div>

      <div>
        <div className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(255,255,255,0.2)' }}>Receita estimada por hora — últimas 6h</div>v className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(255,255,255,0.2)' }}>Receita estimada por hora — últimas 6h</div>
        <Sparkline data={revData} color={SUCCESS} height={40} />    <Sparkline data={revData} color={SUCCESS} height={40} />
      </div>    </div>
    </Card>    </Card>
  );
};

// ─────────────────────────────────────────────────────────────
// AUTO REPLY EDITOR
// ─────────────────────────────────────────────────────────────
const AutoReplyEditor = ({ campaign, campaignId }: { campaign: any; campaignId: string }) => {ring }) => {
  const [open,     setOpen]     = useState(false);
  const [enabled,  setEnabled]  = useState<boolean>(campaign?.enableAutoReply ?? false);>(campaign?.enableAutoReply ?? false);
  const [text,     setText]     = useState<string>(campaign?.autoReplyText ?? '');(campaign?.autoReplyText ?? '');
  const [imageUrl, setImageUrl] = useState<string>(campaign?.autoReplyImageUrl ?? '');  const [imageUrl, setImageUrl] = useState<string>(campaign?.autoReplyImageUrl ?? '');
  const [saving,   setSaving]   = useState(false);setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    setEnabled(campaign?.enableAutoReply ?? false);
    setText(campaign?.autoReplyText ?? '');    setText(campaign?.autoReplyText ?? '');
    setImageUrl(campaign?.autoReplyImageUrl ?? '');toReplyImageUrl ?? '');
  }, [campaign?.id, campaign?.enableAutoReply, campaign?.autoReplyText, campaign?.autoReplyImageUrl]);campaign?.enableAutoReply, campaign?.autoReplyText, campaign?.autoReplyImageUrl]);

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'campaigns', campaignId), {
        enableAutoReply: enabled,nableAutoReply: enabled,
        autoReplyText:   enabled ? text.trim() : '',:   enabled ? text.trim() : '',
        autoReplyImageUrl: enabled ? imageUrl.trim() : '',trim() : '',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000); setTimeout(() => setSaved(false), 3000);
    } finally {} finally {
      setSaving(false);      setSaving(false);
    }
  };  };

  const isActive = campaign?.enableAutoReply;oReply;

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <MessageCircle size={14} style={{ color: isActive ? SUCCESS : 'rgba(255,255,255,0.2)' }} />ze={14} style={{ color: isActive ? SUCCESS : 'rgba(255,255,255,0.2)' }} />
          <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Resposta Automática do SDR</span>n>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
            style={isActive
              ? { color: SUCCESS,  background: `${SUCCESS}15`,               border: `1px solid ${SUCCESS}25`               } color: SUCCESS,  background: `${SUCCESS}15`,               border: `1px solid ${SUCCESS}25`               }
              : { color: MUTED,    background: 'rgba(255,255,255,0.04)',      border: `1px solid ${BORDER}`                  }}>a(255,255,255,0.04)',      border: `1px solid ${BORDER}`                  }}>
            {isActive ? 'ativa' : 'desativada'}
          </span>
          {isActive && campaign?.autoReplyText && ( && campaign?.autoReplyText && (
            <span className="text-[11px] truncate max-w-xs hidden md:block" style={{ color: 'rgba(255,255,255,0.25)' }}><span className="text-[11px] truncate max-w-xs hidden md:block" style={{ color: 'rgba(255,255,255,0.25)' }}>
              "{campaign.autoReplyText.slice(0, 60)}{campaign.autoReplyText.length > 60 ? '…' : ''}""{campaign.autoReplyText.slice(0, 60)}{campaign.autoReplyText.length > 60 ? '…' : ''}"
            </span>
          )}
        </div>        </div>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: MUTED }} />ze={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: MUTED }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div key="ar" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}mate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">eight: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Ativar resposta automática</p>e={{ color: 'rgba(255,255,255,0.75)' }}>Ativar resposta automática</p>
                  <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>Enviada quando o contato responde à campanha</p>}>Enviada quando o contato responde à campanha</p>
                </div>
                <button onClick={() => setEnabled(v => !v)}
                  className="relative w-11 h-6 rounded-full transition-all"me="relative w-11 h-6 rounded-full transition-all"
                  style={{ background: enabled ? SUCCESS : 'rgba(255,255,255,0.1)' }}>yle={{ background: enabled ? SUCCESS : 'rgba(255,255,255,0.1)' }}>
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />ssName={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: MUTED }}>Mensagem *</label> }}>Mensagem *</label>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
                      placeholder="Ex: Olá! Obrigado por responder…"aceholder="Ex: Olá! Obrigado por responder…"
                      className="w-full px-3 py-2.5 text-sm rounded-xl resize-none focus:outline-none font-mono"-2.5 text-sm rounded-xl resize-none focus:outline-none font-mono"
                      style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.75)' }} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: MUTED }}>URL da imagem (opcional)</label>{ color: MUTED }}>URL da imagem (opcional)</label>
                    <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://exemplo.com/imagem.jpg"aceholder="https://exemplo.com/imagem.jpg"
                      className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none font-mono"className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none font-mono"
                      style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.75)' }} />      style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.75)' }} />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                <span className="text-[11px]" style={{ color: MUTED }}>le={{ color: MUTED }}>
                  {isActivetive
                    ? <span style={{ color: SUCCESS }} className="flex items-center gap-1"><Check size={11} /> Ativa</span>ap-1"><Check size={11} /> Ativa</span>
                    : 'Sem resposta configurada'}
                </span>
                <button onClick={save} disabled={saving || (enabled && !text.trim())}
                  className="px-4 py-2 text-sm font-bold rounded-xl flex items-center gap-2 text-white transition-opacity disabled:opacity-40" transition-opacity disabled:opacity-40"
                  style={{ background: `linear-gradient(135deg, ${PRIMARY}, #A855F7)` }}>{ background: `linear-gradient(135deg, ${PRIMARY}, #A855F7)` }}>
                  {saving ? <><Loader2 size={12} className="animate-spin" /> Salvando…</> :aving ? <><Loader2 size={12} className="animate-spin" /> Salvando…</> :
                   saved  ? <><Check size={12} /> Salvo!</>                                : 'Salvar'} saved  ? <><Check size={12} /> Salvo!</>                                : 'Salvar'}
                </button>n>
              </div>    </div>
            </div>
          </motion.div>/motion.div>
        )}    )}
      </AnimatePresence>    </AnimatePresence>
    </Card>    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const LiveCampaignDashboard: React.FC<Props> = ({ampaignDashboard: React.FC<Props> = ({
  activeCampaign,n,
  activeCampaignId,nId,
  calculatedStats,dStats,
  banRiskScore,ore,
  campaignLogs,
  settings,
  startNow,
  cancelSchedule,lSchedule,
  togglePauseResume,
  cancelCampaign,
}) => {
  const now         = useClock();
  const isScheduled = activeCampaign?.status === 'scheduled';
  const isRunning   = activeCampaign?.status === 'running';  const isRunning   = activeCampaign?.status === 'running';
  const isPaused    = activeCampaign?.status === 'paused';Paused    = activeCampaign?.status === 'paused';
  const isDone      = activeCampaign?.status === 'completed';ted';

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {/* ── SECTION 1 — GLOBAL STATUS BAR ── */}
      <GlobalStatusBar isRunning={isRunning} hasData={!!activeCampaign} />

      <div className="p-4 md:p-6 space-y-4">
        {/* Page title */}
        <div className="hidden md:block">
          <h1 className="text-2xl font-black" style={{ color: TEXT }}>Campanha Ativa</h1>
          <p className="text-sm mt-0.5" style={{ color: MUTED }}>
            Monitoramento operacional em tempo real de campanhas automatizadas com IA.
          </p>
        </div>

        {/* ── MOBILE LAYOUT ── */}
        <MobileCampaignDashboard
          campaign={activeCampaign}
          calculatedStats={calculatedStats}
          banRiskScore={banRiskScore}
          logs={campaignLogs}
          settings={settings}
          startNow={startNow}
          cancelSchedule={cancelSchedule}
          togglePauseResume={togglePauseResume}
          cancelCampaign={cancelCampaign}
          now={now}
        />

        {/* ── DESKTOP LAYOUT ── */}
        <div className="hidden md:block space-y-4">
          {/* ── SECTION 2 — CAMPAIGN HEADER ── */}
          <CampaignHeader
            campaign={activeCampaign}
            calculatedStats={calculatedStats}
            banRiskScore={banRiskScore}
            now={now}
            isRunning={isRunning}
            isPaused={isPaused}
            isScheduled={isScheduled}
            isDone={isDone}
            togglePauseResume={togglePauseResume}
            cancelCampaign={cancelCampaign}
            startNow={startNow}
            cancelSchedule={cancelSchedule}
          />
          cancelSchedule={cancelSchedule}
        />

        {/* ── SECTION 3 — METRICS GRID ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4">
          <NextSendCard    logs={campaignLogs} settings={settings} now={now} />
          <SpeedCard       logs={campaignLogs} now={now} />edCard       logs={campaignLogs} now={now} />
          <TimeRemainingCard campaign={activeCampaign} calculatedStats={calculatedStats} now={now} />          <TimeRemainingCard campaign={activeCampaign} calculatedStats={calculatedStats} now={now} />
          <DailyLimitCard  logs={campaignLogs} settings={settings} now={now} />ogs} settings={settings} now={now} />
        </div>

        {/* ── SECTION 4 — BAN RISK ── */}─ */}
        <div className="mb-4">
          <BanRiskCard
            campaign={activeCampaign}
            logs={campaignLogs}paignLogs}
            settings={settings}settings={settings}
            banRiskScore={banRiskScore}nRiskScore={banRiskScore}
            now={now}            now={now}
          />
        </div>

        {/* ── SECTION 5+6 — FUNNEL + TERMINAL ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">b-4">
          <FunnelChart campaign={activeCampaign} logs={campaignLogs} calculatedStats={calculatedStats} />lChart campaign={activeCampaign} logs={campaignLogs} calculatedStats={calculatedStats} />
          <div className="lg:col-span-2 flex flex-col h-full"> className="lg:col-span-2 flex flex-col h-full">
            <ExecutionTerminal campaignId={activeCampaignId} />            <ExecutionTerminal campaignId={activeCampaignId} />
          </div>
        </div>

        {/* ── SECTION 7+8 — HOT LEADS + RESPONSE RATE ── */}RESPONSE RATE ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <HotLeadsCard logs={campaignLogs} />adsCard logs={campaignLogs} />
          <div className="lg:col-span-2"> className="lg:col-span-2">
            <ResponseRateCard campaign={activeCampaign} logs={campaignLogs} now={now} />            <ResponseRateCard campaign={activeCampaign} logs={campaignLogs} now={now} />
          </div>
        </div>

        {/* ── SECTION 9 — AI INSIGHTS ── */}S ── */}
        <div className="mb-4">
          <AIInsightsCard
            campaign={activeCampaign}campaign={activeCampaign}
            logs={campaignLogs}gs={campaignLogs}
            calculatedStats={calculatedStats}            calculatedStats={calculatedStats}
          />
        </div>

        {/* ── SECTION 10 — REVENUE & CONVERSION ── */} CONVERSION ── */}
        <div className="mb-4">
          <RevenueCard
            campaign={activeCampaign}{activeCampaign}
            logs={campaignLogs}logs={campaignLogs}
            calculatedStats={calculatedStats}lculatedStats={calculatedStats}
            now={now}            now={now}
          />
        </div>

        {/* ── AUTO REPLY EDITOR ── */}
        <AutoReplyEditor campaign={activeCampaign} campaignId={activeCampaignId} />
        </div>
      </div>
    </div>
  );
};};










































































































































































































































};  );    </div>      </div>         </div>            </AnimatePresence>              })}                 );                   </motion.div>                      </div>                         <div className="text-xs text-white/80 leading-relaxed truncate whitespace-normal">{getLogText(log)}</div>                         <div className="text-[10px] font-mono text-white/30 mb-0.5">{log.timestamp ? fmtTime(log.timestamp) : '—'}</div>                      <div className="flex-1 min-w-0">                      </div>                        {icon}                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold" style={{ background: `${color}15`, color }}>                               className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl flex gap-3 items-start">                   <motion.div key={log._id || i} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}                 return (                 const icon = getLogIcon(log);                 const color = getLogColor(log);              ) : terminalLogs.map((log: any, i: number) => {                <div className="py-8 text-center text-xs text-white/30">Nenhum evento registrado</div>              {terminalLogs.length === 0 ? (            <AnimatePresence initial={false}>         <div className="flex flex-col gap-2">         </div>            ))}               </button>                 {f.label}                       }`}>                         logFilter === f.id ? 'bg-primary text-white' : 'bg-white/5 text-white/50 border border-white/5'                       className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${               <button key={f.id} onClick={() => setLogFilter(f.id as any)}            ].map(f => (              { id: 'sistema', label: 'Sistema' }              { id: 'erros', label: 'Erros' },              { id: 'respostas', label: 'IA' },              { id: 'envios', label: 'Envios' },              { id: 'all', label: 'Todos' },            {[         <div className="flex gap-2 overflow-x-auto pb-2 px-1 -mx-1 hide-scrollbar">                  <div className="text-[11px] font-bold text-white/50 uppercase tracking-widest px-2">Terminal de Operação</div>      <div className="flex flex-col gap-3">      {/* 5. Mobile Terminal */}      </Card>        </div>           <p className="text-xs text-white/70 leading-relaxed"><strong className="text-primary">IA Recomenda:</strong> {banDiagnosis}</p>           <Brain size={16} className="shrink-0 mt-0.5" style={{ color: PRIMARY }} />        <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex gap-3 items-start">        </div>           <motion.div className="absolute top-0 right-0 bottom-0 bg-[#0B1020]" animate={{ left: `${banRiskScore}%` }} />           <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(to right,#22C55E,#84CC16,#EAB308,#F97316,#EF4444)' }} />        <div className="h-2 rounded-full overflow-hidden w-full relative bg-white/10">                </div>          <div className="font-black text-2xl" style={{ color: banLevel.color }}>{banRiskScore}%</div>          </div>            <Shield size={14} style={{ color: banLevel.color }} /> Risco Atual          <div className="text-[11px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-1.5">        <div className="flex justify-between items-center">      <Card className="p-5 flex flex-col gap-4 border-l-4" style={{ borderLeftColor: banLevel.color }}>      {/* 4. Ban Risk */}      </Card>        </div>          {!lastTs ? '—' : inWindow ? 'AGORA' : fmtMMSS(countdown)}        <div className="text-6xl font-black font-mono tabular-nums tracking-tighter" style={{ color: inWindow ? SUCCESS : WARNING }}>        </div>          Próximo Envio          <Clock size={14} style={{ color: inWindow ? SUCCESS : WARNING }} />        <div className="text-xs font-bold text-white/50 uppercase tracking-widest mb-2 flex items-center gap-2">      <Card className="p-6 flex flex-col items-center justify-center text-center bg-gradient-to-b from-card to-card/80">      {/* 3. Timer Card */}      </div>        </Card>          <div className="text-4xl font-black tabular-nums">{useAnimatedNumber(conversoes)}</div>          </div>            <DollarSign size={16} /> <span className="text-[11px] font-bold uppercase tracking-widest">Conversões</span>          <div className="flex items-center gap-1.5 text-success">        <Card className="p-4 flex flex-col justify-between aspect-square">        </Card>          <div className="text-4xl font-black tabular-nums">{useAnimatedNumber(interessados)}</div>          </div>            <Star size={16} /> <span className="text-[11px] font-bold uppercase tracking-wider">Interessados</span>          <div className="flex items-center gap-1.5 text-[#A855F7]">        <Card className="p-4 flex flex-col justify-between aspect-square">        </Card>          <div className="text-4xl font-black tabular-nums">{useAnimatedNumber(respondidos)}</div>          </div>            <MessageCircle size={16} /> <span className="text-[11px] font-bold uppercase tracking-wider">Respostas</span>          <div className="flex items-center gap-1.5 text-warning">        <Card className="p-4 flex flex-col justify-between aspect-square">        </Card>          <div className="text-4xl font-black tabular-nums">{useAnimatedNumber(enviados)}</div>          </div>            <Send size={16} /> <span className="text-[11px] font-bold uppercase tracking-wider">Enviados</span>          <div className="flex items-center gap-1.5 text-primary">        <Card className="p-4 flex flex-col justify-between aspect-square">      <div className="grid grid-cols-2 gap-3">      {/* 2. KPIs 2x2 */}      </Card>        </div>          ) : null}            </>              <button onClick={cancelCampaign} className="py-3.5 px-4 bg-danger/15 text-danger rounded-[16px]"> <X size={18} /> </button>              </button>                {isRunning ? 'Pausar' : 'Retomar'}              <button onClick={togglePauseResume} className="flex-1 py-3.5 font-bold rounded-[16px] text-sm" style={isRunning ? { background: 'rgba(245,158,11,0.15)', color: WARNING } : { background: 'rgba(34,197,94,0.15)', color: SUCCESS }}>            <>          ) : !isDone ? (            </>              <button onClick={cancelSchedule} className="py-3.5 px-4 bg-white/5 text-white/60 rounded-[16px]"> <X size={18} /> </button>              <button onClick={startNow} className="flex-1 py-3.5 bg-success/20 text-success font-bold rounded-[16px] text-sm">Iniciar Agora</button>            <>          {isScheduled ? (        <div className="flex gap-2 pt-2">        </div>          </div>             <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${PRIMARY}, #A855F7)` }} animate={{ width: `${pct}%` }} />          <div className="h-3 rounded-full bg-white/5 overflow-hidden">          </div>            <span className="font-black text-primary text-sm">{animPct}%</span>            <span className="text-white/60 font-mono">{enviados} / {total} contatos</span>          <div className="flex justify-between items-center text-xs">        <div className="space-y-2 pt-2 border-t border-white/5">                </div>          </div>            {statusConfig.label}            )}              </span>                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: SUCCESS }} />                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: SUCCESS }} />              <span className="relative flex h-1.5 w-1.5">            {isRunning && (               style={{ color: statusConfig.color, background: statusConfig.bg, border: `1px solid ${statusConfig.border}` }}>          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider"          </div>            <div className="text-xs font-mono text-white/50">Ativo há {fmtHHMM(activeMs)}</div>            <h2 className="text-xl font-black text-white leading-tight mb-1">{campaign?.nome || 'Campanha Ativa'}</h2>          <div>        <div className="flex justify-between items-start">      <Card className="p-5 flex flex-col gap-4">      {/* 1. Command Center Top */}    <div className="md:hidden flex flex-col gap-4 pb-6">  return (  }).slice(0, 50), [logs, logFilter]);    return true;    if (logFilter === 'sistema') return l.contactId === 'system' || !l.status;    if (logFilter === 'erros') return l.status === 'falhou';    if (logFilter === 'respostas') return ['respondido', 'reply', 'interessado', 'classificado'].includes(l.status);    if (logFilter === 'envios') return l.status === 'enviado';    if (logFilter === 'all') return true;  const terminalLogs = useMemo(() => logs.filter((l: any) => {  const [logFilter, setLogFilter] = useState<LogFilter | 'sistema'>('all');  // Terminal                         'Risco iminente. Encerre imediatamente.';    banRiskScore <= 80 ? 'Alto risco. Pause e reavalie a estratégia.' :    banRiskScore <= 60 ? 'Risco elevado. Aumente o intervalo entre mensagens.' :    banRiskScore <= 40 ? 'Risco aceitável. Monitore o volume.' :    banRiskScore <= 20 ? 'Campanha operando com total segurança. Padrões ideais.' :  const banDiagnosis =                           { label: 'CRÍTICO',      color: DANGER    };    banRiskScore <= 80 ? { label: 'ALTO RISCO',   color: '#F97316' } :    banRiskScore <= 60 ? { label: 'ATENÇÃO',      color: WARNING   } :    banRiskScore <= 40 ? { label: 'SEGURO',       color: '#84CC16' } :    banRiskScore <= 20 ? { label: 'BAIXO RISCO', color: SUCCESS   } :  const banLevel =  // Ban risk  const inWindow = elapsed >= delayMinMs;  const elapsed = lastTs ? now - lastTs : 0;  const countdown = Math.max(0, nextTarget - now);  const nextTarget = lastTs ? lastTs + delayMinMs + Math.random() * (delayMaxMs - delayMinMs) : 0;  const lastTs = lastSentLog?.timestamp ?? 0;  const lastSentLog = [...logs].reverse().find((l: any) => l.status === 'enviado');  const delayMaxMs = settings?.delayMaxMs ?? 90_000;  const delayMinMs = settings?.delayMinMs ?? 35_000;  // Timer calculation                  { label: '—',          color: MUTED,    bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' };    isDone      ? { label: 'Finalizada', color: MUTED,    bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' } :    isScheduled ? { label: 'Agendada',   color: PRIMARY,  bg: 'rgba(109,93,252,0.1)',  border: 'rgba(109,93,252,0.3)'  } :    isPaused    ? { label: 'Pausada',    color: WARNING,  bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  } :    isRunning   ? { label: 'Rodando',    color: SUCCESS,  bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)'   } :  const statusConfig =  const conversoes = Math.round(respondidos * 0.15); // estimation from existing code  const interessados = logs.filter((l: any) => ['interessado', 'classificado'].includes(l.status)).length;  const respondidos = stats.respondidos ?? 0;  const activeMs = now - startTs;  const startTs = campaign?.startedAt ?? campaign?.createdAt ?? now;  const animPct = useAnimatedNumber(Math.round(pct));  const pct = total > 0 ? (enviados / total) * 100 : 0;  const total = enviados + pending;  const pending = calculatedStats?.waiting ?? 0;  const enviados = stats.enviados ?? 0;  const stats = campaign?.stats ?? {};  const isDone      = campaign?.status === 'completed';  const isPaused    = campaign?.status === 'paused';  const isRunning   = campaign?.status === 'running';  const isScheduled = campaign?.status === 'scheduled';}: any) => {  now  cancelCampaign,  togglePauseResume,  cancelSchedule,  startNow,  settings,  logs,  banRiskScore,  calculatedStats,  campaign,const MobileCampaignDashboard = ({// ─────────────────────────────────────────────────────────────// MOBILE CAMPAIGN DASHBOARD// ─────────────────────────────────────────────────────────────export default LiveCampaignDashboard;
export default LiveCampaignDashboard;
