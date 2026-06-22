import React, { useState, useMemo } from 'react';
import { X, Upload, Loader2, AlertCircle, CheckCircle2, Download, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { z } from 'zod';
import { parse } from 'date-fns';
import { createContact, contactsCollection, bulkCreateContacts } from '../../services/firestore';
import { Contact, ContactStage } from '../../types';
import { analyzeAndNormalizePhone, isClearlyInvalidName, getStateFromPhone } from '../../lib/phone';
import { getDocs, query, where, Timestamp } from 'firebase/firestore';

interface ImportCSVModalProps {
  onClose: () => void;
  existingContacts: Contact[];
  targetFolderId?: string | null;
}

type RowStatus = 'valid' | 'review' | 'discard';

interface ParsedRow {
  nome: string;
  telefoneRaw: string;
  telefoneE164: string | null;
  email: string;
  cidade: string;
  estado: string;
  notes: string;
  lastContactAt: number | null;
  
  status: RowStatus;
  reason?: string;
  isDuplicate?: boolean; // Strong match (exact E164)
  isPossibleDuplicate?: boolean; // Weak match (1 digit off)
}

export const ImportCSVModal: React.FC<ImportCSVModalProps> = ({ onClose, existingContacts, targetFolderId }) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const calculateSimilarity = (phone1: string, phone2: string) => {
      if(phone1.length !== phone2.length) return false;
      let diffLines = 0;
      for(let i=0; i<Math.max(phone1.length, phone2.length); i++){
          if(phone1[i] !== phone2[i]) diffLines++;
      }
      return diffLines === 1;
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        let parsedRows: ParsedRow[] = results.data.map((row: any) => {
          // Normalize row keys to lowercase and trim
          const normalizedRow: Record<string, string> = {};
          Object.keys(row).forEach(k => {
            if (k) {
              normalizedRow[k.trim().toLowerCase()] = row[k];
            }
          });

          // Normalize matching column names depending on how CSV exports
          const fullName = normalizedRow['name'] || normalizedRow['nome'] || normalizedRow['firstname'] || normalizedRow['first name'] || [normalizedRow['given name'], normalizedRow['family name']].filter(Boolean).join(' ') || '';
          let cName = fullName.trim().split(' ')[0] || '';
          
          let isUnknownName = false;
          if (!cName) {
            cName = 'Desconhecido';
            isUnknownName = true;
          }
          
          // Grab phone from possible headers
          const cPhone = normalizedRow['phone 1 - value'] || normalizedRow['telefone 1 - valor'] || normalizedRow['mobile'] || normalizedRow['telefone'] || normalizedRow['phone'] || normalizedRow['celular'] || '';
          
          // Desprezando as outras informações
          const cEmail = '';
          const cCidade = '';
          const cEstado = '';
          const cLastActivity = '';
          const cNotes = '';
          
          let status: RowStatus = 'valid';
          let reason: string[] = [];

          if (isUnknownName) {
            status = 'review';
            reason.push('Nome ausente');
          } else if (isClearlyInvalidName(cName) && cName.toLowerCase() !== 'desconhecido') {
            status = 'discard';
            reason.push('Nome inválido');
          } else if (cName.trim().toLowerCase() === 'usuário anônimo') {
            status = 'review';
            reason.push('Nome anônimo');
          }

          const phoneAnalysis = analyzeAndNormalizePhone(cPhone);
          
          if (phoneAnalysis.status === 'discard') {
            status = 'discard';
            reason.push(phoneAnalysis.reason!);
          } else if (phoneAnalysis.status === 'review') {
             if (status !== 'discard') status = 'review';
             reason.push(phoneAnalysis.reason!);
          }

          let lastContactAtMs: number | null = null;
          const cEstadoFromDDD = getStateFromPhone(phoneAnalysis.e164);

          return {
            nome: cName.trim(),
            telefoneRaw: cPhone.trim(),
            telefoneE164: phoneAnalysis.e164,
            email: cEmail.trim(),
            cidade: cCidade.trim(),
            estado: cEstadoFromDDD,
            notes: cNotes.trim(),
            lastContactAt: lastContactAtMs,
            status,
            reason: reason.join(', '),
          };
        });

        // Deduplication intra-CSV and against Existing
        const e164Map = new Map<string, ParsedRow>();
        
        parsedRows.forEach(row => {
           if (row.status === 'discard' || !row.telefoneE164) return;
           
           // Check existing database matches
           const existingMatch = existingContacts.find(c => c.telefoneE164 === row.telefoneE164);
           if (existingMatch) {
               row.isDuplicate = true;
               row.reason = (row.reason ? row.reason + ', ' : '') + 'Duplicado no banco';
               row.status = 'discard'; // Do not import exact duplicates straight up, unless we do merging
               // According to spec: manter o de lastContactAt mais recente e sinalizar. 
               // For simplicity in this logic step, we will mark as duplicate here. Merging takes more complex cross-document updates.
               return; 
           }

           // Check Intra-CSV exact matches
           if (e164Map.has(row.telefoneE164)) {
               const existing = e164Map.get(row.telefoneE164)!;
               const existingTime = existing.lastContactAt || 0;
               const newTime = row.lastContactAt || 0;
               if (newTime > existingTime) {
                   existing.status = 'discard';
                   existing.reason = (existing.reason ? existing.reason + ', ' : '') + 'Duplicado (antigo)';
                   e164Map.set(row.telefoneE164, row);
               } else {
                   row.status = 'discard';
                   row.reason = (row.reason ? row.reason + ', ' : '') + 'Duplicado (antigo)';
               }
           } else {
               e164Map.set(row.telefoneE164, row);
           }
        });

        // Weak dedupe detection
        const allValid = parsedRows.filter(r => r.status !== 'discard' && r.telefoneE164);
        allValid.forEach(row => {
            const hasSimilar = allValid.find(other => 
                other !== row && 
                other.nome === row.nome && 
                calculateSimilarity(other.telefoneE164!, row.telefoneE164!)
            );
            if (hasSimilar) {
                row.isPossibleDuplicate = true;
                if(row.status === 'valid') row.status = 'review';
                row.reason = (row.reason ? row.reason + ', ' : '') + 'Possível duplicado';
            }
        });

        setPreview(parsedRows);
        setLoading(false);
      },
      error: () => {
          setLoading(false);
          alert('Erro ao ler o arquivo CSV');
      }
    });
  };

  const [importingNames, setImportingNames] = useState<{ id: string; nome: string }[]>([]);

  const handleImport = async () => {
    const toImport = preview.filter(r => r.status === 'valid' || r.status === 'review');
    if (toImport.length === 0) return;

    setImporting(true);
    setProgress(0);
    setImportingNames([]);
    
    const CHUNK_SIZE = 50;

    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);
      
      const newContacts: Omit<Contact, 'id' | 'createdAt'>[] = chunk.map((row) => ({
        nome: row.nome,
        telefoneRaw: row.telefoneRaw,
        telefoneE164: row.telefoneE164!,
        email: row.email,
        cidade: row.cidade,
        estado: row.estado,
        interesse: '',
        produto: '',
        tags: [],
        stage: 'Novo Lead',
        status: 'active',
        notes: row.notes || '',
        lastContactAt: row.lastContactAt,
        needsReview: row.status === 'review',
        optIn: true,
        ...(targetFolderId ? { folderId: targetFolderId } : {}),
      }));

      try {
        await bulkCreateContacts(newContacts);
        const lastFew = chunk.slice(-3).map((r, idx) => ({ id: `${i}-${idx}`, nome: r.nome }));
        setImportingNames(lastFew);
      } catch (e: any) {
        console.error('Error importing chunk', e);
        alert('Erro ao importar contatos: ' + e.message);
        setImporting(false);
        return;
      }
      
      setProgress(Math.round((Math.min(i + CHUNK_SIZE, toImport.length) / toImport.length) * 100));
      await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for visual effect
    }
    
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const exportDiscarded = () => {
    const discarded = preview.filter(r => r.status === 'discard');
    if(discarded.length === 0) return;

    const csvContent = Papa.unparse(discarded.map(r => ({
        Nome: r.nome,
        Telefone: r.telefoneRaw,
        Email: r.email,
        Motivo: r.reason
    })));

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "contatos_descartados.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const counts = useMemo(() => ({
    total: preview.length,
    valid: preview.filter(r => r.status === 'valid').length,
    review: preview.filter(r => r.status === 'review').length,
    discard: preview.filter(r => r.status === 'discard').length,
  }), [preview]);

  return (
    <div className="fixed inset-0 z-50 flex md:items-center justify-end md:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-[#0B1020] border-t md:border border-white/5 rounded-t-[32px] md:rounded-[24px] w-full max-w-xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] md:shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden"
      >
        <div className="md:hidden flex justify-center p-3 shrink-0">
           <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>

        {/* Importing Overlay */}
        <AnimatePresence>
          {importing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-[#050816]/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 gap-6"
            >
              <div className="relative w-16 h-16">
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-indigo-500/20"
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-indigo-400 font-bold text-sm">{progress}%</div>
              </div>

              <div className="w-full max-w-xs space-y-2">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="bg-indigo-500 h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="h-8 overflow-hidden flex items-center justify-center [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)]">
                  <AnimatePresence mode="popLayout">
                    {importingNames.slice(-1).map((n) => (
                      <motion.div
                        key={n.id}
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -12, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="text-sm text-zinc-400 truncate text-center w-full"
                      >
                        {n.nome}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <p className="text-zinc-500 text-xs">Importando contatos, aguarde...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Upload size={16} /> Importar Contatos CSV
            </h3>
            {targetFolderId && (
              <p className="text-xs text-indigo-400 mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                Contatos importados irão para a pasta selecionada
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors" disabled={importing}>
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {preview.length === 0 ? (
            <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center">
              <Upload size={36} className="mx-auto text-zinc-500 mb-3" />
              <p className="text-zinc-300 font-medium mb-1">Selecione o arquivo CSV</p>
              <p className="text-zinc-500 text-xs mb-5 leading-relaxed">
                Suporta Google Contacts e formato nativo. Extrai primeiro nome e telefone das colunas
                <span className="font-mono text-zinc-400 bg-zinc-800 px-1 mx-1 rounded">Name</span>,
                <span className="font-mono text-zinc-400 bg-zinc-800 px-1 mx-1 rounded">mobile</span>,
                <span className="font-mono text-zinc-400 bg-zinc-800 px-1 ml-1 rounded">Phone 1 - Value</span>.
              </p>
              <label className="bg-white text-zinc-950 px-5 py-2.5 rounded-lg font-medium cursor-pointer hover:bg-zinc-200 transition-colors inline-flex items-center gap-2 text-sm">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {loading ? 'Processando...' : 'Escolher Arquivo'}
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={loading} />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-zinc-950 p-3 border border-zinc-800 rounded-lg text-center">
                  <p className="text-zinc-500 text-[10px] font-medium uppercase">Total</p>
                  <p className="text-xl font-bold text-white">{counts.total}</p>
                </div>
                <div className="bg-green-950/20 p-3 border border-green-500/20 rounded-lg text-center">
                  <p className="text-green-500 text-[10px] font-medium uppercase flex items-center justify-center gap-1"><CheckCircle2 size={11}/> OK</p>
                  <p className="text-xl font-bold text-green-400">{counts.valid}</p>
                </div>
                <div className="bg-amber-950/20 p-3 border border-amber-500/20 rounded-lg text-center">
                  <p className="text-amber-500 text-[10px] font-medium uppercase flex items-center justify-center gap-1"><HelpCircle size={11}/> Revisar</p>
                  <p className="text-xl font-bold text-amber-400">{counts.review}</p>
                </div>
                <div className="bg-red-950/20 p-3 border border-red-500/20 rounded-lg text-center">
                  <p className="text-red-500 text-[10px] font-medium uppercase flex items-center justify-center gap-1"><AlertCircle size={11}/> Ignorar</p>
                  <p className="text-xl font-bold text-red-400">{counts.discard}</p>
                </div>
              </div>

              {counts.discard > 0 && (
                <div className="flex justify-between items-center bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-800 text-xs">
                  <p className="text-zinc-400">{counts.discard} com dados inválidos serão ignorados.</p>
                  <button onClick={exportDiscarded} className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-white transition-colors flex-shrink-0 ml-2">
                    <Download size={12} /> Exportar erros
                  </button>
                </div>
              )}

              <div className="border border-zinc-700 rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: 200 }}>
                <div className="bg-zinc-950 border-b border-zinc-800 grid grid-cols-[28px_1fr_1fr_1fr] text-zinc-400 text-[10px] font-semibold uppercase px-3 py-2 flex-shrink-0">
                  <span></span>
                  <span>Nome</span>
                  <span>Telefone</span>
                  <span>Aviso</span>
                </div>
                <div className="overflow-y-auto divide-y divide-zinc-800/60">
                  {preview.map((row, i) => (
                    <div key={i} className={`grid grid-cols-[28px_1fr_1fr_1fr] px-3 py-1.5 text-xs items-center ${
                      row.status === 'discard' ? 'bg-red-500/5 text-red-300' :
                      row.status === 'review' ? 'bg-amber-500/5 text-amber-200' :
                      'text-zinc-300'
                    }`}>
                      <span className="flex items-center">
                        {row.status === 'valid' && <CheckCircle2 size={13} className="text-green-500" />}
                        {row.status === 'review' && <HelpCircle size={13} className="text-amber-500" />}
                        {row.status === 'discard' && <AlertCircle size={13} className="text-red-500" />}
                      </span>
                      <span className="truncate font-medium">{row.nome}</span>
                      <span className="truncate font-mono text-[10px]">{row.telefoneE164 || row.telefoneRaw}</span>
                      <span className="truncate text-[10px] opacity-70">{row.reason || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {preview.length > 0 && (
          <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-950 flex justify-end gap-2 pb-safe">
            <button
              onClick={() => setPreview([])}
              className="px-4 py-2 rounded-lg text-zinc-300 bg-zinc-800 hover:bg-zinc-700 font-medium transition-colors text-sm"
              disabled={importing}
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || counts.valid + counts.review === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
            >
              <Upload size={15} />
              Importar {counts.valid + counts.review}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
