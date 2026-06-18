import React from 'react';
import { ExternalLink, Download, MessageCircle, RefreshCcw, User, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PreviewCardProps {
  preview: any;
  onOpenLead: (id: string) => void;
  onRegenerate: (id: string) => void;
}

export const PreviewCard: React.FC<PreviewCardProps> = ({ preview, onOpenLead, onRegenerate }) => {
  const isSuccess = preview.generationStatus === 'success';

  return (
    <div className="group relative bg-[#121214] border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/50 transition-all duration-300 shadow-2xl">
      {/* Image Container */}
      <div className="relative aspect-[4/5] overflow-hidden bg-black/40">
        <img 
          src={preview.previewImageUrl} 
          alt={preview.customerName}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          loading="lazy"
        />
        
        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => window.open(preview.previewImageUrl, '_blank')}
              className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-medium border border-white/10"
            >
              <ExternalLink size={14} /> Abrir
            </button>
            <a 
              href={preview.previewImageUrl} 
              download={`preview_${preview.customerName}.png`}
              className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-lg border border-white/10"
            >
              <Download size={14} />
            </a>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${
          isSuccess ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
        }`}>
          {isSuccess ? 'Gerada' : 'Falha'}
        </div>
      </div>

      {/* Info Content */}
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-white font-semibold text-sm truncate max-w-[140px]">
              {preview.customerName}
            </h3>
            <p className="text-white/40 text-[10px] flex items-center gap-1">
              {format(preview.createdAt?.toDate?.() || new Date(), "dd 'de' MMM, HH:mm", { locale: ptBR })}
            </p>
          </div>
          {preview.originalImageUrl && (
            <div className="relative w-10 h-12 rounded-lg overflow-hidden border border-white/10 group/thumb">
               <img src={preview.originalImageUrl} className="w-full h-full object-cover opacity-50 group-hover/thumb:opacity-100 transition-opacity" alt="Original" />
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <ImageIcon size={10} className="text-white/20" />
               </div>
            </div>
          )}
          <div className="text-right">
            <span className="text-blue-400 font-bold text-sm">
              R$ {preview.quoteValue || 597}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button 
            onClick={() => onOpenLead(preview.contactId)}
            className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors border border-blue-500/20"
            title="Ver Lead"
          >
            <User size={14} />
          </button>
          <button 
            className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors border border-green-500/20 flex-1 flex items-center justify-center gap-2 text-xs font-medium"
            title="Falar no WhatsApp"
          >
            <MessageCircle size={14} /> WhatsApp
          </button>
          <button 
            onClick={() => onRegenerate(preview.previewId)}
            className="p-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-lg transition-colors border border-white/10"
            title="Regenerar IA"
          >
            <RefreshCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
