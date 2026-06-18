import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, limit, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { PreviewCard } from './PreviewCard';
import { logger } from '../../../services/logging/logger';
import { Loader2, Image as ImageIcon, Filter } from 'lucide-react';

export const PreviewGrid: React.FC = () => {
  const [previews, setPreviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    logger.info('ADMIN_PREVIEWS', 'Starting realtime listener');
    
    let q = query(
      collection(db, 'previews'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    if (filter !== 'all') {
      q = query(q, where('generationStatus', '==', filter));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPreviews(data);
      setLoading(false);
      console.log('[PREVIEW ADMIN] Realtime updated', data.length, 'items');
    });

    return () => unsubscribe();
  }, [filter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-white/40 gap-4">
        <Loader2 className="animate-spin text-blue-500" size={40} />
        <p className="text-sm font-medium animate-pulse tracking-widest uppercase">Carregando Galeria...</p>
      </div>
    );
  }

  if (previews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-white/20 gap-4 border-2 border-dashed border-white/5 rounded-3xl m-8">
        <ImageIcon size={60} strokeWidth={1} />
        <p className="text-lg">Nenhuma preview gerada ainda.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header & Controls */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="w-2 h-10 bg-blue-500 rounded-full" />
            Galeria <span className="text-white/40">Premium</span>
          </h1>
          <p className="text-white/40 mt-2 text-sm">Acompanhe e gerencie todas as miniaturas geradas por IA em tempo real.</p>
        </div>

        <div className="flex items-center gap-2 bg-[#121214] p-1.5 rounded-xl border border-white/5">
           {['all', 'success', 'error'].map((f) => (
             <button
               key={f}
               onClick={() => setFilter(f)}
               className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-widest ${
                 filter === f ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:text-white'
               }`}
             >
               {f === 'all' ? 'Todos' : f === 'success' ? 'Sucesso' : 'Falhas'}
             </button>
           ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
        {previews.map((preview) => (
          <PreviewCard 
            key={preview.id} 
            preview={preview} 
            onOpenLead={(id) => console.log('Open lead', id)}
            onRegenerate={(id) => console.log('Regenerate', id)}
          />
        ))}
      </div>
    </div>
  );
};
