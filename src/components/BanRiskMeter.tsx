import React, { useState, useMemo, useEffect } from 'react';
import { Shield, Zap, Hash, Users, Image as ImgIcon, Type, Sun, ThumbsUp, AlertTriangle, TrendingDown, Info } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BanRiskMeterProps {
  defaultVolume?: number;
  defaultIntervalSeconds?: number;
  defaultColdPct?: number;
  defaultMediaPct?: number;
  defaultVariationPct?: number;
}

interface Factors {
  speedScore: number;
  speedMph: number;
  volumeScore: number;
  coldScore: number;
  replyBonus: number;
  mediaScore: number;
  variationScore: number;
  warmupBonus: number;
  total: number;
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

function computeRisk(
  volume: number,
  intervalSec: number,
  cold: number,
  responseRate: number,
  mediaPct: number,
  variationPct: number,
  warmupDays: number,
): Factors {
  const mph = intervalSec > 0 ? 3600 / intervalSec : 9999;
  const speedScore = mph > 3600 ? 35 : mph > 1800 ? 25 : mph > 720 ? 15 : mph > 360 ? 7 : 0;
  const volumeScore = volume > 5000 ? 20 : volume > 2000 ? 13 : volume > 500 ? 6 : 0;
  const coldScore    = +(cold * 0.20).toFixed(1);
  const replyBonus   = +(responseRate * 0.18).toFixed(1);
  const mediaScore   = +(mediaPct * 0.10).toFixed(1);
  const variationScore = +(variationPct * 0.12).toFixed(1);
  const warmupBonus  = +Math.min(warmupDays * 0.5, 20).toFixed(1);
  const sum = speedScore + volumeScore + coldScore - replyBonus + mediaScore + variationScore - warmupBonus;
  return {
    speedScore, speedMph: Math.round(mph),
    volumeScore, coldScore, replyBonus, mediaScore, variationScore, warmupBonus,
    total: Math.max(0, Math.min(100, Math.round(sum))),
  };
}

const ZONES = [
  { from: 0,  to: 30,  label: 'BAIXO',    color: '#7ab52a', desc: 'Campanha dentro dos limites seguros.' },
  { from: 30, to: 55,  label: 'MODERADO', color: '#EF9F27', desc: 'Monitore reports e engajamento de perto.' },
  { from: 55, to: 75,  label: 'ALTO',     color: '#D85A30', desc: 'Risco significativo de ban temporário.' },
  { from: 75, to: 101, label: 'CRÍTICO',  color: '#c43d3d', desc: 'Ban permanente muito provável.' },
];

function getZone(score: number) {
  return ZONES.find(z => score < z.to) ?? ZONES[3];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SliderRowProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
  /** invert: lower value = MORE risky (shown red when low) */
  invert?: boolean;
}

const SliderRow = ({ icon, label, tooltip, value, onChange, color, invert }: SliderRowProps) => {
  const dangerous = invert ? value < 15 : value > 70;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-44 shrink-0">
        <span className="text-zinc-500" title={tooltip}>{icon}</span>
        <span className="text-xs text-zinc-400 font-medium leading-tight">{label}</span>
        <span title={tooltip} className="text-zinc-600 cursor-help"><Info size={10} /></span>
      </div>
      <input
        type="range" min={0} max={100} step={1}
        value={value}
        onChange={e => onChange(+e.target.value)}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: color }}
      />
      <span className={`w-10 text-right text-xs font-bold tabular-nums ${dangerous ? 'text-rose-400' : 'text-zinc-300'}`}>
        {value}%
      </span>
    </div>
  );
};

interface NumberInputProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

const NumberInput = ({ icon, label, value, onChange, min, max, step = 1, unit }: NumberInputProps) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
      {icon} {label}
    </label>
    <div className="flex items-center gap-1">
      <input
        type="number" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, +e.target.value || min)))}
        className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      />
      {unit && <span className="text-xs text-zinc-500 shrink-0">{unit}</span>}
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const BanRiskMeter: React.FC<BanRiskMeterProps> = ({
  defaultVolume = 500,
  defaultIntervalSeconds = 30,
  defaultColdPct = 30,
  defaultMediaPct = 0,
  defaultVariationPct = 20,
}) => {
  const [volume, setVolume]           = useState(defaultVolume);
  const [intervalSec, setIntervalSec] = useState(defaultIntervalSeconds);
  const [cold, setCold]               = useState(defaultColdPct);
  const [responseRate, setResponseRate] = useState(5);
  const [mediaPct, setMediaPct]       = useState(defaultMediaPct);
  const [variationPct, setVariationPct] = useState(defaultVariationPct);
  const [warmupDays, setWarmupDays]   = useState(7);

  // Sync dynamic props (audience / settings) without resetting user-edited sliders
  useEffect(() => setVolume(defaultVolume), [defaultVolume]);
  useEffect(() => setIntervalSec(defaultIntervalSeconds), [defaultIntervalSeconds]);
  useEffect(() => setMediaPct(defaultMediaPct), [defaultMediaPct]);

  const f     = useMemo(() => computeRisk(volume, intervalSec, cold, responseRate, mediaPct, variationPct, warmupDays),
                        [volume, intervalSec, cold, responseRate, mediaPct, variationPct, warmupDays]);
  const zone  = getZone(f.total);

  // ── Recommendations ──
  const recommendations = useMemo(() => {
    if (f.total < 55) return [];
    const items: { score: number; text: string }[] = [
      {
        score: f.speedScore,
        text: f.speedScore >= 25
          ? `Reduza a velocidade para menos de 720 msgs/h — aumente o intervalo para ≥5 seg. Atual: ${f.speedMph.toLocaleString()}/h.`
          : `Considere aumentar o intervalo entre envios. Velocidade atual: ${f.speedMph.toLocaleString()}/h.`,
      },
      {
        score: f.volumeScore,
        text: 'Divida a campanha em lotes diários de até 500 mensagens para reduzir pressão sobre a conta.',
      },
      {
        score: f.coldScore,
        text: 'Priorize contatos com opt-in ativo. Contatos frios têm alto risco de marcar como spam.',
      },
      {
        score: f.variationScore,
        text: 'Use {{nome}} e {{produto}} para personalizar cada mensagem. Textos idênticos são detectados como spam.',
      },
      {
        score: f.mediaScore,
        text: 'Evite enviar mídia/links na primeira mensagem. Comece com texto puro.',
      },
      {
        score: f.warmupBonus < 5 ? 8 : 0,
        text: `Aqueça a conta por mais dias antes de campanhas grandes (atual: ${warmupDays} dias; ideal: 14+).`,
      },
      {
        score: f.replyBonus < 3 ? 6 : 0,
        text: 'Trabalhe o engajamento: mensagens com alta taxa de resposta protegem a conta contra detecção.',
      },
    ];
    return items
      .filter(i => i.score > 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(i => i.text);
  }, [f, warmupDays]);

  // ── Factor table rows ──
  const factorRows = [
    { label: 'Velocidade',        icon: <Zap size={12} />,     value: f.speedScore,     positive: true,  detail: `${f.speedMph.toLocaleString()} msgs/h` },
    { label: 'Volume',            icon: <Hash size={12} />,    value: f.volumeScore,    positive: true,  detail: `${volume.toLocaleString()} msgs` },
    { label: 'Contatos frios',    icon: <Users size={12} />,   value: f.coldScore,      positive: true,  detail: `${cold}%` },
    { label: 'Mídia/Links',       icon: <ImgIcon size={12} />, value: f.mediaScore,     positive: true,  detail: `${mediaPct}%` },
    { label: 'Sem variação',      icon: <Type size={12} />,    value: f.variationScore, positive: true,  detail: `${variationPct}%` },
    { label: 'Taxa de resposta',  icon: <ThumbsUp size={12} />,value: f.replyBonus,     positive: false, detail: `${responseRate}%` },
    { label: 'Aquecimento',       icon: <Sun size={12} />,     value: f.warmupBonus,    positive: false, detail: `${warmupDays} dias` },
  ];

  const scorePercent = Math.max(0.5, Math.min(99.5, f.total));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-indigo-400" />
          <span className="text-sm font-bold text-white">Calculadora de Risco de Banimento</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Pré-disparo · Evolution API</span>
      </div>

      {/* Parameters */}
      <div className="space-y-4 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Parâmetros do Disparo</p>

        {/* Number inputs */}
        <div className="grid grid-cols-3 gap-3">
          <NumberInput icon={<Hash size={10} />}   label="Volume"    value={volume}      onChange={setVolume}      min={1}  max={100000} unit="msgs" />
          <NumberInput icon={<Zap size={10} />}    label="Intervalo" value={intervalSec} onChange={setIntervalSec} min={1}  max={3600}   unit="seg"  />
          <NumberInput icon={<Sun size={10} />}    label="Aquecimento" value={warmupDays} onChange={setWarmupDays} min={0}  max={90}     unit="dias" />
        </div>

        {/* Percentage sliders */}
        <div className="space-y-3 pt-1">
          <SliderRow
            icon={<Users size={13} />}   label="Contatos frios"          tooltip="% de contatos sem opt-in / desconhecidos"
            value={cold}       onChange={setCold}        color="#EF9F27" />
          <SliderRow
            icon={<ThumbsUp size={13} />} label="Taxa de resposta esperada" tooltip="Taxa de resposta real ou estimada da campanha (reduz o risco)"
            value={responseRate} onChange={setResponseRate} color="#7ab52a" invert />
          <SliderRow
            icon={<ImgIcon size={13} />} label="Mensagens com mídia/link"  tooltip="% de mensagens que contém imagem, vídeo ou link"
            value={mediaPct}   onChange={setMediaPct}    color="#D85A30" />
          <SliderRow
            icon={<Type size={13} />}    label="Textos idênticos (sem variação)" tooltip="% de mensagens com texto igual — 0% = totalmente personalizado"
            value={variationPct} onChange={setVariationPct} color="#c43d3d" />
        </div>
      </div>

      {/* ── Risk Meter ── */}
      <div className="space-y-3">
        {/* Score display */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-3xl font-black tabular-nums" style={{ color: zone.color }}>{f.total}%</span>
            <span className="ml-2 text-xs font-bold uppercase tracking-widest" style={{ color: zone.color }}>{zone.label}</span>
          </div>
          <span className="text-xs text-zinc-500 text-right max-w-[200px]">{zone.desc}</span>
        </div>

        {/* Gradient bar + pointer */}
        <div className="relative" style={{ paddingTop: '16px' }}>
          {/* Pointer triangle */}
          <div
            className="absolute z-10"
            style={{
              top: 0, left: `${scorePercent}%`,
              transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: `10px solid ${zone.color}`,
            }}
          />
          {/* Bar */}
          <div
            className="relative h-5 rounded-full overflow-hidden"
            style={{ background: 'linear-gradient(to right, #639922 0%, #EF9F27 30%, #D85A30 55%, #A32D2D 85%, #A32D2D 100%)' }}
          >
            {/* Zone tick marks */}
            {[30, 55, 75].map(pct => (
              <div key={pct} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${pct}%` }} />
            ))}
          </div>
          {/* Zone label row */}
          <div className="relative h-5 mt-1">
            {ZONES.map(z => (
              <span
                key={z.label}
                className="absolute text-[9px] font-bold uppercase tracking-widest"
                style={{
                  left: `${z.from + (z.to > 100 ? 25 : (z.to - z.from) / 2)}%`,
                  transform: z.from === 0 ? 'translateX(0)' : 'translateX(-50%)',
                  color: z.color,
                  opacity: 0.75,
                }}
              >
                {z.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Factors + Recommendations ── */}
      <div className={`grid gap-4 ${recommendations.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Factor breakdown */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Fatores Individuais</p>
          <div className="space-y-1.5">
            {factorRows.map(row => {
              const pts    = row.positive ? row.value : -row.value;
              const isGood = pts <= 0;
              return (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-zinc-500">{row.icon}
                    <span className="text-xs text-zinc-400">{row.label}</span>
                    <span className="text-[10px] text-zinc-600">({row.detail})</span>
                  </div>
                  <span className={`text-xs font-bold tabular-nums ${isGood ? 'text-emerald-400' : pts > 10 ? 'text-rose-400' : pts > 4 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {pts > 0 ? '+' : ''}{pts.toFixed(1)} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-rose-500/80 uppercase tracking-widest flex items-center gap-1">
              <AlertTriangle size={10} /> Recomendações
            </p>
            <ol className="space-y-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex gap-2 text-xs text-zinc-400 leading-relaxed">
                  <span className="shrink-0 font-bold text-rose-400/80">{i + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Healthy state message */}
        {recommendations.length === 0 && f.total < 55 && (
          <div className="flex items-center gap-2 text-xs text-emerald-400/70 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
            <TrendingDown size={14} className="shrink-0" />
            <span>Parâmetros dentro dos limites seguros. Prossiga com cautela e monitore as métricas em tempo real após o início.</span>
          </div>
        )}
      </div>
    </div>
  );
};
