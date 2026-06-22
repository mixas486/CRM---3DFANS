import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, Trello, Megaphone, Inbox, Settings, LogOut, MessageSquare, Send, Activity, LayoutDashboard, Bot, Power, Sparkles, Image as ImageIcon, BarChart2, TrendingUp, Terminal, FileText, Menu, X } from 'lucide-react';
import { getConnectionState } from '../services/evolution';
import { subscribeToConnectionStatus } from '../services/firestore';
import { subscribeToQuotaError } from '../utils/firestoreErrorHandler';
import { firebaseConfig } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AnimatePresence, motion } from 'framer-motion';

import { SdrGlobalToggle } from './SdrGlobalToggle';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [connStatus, setConnStatus] = useState<string>('checking');
  const [hasQuotaError, setHasQuotaError] = useState(false);
  const [sdrGlobal, setSdrGlobal] = useState<any>(null);
  const [agentConfig, setAgentConfig] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    getConnectionState().then(res => {
        if (res?.instance?.state === 'open') setConnStatus('online');
        else if (res?.instance?.state === 'connecting') setConnStatus('connecting');
        else setConnStatus('offline');
    }).catch(() => setConnStatus('offline'));
    const unsubscribe = subscribeToConnectionStatus(
      (status) => {
        if (status === 'open') setConnStatus('online');
        else if (status === 'connecting') setConnStatus('connecting');
        else setConnStatus('offline');
      },
      () => {}
    );
    const unsubSdr = onSnapshot(doc(db, 'system', 'system'), (snap) => {
        if (snap.exists()) setSdrGlobal(snap.data());                
    });
    const unsubAgent = onSnapshot(doc(db, 'system', 'config', 'settings', 'aiAgent'), (snap) => {
        if (snap.exists()) setAgentConfig(snap.data());
    });
    const unsubQuota = subscribeToQuotaError((status) => {
      setHasQuotaError(status);
    });
    return () => { unsubscribe(); unsubSdr(); unsubAgent(); unsubQuota(); };
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  const toggleGlobalSdr = async () => {
      try {
          const sdrRef = doc(db, 'system', 'system');
          await updateDoc(sdrRef, { globalSDREnabled: !sdrGlobal?.globalSDREnabled });
      } catch (e) { console.error("Failed to toggle global automation", e); }
  };

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const mainNavItems = [
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/inbox', label: 'Inbox', icon: <Inbox size={20} /> },
    { to: '/campaigns', label: 'Campanhas', icon: <Megaphone size={20} /> },
    { to: '/contacts', label: 'Contatos', icon: <Users size={20} /> },
  ];

  const secondaryNavItems = [
    { to: '/pipeline', label: 'Funil', icon: <Trello size={20} /> },
    { to: '/ai', label: agentConfig?.agentName ? `IA: ${agentConfig.agentName}` : 'Agente IA', icon: <Bot size={20} /> },
    { to: '/orcamentos', label: 'Orçamentos', icon: <FileText size={20} /> },
    { to: '/admin/previews', label: 'Previews IA', icon: <ImageIcon size={20} /> },
    { to: '/admin/insights', label: 'Análise de Leads', icon: <TrendingUp size={20} /> },
    { to: '/admin/ai-agent', label: 'Config Agente', icon: <Sparkles size={20} /> },
    { to: '/admin/ai-usage', label: 'Custo IA', icon: <BarChart2 size={20} /> },
    { to: '/admin/logs', label: 'Logs do Sistema', icon: <Terminal size={20} /> },
    { to: '/analytics', label: 'Analytics', icon: <Activity size={20} /> },
    { to: '/permissions', label: 'Permissões', icon: <Users size={20} /> },
    { to: '/settings', label: 'Configurações', icon: <Settings size={20} /> },
  ];

  const allNavItems = [...mainNavItems, ...secondaryNavItems];

  const getPageTitle = () => {
    const item = allNavItems.find(i => location.pathname.startsWith(i.to));
    return item ? item.label : 'Visão Geral';
  };

  return (
    <div className="flex h-[100dvh] bg-[#050816] text-white font-sans selection:bg-[#6D5DFC]/30 overflow-hidden">
      {/* Sidebar Desktop */}
      <div className="hidden md:flex w-64 bg-[#0B1020]/90 backdrop-blur-xl border-r border-white/5 flex-col z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#6D5DFC] flex items-center justify-center shadow-[0_0_15px_rgba(109,93,252,0.4)]">
            <MessageSquare size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">3DFANS CRM</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto pb-4">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-[#6D5DFC]/10 text-[#6D5DFC] font-semibold border border-[#6D5DFC]/20'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="mb-4 px-3 flex flex-col">
            <span className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">Logado como</span>
            <span className="text-sm font-semibold text-white truncate">{user?.email}</span>
          </div>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-3 text-[#94A3B8] hover:text-[#EF4444] hover:bg-white/5 rounded-xl transition-colors font-semibold">
            <LogOut size={20} /> Sair
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#6D5DFC]/10 via-[#050816] to-[#050816] -z-10 pointer-events-none" />
        
        {hasQuotaError && (
          <div className="bg-[#EF4444]/10 border-b border-[#EF4444]/20 px-4 py-3 backdrop-blur-xl flex flex-col items-start gap-3 z-50 animate-in slide-in-from-top duration-300">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]" />
                <h4 className="text-xs font-black text-[#EF4444] uppercase tracking-widest">Cota do Firestore Excedida</h4>
              </div>
              <p className="text-white/70 text-[11px] leading-relaxed max-w-4xl">Limite de leituras diárias excedido. Faça upgrade para o plano Blaze para continuar.</p>
            </div>
            <a href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/crm-3dfans/data`} target="_blank" rel="noreferrer"
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] block text-center w-full md:w-auto">
              Liberar Firestore
            </a>
          </div>
        )}

        {/* Topbar Mobile (App Style) */}
        <header className="md:hidden h-[60px] bg-[#0B1020]/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 z-40 shrink-0 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#6D5DFC] flex items-center justify-center shadow-[0_0_15px_rgba(109,93,252,0.4)]">
              <MessageSquare size={16} className="text-white" />
            </div>
            <span className="font-bold text-white tracking-tight">{getPageTitle()}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
                 connStatus === 'online' ? 'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                 connStatus === 'connecting' ? 'bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse' : 
                 'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]'
             }`} />
          </div>
        </header>

        {/* Topbar Desktop */}
        <header className="hidden md:flex h-16 bg-[#0B1020]/50 backdrop-blur-md border-b border-white/5 items-center justify-between px-8 z-10 shrink-0">
          <div className="text-[#94A3B8] font-semibold tracking-wide text-sm flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-[#6D5DFC]"></div>
             {getPageTitle()}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <SdrGlobalToggle />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 bg-[#0B1020] backdrop-blur-sm">
               <div className={`w-2 h-2 rounded-full ${
                   connStatus === 'online' ? 'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                   connStatus === 'connecting' ? 'bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse' : 
                   'bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]'
               }`} />
               <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest">
                  {connStatus === 'online' ? 'WhatsApp Online' : connStatus === 'connecting' ? 'Conectando...' : 'Offline'}
               </span>
            </div>
          </div>
        </header>

        {/* Main Content Scroll */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[80px] md:pb-0 scroll-smooth">
          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>

        {/* Bottom Navigation Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[72px] bg-[#0B1020]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-50 pb-safe">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full h-full gap-1 transition-all ${
                  isActive ? 'text-[#6D5DFC]' : 'text-[#94A3B8] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-[#6D5DFC]/10 scale-110' : ''}`}>
                    {React.cloneElement(item.icon as React.ReactElement, { size: 22, strokeWidth: isActive ? 2.5 : 2 })}
                  </div>
                  <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all ${
              mobileMenuOpen ? 'text-[#6D5DFC]' : 'text-[#94A3B8] hover:text-white'
            }`}>
            <div className={`p-1 rounded-xl transition-all ${mobileMenuOpen ? 'bg-[#6D5DFC]/10 scale-110' : ''}`}>
              <Menu size={22} strokeWidth={mobileMenuOpen ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] tracking-wide ${mobileMenuOpen ? 'font-bold' : 'font-medium'}`}>Mais</span>
          </button>
        </nav>

        {/* Mobile Menu "Mais" (Bottom Sheet) */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={() => setMobileMenuOpen(false)} />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0B1020] border-t border-white/10 rounded-t-[32px] z-[70] max-h-[85vh] flex flex-col pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                <div className="flex justify-center p-3 shrink-0">
                  <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                </div>
                <div className="flex items-center justify-between px-6 pb-4 border-b border-white/5 shrink-0">
                  <h2 className="text-lg font-bold text-white">Mais Opções</h2>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-full bg-white/5 text-[#94A3B8]"><X size={20} /></button>
                </div>
                <div className="overflow-y-auto px-4 py-2">
                  <div className="mb-4 mt-2 px-2 flex items-center justify-between bg-[#6D5DFC]/10 p-4 rounded-2xl border border-[#6D5DFC]/20">
                    <span className="text-sm font-bold text-[#6D5DFC]">IA SDR Global</span>
                    <SdrGlobalToggle />
                  </div>
                  <div className="space-y-1 mb-6">
                    {secondaryNavItems.map((item) => (
                      <NavLink key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-4 px-4 py-4 rounded-2xl transition-colors ${
                            isActive ? 'bg-white/10 text-white font-bold' : 'text-[#94A3B8] hover:bg-white/5 hover:text-white font-semibold'
                          }`
                        }>
                        {item.icon}
                        <span className="text-base">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                  <div className="border-t border-white/5 pt-4 pb-8">
                    <div className="px-4 mb-4">
                      <p className="text-[11px] text-[#94A3B8] font-bold uppercase tracking-widest mb-1">Logado como</p>
                      <p className="text-sm text-white font-semibold truncate">{user?.email}</p>
                    </div>
                    <button onClick={handleLogout}
                      className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-[#EF4444]/10 text-[#EF4444] font-bold hover:bg-[#EF4444]/20 transition-colors border border-[#EF4444]/20">
                      <LogOut size={20} /> Sair do Sistema
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
