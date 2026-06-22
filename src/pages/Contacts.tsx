import React, { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue, memo } from 'react';
import Papa from 'papaparse';
import { useContacts } from '../hooks/useContacts';
import { createContact, bulkCreateContacts, subscribeToFolders, createFolder, renameFolder, deleteFolder, moveContactsToFolder, bulkDeleteContacts } from '../services/firestore';
import { fetchChats } from '../services/evolution';
import { getAccessToken, googleSignIn, initAuth } from '../services/auth';
import { fetchGoogleContacts } from '../services/googleContacts';
import { getStateFromPhone } from '../lib/phone';
import { extractWhatsAppIdentity } from '../utils/whatsappIdentity';
import { ImportCSVModal } from '../features/contacts/ImportCSVModal';
import { SyncWhatsAppModal } from '../features/contacts/SyncWhatsAppModal';
import { ContactDrawer } from '../features/contacts/ContactDrawer';
import { Contact, ContactFolder, ContactStage } from '../types';
import { Search, Plus, Upload, Filter, Tag, ArrowRight, MoreHorizontal, Loader2, CheckSquare, Square, AlertTriangle, Download, RefreshCw, FolderOpen, Folder, FolderPlus, Pencil, Trash2, ChevronDown, Trash, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── Contact row ───────────────────────────────────────────────────────────────
const ROW_HEIGHT = 56;
const PAGE_SIZE  = 50;

interface RowData {
  contacts: Contact[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openContact: (c: Contact) => void;
}

type VirtualRowProps = { ariaAttributes?: Record<string, unknown>; index: number; style?: React.CSSProperties } & RowData;

const VirtualRow = memo(({ index, style, contacts, selectedIds, toggleSelect, openContact }: VirtualRowProps) => {
  const c = contacts[index];
  if (!c) return null;
  const sel = selectedIds.has(c.id);
  return (
    <div
      style={style}
      className={`flex items-center border-b border-zinc-800/60 cursor-pointer transition-colors select-none ${sel ? 'bg-indigo-500/10' : 'hover:bg-zinc-800/40'} ${c.needsReview ? '!bg-amber-950/20' : ''}`}
      onClick={() => openContact(c)}
    >
      <div className="w-12 flex-shrink-0 flex items-center justify-center" onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
        <button className={sel ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-400'}>
          {sel ? <CheckSquare size={17} /> : <Square size={17} />}
        </button>
      </div>
      <div className="flex-1 min-w-0 px-3">
        <div className="font-medium text-white flex items-center gap-1.5 truncate text-sm">
          {c.nome}
          {c.needsReview && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
        </div>
        {c.email && <div className="text-[11px] text-zinc-500 truncate">{c.email}</div>}
      </div>
      <div className="w-40 flex-shrink-0 px-3 font-mono text-sm text-zinc-300 truncate">{c.telefoneE164}</div>
      <div className="w-36 flex-shrink-0 px-3 hidden sm:block">
        <span className="inline-flex px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-xs truncate max-w-full">{c.stage}</span>
      </div>
      <div className="w-32 flex-shrink-0 px-3 text-xs text-zinc-400 truncate hidden lg:block">
        {[c.cidade, c.estado].filter(Boolean).join(' - ') || '-'}
      </div>
      <div className="w-28 flex-shrink-0 px-3 text-xs text-zinc-400 hidden md:block">
        {c.lastContactAt ? new Date(c.lastContactAt).toLocaleDateString('pt-BR') : '-'}
      </div>
      <div className="w-14 flex-shrink-0 px-3 flex items-center justify-center">
        <div className={`w-2.5 h-2.5 rounded-full ${c.optIn ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
      <div className="w-10 flex-shrink-0 flex items-center justify-center text-zinc-500">
        <MoreHorizontal size={16} />
      </div>
    </div>
  );
});

// ── Delete modal ──────────────────────────────────────────────────────────────
interface DeleteModalProps {
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ ids, onClose, onDone }) => {
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const handleConfirm = async () => {
    setRunning(true);
    await bulkDeleteContacts(ids, (d) => setDone(d));
    setFinished(true);
    setRunning(false);
    onDone();
  };

  const pct = ids.length > 0 ? Math.round((done / ids.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trash2 size={18} className="text-rose-400" /> Remover Contatos
            </h3>
            <p className="text-sm text-zinc-400 mt-1">
              {finished
                ? `${ids.length} contato${ids.length !== 1 ? 's' : ''} removido${ids.length !== 1 ? 's' : ''} com sucesso.`
                : running
                  ? `Removendo ${done} de ${ids.length}...`
                  : `Excluir permanentemente ${ids.length} contato${ids.length !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`}
            </p>
          </div>
          {!running && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors ml-3">
              <X size={18} />
            </button>
          )}
        </div>

        {(running || finished) && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{done} removidos</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {!running && !finished && (
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={15} /> Confirmar Exclusão
            </button>
          </div>
        )}

        {finished && (
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export const ContactsPage: React.FC = () => {
  const { contacts, loading } = useContacts();
  const [search, setSearch] = useState('');

  const deferredSearch = useDeferredValue(search);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; ids: string[] }>({ open: false, ids: [] });

  // Folder state
  const [folders, setFolders] = useState<ContactFolder[]>([]);
  const [filterFolderId, setFilterFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [page, setPage] = useState(1);
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);
  const moveDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToFolders(setFolders, console.error);
    return unsub;
  }, []);

  // Close move dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moveDropdownRef.current && !moveDropdownRef.current.contains(e.target as Node)) {
        setMoveDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleRenameFolder = async (id: string) => {
    if (!renamingValue.trim()) { setRenamingFolderId(null); return; }
    await renameFolder(id, renamingValue.trim());
    setRenamingFolderId(null);
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (!confirm(`Excluir pasta "${name}"? Os contatos não serão excluídos.`)) return;
    await deleteFolder(id);
    if (filterFolderId === id) setFilterFolderId(null);
  };

  const handleMoveToFolder = async (folderId: string | null) => {
    await moveContactsToFolder(Array.from(selectedIds), folderId);
    setMoveDropdownOpen(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    setDeleteModal({ open: true, ids: Array.from(selectedIds) });
  };

  const handleRemoveUnnamed = () => {
    const UNNAMED = new Set(['usuário', 'usuario', 'desconhecido', 'desconhecido (google)', 'desconhecido (wa)', 'unknown', 'anônimo', 'anonimo', '']);
    const ids = contacts.filter(c => UNNAMED.has((c.nome || '').trim().toLowerCase())).map(c => c.id);
    if (ids.length === 0) return;
    setDeleteModal({ open: true, ids });
  };

  useEffect(() => {
    // Inicializa a autenticação silenciosamente para recuperar o accessToken
    initAuth();
  }, []);

  const [filterStage, setFilterStage] = useState<string>('todos');
  const [filterOptIn, setFilterOptIn] = useState<string>('todos');
  const [filterNeedsReview, setFilterNeedsReview] = useState<boolean>(false);
  const [filterInactivityDays, setFilterInactivityDays] = useState<string>('todos');
  const [filterEstado, setFilterEstado] = useState<string>('');
  const [filterCidade, setFilterCidade] = useState<string>('');
  
  const [sortField, setSortField] = useState<'lastContactAt' | 'lastMessageAt' | 'nome'>('lastMessageAt');

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const navigate = useNavigate();

  // Filter & Sort Contacts In-Memory with full safety guards
  const filteredContacts = useMemo(() => {
    const now = Date.now();
    let result = contacts.filter(c => {
      const contactNome = c.nome || '';
      const contactPhone = c.telefoneE164 || '';
      const contactEmail = c.email || '';
      const contactStage = c.stage || '';
      const contactEstado = c.estado || '';
      const contactCidade = c.cidade || '';

      // Search
      if (deferredSearch) {
        const s = deferredSearch.toLowerCase();
        if (
          !contactNome.toLowerCase().includes(s) && 
          !contactPhone.toLowerCase().includes(s) && 
          !contactEmail.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      // Stage
      if (filterStage !== 'todos' && contactStage !== filterStage) return false;
      // OptIn
      if (filterOptIn !== 'todos') {
        const isOptIn = filterOptIn === 'sim';
        if (c.optIn !== isOptIn) return false;
      }
      // Needs Review
      if (filterNeedsReview && !c.needsReview) return false;
      
      // Inactivity
      if (filterInactivityDays !== 'todos') {
          const days = parseInt(filterInactivityDays, 10);
          const limitMs = now - (days * 24 * 60 * 60 * 1000);
          if (!c.lastContactAt || c.lastContactAt > limitMs) return false;
      }

      // Estado & Cidade
      if (filterEstado && !contactEstado.toLowerCase().includes(filterEstado.toLowerCase())) return false;
      if (filterCidade && !contactCidade.toLowerCase().includes(filterCidade.toLowerCase())) return false;

      // Pasta
      if (filterFolderId !== null && c.folderId !== filterFolderId) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
        if (sortField === 'nome') {
            return (a.nome || '').localeCompare(b.nome || '');
        } else if (sortField === 'lastMessageAt') {
            const timeA = Math.max(a.lastInboundAt || 0, a.lastOutboundAt || 0);
            const timeB = Math.max(b.lastInboundAt || 0, b.lastOutboundAt || 0);
            return timeB - timeA;
        } else {
            const timeA = a.lastContactAt || 0;
            const timeB = b.lastContactAt || 0;
            return timeB - timeA;
        }
    });

    return result;
  }, [contacts, deferredSearch, filterStage, filterOptIn, filterNeedsReview, filterInactivityDays, filterEstado, filterCidade, sortField, filterFolderId]);

  const totalPages   = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE));
  const pagedContacts = useMemo(
    () => filteredContacts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredContacts, page],
  );

  // Reset to page 1 whenever filters/sort change
  useEffect(() => setPage(1), [deferredSearch, filterStage, filterOptIn, filterNeedsReview, filterInactivityDays, filterEstado, filterCidade, sortField, filterFolderId]);

  // Selection logic
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const openContact = useCallback((c: Contact) => setSelectedContact(c), []);

  const selectedWithRestrictions = useMemo(() => {
     let optInFalse = 0;
     let needsReview = 0;
     selectedIds.forEach(id => {
         const c = contacts.find(x => x.id === id);
         if (c) {
             if (!c.optIn) optInFalse++;
             if (c.needsReview) needsReview++;
         }
     });
     return { optInFalse, needsReview, canSend: optInFalse === 0 && needsReview === 0 };
  }, [selectedIds, contacts]);

  const handleSendToCampaign = () => {
    if (!selectedWithRestrictions.canSend) {
        alert('Não é possível adicionar à campanha: alguns contatos selecionados não possuem opt-in ou precisam de revisão.');
        return;
    }
    navigate('/campaigns', { state: { selectedIds: Array.from(selectedIds) } });
  };

  const handleSelectTop100 = () => {
    const top100 = filteredContacts.slice(0, 100).map(c => c.id);
    setSelectedIds(new Set(top100));
  };

  const handleExport = () => {
    const dataToExport = filteredContacts.map(c => ({
      Nome: c.nome,
      Telefone: c.telefoneE164,
      Email: c.email || '',
      Cidade: c.cidade || '',
      Estado: c.estado || '',
      Estagio: c.stage,
      Atividade: c.lastContactAt ? new Date(c.lastContactAt).toLocaleString() : '',
      Tags: c.tags?.join(', ') || ''
    }));

    const csvContent = Papa.unparse(dataToExport);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "contatos.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isExtractingGoogle, setIsExtractingGoogle] = useState(false);

  const handleExtractGoogle = async () => {
    try {
      let token = await getAccessToken();
      if (!token) {
        // Must call signInWithPopup without any async gaps (like window.confirm or setTimeout)
        const result = await googleSignIn();
        if (result) {
          token = result.accessToken;
        } else {
          return;
        }
      }

      
      setIsExtractingGoogle(true);
      const gContacts = await fetchGoogleContacts();
      const newContacts: Omit<Contact, 'id' | 'createdAt'>[] = [];
      const currentPhones = new Set(contacts.flatMap(c => [c.telefoneE164, c.telefoneRaw]));

      for (const gc of gContacts) {
        const phoneData = gc.phoneNumbers?.[0];
        const rawPhone = phoneData?.value || '';
        const e164 = phoneData?.canonicalForm || '+' + rawPhone.replace(/\D/g, '');
        
        if (!rawPhone || rawPhone.replace(/\D/g, '').length < 10) continue;
        
        if (currentPhones.has(e164) || currentPhones.has(rawPhone)) {
            continue;
        }

        let name = 'Desconhecido (Google)';
        if (gc.names && gc.names.length > 0) {
           name = gc.names[0].givenName || gc.names[0].displayName || name;
        }
        
        // extrair apenas o primeiro nome se houver espacos
        name = name.trim().split(' ')[0] || '';

        const estadoFromPhone = getStateFromPhone(e164);

        newContacts.push({
          nome: name,
          telefoneRaw: rawPhone,
          telefoneE164: e164,
          email: '',
          cidade: '',
          estado: estadoFromPhone,
          interesse: '',
          produto: '',
          tags: ['origem:google'],
          stage: 'Novo Lead',
          status: 'active',
          notes: 'Extraído do Google Contacts',
          lastContactAt: null,
          needsReview: true,
          optIn: true
        });
        
        currentPhones.add(e164);
      }
      
      let added = 0;
      for (let i = 0; i < newContacts.length; i += 450) {
        const chunk = newContacts.slice(i, i + 450);
        await bulkCreateContacts(chunk);
        added += chunk.length;
      }
      
      alert(`Extração do Google concluída. ${added} novos contatos adicionados!`);
    } catch (e: any) {
      console.error(e);
      alert('Erro ao extrair Google Contacts: ' + e.message);
    } finally {
      setIsExtractingGoogle(false);
    }
  };

  const handleExtractWhatsApp = async () => {
    
    setIsExtracting(true);
    try {
      const waChats = await fetchChats();
      const rawChats = Array.isArray(waChats) ? waChats : (waChats.data || []);
      
      const newContacts: Omit<Contact, 'id' | 'createdAt'>[] = [];
      const currentPhones = new Set(contacts.flatMap(c => [c.telefoneE164, c.telefoneRaw]));

      for (const wc of rawChats) {
        const jid = wc.remoteJid || wc.id; // fallback to id just in case
        if (!jid || typeof jid !== 'string') continue;
        
        const identity = extractWhatsAppIdentity({
          sender: jid,
          remoteJid: jid
        });

        if (!identity.isValid || !identity.phoneE164) {
          continue;
        }
        
        const rawPhone = identity.phoneE164;
        const e164 = '+' + rawPhone;
        
        if (currentPhones.has(e164) || currentPhones.has(rawPhone)) {
            continue;
        }

        const name = wc.name || wc.pushName || 'Desconhecido (WA)';
        const estadoFromWaPhone = getStateFromPhone(e164);

        newContacts.push({
          nome: name,
          telefoneRaw: rawPhone,
          telefoneE164: e164,
          email: '',
          cidade: '',
          estado: estadoFromWaPhone,
          interesse: '',
          produto: '',
          tags: ['origem:wa'],
          stage: 'Novo Lead',
          status: 'active',
          notes: 'Extraído do WhatsApp',
          lastContactAt: null,
          needsReview: true,
          optIn: true
        });
        
        // Prevent adding multiple entries for the same in loop
        currentPhones.add(e164);
      }
      
      let added = 0;
      // batch inserts in chunks of 450 to respect firestore limits
      for (let i = 0; i < newContacts.length; i += 450) {
        const chunk = newContacts.slice(i, i + 450);
        await bulkCreateContacts(chunk);
        added += chunk.length;
      }
      
      alert(`Extração concluída. ${added} novos contatos adicionados!`);
    } catch (e: any) {
      console.error(e);
      alert('Erro ao extrair WhatsApp: ' + e.message);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Page Header / Topbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 md:mb-6">
        <div className="hidden md:block">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">Contatos</h2>
          <p className="text-[#94A3B8] text-sm">
            {loading ? 'Carregando...' : `${filteredContacts.length} contatos encontrados.`}
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
          <button 
            onClick={handleExtractGoogle}
            disabled={isExtractingGoogle}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isExtractingGoogle ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} 
            Extrair Google
          </button>
          <button 
            onClick={() => setIsSyncModalOpen(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-black transition-all hover:scale-105 active:scale-95 duration-150"
          >
            <RefreshCw size={16} /> 
            Sincronizar WhatsApp
          </button>
          <button 
            onClick={handleExport}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} /> Exportar
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
          >
            <Upload size={16} /> Importar CSV
          </button>
          {contacts.some(c => { const n = (c.nome||'').trim().toLowerCase(); return !n || n==='usuário' || n==='usuario' || n==='desconhecido' || n.startsWith('desconhecido ('); }) && (
            <button
              onClick={handleRemoveUnnamed}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-rose-900/30 border border-rose-700/50 hover:bg-rose-900/50 text-rose-400 rounded-lg text-sm font-medium transition-colors"
              title="Remove contatos sem nome ou com nome genérico (Usuário, Desconhecido)"
            >
              <Trash size={16} /> Remover sem nome
            </button>
          )}
          <button className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Contato
          </button>
        </div>
      </div>

      {/* Folder Bar */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 hide-scrollbar">
        {/* "Todos" chip */}
        <button
          onClick={() => setFilterFolderId(null)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            filterFolderId === null
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
          }`}
        >
          <Folder size={12} /> Todos ({contacts.length})
        </button>

        {/* Folder chips */}
        {folders.map(f => {
          const count = contacts.filter(c => c.folderId === f.id).length;
          const isActive = filterFolderId === f.id;
          return (
            <div key={f.id} className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all group ${
              isActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}>
              {renamingFolderId === f.id ? (
                <input
                  autoFocus
                  value={renamingValue}
                  onChange={e => setRenamingValue(e.target.value)}
                  onBlur={() => handleRenameFolder(f.id)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(f.id); if (e.key === 'Escape') setRenamingFolderId(null); }}
                  className="bg-transparent outline-none w-24 text-white"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <button onClick={() => setFilterFolderId(f.id)} className="flex items-center gap-1.5">
                  <FolderOpen size={12} /> {f.name} <span className="opacity-60">({count})</span>
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setRenamingFolderId(f.id); setRenamingValue(f.name); }}
                className="ml-1 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                title="Renomear"
              ><Pencil size={11} /></button>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteFolder(f.id, f.name); }}
                className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity text-rose-400"
                title="Excluir pasta"
              ><Trash2 size={11} /></button>
            </div>
          );
        })}

        {/* Create folder */}
        {creatingFolder ? (
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-indigo-500 bg-indigo-600/10">
            <FolderPlus size={12} className="text-indigo-400" />
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); } }}
              onBlur={() => { if (newFolderName.trim()) handleCreateFolder(); else { setCreatingFolder(false); setNewFolderName(''); } }}
              placeholder="Nome da pasta..."
              className="bg-transparent outline-none text-white w-28"
            />
          </div>
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-all"
          >
            <FolderPlus size={12} /> Nova Pasta
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col xl:flex-row gap-3 mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="relative flex-1 min-w-[250px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar nome, telefone ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2 xl:border-l xl:border-zinc-800 xl:pl-3">
          <Filter size={16} className="text-zinc-500 mr-1" />
          <select 
            value={filterStage}
            onChange={e => setFilterStage(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-2 text-sm focus:outline-none w-36"
          >
            <option value="todos">Todos estágios</option>
            <option value="Novo Lead">Novo Lead</option>
            <option value="Interessado">Interessado</option>
            <option value="Orçamento Enviado">Orç. Enviado</option>
            <option value="Negociação">Negociação</option>
            <option value="Cliente">Cliente</option>
          </select>

          <select 
            value={filterOptIn}
            onChange={e => setFilterOptIn(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-2 text-sm focus:outline-none w-28"
          >
            <option value="todos">Opt-in (Tds)</option>
            <option value="sim">Permitidos</option>
            <option value="nao">Bloqueados</option>
          </select>

          <select 
            value={filterInactivityDays}
            onChange={e => setFilterInactivityDays(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-2 text-sm focus:outline-none w-36"
          >
            <option value="todos">Qualquer Ativ.</option>
            <option value="7">Sem ativ. {'>'} 7 dias</option>
            <option value="15">Sem ativ. {'>'} 15 dias</option>
            <option value="30">Sem ativ. {'>'} 30 dias</option>
          </select>
          
          <input
            type="text"
            placeholder="Estado..."
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-2 text-sm focus:outline-none w-24"
          />

          <input
            type="text"
            placeholder="Cidade..."
            value={filterCidade}
            onChange={e => setFilterCidade(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white rounded-lg px-2 py-2 text-sm focus:outline-none w-28"
          />

          <label className="flex items-center gap-2 text-sm text-zinc-300 ml-2 cursor-pointer bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg">
              <input type="checkbox" checked={filterNeedsReview} onChange={e => setFilterNeedsReview(e.target.checked)} className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-950" />
              Revisar apenas
          </label>
        </div>
      </div>

      {/* Batch Actions Bar (Floating) */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-600 border border-indigo-500 text-white p-3 rounded-xl mb-4 flex flex-col sm:flex-row items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-4 gap-4">
          <div className="text-sm font-medium px-2">
              {selectedIds.size} contatos selecionados
              {(!selectedWithRestrictions.canSend) && (
                  <span className="ml-3 text-red-200 border-l border-indigo-400 pl-3">
                      Lote inválido p/ campanha ({selectedWithRestrictions.optInFalse} sem opt-in, {selectedWithRestrictions.needsReview} precisam revisão)
                  </span>
              )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-sm font-medium transition-colors flex items-center gap-1">
               <Tag size={14} /> Tags
            </button>

            {/* Move to folder dropdown */}
            <div className="relative" ref={moveDropdownRef}>
              <button
                onClick={() => setMoveDropdownOpen(v => !v)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
              >
                <FolderOpen size={14} /> Mover para pasta <ChevronDown size={12} />
              </button>
              {moveDropdownOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[180px]">
                  <button
                    onClick={() => handleMoveToFolder(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                  >
                    <Folder size={14} /> Sem pasta
                  </button>
                  {folders.length > 0 && <div className="border-t border-zinc-800 my-1" />}
                  {folders.map(f => (
                    <button
                      key={f.id}
                      onClick={() => handleMoveToFolder(f.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                    >
                      <FolderOpen size={14} className="text-indigo-400" /> {f.name}
                    </button>
                  ))}
                  {folders.length === 0 && (
                    <p className="px-3 py-2 text-xs text-zinc-600">Nenhuma pasta criada</p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSendToCampaign}
              disabled={!selectedWithRestrictions.canSend}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1 ${selectedWithRestrictions.canSend ? 'bg-white text-indigo-600 hover:bg-zinc-100' : 'bg-white/50 text-indigo-800 cursor-not-allowed'}`}
            >
              <ArrowRight size={14} /> Enviar p/ Campanha
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-md text-sm font-bold transition-colors flex items-center gap-1 text-white"
            >
              <Trash size={14} /> Remover
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-zinc-950 border-b border-zinc-800 p-2 flex justify-between gap-2 text-sm text-zinc-400 items-center px-4">
            <button
              onClick={handleSelectTop100}
              disabled={filteredContacts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
            >
              <CheckSquare size={14} /> Selecionar 100 mais recentes
            </button>
            <div className="flex items-center gap-2">
              Ordenar por:
              <select value={sortField} onChange={e => setSortField(e.target.value as any)} className="bg-zinc-900 border-zinc-800 rounded px-2 py-1 focus:outline-none">
                  <option value="lastMessageAt">Últ. Mensagem (Recentes)</option>
                  <option value="lastContactAt">Últ. Atividade</option>
                  <option value="nome">Nome (A-Z)</option>
              </select>
            </div>
        </div>
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 size={32} className="animate-spin text-zinc-500 mb-4" />
            <p className="text-zinc-400">Carregando contatos...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
              <Search size={32} />
            </div>
            <p className="text-lg font-medium text-white mb-1">Nenhum contato encontrado</p>
            <p className="max-w-md mx-auto">
              {search || filterStage !== 'todos' || filterOptIn !== 'todos' || filterNeedsReview || filterInactivityDays !== 'todos'
                ? 'Tente remover alguns filtros para ver mais resultados.' 
                : 'Você ainda não possui contatos. Importe um arquivo CSV para começar.'}
            </p>
            {(!search && filterStage === 'todos') && (
              <button 
                onClick={() => setIsImportModalOpen(true)}
                className="mt-6 px-6 py-2.5 bg-white text-zinc-950 font-medium rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Importar CSV
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header row */}
            <div className="flex items-center bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-medium flex-shrink-0" style={{ height: 40 }}>
              <div className="w-12 flex-shrink-0 flex items-center justify-center">
                <button onClick={toggleSelectAll} className="text-zinc-500 hover:text-white transition-colors">
                  {selectedIds.size === filteredContacts.length && filteredContacts.length > 0 ? <CheckSquare size={17} /> : <Square size={17} />}
                </button>
              </div>
              <div className="flex-1 min-w-0 px-3">Nome</div>
              <div className="w-40 flex-shrink-0 px-3">Telefone</div>
              <div className="w-36 flex-shrink-0 px-3 hidden sm:block">Estágio</div>
              <div className="w-32 flex-shrink-0 px-3 hidden lg:block">Localização</div>
              <div className="w-28 flex-shrink-0 px-3 hidden md:block">Últ. Atividade</div>
              <div className="w-14 flex-shrink-0 px-3 text-center">Opt-in</div>
              <div className="w-10 flex-shrink-0" />
            </div>
            {/* Paginated list body */}
            <div className="flex-1 overflow-y-auto">
              {pagedContacts.map((c, i) => (
                <VirtualRow
                  key={c.id}
                  index={i}
                  style={{ height: ROW_HEIGHT }}
                  contacts={pagedContacts}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  openContact={openContact}
                />
              ))}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-t border-zinc-800 bg-zinc-950 text-xs text-zinc-400">
                <span className="tabular-nums">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredContacts.length)} de {filteredContacts.length} contatos
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >«</button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >‹</button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-zinc-600">…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className={`min-w-[28px] px-2 py-1 rounded font-medium transition-colors ${
                            page === p
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-zinc-800 text-zinc-400'
                          }`}
                        >{p}</button>
                      )
                    )}

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >›</button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >»</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isImportModalOpen && <ImportCSVModal onClose={() => setIsImportModalOpen(false)} existingContacts={contacts} targetFolderId={filterFolderId} />}
      {isSyncModalOpen && <SyncWhatsAppModal onClose={() => setIsSyncModalOpen(false)} />}
      <ContactDrawer contact={selectedContact} onClose={() => setSelectedContact(null)} />
      {deleteModal.open && (
        <DeleteModal
          ids={deleteModal.ids}
          onClose={() => setDeleteModal({ open: false, ids: [] })}
          onDone={() => { setSelectedIds(new Set()); setDeleteModal({ open: false, ids: [] }); }}
        />
      )}
    </div>
  );
};
