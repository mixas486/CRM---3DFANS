import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Users, Trello, Megaphone, Inbox, Settings, LogOut, MessageSquare, Send, Activity, LayoutDashboard, Bot, Power, Sparkles } from 'lucide-react';
import { getConnectionState } from '../services/evolution';
import { subscribeToConnectionStatus } from '../services/firestore';
import { subscribeToQuotaError } from '../utils/firestoreErrorHandler';
import { firebaseConfig } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

import { SdrGlobalToggle } from './SdrGlobalToggle';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [connStatus, setConnStatus] = useState<string>('checking');
  const [hasQuotaError, setHasQuotaError] = useState(false);
  const [sdrGlobal, setSdrGlobal] = useState<any>(null);
  const [agentConfig, setAgentConfig] = useState<any>(null);

  useEffect(() => {
    // Initial fetch to get instant state if not cached
    getConnectionState().then(res => {
        if (res?.instance?.state === 'open') setConnStatus('online');
        else if (res?.instance?.state === 'connecting') setConnStatus('connecting');
        else setConnStatus('offline');
    }).catch(() => setConnStatus('offline'));

    // Real-time listener for updates via Webhook
    const unsubscribe = subscribeToConnectionStatus(
      (status) => {
        if (status === 'open') setConnStatus('online');
        else if (status === 'connecting') setConnStatus('connecting');
        else setConnStatus('offline');
      },
      () => {}
    );
        
    // Subscribe to SDR system config
    const unsubSdr = onSnapshot(doc(db, 'system', 'system'), (snap) => {
        if (snap.exists()) setSdrGlobal(snap.data());                
    });

    // Subscribe to Agent config
    const unsubAgent = onSnapshot(doc(db, 'system', 'config', 'settings', 'aiAgent'), (snap) => {
        if (snap.exists()) setAgentConfig(snap.data());
    });
    
    // Subscribe to quota error status
    const unsubQuota = subscribeToQuotaError((status) => {
      setHasQuotaError(status);
    });
    
    return () => {
      unsubscribe();
      unsubSdr();
      unsubAgent();
      unsubQuota();
    };
  }, []);

  const toggleGlobalSdr = async () => {
      try {
          const sdrRef = doc(db, 'system', 'system');
          await updateDoc(sdrRef, {
              globalSDREnabled: !sdrGlobal?.globalSDREnabled
          });
      } catch (e) {
          console.error("Failed to toggle global automation", e);
      }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { to: '/inbox', label: 'Inbox', icon: <Inbox size={20} /> },
    { to: '/contacts', label: 'Contatos', icon: <Users size={20} /> },
    { to: '/campaigns', label: 'Campanhas', icon: <Megaphone size={20} /> },
    { to: '/pipeline', label: 'Funil', icon: <Trello size={20} /> },
    { to: '/ai', label: agentConfig?.agentName ? `IA: ${agentConfig.agentName}` : 'Agente IA', icon: <Bot size={20} /> },
    { to: '/admin/ai-agent', label: 'Config Agente', icon: <Sparkles size={20} /> },
    { to: '/analytics', label: 'Analytics', icon: <Activity size={20} /> },
    { to: '/settings', label: 'Configurações', icon: <Settings size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-950/80 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            <MessageSquare size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">3DFANS CRM</h1>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-400 font-medium shadow-[inset_2px_0_0_rgba(99,102,241,1)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800/80">
          <div className="mb-4 px-3 flex flex-col">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Logado como</span>
            <span className="text-sm font-medium text-zinc-300 truncate">{user?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 text-zinc-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-black to-black -z-10 pointer-events-none" />
        
        {hasQuotaError && (
          <div className="bg-red-950/80 border-b border-red-800/40 px-6 py-4 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 z-50 animate-in slide-in-from-top duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)]" />
                <h4 className="text-sm font-black text-white uppercase tracking-wider">Cota do Firestore Excedida (Spark Plan)</h4>
              </div>
              <p className="text-zinc-300 text-xs font-normal leading-relaxed max-w-4xl">
                Você atingiu o limite de consultas gratuitas do Firestore (cerca de 50 mil leituras diárias). A cota diária é renovada automaticamente pelo Firebase no próximo dia. Para reestabelecer o funcionamento de imediato, recomendamos ativar o Faturamento (Spark para Blaze) clicando no botão para abrir as configurações oficiais de Upgrade do banco de dados no painel da Google/Firebase:
              </p>
            </div>
            <div className="flex items-center gap-3 self-stretch md:self-auto shrink-0">
              <a 
                href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/crm-3dfans/data`}
                target="_blank" 
                rel="noreferrer"
                className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)] block text-center cursor-pointer"
              >
                Liberar Firestore (Upgrade)
              </a>
            </div>
          </div>
        )}

        {/* Topbar */}
        <header className="h-16 bg-zinc-950/50 backdrop-blur-md border-b border-zinc-800/80 flex items-center justify-between px-8 z-10 shrink-0">
          <div className="text-zinc-400 font-medium tracking-wide text-sm flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
             Visão Geral
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <SdrGlobalToggle />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm whitespace-nowrap">
               <div className={`w-2 h-2 rounded-full ${
                   connStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                   connStatus === 'connecting' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse' : 
                   'bg-rose-500 shadow-[0_0_8px_rgba(243,24,60,0.5)]'
               }`} />
               <span className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">
                  {connStatus === 'online' ? 'WA Online' : connStatus === 'connecting' ? 'Conectando...' : 'Offline'}
               </span>
            </div>
          </div>
        </header>

        {/* Main Content Scroll */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
