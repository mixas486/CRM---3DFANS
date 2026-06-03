import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const SdrGlobalToggle: React.FC = () => {
  const [sdrGlobal, setSdrGlobal] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system', 'system'), (snap) => {
      if (snap.exists()) setSdrGlobal(snap.data());                
    });
    return unsub;
  }, []);

  const toggleGlobalSdr = async () => {
    try {
      const sdrRef = doc(db, 'system', 'system');
      await setDoc(sdrRef, {
        globalSDREnabled: !sdrGlobal?.globalSDREnabled
      }, { merge: true });
    } catch (e) {
      console.error("Failed to toggle global automation", e);
    }
  };

  return (
    <button 
      onClick={toggleGlobalSdr}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm transition-all ${sdrGlobal?.globalSDREnabled ? 'text-indigo-400 border-indigo-500/30' : 'text-zinc-400 hover:text-zinc-200'}`}
    >
      <Bot size={12} />
      <span className="text-[10px] font-semibold uppercase tracking-widest">IA {sdrGlobal?.globalSDREnabled ? 'ATIVADA' : 'DESLIGADA'}</span>
    </button>
  );
};
