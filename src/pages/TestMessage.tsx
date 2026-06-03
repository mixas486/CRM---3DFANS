import React, { useState, useEffect, useMemo } from 'react';
import { subscribeToContacts } from '../services/firestore';
import { sendTextMessage } from '../services/evolution';
import { extractWhatsAppIdentity } from '../utils/whatsappIdentity';
import { Contact } from '../types';
import { Send, Search, Users, AlertCircle, CheckCircle2, Loader2, MessageSquareText } from 'lucide-react';

export const TestMessage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToContacts(
      (data) => setContacts(data),
      (err) => console.error("Error loading contacts:", err)
    );
    return () => unsub();
  }, []);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => 
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.telefoneE164.includes(searchTerm)
    );
  }, [contacts, searchTerm]);

  const toggleSelection = (contactId: string) => {
    const newSelection = new Set(selectedContactIds);
    if (newSelection.has(contactId)) {
      newSelection.delete(contactId);
    } else {
      newSelection.add(contactId);
    }
    setSelectedContactIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleSendTest = async () => {
    if (selectedContactIds.size === 0) {
      setSendStatus({ type: 'error', msg: 'Selecione ao menos um contato.' });
      return;
    }
    if (!message.trim()) {
      setSendStatus({ type: 'error', msg: 'A mensagem não pode estar vazia.' });
      return;
    }

    setIsSending(true);
    setSendStatus(null);
    let successCount = 0;
    let failCount = 0;

    const targets = contacts.filter(c => selectedContactIds.has(c.id));

    try {
      for (const contact of targets) {
        try {
          const rawNumber = contact.telefoneE164 || contact.phoneE164 || contact.telefoneRaw || '';
          const identity = extractWhatsAppIdentity({
            sender: rawNumber,
            remoteJid: rawNumber
          });

          if (!identity.isValid || !identity.phoneE164 || !identity.phoneE164.startsWith('55') || identity.phoneE164.length < 12) {
            console.error('[SEND BLOCKED] Invalid phone:', identity.phoneE164 || rawNumber);
            failCount++;
            continue;
          }

          const numberPhone = identity.phoneE164;
          await sendTextMessage(numberPhone, message);
          successCount++;
        } catch (err) {
          console.error(`Erro ao enviar para ${contact.nome}:`, err);
          failCount++;
        }
      }

      setSendStatus({ 
        type: failCount === 0 ? 'success' : 'error', 
        msg: `Envio concluído: ${successCount} sucesso(s), ${failCount} falha(s).` 
      });
      if (failCount === 0) {
        setMessage('');
        setSelectedContactIds(new Set());
      }
    } catch (e: any) {
      setSendStatus({ type: 'error', msg: e.message || 'Erro inesperado ao enviar.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl flex items-center gap-3 font-bold tracking-tight text-white mb-2">
            <Send className="text-indigo-500" /> Disparo de Teste
          </h1>
          <p className="text-zinc-400">Página para realizar disparos em massa apenas para contatos selecionados de forma isolada.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Contacts List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col h-[600px] overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                placeholder="Buscar contatos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-zinc-900"
                  checked={filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                  onChange={handleSelectAll}
                />
                <span>Selecionar todos ({filteredContacts.length})</span>
              </label>
              <span className="text-xs text-indigo-400 font-medium">
                {selectedContactIds.size} selecionado(s)
              </span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">Nenhum contato encontrado.</div>
            ) : (
              filteredContacts.map(contact => (
                <label key={contact.id} className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-700 transition-colors">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-zinc-900"
                    checked={selectedContactIds.has(contact.id)}
                    onChange={() => toggleSelection(contact.id)}
                  />
                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-medium text-zinc-300 truncate">{contact.nome}</div>
                    <div className="text-xs text-zinc-500">{contact.telefoneE164}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Message Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <MessageSquareText className="text-zinc-400" size={20} /> Conteúdo da Mensagem
            </h2>
            
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem de teste aqui..."
              className="w-full h-48 bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />

            {sendStatus && (
              <div className={`p-4 rounded-lg flex items-center gap-3 text-sm ${
                sendStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {sendStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                {sendStatus.msg}
              </div>
            )}

            <button
              onClick={handleSendTest}
              disabled={isSending || selectedContactIds.size === 0 || !message.trim()}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-auto"
            >
              {isSending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Enviando ({selectedContactIds.size} contatos)...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Enviar Teste
                </>
              )}
            </button>
        </div>

      </div>
    </div>
  );
};
