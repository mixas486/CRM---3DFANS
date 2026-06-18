import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { subscribeToInboxChats, subscribeToInboxMessages, InboxChat, subscribeToSyncStatus, SyncStatus, markChatAsRead } from '../services/inbox';
import { sendTextMessage, sendMediaMessage, syncHistory } from '../services/evolution';
import { extractWhatsAppPhone } from '../utils/whatsapp';
import { ContactDrawer } from '../features/contacts/ContactDrawer';
import { Search, MessageSquare, Send, Sparkles, Image as ImageIcon, Loader2, User as UserIcon, RefreshCw, SmartphoneNfc, AlertCircle, Paperclip, Mic, Smile, Check, CheckCheck, MoreVertical, Filter, X } from 'lucide-react';
import { Contact } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDropzone } from 'react-dropzone';
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';
import { useContacts } from '../hooks/useContacts';
import { getSettings, updateContact } from '../services/firestore';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, updateDoc, onSnapshot } from 'firebase/firestore';
import { normalizeChat } from '../utils/chatNormalizer';

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

const toast = {
  error: (msg: string) => {
    alert(msg);
  },
  success: (msg: string) => {
    alert(msg);
  }
};

function normalizePhone(phone?: string): string {
  if (!phone) return '';
  return phone
    .replace('@s.whatsapp.net', '')
    .replace(/[^\d]/g, '');
}

function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  return phone.length >= 10; // Simple validation: Country code + area code + number
}

const ChatSkeleton = () => (
    <div className="h-[72px] px-4 mx-2 my-1 rounded-xl flex items-center bg-zinc-900/40 border border-zinc-800/30 animate-pulse">
        <div className="w-12 h-12 rounded-full bg-zinc-800/50 shrink-0" />
        <div className="flex-1 ml-3 flex flex-col justify-center gap-2">
            <div className="flex justify-between">
                <div className="h-3 w-28 bg-zinc-800/50 rounded" />
                <div className="h-2 w-10 bg-zinc-800/50 rounded" />
            </div>
            <div className="h-2 w-48 bg-zinc-800/50 rounded" />
        </div>
    </div>
);

// Helper for "Você:"
const msgIsMine = (chat: InboxChat) => {
    // If the last message was outbound
    return chat.lastMessage?.includes('status='); 
};

const ChatRowItem = React.memo(({ chat, isSelected, onClick, style }: { chat: InboxChat, isSelected: boolean, onClick: (chat: InboxChat) => void, style?: React.CSSProperties }) => {
    // Determine random score or status for demo premium feel if real not available
    const score = chat.contact?.valorEstimado ? chat.contact.valorEstimado > 3000 ? 'hot' : 'warm' : 'cold';
    
    return (
        <div style={style} className="px-2 py-0.5">
            <div 
                onClick={() => onClick(chat)}
                className={`h-[76px] px-3 rounded-2xl cursor-pointer transition-all duration-300 flex items-center group relative overflow-hidden shrink-0 ${
                isSelected 
                    ? 'bg-gradient-to-r from-indigo-500/10 to-transparent border border-indigo-500/20 shadow-[inset_1px_0_0_rgba(99,102,241,1)]' 
                    : 'bg-transparent hover:bg-zinc-800/40 border border-transparent'
                }`}
            >
                {isSelected && (
                    <motion.div layoutId="selected-indicator" className="absolute left-0 top-0 bottom-0 w-[2px] bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)]" />
                )}
                <div className="flex gap-3 w-full pr-1">
                    <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center shadow-inner relative group-hover:shadow-md transition-shadow">
                            {chat.profilePicUrl ? (
                                <img src={chat.profilePicUrl} alt={chat.pushName} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            ) : (
                                <UserIcon size={18} className="text-zinc-500" />
                            )}
                        </div>
                        {/* Online Indicator */}
                        <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        
                        {chat.unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 z-10 scale-90">
                                <span className="flex h-4 w-4">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
                                </span>
                            </div>
                        )}
                    </div>
                
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex justify-between items-end mb-1">
                            <h4 className={`text-[15px] tracking-tight truncate flex items-center gap-1.5 ${isSelected ? 'font-semibold text-white' : 'font-medium text-zinc-100'}`}>
                                {chat.contact ? chat.contact.nome : chat.pushName}
                                {score === 'hot' && <Sparkles size={10} className="text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.6)]" />}
                            </h4>
                            <span className={`text-[10px] uppercase font-bold tracking-wider whitespace-nowrap ml-2 ${chat.unreadCount > 0 ? 'text-indigo-400' : 'text-zinc-500'}`}>
                                {new Date(chat.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center gap-2">
                                <p className={`text-[13px] leading-tight truncate flex-1 transition-colors ${chat.unreadCount > 0 ? 'text-zinc-200 font-medium' : 'text-zinc-500 group-hover:text-zinc-400'}`}>
                                    <span className={msgIsMine(chat) ? 'opacity-60 text-[11px] mr-1 uppercase font-medium tracking-wide' : 'hidden'}>Você:</span>
                                    {chat.lastMessage || '...'}
                                </p>
                                <AnimatePresence>
                                {chat.unreadCount > 0 && (
                                    <motion.span 
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        className="inline-flex shrink-0 items-center justify-center min-w-[20px] h-[20px] px-1.5 bg-indigo-500 rounded-full text-[10px] font-bold text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]"
                                    >
                                        {chat.unreadCount}
                                    </motion.span>
                                )}
                                </AnimatePresence>
                            </div>
                            
                            {/* Premium Tags Preview */}
                            <div className="flex gap-1.5 overflow-hidden">
                                {chat.contact?.stage && (
                                     <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-sky-500/10 text-sky-400 border border-sky-500/20 uppercase font-semibold tracking-wider font-mono truncate">
                                        {chat.contact.stage}
                                     </span>
                                )}
                                {chat.contact?.tags?.slice(0,1).map(tag => (
                                     <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-[4px] bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase font-semibold tracking-wider font-mono truncate">
                                        {tag}
                                     </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
ChatRowItem.displayName = 'ChatRowItem';

import { Play, Pause, FileAudio, FileImage, FileText, Reply, Download } from 'lucide-react';

const AudioPlayer = ({ url, isOut }: { url?: string; isOut: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);

    if (!url) return;

    setLoading(true);
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(isFinite(audio.duration) ? audio.duration : 0);
      setLoading(false);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const handleError = () => { setLoadError(true); setLoading(false); };
    const handleCanPlay = () => setLoading(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    audio.src = url;
    audio.load();

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [url]);

  const togglePlay = async () => {
    if (!audioRef.current || loadError) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Audio play failed:', err);
        setLoadError(true);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPercent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audioRef.current.currentTime = clickPercent * duration;
    setCurrentTime(clickPercent * duration);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const barsCount = 28;
  const heights = useMemo(() => {
    return Array.from({ length: barsCount }).map(() => Math.max(4, Math.random() * 20));
  }, []);

  if (!url) {
    return (
      <div className="flex items-center gap-2 py-1 opacity-50 text-[11px]">
        <FileAudio size={16} />
        <span>Áudio indisponível</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 opacity-50 ${isOut ? 'bg-white/20' : 'bg-zinc-700'}`}>
          <Play size={16} className="fill-current" />
        </div>
        <div className="flex flex-col flex-1 min-w-[140px]">
          <span className="text-[11px] opacity-60">Áudio não pôde ser carregado</span>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-[10px] underline opacity-50 hover:opacity-80">
              Abrir link direto
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1">
      <button
        onClick={togglePlay}
        disabled={loading}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-60 ${
          isOut
            ? 'bg-white text-indigo-600 hover:scale-105 hover:bg-zinc-100 shadow-md'
            : 'bg-indigo-600 hover:scale-105 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/10'
        }`}
      >
        {loading
          ? <Loader2 size={16} className="animate-spin" />
          : isPlaying
            ? <Pause size={18} className="fill-current" />
            : <Play size={18} className="fill-current ml-1" />}
      </button>

      <div className="flex flex-col flex-1 min-w-[140px]">
        <div
          onClick={handleSeek}
          className="flex items-center gap-0.5 h-6 cursor-pointer relative group"
        >
          {heights.map((h, i) => {
            const isFilled = (i / barsCount) * 100 <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all duration-150 ${
                  isFilled
                    ? isOut ? 'bg-white' : 'bg-indigo-500'
                    : isOut ? 'bg-white/30' : 'bg-zinc-600'
                }`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        <div className="flex justify-between text-[10px] font-mono font-medium opacity-70 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '–:––'}</span>
        </div>
      </div>

      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-transparent relative overflow-hidden ml-1">
        <Mic size={14} className={isOut ? 'text-white/60' : 'text-indigo-400/60'} />
      </div>
    </div>
  );
};

const ImageBubble = ({ url }: { url: string }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return (
        <>
            <div 
                className="relative group rounded-xl overflow-hidden mb-1 cursor-zoom-in"
                onClick={() => setIsExpanded(true)}
            >
                <img src={url} alt="Media" className="w-full max-w-[280px] object-cover rounded-xl" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                     <button className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 shadow-xl">
                         <ImageIcon size={18} />
                     </button>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsExpanded(false)}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out"
                    >
                        <motion.img 
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            src={url} 
                            alt="Fullscreen" 
                            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" 
                        />
                        <button 
                            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center transition-all"
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                        >
                            <X size={24} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

const MessageBubble = React.memo(({ msg, isOut, showTail }: { msg: any, isOut: boolean, showTail: boolean }) => {
    // Detect types from Firestore fields or text fallbacks
    const isAudio = msg.mediaType === 'audio' || msg.messageType === 'audioMessage' || msg.body?.startsWith('[AUDIO]') || msg.body?.startsWith('[ÁUDIO]') || msg.body?.startsWith('[AUDIO]');
    const isImage = msg.mediaType === 'image' || msg.messageType === 'imageMessage' || msg.body?.startsWith('[IMAGE]') || msg.body?.startsWith('[IMAGEM]');
    const isVideo = msg.mediaType === 'video' || msg.messageType === 'videoMessage' || msg.body?.startsWith('[VIDEO]');
    const isSticker = msg.mediaType === 'sticker' || msg.messageType === 'stickerMessage' || msg.body?.startsWith('[STICKER]') || msg.body?.startsWith('[FIGURINHA]');
    const isDocument = msg.mediaType === 'document' || msg.messageType === 'documentMessage' || msg.body?.startsWith('[DOCUMENTO]') || msg.body?.startsWith('[DOCUMENT]');
    
    // Helper to handle proxy for encrypted WhatsApp URLs
    const getFinalMediaUrl = (url?: string) => {
        if (!url) return '';
        // If it's already a proxy URL or a base64, return as is
        if (url.startsWith('/api/evolution/media-proxy') || url.startsWith('data:')) return url;
        // If it's a WhatsApp encrypted URL, point to our proxy
        if (url.includes('whatsapp.net') || url.includes('whatsapp.com')) {
             return `/api/evolution/media-proxy?instance=${msg.instanceId || msg.instance || '3dfans'}&msgId=${msg.id}`;
        }
        return url;
    };

    const mediaUrl = getFinalMediaUrl(msg.mediaUrl);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`flex mb-1 w-full group ${isOut ? 'justify-end' : 'justify-start'}`}
        >
            <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2 relative backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-md ${
                isOut 
                ? `bg-indigo-600/90 hover:bg-indigo-600 text-white border border-indigo-500/50 ${showTail ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl'}` 
                : `bg-zinc-800/80 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/50 ${showTail ? 'rounded-2xl rounded-bl-sm' : 'rounded-2xl'}`
            }`}>
                {/* Reply action overlay */}
                <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all ${isOut ? '-left-12' : '-right-12'}`}>
                    <button className="w-8 h-8 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 hover:text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                        <Reply size={14} className={isOut ? '' : 'scale-x-[-1]'} />
                    </button>
                </div>

                {isImage ? (
                    <>
                       <ImageBubble url={mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop'} />
                       <span className="text-[15px] leading-relaxed whitespace-pre-wrap block font-normal text-left">{msg.body?.replace('[IMAGE]', '').replace('[IMAGEM]', '').trim() || ''}</span>
                    </>
                ) : isAudio ? (
                    <AudioPlayer url={mediaUrl} isOut={isOut} />
                ) : isVideo ? (
                    <div className="rounded-xl overflow-hidden mb-1">
                       <video src={mediaUrl} controls className="max-w-[280px] rounded-xl outline-none" />
                       <span className="text-[15px] leading-relaxed whitespace-pre-wrap block font-normal text-left mt-1">{msg.body?.replace('[VIDEO]', '').trim() || ''}</span>
                    </div>
                ) : isSticker ? (
                    <div className="max-w-[120px] rounded-lg overflow-hidden my-1">
                       <img src={mediaUrl} alt="Sticker" className="w-full h-auto object-contain" />
                    </div>
                ) : isDocument ? (
                    <div className="flex items-center gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-700/50 my-1 min-w-[220px]">
                      <FileText size={28} className="text-indigo-400 shrink-0" />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-semibold truncate text-white">{msg.body?.replace('[DOCUMENTO]', '').replace('[DOCUMENT]', '').trim() || 'Documento'}</p>
                        <span className="text-[9px] text-zinc-400 font-mono">Clique para baixar</span>
                      </div>
                      <a href={mediaUrl} target="_blank" rel="noreferrer" className="p-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-lg transition-colors shrink-0">
                        <Download size={14} />
                      </a>
                    </div>
                ) : (
                    <span className="text-[15px] leading-relaxed whitespace-pre-wrap block font-normal text-left">{msg.body}</span>
                )}
                
                <div className={`flex items-center gap-1 mt-1 ml-4 float-right min-w-10 ${isAudio ? 'mt-2' : ''}`}>
                <span className="text-[10px] font-medium opacity-60">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {isOut && (
                    <span className="opacity-80">
                        {msg.status === 'sending' || msg.status === 'pending' ? <Loader2 size={10} className="animate-spin" /> : 
                        msg.status === 'read' ? <CheckCheck size={12} className="text-sky-300" /> : 
                        msg.status === 'delivered' ? <CheckCheck size={12} /> : 
                        <Check size={12} />}
                    </span>
                )}
                </div>
                <div className="clear-both"></div>
            </div>
        </motion.div>
    );
});
MessageBubble.displayName = 'MessageBubble';

export const InboxPage = () => {
  const { contacts } = useContacts();
  const [rawChats, setRawChats] = useState<InboxChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const chats = useMemo(() => {
    const enriched = rawChats.map(chat => {
      const parsedPhone = extractWhatsAppPhone(chat.id);
      const possiblePhone = chat.telefoneE164 || chat.phoneE164 || parsedPhone || chat.chatId;
      const phone = normalizePhone(possiblePhone);
        
      const contact = contacts.find(c => {
        if (!phone) return false;
        const cPhone = (c.telefoneE164 || c.phoneE164 || c.telefoneRaw || '').replace(/[^\d]/g, '');
        if (!cPhone) return false;
        return cPhone.endsWith(phone) || phone.endsWith(cPhone);
      });
      return {
        ...chat,
        contact
      };
    });
    return enriched.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }, [rawChats, contacts]);

  const selectedChat = useMemo(() => {
    return chats.find(c => c.id === selectedChatId) || null;
  }, [chats, selectedChatId]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [drawerContact, setDrawerContact] = useState<Contact | null>(null);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filterTags, setFilterTags] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [agentConfig, setAgentConfig] = useState<any>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'system', 'config', 'settings', 'aiAgent'), (snap) => {
        if (snap.exists()) setAgentConfig(snap.data());
    });
  }, []);

  const handleToggleSdr = async (enable: boolean) => {
      if (!selectedChat) return;
      try {
          const chatRef = doc(db, 'chats', selectedChat.chatId);
          await updateDoc(chatRef, {
              sdrEnabled: enable,
              humanTakeover: !enable
          });
          toast.success(`${agentConfig?.agentName || 'Automação'} ${enable ? 'ativado' : 'desativado'} com sucesso.`);
      } catch (e: any) {
          toast.error(`Erro ao atualizar ${agentConfig?.agentName || 'IA'}: ` + e.message);
      }
  };

  useEffect(() => {
    const unsubscribe = subscribeToSyncStatus((status) => {
      if (status) {
        // Auto-clear syncing if no updates for 15 seconds
        if (status.status === 'syncing' && status.updatedAt) {
          if (Date.now() - status.updatedAt > 15000) {
             setSyncStatus({ ...status, status: 'idle' });
             return;
          }
        }
      }
      setSyncStatus(status);
    });
    
    // Safety interval to clear stuck sync UI
    const interval = setInterval(() => {
      setSyncStatus(current => {
         if (current && current.status === 'syncing' && current.updatedAt) {
            if (Date.now() - current.updatedAt > 15000) {
               return { ...current, status: 'idle' };
            }
         }
         return current;
      });
    }, 5000);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleSyncHistory = async () => {
    if (syncStatus?.status === 'syncing' || syncingHistory) return;
    
    setSyncingHistory(true);
    try {
      await syncHistory();
    } catch (err: any) {
      alert(`Falha ao iniciar sincronização: ${err.message}`);
    } finally {
      setSyncingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...files]);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setAttachedFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const onEmojiClick = (emojiData: EmojiClickData) => {
      setInputText(prev => prev + emojiData.emoji);
  };

  // Firestore Realtime Subscription for Chats
  useEffect(() => {
    const unsubscribe = subscribeToInboxChats(
       (incomingChats) => {
         console.log('[CHAT MERGE]', {
             totalIncoming: incomingChats.length
         });
         setRawChats(prev => {
             const map = new Map(prev.map(chat => [chat.chatId, chat]));
             incomingChats.forEach(raw => {
                 const normalized = normalizeChat(raw);
                 console.log('[SNAPSHOT CHAT]', {
                     chatId: normalized.chatId,
                     lastMessage: normalized.lastMessage,
                     lastMessageAt: normalized.lastMessageAt,
                 });
                 map.set(normalized.chatId, { ...map.get(normalized.chatId), ...normalized });
             });
             const sorted = Array.from(map.values()).sort((a,b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
             console.log('[SNAPSHOT MERGE]', {
                 totalIncoming: incomingChats.length,
                 totalRendered: sorted.length
             });
             return sorted;
         });
         setLoadingChats(false);
         setError('');
       },
       (err) => {
          console.error("Erro ao assinar chats:", err);
          setError('Falha ao conectar com o banco de dados (Realtime).');
          setLoadingChats(false);
       }
    );

    return () => unsubscribe();
  }, []);

  // Automatic Opt-out check on fully hydrated chats
  useEffect(() => {
    if (chats.length === 0) return;
    
    let optOutKeywords: string[] = [];
    getSettings().then(s => {
       if (s && s.optOutKeywords) {
          optOutKeywords = s.optOutKeywords.map((k: string) => k.toLowerCase().trim());
          for (const chat of chats) {
             if (chat.contact && chat.contact.optIn && chat.lastMessage) {
                const msgLower = chat.lastMessage.toLowerCase().trim();
                if (optOutKeywords.includes(msgLower)) {
                    updateContact(chat.contact.id, { 
                        optIn: false, 
                        notes: "Descadastrado (Opt-out automático via palavra-chave: " + chat.lastMessage + ")\n\n" + (chat.contact.notes || '') 
                    });
                }
             }
          }
       }
    });
  }, [chats]);

  // Firestore Realtime Subscription for Messages
  useEffect(() => {
    if (selectedChatId) {
      setLoadingMessages(true);
      console.log("[MESSAGES QUERY]", selectedChatId);
      
      const chatToRead = chats.find(c => c.id === selectedChatId);
      if (chatToRead && chatToRead.unreadCount > 0) {
         markChatAsRead(selectedChatId);
      }

      const unsubscribe = subscribeToInboxMessages(
         selectedChatId,
         (msgs) => {
            console.log("[MESSAGES LOADED]", msgs.length, msgs);
            setMessages(msgs);
            setLoadingMessages(false);
         },
         (err) => {
            console.error("Erro ao assinar mensagens:", err);
            setLoadingMessages(false);
         }
      );
      
      return () => unsubscribe();
    } else {
      setMessages([]);
    }
  }, [selectedChatId]);

  // Smooth scroll
  useEffect(() => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if ((!inputText.trim() && attachedFiles.length === 0) || !selectedChat) return;
    
    const number =
      selectedChat.contact?.telefoneE164 ||
      selectedChat.contact?.phoneE164 ||
      selectedChat.contact?.telefoneRaw ||
      selectedChat.telefoneE164 ||
      selectedChat.chatId ||
      '';

    const realPhone = normalizePhone(number);

    console.log(
      '[INBOX SEND]',
      {
        selectedChat,
        contact: selectedChat.contact,
        resolvedPhone: realPhone
      }
    );

    if (!isValidPhone(realPhone)) {
      console.error(
        '[INBOX SEND BLOCKED]',
        realPhone
      );
      toast.error(
        'Telefone inválido'
      );
      return;
    }

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);
    
    try {
      if (attachedFiles.length > 0) {
        const file = attachedFiles[0];
        setAttachedFiles(prev => prev.filter((_, i) => i !== 0));
        
        const base64Data = await fileToBase64(file);
        
        let mediatype = 'document';
        if (file.type.startsWith('image/')) mediatype = 'image';
        else if (file.type.startsWith('audio/')) mediatype = 'audio';
        else if (file.type.startsWith('video/')) mediatype = 'video';

        const localPreviewUrl = `data:${file.type};base64,${base64Data}`;

        const fakeId = Date.now().toString();
        setMessages(prev => [...prev, {
            id: fakeId, 
            direction: 'outbound',
            body: textToSend || file.name,
            timestamp: Date.now(),
            status: 'sending',
            mediaType: mediatype,
            mediaUrl: localPreviewUrl
        }]);

        await sendMediaMessage(realPhone, base64Data, mediatype, textToSend, file.name);
        
        setDoc(doc(db, 'chats', selectedChat.chatId), {
            lastMessage: textToSend || `[${mediatype}]`,
            lastMessageAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        
      } else {
        const fakeId = Date.now().toString();
        setMessages(prev => [...prev, {
            id: fakeId, 
            direction: 'outbound',
            body: textToSend,
            timestamp: Date.now(),
            status: 'sending',
            mediaType: 'text'
        }]);

        await sendTextMessage(realPhone, textToSend);
        
        // Optimistic update of chat so it pops to the top immediately
        setDoc(doc(db, 'chats', selectedChat.chatId), {
           lastMessage: textToSend,
           lastMessageAt: serverTimestamp(),
           updatedAt: serverTimestamp()
        }, { merge: true });
        
      }
    } catch (err: any) {
      alert("Erro ao enviar: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const filteredChats = useMemo(() => {
    if (!debouncedSearch) return chats;
    return chats.filter(c => 
      c.pushName?.toLowerCase().includes(debouncedSearch.toLowerCase()) || 
      c.contact?.nome.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [chats, debouncedSearch]);

  const virtualizer = useVirtualizer({
    count: filteredChats.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76, // 72px items + 4px margin
    overscan: 10,
  });

  const handleChatSelect = useCallback((chat: InboxChat) => {
      setSelectedChatId(chat.id);
  }, []);

    const renderMessages = () => {
        let lastDate = '';
        const items: React.ReactNode[] = [];

        messages.forEach((msg, idx) => {
            const msgDate = new Date(msg.timestamp).toLocaleDateString();
            
            // Date separator
            if (msgDate !== lastDate) {
                items.push(
                    <div key={`date-${msgDate}`} className="flex justify-center my-6">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 bg-zinc-900/50 px-3 py-1 rounded-full backdrop-blur-md border border-zinc-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                            {msgDate === new Date().toLocaleDateString() ? 'Hoje' : msgDate}
                        </span>
                    </div>
                );
                lastDate = msgDate;
            }

            const isOut = msg.direction === 'outbound';
            const showTail = idx === messages.length - 1 || messages[idx + 1]?.direction !== msg.direction || new Date(messages[idx+1]?.timestamp).toLocaleDateString() !== msgDate;

            items.push(
                <MessageBubble key={msg.id || idx} msg={msg} isOut={isOut} showTail={showTail} />
            );
        });
        
        return items;
    };

  return (
    <div className="h-[calc(100vh-5rem)] -m-4 sm:-m-8 flex overflow-hidden font-sans bg-black rounded-lg sm:rounded-2xl border border-zinc-800/80 shadow-2xl relative z-0">
      
      {/* Glow Effect */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* 1. Lista de conversas (esquerda) */}
      <div className="w-full md:w-80 lg:w-96 border-r border-zinc-800/60 bg-zinc-950/40 backdrop-blur-2xl flex flex-col shrink-0">
        <div className="px-5 py-6 border-b border-zinc-800/60 shrink-0">
          <div className="flex items-center justify-between mb-5">
             <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight">Caixa de Entrada</h2>
             <div className="flex gap-2">
               <button 
                 onClick={handleSyncHistory} 
                 disabled={syncStatus?.status === 'syncing' || syncingHistory}
                 className={`p-2 rounded-full hover:bg-white/10 text-zinc-400 transition-colors tooltip flex items-center justify-center ${(syncStatus?.status === 'syncing' || syncingHistory) ? 'text-indigo-400' : ''}`}
                 title="Sincronizar Histórico"
               >
                 <RefreshCw size={18} className={(syncStatus?.status === 'syncing' || syncingHistory) ? 'animate-spin' : ''} />
               </button>
               <button className="p-2 rounded-full hover:bg-white/10 text-zinc-400 transition-colors tooltip" title="Filtros">
                 <Filter size={18} />
               </button>
               <button className="p-2 rounded-full hover:bg-white/10 text-zinc-400 transition-colors">
                 <MoreVertical size={18} />
               </button>
             </div>
          </div>
          {/* Real-time Sync Progress Board */}
          {syncStatus?.status === 'syncing' && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-950/25 backdrop-blur-md flex flex-col gap-2 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Loader2 size={13} className="animate-spin text-indigo-400" />
                     <span className="text-xs font-semibold text-indigo-300">Sincronizando WhatsApp...</span>
                  </div>
                  <span className="text-[9px] font-mono bg-indigo-500/25 text-indigo-300 px-1.5 py-0.5 rounded-full uppercase animate-pulse">Realtime</span>
                </div>
                
                <div className="grid grid-cols-3 gap-1.5 text-center mt-1">
                  <div className="bg-white/5 border border-white/5 p-1.5 rounded-lg">
                    <div className="text-sm font-bold text-white font-mono">{syncStatus.chatsCount || 0}</div>
                    <div className="text-[8px] text-zinc-400 uppercase tracking-wider font-semibold">Chats</div>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-1.5 rounded-lg">
                    <div className="text-sm font-bold text-white font-mono">{syncStatus.contactsCount || 0}</div>
                    <div className="text-[8px] text-zinc-400 uppercase tracking-wider font-semibold">Contatos</div>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-1.5 rounded-lg">
                    <div className="text-sm font-bold text-white font-mono">{syncStatus.messagesCount || 0}</div>
                    <div className="text-[8px] text-zinc-400 uppercase tracking-wider font-semibold">Mensagens</div>
                  </div>
                </div>

                <div className="w-full bg-zinc-800 rounded-full h-1 mt-1 overflow-hidden">
                  <div className="bg-indigo-500 h-1 rounded-full w-full animate-pulse" />
                </div>
              </div>
            </motion.div>
          )}

          <div className="relative group">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar pessoas ou mensagens..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-zinc-600 shadow-inner"
            />
          </div>
          {error && (
            <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="mt-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-2.5 rounded-lg flex gap-2 items-center">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
            </motion.div>
          )}
        </div>
        
        <div className="flex-1 bg-transparent overflow-hidden">
          {loadingChats ? (
            <div className="w-full h-full overflow-hidden flex flex-col pt-2">
               {[1, 2, 3, 4, 5, 6].map(i => <ChatSkeleton key={i} />)}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 pt-12">
               <MessageSquare size={32} className="mx-auto mb-3 opacity-20" />
               <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            <div ref={scrollRef} className="w-full h-full overflow-y-auto custom-scrollbar contain-strict">
                <div 
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                        const chat = filteredChats[virtualItem.index];
                        return (
                            <ChatRowItem 
                                key={chat.chatId} 
                                chat={chat} 
                                isSelected={selectedChat?.chatId === chat.chatId} 
                                onClick={handleChatSelect} 
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualItem.size}px`,
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            />
                        );
                    })}
                </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Thread (centro) */}
      <div 
        {...getRootProps()}
        className={`flex-1 flex flex-col bg-transparent relative outline-none ${selectedChat ? 'visible' : 'hidden md:flex'}`}
      >
        <input {...getInputProps()} />
        {selectedChat ? (() => {
          const chatPhoneE164 = selectedChat.telefoneE164 || extractWhatsAppPhone(selectedChat.chatId) || '';
          const fallbackContact = selectedChat.contact || { id: selectedChat.chatId, nome: selectedChat.pushName, telefoneE164: chatPhoneE164, tags: [], optIn: true, needsReview: false } as Contact;
          
          return (
          <>
            {/* Thread Header */}
            <div className="h-[76px] px-6 bg-zinc-950/60 backdrop-blur-xl flex items-center justify-between shrink-0 border-b border-zinc-800/60 z-10 relative">
              <div 
                className="flex items-center gap-4 cursor-pointer group"
                onClick={() => {
                     setDrawerContact(fallbackContact);
                }}
              >
                <div className="relative">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800/80 flex items-center justify-center border-2 border-zinc-700/50 group-hover:border-indigo-500/80 shadow-lg transition-all transform group-hover:scale-105">
                        {selectedChat.profilePicUrl ? (
                            <img src={selectedChat.profilePicUrl} alt="Contact" className="w-full h-full object-cover" />
                        ) : <UserIcon size={20} className="text-zinc-500" />}
                    </div>
                    {/* Always online indicator for premium feel */}
                    <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-950 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                </div>
                <div>
                  <h3 className="font-bold tracking-tight text-white flex items-center gap-2 group-hover:text-indigo-400 transition-colors text-[17px]">
                       {selectedChat.contact ? selectedChat.contact.nome : selectedChat.pushName}
                       {(selectedChat.contact?.valorEstimado ? selectedChat.contact.valorEstimado > 3000 : false) && <Sparkles size={14} className="text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]" />}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                     {selectedChat.sdrEnabled ? (
                         <span className="text-[10px] font-bold bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded-full flex items-center gap-1"><Sparkles size={8}/> {agentConfig?.agentName || 'IA'}</span>
                     ) : selectedChat.humanTakeover ? (
                         <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full flex items-center gap-1"><UserIcon size={8}/> Humano</span>
                     ) : null}
                     <button onClick={() => handleToggleSdr(!selectedChat.sdrEnabled)} className="text-[10px] bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded text-zinc-200 transition-colors font-medium">
                         {selectedChat.sdrEnabled ? `Desativar ${agentConfig?.agentName || 'IA'}` : `Ativar ${agentConfig?.agentName || 'IA'}`}
                     </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium mt-1">
                      <span className="text-emerald-400 font-mono tracking-tight flex items-center gap-1.5">
                          Online
                      </span>
                      <span className="text-zinc-700">•</span>
                      <span className="text-zinc-400 font-mono tracking-tight text-[11px] opacity-80">
                          +{chatPhoneE164}
                      </span>
                      {selectedChat.contact?.stage && (
                          <>
                              <span className="text-zinc-700">•</span>
                              <span className="px-1.5 py-0.5 rounded-[4px] bg-zinc-800 border border-zinc-700 text-[9px] text-zinc-300 font-bold uppercase tracking-widest font-mono">
                                  {selectedChat.contact.stage}
                              </span>
                          </>
                      )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                  <button 
                     onClick={() => {
                        setDrawerContact(fallbackContact);
                     }}
                     className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-full transition-all shadow-sm flex items-center gap-2 group font-medium text-sm"
                  >
                      <Sparkles size={16} className="group-hover:text-amber-400 transition-colors" />
                      <span className="hidden sm:block tracking-wide">IA Insight</span>
                  </button>
                  <div className="w-px h-6 bg-zinc-800 mx-2" />
                  <button 
                     className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-all shadow-sm flex items-center justify-center shrink-0" 
                     onClick={() => setDrawerContact(fallbackContact)}
                  >
                      <MoreVertical size={20} />
                  </button>
              </div>
            </div>

            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 custom-scrollbar relative z-0">
              {loadingMessages && messages.length === 0 ? (
                 <div className="flex flex-col gap-4 justify-end h-full opacity-30 pb-4">
                     {/* Chat Messages Skeleton */}
                     <div className="flex justify-start"><div className="w-48 h-12 bg-zinc-800/50 rounded-2xl animate-pulse" /></div>
                     <div className="flex justify-end"><div className="w-64 h-16 bg-indigo-900/30 rounded-2xl animate-pulse" /></div>
                     <div className="flex justify-start"><div className="w-32 h-10 bg-zinc-800/50 rounded-2xl animate-pulse" /></div>
                 </div>
              ) : (
                <div className="flex flex-col min-h-full justify-end">
                  {renderMessages()}
                  <div ref={messagesEndRef} className="h-4 shrink-0" />
                </div>
              )}
            </div>

            {/* Input Box */}
            <div className="px-6 py-4 bg-zinc-950/60 backdrop-blur-xl border-t border-zinc-800/60 flex flex-col gap-2 shrink-0 relative transition-all duration-300">
               
               {/* Drag and Drop overlay */}
               <AnimatePresence>
                 {isDragActive && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-500/80 rounded-t-3xl z-10 flex items-center justify-center pointer-events-none"
                    >
                        <motion.div 
                            initial={{ scale: 0.8 }} 
                            animate={{ scale: 1 }} 
                            className="bg-indigo-600/90 text-white px-6 py-3 rounded-full font-medium shadow-xl flex items-center gap-3 backdrop-blur-md"
                        >
                            <ImageIcon size={20} />
                            Solte arquivos aqui para enviar
                        </motion.div>
                    </motion.div>
                 )}
               </AnimatePresence>

               {/* Attachments Preview */}
               {attachedFiles.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 pt-1 px-1">
                      {attachedFiles.map((file, i) => (
                          <div key={i} className="w-16 h-16 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex flex-col items-center justify-center shrink-0 relative overflow-hidden group shadow-sm transition-all hover:bg-zinc-700/80">
                             {file.type.startsWith('image/') ? (
                                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                             ) : (
                                <>
                                  <Paperclip size={20} className="text-zinc-500 mb-1 group-hover:text-indigo-400 transition-colors" />
                                  <span className="text-[9px] text-zinc-400 truncate w-full px-2 text-center" title={file.name}>{file.name}</span>
                                </>
                             )}
                             <button 
                                onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-rose-500 hover:border-rose-500 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-md"
                                title="Remove"
                             >
                                <X size={12} />
                             </button>
                          </div>
                      ))}
                  </div>
               )}

               <div className="flex items-end gap-3 w-full relative">
                 <button onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors rounded-xl shrink-0 group relative overflow-hidden">
                     <Paperclip size={22} className="group-hover:-rotate-12 transition-transform" /><input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*,audio/*,application/*" />
                 </button>
                 
                 <div className="flex-1 bg-zinc-900/80 border border-zinc-800/80 focus-within:border-indigo-500/50 focus-within:bg-zinc-900 focus-within:shadow-[0_0_15px_rgba(99,102,241,0.1)] rounded-2xl flex flex-col min-h-[50px] transition-all relative">
                   
                   {/* Emoji Picker Popover */}
                   <AnimatePresence>
                       {showEmojiPicker && (
                           <motion.div 
                               initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                               animate={{ opacity: 1, y: 0, scale: 1 }} 
                               exit={{ opacity: 0, y: 10, scale: 0.95 }}
                               transition={{ duration: 0.15 }}
                               className="absolute bottom-[calc(100%+12px)] left-0 z-50 shadow-2xl"
                           >
                               <div className="drop-shadow-2xl rounded-2xl border border-zinc-800/80 overflow-hidden">
                                   <EmojiPicker 
                                       onEmojiClick={onEmojiClick} 
                                       theme={Theme.DARK} 
                                       lazyLoadEmojis 
                                       searchPlaceHolder="Buscar emoji..."
                                       width={320}
                                       height={400}
                                   />
                               </div>
                           </motion.div>
                       )}
                   </AnimatePresence>

                   <div className="flex items-end w-full">
                     <button 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-3 transition-colors ${showEmojiPicker ? 'text-indigo-400' : 'text-zinc-500 hover:text-indigo-400'}`}
                     >
                       <Smile size={20} />
                     </button>
                     <textarea 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                                setShowEmojiPicker(false);
                            }
                        }}
                        placeholder="Pressione / para templates, ou digite uma mensagem..."
                        className="w-full bg-transparent text-white py-3 px-1 text-[15px] focus:outline-none resize-none max-h-32 custom-scrollbar placeholder:text-zinc-500"
                        rows={Math.min(4, Math.max(1, inputText.split('\n').length))}
                     />
                   </div>
                 </div>
                 
                 {inputText.trim() ? (
                   <motion.button 
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={handleSend}
                     disabled={sending}
                     className="p-3.5 bg-indigo-600 text-white rounded-xl shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:bg-indigo-500 border border-indigo-500/50 transition-colors shrink-0 flex items-center justify-center disabled:opacity-50 h-[50px] w-[50px]"
                   >
                      {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-1" />}
                   </motion.button>
                 ) : (
                   <div className="flex gap-2">
                     <button className="p-3.5 text-zinc-400 hover:bg-zinc-800/50 rounded-xl transition-colors shrink-0 hidden md:flex h-[50px] w-[50px] items-center justify-center group" title="Sugerir com IA">
                        <Sparkles size={20} className="group-hover:text-purple-400 transition-colors" />
                     </button>
                     <button className="p-3.5 bg-zinc-800/80 border border-zinc-700/50 text-zinc-300 rounded-xl hover:bg-zinc-700 hover:text-white transition-colors shrink-0 h-[50px] w-[50px] flex items-center justify-center group">
                        <Mic size={20} className="group-hover:scale-110 transition-transform" />
                     </button>
                   </div>
                 )}
               </div>
               
               <div className="flex justify-center items-center h-4">
                  <span className="text-[10px] text-zinc-600 tracking-wider">Aperte Enter para enviar • Shift + Enter para quebrar linha</span>
               </div>
            </div>
          </>
          );
        })() : (
           <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950/20 backdrop-blur-sm relative z-0">
               <div className="w-24 h-24 rounded-full bg-zinc-900/50 flex items-center justify-center mb-6 shadow-inner border border-zinc-800/50">
                  <MessageSquare size={40} className="opacity-40" />
               </div>
               <h2 className="text-2xl font-bold tracking-tight text-white mb-2 max-w-sm text-center">Nenhum chat selecionado</h2>
               <p className="text-sm max-w-sm text-center font-medium opacity-80">Selecione uma conversa ao lado para visualizar mensagens ou responder contatos. Integrado com Evolution API.</p>
           </div>
        )}
      </div>
      
      {/* 3. Contexto (direita) */}
      <ContactDrawer contact={drawerContact} onClose={() => setDrawerContact(null)} />

    </div>
  );
};