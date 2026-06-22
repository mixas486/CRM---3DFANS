import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Shield, Plus, Trash2, Mail, ShieldAlert, CheckCircle2, UserCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface AllowedUser {
  email: string;
  role: 'admin' | 'viewer';
}

export const Permissions: React.FC = () => {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<'admin' | 'viewer'>('viewer');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'system', 'users', 'allowed'));
      const list: AllowedUser[] = [];
      snap.forEach(d => { list.push({ email: d.id, ...d.data() } as AllowedUser); });
      setUsers(list);
    } catch (error) { console.error("Erro ao buscar usuários", error); }
    finally { setLoading(false); }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsSaving(true);
    const email = emailInput.trim().toLowerCase();
    try {
      await setDoc(doc(db, 'system', 'users', 'allowed', email), { role: roleInput });
      setEmailInput('');
      fetchUsers();
    } catch (error) { console.error("Erro ao adicionar usuário", error); alert('Erro ao salvar permissão'); }
    finally { setIsSaving(false); }
  };

  const handleRemoveUser = async (email: string) => {
    if (email === 'michelskapp@gmail.com') { alert('O Super Admin não pode ser removido.'); return; }
    if (window.confirm(`Remover acesso de ${email}?`)) {
      try { await deleteDoc(doc(db, 'system', 'users', 'allowed', email)); fetchUsers(); }
      catch (error) { console.error("Erro ao remover", error); }
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="hidden md:block">
        <h2 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">Permissões de Acesso <Shield className="text-[#6D5DFC]" size={24} /></h2>
        <p className="text-[#94A3B8] text-sm font-medium">Gerencie quem pode acessar o CRM e seus respectivos níveis de permissão.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-[#0B1020] backdrop-blur-xl border border-white/5 rounded-3xl p-6 sticky top-24">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Plus size={18} className="text-[#22C55E]" /> Adicionar Usuário</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#94A3B8] uppercase tracking-widest mb-1.5">Email do Google</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="exemplo@gmail.com" required
                    className="w-full bg-[#050816] border border-white/10 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#6D5DFC]/50 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#94A3B8] uppercase tracking-widest mb-1.5">Nível de Acesso</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`cursor-pointer px-4 py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${roleInput === 'viewer' ? 'bg-[#6D5DFC]/10 border-[#6D5DFC]/30 text-[#6D5DFC]' : 'bg-[#050816] border-white/5 text-[#94A3B8] hover:bg-white/5'}`}>
                    <input type="radio" name="role" value="viewer" checked={roleInput === 'viewer'} onChange={() => setRoleInput('viewer')} className="hidden" />
                    <UserCircle size={18} /><span className="text-xs font-bold">Visualizador</span>
                  </label>
                  <label className={`cursor-pointer px-4 py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${roleInput === 'admin' ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]' : 'bg-[#050816] border-white/5 text-[#94A3B8] hover:bg-white/5'}`}>
                    <input type="radio" name="role" value="admin" checked={roleInput === 'admin'} onChange={() => setRoleInput('admin')} className="hidden" />
                    <ShieldAlert size={18} /><span className="text-xs font-bold">Admin</span>
                  </label>
                </div>
              </div>
              <button type="submit" disabled={isSaving || !emailInput.trim()}
                className="w-full py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-50 mt-2"
                style={{ background: 'linear-gradient(135deg, #6D5DFC, #5B4AE0)' }}>
                {isSaving ? 'Salvando...' : 'Liberar Acesso'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#0B1020] backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-white/5 bg-[#050816]/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><CheckCircle2 size={18} className="text-[#6D5DFC]" /> Usuários Autorizados</h3>
            </div>
            <div className="divide-y divide-white/5">
              <div className="p-5 flex items-center justify-between bg-[#F59E0B]/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] flex items-center justify-center border border-[#F59E0B]/30 font-bold"><ShieldAlert size={18} /></div>
                  <div><p className="font-bold text-white text-sm">michelskapp@gmail.com</p><p className="text-xs text-[#F59E0B]/80 font-mono mt-0.5">Super Admin (Dono)</p></div>
                </div>
                <span className="text-xs text-[#94A3B8] font-bold uppercase tracking-widest px-3 py-1 bg-black/30 rounded-full border border-white/5">Intocável</span>
              </div>
              {loading ? (
                <div className="p-12 text-center text-[#94A3B8]">Carregando permissões...</div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-[#94A3B8]">Nenhum outro usuário cadastrado.</div>
              ) : (
                users.map(u => (
                  <motion.div key={u.email} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 flex items-center justify-between hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold ${u.role === 'admin' ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30' : 'bg-[#6D5DFC]/10 text-[#6D5DFC] border-[#6D5DFC]/30'}`}>
                        {u.role === 'admin' ? <ShieldAlert size={18} /> : <UserCircle size={18} />}
                      </div>
                      <div><p className="font-bold text-white text-sm">{u.email}</p><p className={`text-xs font-mono mt-0.5 ${u.role === 'admin' ? 'text-[#F59E0B]/80' : 'text-[#6D5DFC]/80'}`}>{u.role === 'admin' ? 'Administrador' : 'Visualizador'}</p></div>
                    </div>
                    <button onClick={() => handleRemoveUser(u.email)} className="p-2 bg-[#EF4444]/10 text-[#EF4444] rounded-lg hover:bg-[#EF4444] hover:text-white transition-colors opacity-0 group-hover:opacity-100" title="Revogar Acesso"><Trash2 size={16} /></button>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
