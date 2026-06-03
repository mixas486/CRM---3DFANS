import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { useContacts } from '../hooks/useContacts';
import { createContact, bulkCreateContacts } from '../services/firestore';
import { fetchChats } from '../services/evolution';
import { getAccessToken, googleSignIn, initAuth } from '../services/auth';
import { fetchGoogleContacts } from '../services/googleContacts';
import { getStateFromPhone } from '../lib/phone';
import { extractWhatsAppIdentity } from '../utils/whatsappIdentity';
import { ImportCSVModal } from '../features/contacts/ImportCSVModal';
import { SyncWhatsAppModal } from '../features/contacts/SyncWhatsAppModal';
import { ContactDrawer } from '../features/contacts/ContactDrawer';
import { Contact, ContactStage } from '../types';
import { Search, Plus, Upload, Filter, Tag, ArrowRight, MoreHorizontal, Loader2, CheckSquare, Square, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ContactsPage: React.FC = () => {
  const { contacts, loading } = useContacts();
  const [search, setSearch] = useState('');
  
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
  
  const [sortField, setSortField] = useState<'lastContactAt' | 'nome'>('lastContactAt');

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
      if (search) {
        const s = search.toLowerCase();
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

      return true;
    });

    // Sort
    result.sort((a, b) => {
        if (sortField === 'nome') {
            return (a.nome || '').localeCompare(b.nome || '');
        } else {
            const timeA = a.lastContactAt || 0;
            const timeB = b.lastContactAt || 0;
            return timeB - timeA; // Descending (most recent first)
        }
    });

    return result;
  }, [contacts, search, filterStage, filterOptIn, filterNeedsReview, filterInactivityDays, filterEstado, filterCidade, sortField]);

  // Selection logic
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

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
    console.log('Sending to campaign ids:', Array.from(selectedIds));
    navigate('/campaigns?audience=selected'); 
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1">Contatos</h2>
          <p className="text-zinc-400 text-sm">
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
          <button className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Contato
          </button>
        </div>
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
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md text-sm font-medium transition-colors flex items-center gap-1">
               <Tag size={14} /> Tags
            </button>
            <button 
              onClick={handleSendToCampaign}
              disabled={!selectedWithRestrictions.canSend}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1 ${selectedWithRestrictions.canSend ? 'bg-white text-indigo-600 hover:bg-zinc-100' : 'bg-white/50 text-indigo-800 cursor-not-allowed'}`}
            >
              <ArrowRight size={14} /> Enviar p/ Campanha
            </button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-zinc-950 border-b border-zinc-800 p-2 flex justify-end gap-2 text-sm text-zinc-400 items-center px-4">
            Ordernar por: 
            <select value={sortField} onChange={e => setSortField(e.target.value as any)} className="bg-zinc-900 border-zinc-800 rounded px-2 py-1 focus:outline-none">
                <option value="lastContactAt">Data Ativ. (Recentes)</option>
                <option value="nome">Nome (A-Z)</option>
            </select>
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
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-950 sticky top-0 z-10 border-b border-zinc-800 shadow-sm">
                <tr className="text-zinc-400 font-medium">
                  <th className="px-4 py-3 w-12 text-center">
                    <button onClick={toggleSelectAll} className="text-zinc-500 hover:text-white transition-colors">
                      {selectedIds.size === filteredContacts.length ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Estágio</th>
                  <th className="px-4 py-3">Localização</th>
                  <th className="px-4 py-3">Últ. Atividade</th>
                  <th className="px-4 py-3 text-center">Opt-in</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredContacts.map(contact => {
                  const isSelected = selectedIds.has(contact.id);
                  return (
                    <tr 
                      key={contact.id} 
                      className={`hover:bg-zinc-800/50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-500/10' : ''} ${contact.needsReview ? 'bg-amber-950/20' : ''}`}
                      onClick={() => setSelectedContact(contact)}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => { e.stopPropagation(); toggleSelect(contact.id); }}>
                        <button className={`transition-colors ${isSelected ? 'text-indigo-400' : 'text-zinc-600 hover:text-zinc-400'}`}>
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white flex items-center gap-2">
                            {contact.nome}
                            {contact.needsReview && <span title="Revisão pendente"><AlertTriangle size={14} className="text-amber-500" /></span>}
                        </div>
                        {contact.email && <div className="text-xs text-zinc-500">{contact.email}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-300">
                          {contact.telefoneE164}
                          {contact.telefoneRaw !== contact.telefoneE164 && <span className="block text-[10px] text-zinc-500 mt-0.5" title="Original importado">{contact.telefoneRaw}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-md text-xs font-medium">
                          {contact.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {contact.cidade || contact.estado ? (
                          <>
                            {contact.cidade} {contact.cidade && contact.estado ? '-' : ''} {contact.estado}
                          </>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                          {contact.lastContactAt ? new Date(contact.lastContactAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className={`inline-block w-2.5 h-2.5 rounded-full ${contact.optIn ? 'bg-green-500' : 'bg-red-500'}`} title={contact.optIn ? 'Permitido' : 'Bloqueado'} />
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500">
                        <MoreHorizontal size={18} className="inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isImportModalOpen && <ImportCSVModal onClose={() => setIsImportModalOpen(false)} existingContacts={contacts} />}
      {isSyncModalOpen && <SyncWhatsAppModal onClose={() => setIsSyncModalOpen(false)} />}
      <ContactDrawer contact={selectedContact} onClose={() => setSelectedContact(null)} />
    </div>
  );
};
