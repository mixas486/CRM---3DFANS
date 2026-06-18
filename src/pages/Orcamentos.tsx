import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  FileText, Search, Phone, Image as ImageIcon, ZoomIn, Check,
  X, ChevronDown, RefreshCw, ExternalLink, DollarSign, Package, Palette
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface QuoteRecord {
  previewId: string;
  chatId: string;
  contactId: string;
  customerName: string;
  customerPhone: string;
  previewImageUrl: string;
  originalImageUrl: string;
  generationStatus: string;
  quoteValue: number;
  quantity: number;
  style: string;
  createdAt: any;
  archived: boolean;
  viewedByAdmin: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const STYLE_OPTIONS = ['Realista', 'Cartoon', 'Chibi', 'Pixar', 'Anime', 'Minimalista', 'Custom'];

export default function Orcamentos() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ quantity: number; style: string; quoteValue: number }>({ quantity: 1, style: 'Realista', quoteValue: 597 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'previews'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setQuotes(snap.docs.map(d => ({ previewId: d.id, ...d.data() } as QuoteRecord)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const filtered = quotes.filter(q => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (q.customerName || '').toLowerCase().includes(s) ||
      (q.customerPhone || '').includes(s)
    );
  });

  const totalValue = filtered.reduce((sum, q) => sum + (q.quoteValue || 597) * (q.quantity || 1), 0);

  function startEdit(q: QuoteRecord) {
    setEditingId(q.previewId);
    setEditValues({ quantity: q.quantity || 1, style: q.style || 'Realista', quoteValue: q.quoteValue || 597 });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'previews', id), {
        quantity: editValues.quantity,
        style: editValues.style,
        quoteValue: editValues.quoteValue,
      });
    } finally {
      setSaving(false);
      setEditingId(null);
    }
  }

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    try {
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return format(date, "dd/MM/yy HH:mm", { locale: ptBR });
    } catch { return '—'; }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <FileText size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Orçamentos</h1>
            <p className="text-xs text-zinc-500 font-medium">Previews gerados pelo SDR</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2 text-center">
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Total</p>
            <p className="text-lg font-black text-white">{filtered.length}</p>
          </div>
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2 text-center">
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Valor Potencial</p>
            <p className="text-lg font-black text-emerald-400">
              R$ {totalValue.toLocaleString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw size={24} className="animate-spin text-indigo-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <FileText size={48} className="text-zinc-800" />
          <p className="text-zinc-500 font-semibold">Nenhum orçamento encontrado</p>
          <p className="text-zinc-600 text-sm">Os orçamentos aparecem automaticamente quando o SDR gera uma miniatura.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/60">
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Contato</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Imagens</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Qtd</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Estilo</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Valor</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Data</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filtered.map(q => {
                const isEditing = editingId === q.previewId;
                return (
                  <tr key={q.previewId} className="bg-zinc-950/40 hover:bg-zinc-900/40 transition-colors group">
                    {/* Contact */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white text-sm truncate max-w-[140px]">
                        {q.customerName || 'Sem nome'}
                      </p>
                      <p className="text-zinc-500 text-[11px] flex items-center gap-1 mt-0.5">
                        <Phone size={9} />
                        {q.customerPhone || '—'}
                      </p>
                    </td>

                    {/* Images */}
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {q.originalImageUrl ? (
                          <button
                            onClick={() => setLightbox(q.originalImageUrl)}
                            className="relative w-10 h-12 rounded-lg overflow-hidden border border-zinc-700 hover:border-indigo-500/50 transition-colors group/img"
                            title="Imagem original"
                          >
                            <img src={q.originalImageUrl} alt="Original" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn size={10} className="text-white" />
                            </div>
                            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/70 text-zinc-400 py-0.5">Orig</span>
                          </button>
                        ) : (
                          <div className="w-10 h-12 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <ImageIcon size={10} className="text-zinc-600" />
                          </div>
                        )}
                        {q.previewImageUrl ? (
                          <button
                            onClick={() => setLightbox(q.previewImageUrl)}
                            className="relative w-10 h-12 rounded-lg overflow-hidden border border-indigo-500/30 hover:border-indigo-400/60 transition-colors group/img"
                            title="Preview gerado"
                          >
                            <img src={q.previewImageUrl} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn size={10} className="text-white" />
                            </div>
                            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-indigo-900/70 text-indigo-300 py-0.5">3D</span>
                          </button>
                        ) : (
                          <div className="w-10 h-12 rounded-lg bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <ImageIcon size={10} className="text-zinc-600" />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Quantity */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={editValues.quantity}
                          onChange={e => setEditValues(v => ({ ...v, quantity: parseInt(e.target.value) || 1 }))}
                          className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-indigo-500"
                        />
                      ) : (
                        <span className="flex items-center gap-1 text-zinc-300 font-medium">
                          <Package size={11} className="text-zinc-600" />
                          {q.quantity || 1}
                        </span>
                      )}
                    </td>

                    {/* Style */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="relative">
                          <select
                            value={editValues.style}
                            onChange={e => setEditValues(v => ({ ...v, style: e.target.value }))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-indigo-500 appearance-none pr-6"
                          >
                            {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-zinc-300 font-medium">
                          <Palette size={11} className="text-zinc-600" />
                          {q.style || 'Realista'}
                        </span>
                      )}
                    </td>

                    {/* Value */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">R$</span>
                          <input
                            type="number"
                            min={0}
                            value={editValues.quoteValue}
                            onChange={e => setEditValues(v => ({ ...v, quoteValue: parseInt(e.target.value) || 0 }))}
                            className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-2 py-1 text-sm text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 font-bold text-emerald-400">
                          <DollarSign size={11} />
                          {(q.quoteValue || 597).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_STYLES[q.generationStatus] || STATUS_STYLES.pending}`}>
                        {q.generationStatus === 'success' ? 'Gerado' : q.generationStatus === 'failed' ? 'Falha' : 'Pendente'}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-zinc-500 text-xs font-mono whitespace-nowrap">
                      {formatDate(q.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(q.previewId)}
                              disabled={saving}
                              className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors"
                              title="Salvar"
                            >
                              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg border border-zinc-700 transition-colors"
                              title="Cancelar"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(q)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg border border-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                              title="Editar"
                            >
                              <Palette size={12} />
                            </button>
                            {q.previewImageUrl && (
                              <a
                                href={q.previewImageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/20 transition-colors opacity-0 group-hover:opacity-100"
                                title="Abrir preview"
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <img src={lightbox} alt="Preview" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
