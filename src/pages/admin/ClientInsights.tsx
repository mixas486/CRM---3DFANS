import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Contact } from '../../types';
import axios from 'axios';
import { TrendingUp, Activity, CheckCircle, XCircle, Clock, Thermometer, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';

export type LeadStatus = 'fechou' | 'achou_caro' | 'contato_futuro' | 'em_negociacao' | 'frio' | 'nao_analisado';

const STATUS_CONFIG: Record<LeadStatus, { label: string, color: string, icon: any }> = {
  fechou: { label: 'Fechou Compra', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle },
  achou_caro: { label: 'Achou Caro', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', icon: XCircle },
  contato_futuro: { label: 'Contato Futuro', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Clock },
  em_negociacao: { label: 'Em Negociação', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: Activity },
  frio: { label: 'Frio / Sem Interesse', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20', icon: AlertCircle },
  nao_analisado: { label: 'Não Analisado', color: 'text-zinc-500 bg-zinc-800/50 border-zinc-700', icon: Activity },
};

function getTempColor(temp: number) {
  if (temp >= 80) return 'text-rose-500';
  if (temp >= 50) return 'text-amber-500';
  if (temp > 0) return 'text-sky-500';
  return 'text-zinc-500';
}

export default function ClientInsights() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'contacts'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by temperature desc, but push non-analyzed to the bottom
      data.sort((a: any, b: any) => {
        const tempA = a.aiInsights?.temperature ?? -1;
        const tempB = b.aiInsights?.temperature ?? -1;
        return tempB - tempA;
      });
      setContacts(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleAnalyze = async (contactId: string) => {
    setAnalyzingId(contactId);
    try {
      const response = await axios.post('/api/analyze-lead', { contactId });
      if (response.data.error) {
        alert('Erro: ' + response.data.error);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message;
      console.error('Failed to analyze lead', err);
      alert('Falha ao analisar lead: ' + errorMessage);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleAnalyzeAll = async () => {
    const unanalyzed = contacts.filter(c => !c.aiInsights);
    if (!unanalyzed.length) {
      alert('Todos os leads já foram analisados!');
      return;
    }
    if (!window.confirm(`Deseja analisar ${unanalyzed.length} leads? Isso consumirá tokens da IA.`)) return;
    
    for (const c of unanalyzed) {
      await handleAnalyze(c.id);
    }
    alert('Análise em lote concluída!');
  };

  if (loading) {
    return <div className="p-8 text-zinc-500">Carregando insights...</div>;
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="text-indigo-500" /> Insights de Clientes
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Inteligência Artificial analisando o histórico completo de conversas de cada cliente.
          </p>
        </div>
        <button
          onClick={handleAnalyzeAll}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
        >
          <SparklesIcon /> Avaliar Todos Pendentes
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['fechou', 'em_negociacao', 'contato_futuro', 'achou_caro'].map(key => {
          const count = contacts.filter(c => c.aiInsights?.status === key).length;
          const config = STATUS_CONFIG[key as LeadStatus];
          const Icon = config.icon;
          return (
            <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center gap-4">
              <div className={`p-3 rounded-xl border ${config.color}`}>
                <Icon size={24} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{config.label}</p>
                <p className="text-2xl font-bold text-white">{count}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="border-b border-zinc-800 bg-zinc-900 text-xs font-semibold uppercase text-zinc-500">
            <tr>
              <th className="px-6 py-4">Cliente</th>
              <th className="px-6 py-4">Status da IA</th>
              <th className="px-6 py-4">Temperatura</th>
              <th className="px-6 py-4 w-1/3">Resumo / Motivo</th>
              <th className="px-6 py-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {contacts.map(contact => {
              const insights = contact.aiInsights;
              const status: LeadStatus = insights?.status || 'nao_analisado';
              const config = STATUS_CONFIG[status];
              const StatusIcon = config.icon;
              const temp = insights?.temperature ?? 0;

              return (
                <tr key={contact.id} className="transition-colors hover:bg-zinc-800/20">
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">{contact.nome || contact.pushName || contact.telefoneE164}</p>
                    <p className="text-xs text-zinc-500">{contact.telefoneE164}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${config.color}`}>
                      <StatusIcon size={12} />
                      {config.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {insights ? (
                      <div className="flex items-center gap-2">
                        <Thermometer size={16} className={getTempColor(temp)} />
                        <span className={`font-bold ${getTempColor(temp)}`}>{temp}º</span>
                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${temp >= 80 ? 'bg-rose-500' : temp >= 50 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${temp}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs leading-relaxed text-zinc-400 line-clamp-2">
                      {insights?.summary || 'Nenhuma análise gerada ainda.'}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleAnalyze(contact.id)}
                      disabled={analyzingId === contact.id}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                      title="Analisar Histórico"
                    >
                      {analyzingId === contact.id ? <Loader2 size={18} className="animate-spin text-indigo-400" /> : <PlayCircle size={18} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
