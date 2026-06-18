import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Terminal, Search, Pause, Play, Download, ChevronDown, Activity, AlertCircle, AlertTriangle, Info, Bug, ChevronRight, Wifi, WifiOff } from 'lucide-react';

interface SystemLog {
  id: string;
  timestamp: any;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  tag: string;
  message: string;
  metadata?: any;
}

// Terminal-style level configs
const LEVEL_CONFIG = {
  INFO: {
    label: 'INFO',
    textColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/30',
    lineColor: 'border-l-cyan-500/30',
    icon: Info,
    prefix: '●',
  },
  WARN: {
    label: 'WARN',
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
    lineColor: 'border-l-amber-500/60',
    icon: AlertTriangle,
    prefix: '▲',
  },
  ERROR: {
    label: 'ERR!',
    textColor: 'text-red-400',
    bgColor: 'bg-red-500/15 border-red-500/40',
    lineColor: 'border-l-red-500',
    icon: AlertCircle,
    prefix: '✖',
  },
  DEBUG: {
    label: 'DEBG',
    textColor: 'text-zinc-500',
    bgColor: 'bg-zinc-800/30 border-zinc-700/30',
    lineColor: 'border-l-zinc-700/30',
    icon: Bug,
    prefix: '·',
  },
} as const;

const TAG_COLORS: Record<string, string> = {
  SDR: 'text-purple-400 bg-purple-500/10',
  SDR_ENGINE: 'text-purple-400 bg-purple-500/10',
  WEBHOOK: 'text-emerald-400 bg-emerald-500/10',
  AI: 'text-blue-400 bg-blue-500/10',
  DATABASE: 'text-orange-400 bg-orange-500/10',
  EVOLUTION: 'text-teal-400 bg-teal-500/10',
  SYSTEM: 'text-zinc-400 bg-zinc-700/30',
  MEDIA: 'text-pink-400 bg-pink-500/10',
  STORAGE: 'text-yellow-400 bg-yellow-500/10',
  PREVIEW: 'text-indigo-400 bg-indigo-500/10',
};

const LEVELS = ['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const;

function MetadataPanel({ metadata }: { metadata: any }) {
  let formatted: string;
  try {
    formatted = JSON.stringify(metadata, null, 2);
  } catch {
    formatted = String(metadata);
  }
  return (
    <pre className="mt-1 ml-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-[11px] text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
      {formatted}
    </pre>
  );
}

function LogRow({ log }: { log: SystemLog }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.DEBUG;
  const Icon = cfg.icon;
  const tagStyle = TAG_COLORS[log.tag] ?? 'text-zinc-400 bg-zinc-700/30';

  const formatTimestamp = (ts: any) => {
    if (!ts) return '--:--:--';
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour12: false });
    }
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  };

  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <div className={`border-l-2 ${cfg.lineColor} pl-2 group`}>
      <div
        className={`flex gap-2 items-start -ml-2 pl-2 py-0.5 rounded-r transition-colors ${hasMetadata ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
        onClick={() => hasMetadata && setExpanded(e => !e)}
      >
        {/* Timestamp */}
        <span className="text-zinc-600 shrink-0 select-none tabular-nums text-[11px] mt-0.5 w-[5.5rem]">
          {formatTimestamp(log.timestamp)}
        </span>

        {/* Level badge */}
        <span className={`shrink-0 inline-flex items-center gap-0.5 font-bold text-[10px] px-1.5 py-0.5 rounded border ${cfg.bgColor} ${cfg.textColor} leading-none`}>
          <Icon size={9} />
          {cfg.label}
        </span>

        {/* Tag */}
        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${tagStyle} leading-none`}>
          {log.tag}
        </span>

        {/* Message */}
        <span className={`flex-1 text-[12px] break-all leading-snug ${log.level === 'ERROR' ? 'text-red-300' : log.level === 'WARN' ? 'text-amber-200' : 'text-zinc-300'}`}>
          {log.message}
        </span>

        {/* Expand indicator */}
        {hasMetadata && (
          <ChevronRight
            size={12}
            className={`shrink-0 text-zinc-600 mt-0.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        )}
      </div>

      {expanded && hasMetadata && <MetadataPanel metadata={log.metadata} />}
    </div>
  );
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setLevelFilter] = useState<string>('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPaused) return;

    setConnError(null);

    const q = query(
      collection(db, 'system_logs'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setIsConnected(true);
        setConnError(null);
        const newLogs = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SystemLog[];
        setLogs(newLogs.reverse());
      },
      (err) => {
        setIsConnected(false);
        setConnError(err.message || 'Erro ao conectar ao Firestore');
      }
    );

    return unsub;
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term ||
      log.message.toLowerCase().includes(term) ||
      log.tag.toLowerCase().includes(term);
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    return matchesSearch && matchesLevel;
  });

  const counts = logs.reduce((acc, l) => {
    acc[l.level] = (acc[l.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleDownload = () => {
    const lines = filteredLogs.map(l => {
      const ts = l.timestamp instanceof Timestamp
        ? l.timestamp.toDate().toISOString()
        : new Date(l.timestamp).toISOString();
      const meta = l.metadata ? ' | ' + JSON.stringify(l.metadata) : '';
      return `[${ts}] [${l.level}] [${l.tag}] ${l.message}${meta}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().slice(0, 19)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg border border-zinc-700">
            <Terminal size={18} className="text-zinc-300" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">Logs do Sistema</h1>
            <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
              {isPaused ? (
                <><Pause size={9} /> Pausado</>
              ) : isConnected ? (
                <><Wifi size={9} className="text-emerald-500" /><Activity size={9} className="animate-pulse text-emerald-500" /> Tempo real</>
              ) : connError ? (
                <><WifiOff size={9} className="text-red-400" /> Sem conexão</>
              ) : (
                <><Activity size={9} className="animate-pulse text-zinc-500" /> Conectando...</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" size={12} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-black border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-zinc-600 w-40 transition-all"
            />
          </div>

          {/* Level filters */}
          <div className="flex gap-0.5 bg-black p-0.5 rounded-lg border border-zinc-800">
            {LEVELS.map(lvl => {
              const cfg = lvl !== 'ALL' ? LEVEL_CONFIG[lvl] : null;
              const active = filterLevel === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    active
                      ? cfg ? `${cfg.bgColor} ${cfg.textColor}` : 'bg-zinc-800 text-white'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {lvl}
                  {lvl !== 'ALL' && counts[lvl] ? (
                    <span className="ml-1 opacity-60">{counts[lvl]}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 border-l border-zinc-800 pl-2">
            <button
              onClick={() => setIsPaused(p => !p)}
              className={`p-1.5 rounded-lg transition-colors ${isPaused ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-amber-400 hover:bg-amber-500/10'}`}
              title={isPaused ? 'Retomar' : 'Pausar'}
            >
              {isPaused ? <Play size={15} /> : <Pause size={15} />}
            </button>
            <button
              onClick={() => setAutoScroll(a => !a)}
              className={`p-1.5 rounded-lg transition-colors ${autoScroll ? 'text-zinc-300 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-800'}`}
              title="Auto-scroll"
            >
              <ChevronDown size={15} className={autoScroll ? 'translate-y-px' : ''} />
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              title="Download"
            >
              <Download size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {connError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
          <AlertCircle size={14} className="shrink-0" />
          <span><strong>Erro de conexão:</strong> {connError}</span>
        </div>
      )}

      {/* Log console */}
      <div className="flex-1 bg-black border border-zinc-800/80 rounded-2xl overflow-y-auto p-4 font-mono text-[12px] leading-relaxed">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-700 italic text-sm gap-2">
            <Terminal size={28} className="opacity-20" />
            {connError
              ? 'Não foi possível carregar os logs.'
              : logs.length === 0 && isConnected
              ? 'Nenhum log registrado ainda.'
              : 'Nenhum log corresponde aos filtros.'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map(log => (
              <LogRow key={log.id} log={log} />
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-1 text-[10px] text-zinc-600 uppercase font-bold tracking-widest">
        <div className="flex gap-4">
          <span>Total: {logs.length}</span>
          {searchTerm || filterLevel !== 'ALL' ? <span>Filtrados: {filteredLogs.length}</span> : null}
          {counts.ERROR ? <span className="text-red-500/70">Erros: {counts.ERROR}</span> : null}
          {counts.WARN ? <span className="text-amber-500/70">Avisos: {counts.WARN}</span> : null}
        </div>
        <span>crm-3dfans · system_logs</span>
      </div>
    </div>
  );
}
