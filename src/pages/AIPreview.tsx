import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Cpu, Zap, Star, Download, RefreshCw, Maximize2, ZoomIn, ZoomOut,
  CheckCircle2, Shirt, Scissors, Palette, Award, Shield, Clock, DollarSign,
  MessageSquare, Layers, Plus, Minus, Scan, Target, Activity,
  FlaskConical, Ruler, Globe, Watch, ChevronRight, Gift, Package,
  Type, Camera, Printer, Circle, X, Play, Eye, Wand2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type MiniType = 'realistic' | 'funko' | 'figure' | 'mascot';
type PaintLevel = 'standard' | 'professional' | 'collector';

// ─── Static Data ─────────────────────────────────────────────────────────────

const DETECTION_ITEMS = [
  { label: 'Face detected', icon: Scan, delay: 0 },
  { label: 'Pose recognized', icon: Activity, delay: 400 },
  { label: 'Clothing identified', icon: Shirt, delay: 800 },
  { label: 'Accessories identified', icon: Watch, delay: 1200 },
  { label: 'Background analyzed', icon: Camera, delay: 1600 },
  { label: 'Body reconstruction completed', icon: Layers, delay: 2000 },
  { label: 'Miniature composition completed', icon: Sparkles, delay: 2400 },
];

const SIMILARITY_SCORES = [
  { label: 'Facial Similarity', value: 95, color: '#3B82F6' },
  { label: 'Pose Accuracy', value: 97, color: '#06B6D4' },
  { label: 'Clothing Accuracy', value: 98, color: '#8B5CF6' },
  { label: 'Detail Level', value: 96, color: '#10B981' },
  { label: 'Printability', value: 99, color: '#F59E0B' },
];

const SPECS = [
  { icon: Layers, label: 'Style', value: 'Realistic' },
  { icon: Ruler, label: 'Estimated Height', value: '16 cm' },
  { icon: Target, label: 'Scale', value: '1:12' },
  { icon: FlaskConical, label: 'Material', value: 'Premium UV Resin' },
  { icon: Palette, label: 'Painting', value: 'Professional Hand Painted' },
  { icon: Circle, label: 'Base', value: 'Circular Premium Display' },
];

const EDIT_TOOLS = [
  { icon: Scan, label: 'Improve Face', color: '#3B82F6' },
  { icon: Target, label: 'Improve Similarity', color: '#06B6D4' },
  { icon: Shirt, label: 'Improve Clothing', color: '#8B5CF6' },
  { icon: Activity, label: 'Improve Pose', color: '#10B981' },
  { icon: Layers, label: 'Improve Details', color: '#F59E0B' },
  { icon: Scissors, label: 'Improve Hair', color: '#EC4899' },
  { icon: Camera, label: 'Change Background', color: '#6366F1' },
  { icon: Type, label: 'Add Name to Base', color: '#0EA5E9' },
  { icon: RefreshCw, label: 'Regenerate', color: '#F97316' },
];

const QUALITY_METRICS = [
  { label: 'Resin Compatibility', value: 98, color: '#3B82F6' },
  { label: 'Paint Detail Potential', value: 97, color: '#06B6D4' },
  { label: 'Facial Detail Preservation', value: 96, color: '#8B5CF6' },
  { label: 'Structural Stability', value: 99, color: '#10B981' },
  { label: 'Production Ready', value: 100, color: '#F59E0B' },
];

const VERSIONS = [
  { version: 'v1', time: '14:32', note: 'Initial generation', isCurrent: false },
  { version: 'v2', time: '14:38', note: 'Face improved', isCurrent: false },
  { version: 'v3', time: '14:45', note: 'Clothing refined', isCurrent: false },
  { version: 'v4', time: '14:51', note: 'Final details', isCurrent: true },
];

const ANALYTICS_DATA = [
  { label: 'Model Used', value: 'GPT-4o Vision', icon: Cpu },
  { label: 'Generation Time', value: '47 seconds', icon: Clock },
  { label: 'Processing Cost', value: '$0.0024', icon: DollarSign },
  { label: 'Tokens Used', value: '2,847', icon: Zap },
  { label: 'Status', value: 'Completed ✓', icon: CheckCircle2, highlight: true },
  { label: 'Resolution', value: '2048 × 2048px', icon: Maximize2 },
  { label: 'Confidence Score', value: '98.4%', icon: Award },
  { label: 'Provider', value: 'OpenAI + SD XL', icon: Globe },
];

const TESTIMONIALS = [
  {
    name: 'Marina Costa', location: 'São Paulo, SP', avatar: 'MC',
    text: 'Incrível! Minha miniatura ficou idêntica a mim. Meu marido adorou o presente de aniversário — ficou completamente impressionado com a semelhança!',
    tag: 'Realistic · 16cm',
    gradient: 'from-blue-600/20 to-violet-600/20',
  },
  {
    name: 'Rafael Souza', location: 'Rio de Janeiro, RJ', avatar: 'RS',
    text: 'A qualidade de impressão é absurda. Cada detalhe do rosto foi preservado com perfeição. Parece uma escultura profissional.',
    tag: 'Figure · 12cm',
    gradient: 'from-cyan-600/20 to-blue-600/20',
  },
  {
    name: 'Juliana Alves', location: 'Curitiba, PR', avatar: 'JA',
    text: 'Encomendei para presentear meu pai no Dia dos Pais. Ele ficou emocionado com a semelhança. Com certeza vou encomendar mais!',
    tag: 'Funko · 10cm',
    gradient: 'from-violet-600/20 to-pink-600/20',
  },
];

const BASE_PRICES: Record<MiniType, number> = { realistic: 399, funko: 299, figure: 349, mascot: 349 };
const PAINT_PRICES: Record<PaintLevel, number> = { standard: 0, professional: 99, collector: 199 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// ─── Sub-components ──────────────────────────────────────────────────────────

const CircularProgress = ({ value, color, label }: { value: number; color: string; label: string }) => {
  const [active, setActive] = useState(false);
  useEffect(() => { const t = setTimeout(() => setActive(true), 300); return () => clearTimeout(t); }, []);
  const r = 42; const circ = 2 * Math.PI * r;
  const dash = active ? (value / 100) * circ : 0;
  return (
    <div className="flex flex-col items-center gap-2.5">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 8px ${color}90)` }} />
        <text x="50" y="44" textAnchor="middle" fill="white" fontSize="17" fontWeight="900" fontFamily="system-ui, sans-serif">{value}</text>
        <text x="50" y="57" textAnchor="middle" fill={color} fontSize="8" fontWeight="700" fontFamily="system-ui, sans-serif">%</text>
        <text x="50" y="68" textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="6" fontWeight="600" fontFamily="system-ui, sans-serif">SCORE</text>
      </svg>
      <p className="text-[10px] font-black uppercase tracking-widest text-center leading-tight max-w-[80px]" style={{ color }}>{label}</p>
    </div>
  );
};

const QualityBar = ({ label, value, color, index }: { label: string; value: number; color: string; index: number }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(value), 200 + index * 150); return () => clearTimeout(t); }, [value, index]);
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-zinc-300">{label}</span>
        <span className="text-xs font-black tabular-nums" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}99, ${color})`, boxShadow: `0 0 10px ${color}60`, transitionDelay: `${index * 0.15}s` }} />
      </div>
    </div>
  );
};

const AnalyticsCard = ({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: React.ElementType; highlight?: boolean }) => (
  <div className={`bg-[rgba(255,255,255,0.03)] border rounded-xl p-4 flex items-start gap-3 transition-all duration-300 hover:bg-[rgba(255,255,255,0.06)] ${highlight ? 'border-emerald-500/30' : 'border-white/5 hover:border-white/10'}`}>
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${highlight ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-zinc-400'}`}>
      <Icon size={15} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">{label}</p>
      <p className={`text-sm font-black truncate ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
    </div>
  </div>
);

const ShowcaseCard = ({ title, subtitle, icon: Icon, gradient, accent, children }: { title: string; subtitle: string; icon: React.ElementType; gradient: string; accent: string; children: React.ReactNode }) => (
  <div className="group relative overflow-hidden rounded-2xl border border-white/8 bg-[rgba(255,255,255,0.03)] backdrop-blur-xl cursor-pointer hover:border-white/15 transition-all duration-500">
    <div className={`relative aspect-[4/3] overflow-hidden ${gradient}`}>
      {children}
      <div className="absolute inset-0 bg-gradient-to-t from-[#050B18] via-transparent to-transparent" />
      <div className="absolute top-3 left-3">
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-[rgba(5,11,24,0.8)] backdrop-blur-sm`} style={{ color: accent, borderColor: `${accent}30` }}>
          <Icon size={10} />
          Preview
        </div>
      </div>
    </div>
    <div className="p-4">
      <h4 className="text-sm font-black text-white mb-0.5">{title}</h4>
      <p className="text-xs text-zinc-500 font-medium">{subtitle}</p>
    </div>
  </div>
);

// ─── SVG Art Panels ───────────────────────────────────────────────────────────

const OriginalPhotoArt = () => (
  <svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <defs>
      <radialGradient id="bg-photo" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#5a3825" />
        <stop offset="100%" stopColor="#1a0f0a" />
      </radialGradient>
      <radialGradient id="skin" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stopColor="#e8a87c" />
        <stop offset="100%" stopColor="#c47a4a" />
      </radialGradient>
      <radialGradient id="face-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#e8a87c" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#e8a87c" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="300" height="400" fill="url(#bg-photo)" />
    {/* Soft studio vignette */}
    <radialGradient id="vignette" cx="50%" cy="50%" r="60%">
      <stop offset="60%" stopColor="transparent" />
      <stop offset="100%" stopColor="#0a0502" stopOpacity="0.9" />
    </radialGradient>
    <rect width="300" height="400" fill="url(#vignette)" />
    {/* Head glow */}
    <circle cx="150" cy="130" r="75" fill="url(#face-glow)" />
    {/* Neck */}
    <rect x="133" y="178" width="34" height="30" rx="8" fill="url(#skin)" />
    {/* Shoulders / shirt */}
    <path d="M70 200 Q90 185 133 188 L133 240 L70 250 Z" fill="#2d4a6e" />
    <path d="M230 200 Q210 185 167 188 L167 240 L230 250 Z" fill="#2d4a6e" />
    {/* Body */}
    <rect x="100" y="205" width="100" height="130" rx="12" fill="#2d4a6e" />
    {/* Arms */}
    <rect x="65" y="205" width="36" height="90" rx="14" fill="#2d4a6e" transform="rotate(-4 83 250)" />
    <rect x="199" y="205" width="36" height="90" rx="14" fill="#2d4a6e" transform="rotate(4 217 250)" />
    {/* Forearms / hands */}
    <rect x="66" y="278" width="32" height="28" rx="12" fill="url(#skin)" transform="rotate(-4 82 292)" />
    <rect x="202" y="278" width="32" height="28" rx="12" fill="url(#skin)" transform="rotate(4 218 292)" />
    {/* Head */}
    <ellipse cx="150" cy="128" rx="42" ry="48" fill="url(#skin)" />
    {/* Hair */}
    <ellipse cx="150" cy="96" rx="46" ry="28" fill="#2a1a0e" />
    <path d="M108 110 Q104 130 108 148 Q112 120 120 115" fill="#2a1a0e" />
    <path d="M192 110 Q196 130 192 148 Q188 120 180 115" fill="#2a1a0e" />
    {/* Eyes */}
    <ellipse cx="136" cy="130" rx="7" ry="5.5" fill="white" />
    <ellipse cx="164" cy="130" rx="7" ry="5.5" fill="white" />
    <circle cx="137" cy="130" r="3.5" fill="#3d2010" />
    <circle cx="165" cy="130" r="3.5" fill="#3d2010" />
    <circle cx="138" cy="129" r="1.2" fill="white" opacity="0.8" />
    <circle cx="166" cy="129" r="1.2" fill="white" opacity="0.8" />
    {/* Eyebrows */}
    <path d="M128 121 Q136 118 144 121" stroke="#2a1a0e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M156 121 Q164 118 172 121" stroke="#2a1a0e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    {/* Nose */}
    <path d="M148 133 Q144 144 148 148 Q150 150 152 148 Q156 144 152 133" stroke="#c07040" strokeWidth="1.2" fill="none" opacity="0.6" />
    {/* Mouth */}
    <path d="M139 158 Q150 165 161 158" stroke="#a05535" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M141 158 Q150 162 159 158" fill="#c06050" opacity="0.4" />
    {/* Ears */}
    <ellipse cx="108" cy="132" rx="8" ry="11" fill="url(#skin)" />
    <ellipse cx="192" cy="132" rx="8" ry="11" fill="url(#skin)" />
    {/* Shirt collar */}
    <path d="M133 188 L120 205 L150 200 L180 205 L167 188 L150 195 Z" fill="#3a5880" />
    {/* Photo grain overlay */}
    <rect width="300" height="400" fill="url(#bg-photo)" opacity="0.04" />
  </svg>
);

const MiniatureArt = () => (
  <svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <defs>
      <radialGradient id="bg-mini" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#0d1f3c" />
        <stop offset="100%" stopColor="#050B18" />
      </radialGradient>
      <radialGradient id="mini-glow" cx="50%" cy="40%" r="50%">
        <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="mini-glow2" cx="50%" cy="40%" r="30%">
        <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="resin-body" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#c8d8f0" />
        <stop offset="50%" stopColor="#a0b8e0" />
        <stop offset="100%" stopColor="#7090c8" />
      </linearGradient>
      <linearGradient id="resin-skin" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#d4c8b8" />
        <stop offset="100%" stopColor="#b8a898" />
      </linearGradient>
      <linearGradient id="base-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1e3a5f" />
        <stop offset="100%" stopColor="#0d1f3c" />
      </linearGradient>
    </defs>

    <rect width="300" height="400" fill="url(#bg-mini)" />
    {/* Studio grid floor */}
    {[...Array(8)].map((_, i) => (
      <line key={`h${i}`} x1="0" y1={320 + i * 12} x2="300" y2={320 + i * 12} stroke="#3B82F6" strokeWidth="0.3" opacity={0.15 - i * 0.015} />
    ))}
    {[...Array(12)].map((_, i) => {
      const x = i * 28; const ox = (x - 150) * 0.3;
      return <line key={`v${i}`} x1={x} y1="320" x2={150 + ox} y2="400" stroke="#3B82F6" strokeWidth="0.3" opacity="0.12" />;
    })}

    {/* Ambient glows */}
    <ellipse cx="150" cy="200" rx="130" ry="150" fill="url(#mini-glow)" />
    <ellipse cx="150" cy="140" rx="70" ry="90" fill="url(#mini-glow2)" />

    {/* Display base */}
    <ellipse cx="150" cy="348" rx="65" ry="12" fill="url(#base-grad)" stroke="#3B82F6" strokeWidth="1.2" />
    <ellipse cx="150" cy="342" rx="65" ry="10" fill="#1a3560" />
    <ellipse cx="150" cy="338" rx="60" ry="8" fill="#1e3a5f" stroke="#3B82F6" strokeWidth="0.5" opacity="0.7" />
    {/* Base text */}
    <text x="150" y="345" textAnchor="middle" fill="#3B82F6" fontSize="6.5" fontWeight="700" fontFamily="system-ui" opacity="0.8" letterSpacing="2">3DFANS</text>
    {/* Base glow */}
    <ellipse cx="150" cy="348" rx="68" ry="14" fill="none" stroke="#3B82F6" strokeWidth="0.5" opacity="0.4" />
    <ellipse cx="150" cy="348" rx="80" ry="18" fill="none" stroke="#06B6D4" strokeWidth="0.3" opacity="0.2" />

    {/* Legs */}
    <rect x="120" y="270" width="22" height="60" rx="9" fill="url(#resin-body)" />
    <rect x="158" y="270" width="22" height="60" rx="9" fill="url(#resin-body)" />
    {/* Leg edge highlight */}
    <rect x="120" y="270" width="5" height="60" rx="3" fill="white" opacity="0.15" />
    <rect x="158" y="270" width="5" height="60" rx="3" fill="white" opacity="0.15" />
    {/* Feet */}
    <ellipse cx="131" cy="330" rx="13" ry="6" fill="#7090c8" />
    <ellipse cx="169" cy="330" rx="13" ry="6" fill="#7090c8" />

    {/* Body */}
    <rect x="95" y="168" width="110" height="112" rx="16" fill="url(#resin-body)" />
    {/* Shirt detail */}
    <rect x="97" y="168" width="8" height="112" rx="4" fill="white" opacity="0.12" />
    {/* Collar V */}
    <path d="M130 175 L150 195 L170 175" stroke="white" strokeWidth="2" fill="none" opacity="0.3" strokeLinecap="round" />
    {/* Body edge lights */}
    <rect x="95" y="168" width="4" height="112" rx="2" fill="white" opacity="0.2" />

    {/* Arms */}
    <rect x="63" y="172" width="34" height="82" rx="14" fill="url(#resin-body)" transform="rotate(-5 80 213)" />
    <rect x="203" y="172" width="34" height="82" rx="14" fill="url(#resin-body)" transform="rotate(5 220 213)" />
    {/* Arm highlights */}
    <rect x="65" y="175" width="6" height="76" rx="3" fill="white" opacity="0.15" transform="rotate(-5 68 213)" />
    <rect x="205" y="175" width="6" height="76" rx="3" fill="white" opacity="0.15" transform="rotate(5 208 213)" />
    {/* Hands */}
    <ellipse cx="79" cy="256" rx="14" ry="10" fill="url(#resin-skin)" transform="rotate(-5 79 256)" />
    <ellipse cx="221" cy="256" rx="14" ry="10" fill="url(#resin-skin)" transform="rotate(5 221 256)" />

    {/* Neck */}
    <rect x="133" y="152" width="34" height="24" rx="8" fill="url(#resin-skin)" />

    {/* Head */}
    <ellipse cx="150" cy="120" rx="42" ry="46" fill="url(#resin-skin)" />
    {/* Head edge highlight */}
    <ellipse cx="138" cy="108" rx="20" ry="24" fill="white" opacity="0.08" />

    {/* Hair */}
    <ellipse cx="150" cy="86" rx="46" ry="26" fill="#2a2030" />
    <path d="M108 102 Q104 122 110 140 Q114 112 124 107" fill="#2a2030" />
    <path d="M192 102 Q196 122 190 140 Q186 112 176 107" fill="#2a2030" />
    {/* Hair shine */}
    <ellipse cx="145" cy="82" rx="18" ry="8" fill="white" opacity="0.1" transform="rotate(-10 145 82)" />

    {/* Eyes */}
    <ellipse cx="136" cy="120" rx="8" ry="6" fill="white" />
    <ellipse cx="164" cy="120" rx="8" ry="6" fill="white" />
    <circle cx="137" cy="120" r="4" fill="#1a2050" />
    <circle cx="165" cy="120" r="4" fill="#1a2050" />
    <circle cx="138.5" cy="119" r="1.5" fill="white" opacity="0.9" />
    <circle cx="166.5" cy="119" r="1.5" fill="white" opacity="0.9" />
    {/* Eyebrows */}
    <path d="M127 110 Q136 107 145 110" stroke="#2a2030" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M155 110 Q164 107 173 110" stroke="#2a2030" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    {/* Nose */}
    <path d="M148 125 Q145 134 148 137 Q150 139 152 137 Q155 134 152 125" stroke="#b8a898" strokeWidth="1" fill="none" opacity="0.6" />
    {/* Mouth */}
    <path d="M140 148 Q150 155 160 148" stroke="#a09080" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    {/* Ears */}
    <ellipse cx="108" cy="122" rx="8" ry="11" fill="url(#resin-skin)" />
    <ellipse cx="192" cy="122" rx="8" ry="11" fill="url(#resin-skin)" />

    {/* Electric edge glow outline */}
    <ellipse cx="150" cy="120" rx="44" ry="48" fill="none" stroke="#06B6D4" strokeWidth="1.5" opacity="0.35" />
    <rect x="93" y="166" width="114" height="116" rx="17" fill="none" stroke="#3B82F6" strokeWidth="1.2" opacity="0.3" />
    <rect x="61" y="170" width="36" height="85" rx="15" fill="none" stroke="#3B82F6" strokeWidth="0.8" opacity="0.25" transform="rotate(-5 79 212)" />
    <rect x="203" y="170" width="36" height="85" rx="15" fill="none" stroke="#3B82F6" strokeWidth="0.8" opacity="0.25" transform="rotate(5 221 212)" />

    {/* Floating particle dots */}
    {[
      [60, 80], [240, 100], [45, 200], [255, 185], [80, 300], [225, 290], [150, 60],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={2 - (i % 2)} fill="#3B82F6" opacity={0.3 + (i % 3) * 0.15} />
    ))}

    {/* Scan lines overlay */}
    <rect width="300" height="400" fill="none"
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(59,130,246,0.015) 3px, rgba(59,130,246,0.015) 4px)' }} />
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const AIPreview = () => {
  const [sliderPos, setSliderPos] = useState(50);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeVersion, setActiveVersion] = useState('v4');
  const [detectedItems, setDetectedItems] = useState<Set<number>>(new Set());
  const [miniType, setMiniType] = useState<MiniType>('realistic');
  const [characters, setCharacters] = useState(1);
  const [hasPet, setHasPet] = useState(false);
  const [hasCustomBase, setHasCustomBase] = useState(false);
  const [paintLevel, setPaintLevel] = useState<PaintLevel>('professional');
  const [activeEditTool, setActiveEditTool] = useState<number | null>(null);
  const [downloadPulse, setDownloadPulse] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  // Animate detection items in sequence
  useEffect(() => {
    DETECTION_ITEMS.forEach((item, i) => {
      setTimeout(() => {
        setDetectedItems(prev => new Set([...prev, i]));
      }, item.delay);
    });
  }, []);

  // Before/after slider
  const updateSlider = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { if (isDragging.current) updateSlider(e.clientX); };
    const onMouseUp = () => { isDragging.current = false; };
    const onTouchMove = (e: TouchEvent) => { if (isDragging.current) updateSlider(e.touches[0].clientX); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [updateSlider]);

  const handleFullscreen = () => {
    if (!fullscreenRef.current) return;
    if (!document.fullscreenElement) {
      fullscreenRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleDownload = () => {
    setDownloadPulse(true);
    setTimeout(() => setDownloadPulse(false), 2000);
  };

  const total = BASE_PRICES[miniType] + (characters - 1) * 199 + (hasPet ? 149 : 0) + (hasCustomBase ? 89 : 0) + PAINT_PRICES[paintLevel];

  const GLASS = 'bg-[rgba(255,255,255,0.03)] backdrop-blur-xl border border-[rgba(255,255,255,0.07)]';

  return (
    <div className="min-h-screen pb-24" style={{ background: '#050B18' }}>
      {/* Ambient glows */}
      <div className="fixed top-0 left-[10%] w-[600px] h-[500px] rounded-full pointer-events-none -z-10" style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)' }} />
      <div className="fixed top-[30%] right-[5%] w-[400px] h-[400px] rounded-full pointer-events-none -z-10" style={{ background: 'radial-gradient(ellipse, rgba(6,182,212,0.06) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[10%] left-[30%] w-[500px] h-[300px] rounded-full pointer-events-none -z-10" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)' }} />

      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 space-y-10">

        {/* ── HEADER ───────────────────────────────────────────────────────── */}
        <div className="pt-8 pb-2 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6 border" style={{ background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)', color: '#60A5FA' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            3DFANS AI Engine · Active Session
          </div>
          <div className="relative inline-block mb-5">
            <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.2))', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 0 40px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
              <Sparkles size={36} style={{ color: '#60A5FA', filter: 'drop-shadow(0 0 12px rgba(96,165,250,0.8))' }} />
              <div className="absolute -inset-3 rounded-[2rem] border border-blue-500/20 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4 leading-none">
            <span style={{ background: 'linear-gradient(135deg, #ffffff 0%, #93C5FD 50%, #06B6D4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              AI Preview Center
            </span>
          </h1>
          <p className="text-zinc-400 text-lg font-medium max-w-2xl mx-auto leading-relaxed">
            See how your photo is transformed into a premium collectible miniature<br className="hidden sm:block" /> ready for professional 3D printing.
          </p>
        </div>

        {/* ── BEFORE / AFTER COMPARISON ────────────────────────────────────── */}
        <div className={`${GLASS} rounded-3xl overflow-hidden`} style={{ boxShadow: '0 0 60px rgba(59,130,246,0.1), 0 25px 50px rgba(0,0,0,0.5)' }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
              </div>
              <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Comparison View</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                <ZoomOut size={13} />
              </button>
              <span className="text-xs font-black text-zinc-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                <ZoomIn size={13} />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button onClick={handleDownload} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${downloadPulse ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/8 text-zinc-400 hover:text-white hover:bg-white/10'}`}>
                <Download size={12} />
                {downloadPulse ? 'Downloaded!' : 'Download'}
              </button>
              <button onClick={handleFullscreen} className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          {/* Comparison slider area */}
          <div ref={fullscreenRef} className="relative select-none overflow-hidden cursor-col-resize"
            style={{ minHeight: '420px', background: '#050B18' }}
            onMouseDown={e => { isDragging.current = true; updateSlider(e.clientX); }}
            onTouchStart={e => { isDragging.current = true; updateSlider(e.touches[0].clientX); }}>
            <div ref={containerRef} className="relative h-[420px] md:h-[500px]" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
              {/* RIGHT side — miniature (full) */}
              <div className="absolute inset-0">
                <MiniatureArt />
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#60A5FA', backdropFilter: 'blur(8px)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  IA Gerada
                </div>
              </div>
              {/* LEFT side — photo (clipped) */}
              <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
                <OriginalPhotoArt />
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#FCD34D', backdropFilter: 'blur(8px)' }}>
                  <Camera size={10} />
                  Foto Original
                </div>
              </div>
              {/* Slider handle */}
              <div className="absolute top-0 bottom-0 w-0.5 pointer-events-none" style={{ left: `${sliderPos}%`, background: 'linear-gradient(180deg, transparent 0%, #3B82F6 20%, #06B6D4 80%, transparent 100%)', boxShadow: '0 0 20px rgba(59,130,246,0.8)' }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center cursor-col-resize"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #0d1f3c)', border: '2px solid #3B82F6', boxShadow: '0 0 20px rgba(59,130,246,0.6), 0 4px 15px rgba(0,0,0,0.5)' }}>
                  <div className="flex gap-0.5">
                    <ChevronRight size={10} className="text-blue-400 -scale-x-100" />
                    <ChevronRight size={10} className="text-blue-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
            <p className="text-xs text-zinc-600 font-medium">← Drag to compare →</p>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.2))', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA', boxShadow: '0 0 20px rgba(59,130,246,0.15)' }}>
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>
        </div>

        {/* ── AI DETECTION + SIMILARITY ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Detection panel */}
          <div className={`${GLASS} rounded-2xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Cpu size={16} style={{ color: '#60A5FA' }} />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-none">AI Detection Panel</h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">What the AI analyzed automatically</p>
              </div>
            </div>
            <div className="space-y-3">
              {DETECTION_ITEMS.map((item, i) => {
                const detected = detectedItems.has(i);
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-500 ${detected ? 'bg-[rgba(59,130,246,0.08)] border border-blue-500/20' : 'bg-white/3 border border-transparent'}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 ${detected ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-white/5 border border-white/8'}`}>
                      {detected
                        ? <CheckCircle2 size={14} className="text-emerald-400" style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.8))' }} />
                        : <item.icon size={14} className="text-zinc-600" />}
                    </div>
                    <span className={`text-sm font-bold transition-colors duration-500 ${detected ? 'text-white' : 'text-zinc-600'}`}>{item.label}</span>
                    {detected && (
                      <span className="ml-auto text-[10px] font-black text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Similarity scores */}
          <div className={`${GLASS} rounded-2xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)' }}>
                <Target size={16} style={{ color: '#22D3EE' }} />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-none">Similarity Analysis</h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">AI accuracy scores per dimension</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-2">
              {SIMILARITY_SCORES.slice(0, 3).map(s => (
                <CircularProgress key={s.label} value={s.value} color={s.color} label={s.label} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {SIMILARITY_SCORES.slice(3).map(s => (
                <CircularProgress key={s.label} value={s.value} color={s.color} label={s.label} />
              ))}
            </div>
          </div>
        </div>

        {/* ── SPECIFICATIONS + EDIT TOOLS ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Specs */}
          <div className={`${GLASS} rounded-2xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <Package size={16} style={{ color: '#A78BFA' }} />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-none">Miniature Specifications</h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Generated product details</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SPECS.map(spec => (
                <div key={spec.label} className="p-4 rounded-xl border border-white/5 bg-white/3 hover:bg-white/5 hover:border-white/10 transition-all group">
                  <div className="flex items-center gap-2 mb-2">
                    <spec.icon size={14} className="text-zinc-500 group-hover:text-violet-400 transition-colors" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{spec.label}</p>
                  </div>
                  <p className="text-sm font-black text-white leading-tight">{spec.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Edit tools */}
          <div className={`${GLASS} rounded-2xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <Wand2 size={16} style={{ color: '#34D399' }} />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-none">AI Edit Tools</h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Refine your miniature with one click</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {EDIT_TOOLS.map((tool, i) => (
                <button key={i} onClick={() => setActiveEditTool(activeEditTool === i ? null : i)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all duration-200 hover:scale-105 active:scale-95 ${activeEditTool === i ? 'border-opacity-60 bg-opacity-20' : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'}`}
                  style={activeEditTool === i ? { borderColor: tool.color, background: `${tool.color}18` } : {}}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tool.color}15`, color: tool.color }}>
                    <tool.icon size={15} />
                  </div>
                  <span className="text-[9px] font-black leading-tight text-zinc-400 group-hover:text-white">{tool.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── REAL-WORLD VISUALIZATION ─────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Eye size={16} style={{ color: '#FCD34D' }} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white leading-none">Real-World Visualization</h2>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">How your miniature looks in real life</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <ShowcaseCard title="Miniature on Office Desk" subtitle="Precision detail visible at natural scale" icon={Layers} gradient="bg-gradient-to-br from-amber-950/40 via-stone-900/60 to-zinc-900/80" accent="#FCD34D">
              <div className="absolute inset-0 flex items-end justify-center pb-6">
                <div className="relative">
                  {/* Desk surface */}
                  <div className="absolute -bottom-4 -left-16 -right-16 h-8 rounded-lg opacity-60" style={{ background: 'linear-gradient(180deg, #5c3d1e, #3d2810)' }} />
                  <div className="w-16 scale-[0.6] origin-bottom opacity-90">
                    <MiniatureArt />
                  </div>
                </div>
              </div>
              <div className="absolute top-0 inset-x-0 h-1/2" style={{ background: 'linear-gradient(180deg, rgba(92,61,30,0.3), transparent)' }} />
            </ShowcaseCard>

            <ShowcaseCard title="Person Holding Miniature" subtitle="See the size perspective in real hands" icon={Gift} gradient="bg-gradient-to-br from-indigo-950/50 via-blue-950/40 to-slate-900/80" accent="#60A5FA">
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Stylized hand holding the mini */}
                <svg viewBox="0 0 220 280" className="w-full h-full opacity-80">
                  <defs>
                    <linearGradient id="hand-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#6b4c3b" />
                      <stop offset="100%" stopColor="#4a3528" />
                    </linearGradient>
                  </defs>
                  {/* Hand / palm */}
                  <ellipse cx="110" cy="220" rx="52" ry="30" fill="url(#hand-grad)" />
                  {/* Fingers */}
                  <rect x="65" y="185" width="14" height="50" rx="7" fill="url(#hand-grad)" />
                  <rect x="83" y="178" width="14" height="55" rx="7" fill="url(#hand-grad)" />
                  <rect x="101" y="175" width="14" height="57" rx="7" fill="url(#hand-grad)" />
                  <rect x="119" y="178" width="14" height="54" rx="7" fill="url(#hand-grad)" />
                  <rect x="137" y="185" width="14" height="45" rx="7" fill="url(#hand-grad)" />
                  {/* Thumb */}
                  <ellipse cx="60" cy="215" rx="10" ry="25" fill="url(#hand-grad)" transform="rotate(-20 60 215)" />
                  {/* Mini figure sitting in hand */}
                  <g transform="translate(90, 80) scale(0.4)">
                    <ellipse cx="50" cy="198" rx="35" ry="7" fill="#1e3a5f" stroke="#3B82F6" strokeWidth="1.5" />
                    <rect x="33" y="145" width="14" height="42" rx="6" fill="#a0b8e0" />
                    <rect x="53" y="145" width="14" height="42" rx="6" fill="#a0b8e0" />
                    <rect x="20" y="90" width="60" height="64" rx="10" fill="#a0b8e0" />
                    <ellipse cx="50" cy="70" rx="26" ry="28" fill="#d4c8b8" />
                    <ellipse cx="50" cy="52" rx="28" ry="16" fill="#2a2030" />
                    <ellipse cx="50" cy="70" rx="27" ry="29" fill="none" stroke="#3B82F6" strokeWidth="1.2" opacity="0.5" />
                  </g>
                </svg>
              </div>
            </ShowcaseCard>

            <ShowcaseCard title="3DFANS Premium Gift Box" subtitle="Ready for gifting with luxury packaging" icon={Package} gradient="bg-gradient-to-br from-violet-950/50 via-purple-950/40 to-slate-900/80" accent="#A78BFA">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 220 260" className="w-full h-full opacity-85">
                  <defs>
                    <linearGradient id="box-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#1e1435" />
                      <stop offset="100%" stopColor="#0f0a20" />
                    </linearGradient>
                    <linearGradient id="lid-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#2a1d4a" />
                      <stop offset="100%" stopColor="#180f30" />
                    </linearGradient>
                  </defs>
                  {/* Box base */}
                  <rect x="30" y="145" width="160" height="90" rx="8" fill="url(#box-grad)" stroke="rgba(139,92,246,0.4)" strokeWidth="1.5" />
                  {/* Box lid open */}
                  <rect x="28" y="100" width="164" height="50" rx="8" fill="url(#lid-grad)" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" transform="rotate(-10 110 125)" />
                  {/* Ribbon horizontal */}
                  <rect x="30" y="175" width="160" height="8" fill="rgba(139,92,246,0.3)" />
                  {/* Ribbon vertical */}
                  <rect x="106" y="145" width="8" height="90" fill="rgba(139,92,246,0.3)" />
                  {/* Logo on box */}
                  <text x="110" y="205" textAnchor="middle" fill="rgba(139,92,246,0.7)" fontSize="9" fontWeight="900" fontFamily="system-ui" letterSpacing="3">3DFANS</text>
                  {/* Mini figure in box */}
                  <g transform="translate(82, 138) scale(0.35)">
                    <ellipse cx="50" cy="198" rx="35" ry="7" fill="#1e3a5f" />
                    <rect x="33" y="148" width="14" height="38" rx="6" fill="#c8d8f0" />
                    <rect x="53" y="148" width="14" height="38" rx="6" fill="#c8d8f0" />
                    <rect x="22" y="92" width="56" height="62" rx="10" fill="#c8d8f0" />
                    <ellipse cx="50" cy="72" rx="24" ry="26" fill="#d4c8b8" />
                    <ellipse cx="50" cy="54" rx="27" ry="15" fill="#2a2030" />
                  </g>
                  {/* Stars around box */}
                  <text x="22" y="140" fill="#A78BFA" fontSize="12" opacity="0.6">✦</text>
                  <text x="185" y="155" fill="#A78BFA" fontSize="8" opacity="0.5">✦</text>
                  <text x="42" y="110" fill="#A78BFA" fontSize="8" opacity="0.4">✦</text>
                </svg>
              </div>
            </ShowcaseCard>
          </div>
        </div>

        {/* ── PRINT QUALITY + GENERATION HISTORY ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Print quality */}
          <div className={`${GLASS} rounded-2xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <Printer size={16} style={{ color: '#34D399' }} />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-none">Print Quality Analysis</h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Production-readiness indicators</p>
              </div>
            </div>
            <div className="space-y-4">
              {QUALITY_METRICS.map((m, i) => (
                <QualityBar key={m.label} label={m.label} value={m.value} color={m.color} index={i} />
              ))}
            </div>
          </div>

          {/* Generation history */}
          <div className={`${GLASS} rounded-2xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <RefreshCw size={16} style={{ color: '#FCD34D' }} />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-none">Generation History</h2>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Compare previous versions</p>
              </div>
            </div>
            <div className="space-y-3">
              {VERSIONS.map(v => (
                <button key={v.version} onClick={() => setActiveVersion(v.version)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${activeVersion === v.version ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/5 bg-white/3 hover:border-white/12 hover:bg-white/5'}`}>
                  <div className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border ${activeVersion === v.version ? 'border-blue-500/40' : 'border-white/10'}`}
                    style={{ background: 'linear-gradient(135deg, #0d1f3c, #050B18)' }}>
                    <div className="w-full h-full scale-90">
                      <MiniatureArt />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-sm font-black ${activeVersion === v.version ? 'text-blue-400' : 'text-white'}`}>{v.version}</span>
                      {v.isCurrent && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">Current</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 font-medium">{v.note}</p>
                    <p className="text-[10px] text-zinc-600 font-medium mt-0.5">{v.time}</p>
                  </div>
                  {activeVersion === v.version && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#3B82F6', boxShadow: '0 0 10px rgba(59,130,246,0.5)' }}>
                      <CheckCircle2 size={12} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── AI GENERATION ANALYTICS ──────────────────────────────────────── */}
        <div className={`${GLASS} rounded-2xl p-6`}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Zap size={16} style={{ color: '#818CF8' }} />
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-none">AI Generation Analytics</h2>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Advanced diagnostics &amp; model performance</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ANALYTICS_DATA.map(item => (
              <AnalyticsCard key={item.label} label={item.label} value={item.value} icon={item.icon} highlight={item.highlight} />
            ))}
          </div>
        </div>

        {/* ── PRICE ESTIMATOR ──────────────────────────────────────────────── */}
        <div className={`${GLASS} rounded-2xl p-6`} style={{ boxShadow: '0 0 40px rgba(59,130,246,0.08)' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <DollarSign size={16} style={{ color: '#34D399' }} />
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-none">Price Estimator</h2>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Customize your order</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              {/* Miniature Type */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Miniature Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['realistic', 'funko', 'figure', 'mascot'] as MiniType[]).map(t => (
                    <button key={t} onClick={() => setMiniType(t)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-black capitalize transition-all ${miniType === t ? 'border-blue-500/50 bg-blue-500/15 text-blue-400' : 'border-white/8 bg-white/3 text-zinc-400 hover:border-white/15 hover:text-white'}`}>
                      {t}
                      <span className="block text-[10px] font-medium opacity-70 mt-0.5">{fmtBRL(BASE_PRICES[t])}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Characters */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Number of Characters</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCharacters(c => Math.max(1, c - 1))}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                    <Minus size={13} />
                  </button>
                  <span className="text-2xl font-black text-white w-8 text-center">{characters}</span>
                  <button onClick={() => setCharacters(c => Math.min(4, c + 1))}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                    <Plus size={13} />
                  </button>
                  {characters > 1 && <span className="text-xs text-zinc-500 font-medium">+{fmtBRL(199 * (characters - 1))} per extra</span>}
                </div>
              </div>

              {/* Add-ons */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Add-ons</label>
                <div className="space-y-2">
                  {[
                    { label: 'Include Pet', subLabel: '+R$149', key: 'pet', value: hasPet, set: setHasPet },
                    { label: 'Custom Base with Name', subLabel: '+R$89', key: 'base', value: hasCustomBase, set: setHasCustomBase },
                  ].map(item => (
                    <button key={item.key} onClick={() => item.set(!item.value)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${item.value ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/8 bg-white/3 hover:border-white/15'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${item.value ? 'bg-blue-500' : 'bg-white/10 border border-white/15'}`}>
                          {item.value && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <span className="text-sm font-bold text-white">{item.label}</span>
                      </div>
                      <span className="text-xs font-black text-zinc-400">{item.subLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Painting level */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Painting Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { k: 'standard', label: 'Standard', sub: 'Included', color: '#94A3B8' },
                    { k: 'professional', label: 'Professional', sub: '+R$99', color: '#60A5FA' },
                    { k: 'collector', label: "Collector's", sub: '+R$199', color: '#F59E0B' },
                  ] as { k: PaintLevel; label: string; sub: string; color: string }[]).map(p => (
                    <button key={p.k} onClick={() => setPaintLevel(p.k)}
                      className={`py-2.5 px-2 rounded-xl border text-[10px] font-black transition-all text-center ${paintLevel === p.k ? 'border-opacity-50 bg-opacity-15' : 'border-white/8 bg-white/3 hover:border-white/15'}`}
                      style={paintLevel === p.k ? { borderColor: p.color, background: `${p.color}15`, color: p.color } : { color: '#71717A' }}>
                      {p.label}
                      <span className="block text-[9px] font-medium opacity-70 mt-0.5" style={{ color: paintLevel === p.k ? p.color : '#4B5563' }}>{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Total card */}
            <div className="flex flex-col justify-center">
              <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(6,182,212,0.08))', border: '1px solid rgba(59,130,246,0.25)', boxShadow: '0 0 40px rgba(59,130,246,0.12)' }}>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(ellipse, rgba(6,182,212,0.15) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-4">Estimated Total</p>
                <div className="mb-5">
                  <p className="text-5xl font-black text-white tracking-tight" style={{ filter: 'drop-shadow(0 0 20px rgba(59,130,246,0.4))' }}>
                    {fmtBRL(total)}
                  </p>
                  <p className="text-xs text-zinc-500 font-medium mt-1">Shipping calculated at checkout</p>
                </div>
                <div className="space-y-1.5 mb-5 text-xs font-medium text-zinc-400 border-t border-white/8 pt-4">
                  <div className="flex justify-between"><span className="capitalize">{miniType} Miniature</span><span>{fmtBRL(BASE_PRICES[miniType])}</span></div>
                  {characters > 1 && <div className="flex justify-between"><span>{characters - 1}x Extra Character(s)</span><span>{fmtBRL((characters - 1) * 199)}</span></div>}
                  {hasPet && <div className="flex justify-between"><span>Pet</span><span>{fmtBRL(149)}</span></div>}
                  {hasCustomBase && <div className="flex justify-between"><span>Custom Base</span><span>{fmtBRL(89)}</span></div>}
                  {PAINT_PRICES[paintLevel] > 0 && <div className="flex justify-between"><span className="capitalize">{paintLevel} Painting</span><span>{fmtBRL(PAINT_PRICES[paintLevel])}</span></div>}
                </div>
                <button className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:scale-105 active:scale-95" style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)', boxShadow: '0 0 30px rgba(59,130,246,0.4)', color: 'white' }}>
                  PRODUCE MY MINIATURE →
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { icon: Shield, label: 'Quality Guaranteed' },
                  { icon: Gift, label: 'Premium Packaging' },
                  { icon: Award, label: 'Hand Painted' },
                ].map(item => (
                  <div key={item.label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/3 border border-white/5">
                    <item.icon size={16} className="text-zinc-500" />
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 text-center leading-tight">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SOCIAL PROOF ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Star size={16} style={{ color: '#FCD34D' }} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white leading-none">Customer Reviews</h2>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">From real 3DFANS customers</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex">{'★★★★★'.split('').map((s, i) => <span key={i} className="text-amber-400 text-xs">{s}</span>)}</div>
              <span className="text-xs font-black text-amber-400 ml-1">4.9/5</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className={`${GLASS} rounded-2xl p-5 bg-gradient-to-br ${t.gradient} relative overflow-hidden hover:border-white/12 transition-all`}>
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-30" style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.05) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm text-white" style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)' }}>
                    {t.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white leading-none">{t.name}</p>
                    <p className="text-[10px] text-zinc-500 font-medium mt-0.5">{t.location}</p>
                  </div>
                  <div className="flex">{'★★★★★'.split('').map((s, i) => <span key={i} className="text-amber-400 text-xs">{s}</span>)}</div>
                </div>
                <p className="text-sm text-zinc-300 font-medium leading-relaxed mb-3">"{t.text}"</p>
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60A5FA' }}>
                  <CheckCircle2 size={9} />
                  {t.tag}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl p-8 sm:p-12 text-center" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(6,182,212,0.08) 50%, rgba(139,92,246,0.1) 100%)', border: '1px solid rgba(59,130,246,0.2)', boxShadow: '0 0 80px rgba(59,130,246,0.12)' }}>
          {/* BG glows */}
          <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.2) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(6,182,212,0.15) 0%, transparent 70%)' }} />
          {/* Sparkle dots */}
          {[[10, 15], [88, 20], [5, 70], [92, 75], [50, 5], [30, 85], [70, 90]].map(([x, y], i) => (
            <div key={i} className="absolute w-1 h-1 rounded-full animate-pulse" style={{ left: `${x}%`, top: `${y}%`, background: '#60A5FA', opacity: 0.4, animationDelay: `${i * 0.4}s` }} />
          ))}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-5 border" style={{ background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', color: '#60A5FA' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Preview Ready · 98.4% Confidence Score
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4 leading-none">
              <span style={{ background: 'linear-gradient(135deg, #ffffff 0%, #93C5FD 50%, #06B6D4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Your Miniature Is Ready.
              </span>
            </h2>
            <p className="text-zinc-400 text-lg font-medium max-w-xl mx-auto mb-8 leading-relaxed">
              Transform this AI preview into a professionally printed collectible miniature. Hand painted, ready to display.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-base text-white transition-all hover:scale-105 active:scale-95 hover:shadow-2xl" style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)', boxShadow: '0 0 40px rgba(59,130,246,0.35)', letterSpacing: '0.05em' }}>
                PRODUCE MY MINIATURE
              </button>
              <button className="w-full sm:w-auto px-8 py-4 rounded-2xl font-black text-base transition-all hover:scale-105 active:scale-95 hover:bg-white/8" style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em' }}>
                GENERATE ANOTHER VERSION
              </button>
            </div>
            <p className="text-xs text-zinc-600 font-medium mt-5">✦ Production starts within 24 hours &nbsp;·&nbsp; ✦ Delivery in 10–14 business days &nbsp;·&nbsp; ✦ Satisfaction guarantee</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AIPreview;
