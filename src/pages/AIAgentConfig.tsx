import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Bot, Save, Sparkles, User, MessageSquare, Shield, Zap, Info, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';

type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
type TTSProvider = 'openai' | 'elevenlabs';

const TTS_VOICES: { id: TTSVoice; label: string; gender: string; desc: string }[] = [
  { id: 'alloy',   label: 'Alloy',   gender: 'Neutro',    desc: 'Versátil e equilibrado' },
  { id: 'echo',    label: 'Echo',    gender: 'Masculino', desc: 'Claro e articulado' },
  { id: 'fable',   label: 'Fable',   gender: 'Masculino', desc: 'Expressivo, sotaque britânico' },
  { id: 'onyx',    label: 'Onyx',    gender: 'Masculino', desc: 'Grave e autoritário' },
  { id: 'nova',    label: 'Nova',    gender: 'Feminino',  desc: 'Jovem e amigável (padrão)' },
  { id: 'shimmer', label: 'Shimmer', gender: 'Feminino',  desc: 'Suave e calorosa' },
];

export const AIAgentConfig: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState({
        agentName: 'Laura',
        agentRole: 'Especialista 3DFans',
        personality: 'amigável, eficiente e persuasiva',
        avatar: '',
        typingLabel: 'Laura está digitando...',
        enabled: true,
        modoRastreio: false,
        temperature: 0.7,
        promptBase: 'Você é um assistente humano e prestativo.',
        respondWithAudio: false,
        audioStartCondition: '',
        audioStopCondition: '',
        ttsVoice: 'nova' as TTSVoice,
        ttsProvider: 'openai' as TTSProvider,
        elevenLabsVoiceId: '',
    });

    useEffect(() => {
        const configRef = doc(db, 'system', 'config', 'settings', 'aiAgent');
        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists()) {
                setConfig(snap.data() as any);
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const configRef = doc(db, 'system', 'config', 'settings', 'aiAgent');
            await setDoc(configRef, config);
            // Also update the global display name if needed In other parts
        } catch (error) {
            console.error('Error saving agent config:', error);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Bot className="text-indigo-400" /> Configuração do Agente IA
                    </h1>
                    <p className="text-zinc-400 text-sm mt-1">Personalize a identidade e comportamento do seu assistente.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
                >
                    {saving ? <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={18} />}
                    Salvar Alterações
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Visual Identity */}
                <div className="md:col-span-2 space-y-6">
                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-4">
                        <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                            <User size={16} className="text-indigo-400" /> Identidade Visual & Nome
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs text-zinc-500 font-medium ml-1">Nome do Agente</label>
                                <input
                                    type="text"
                                    value={config.agentName}
                                    onChange={(e) => setConfig({ ...config, agentName: e.target.value })}
                                    placeholder="Ex: Laura, Felipe, Sofia"
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-zinc-500 font-medium ml-1">Cargo / Função</label>
                                <input
                                    type="text"
                                    value={config.agentRole}
                                    onChange={(e) => setConfig({ ...config, agentRole: e.target.value })}
                                    placeholder="Ex: Especialista em Orçamentos"
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-zinc-500 font-medium ml-1">Mensagem de Digitação (Typing Label)</label>
                            <input
                                type="text"
                                value={config.typingLabel}
                                onChange={(e) => setConfig({ ...config, typingLabel: e.target.value })}
                                placeholder="Ex: Laura está digitando..."
                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </section>

                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-4">
                        <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                            <Sparkles size={16} className="text-purple-400" /> Personalidade e Criatividade
                        </h2>
                        <div className="space-y-2">
                            <label className="text-xs text-zinc-500 font-medium ml-1">Traços de Personalidade</label>
                            <textarea
                                value={config.personality}
                                onChange={(e) => setConfig({ ...config, personality: e.target.value })}
                                placeholder="Descreva como o agente deve falar (ex: formal, engraçado, focado em vendas)"
                                className="w-full h-24 bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                            />
                        </div>
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-zinc-500 font-medium ml-1">Temperatura (Criatividade): {config.temperature}</label>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1.0"
                                step="0.1"
                                value={config.temperature}
                                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                            <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">
                                <span>Mais Analítico</span>
                                <span>Equilibrado</span>
                                <span>Mais Criativo</span>
                            </div>
                        </div>
                        <div className="pt-4 mt-4 border-t border-zinc-800 space-y-4">
                            {/* Modo Rastreio */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <span className="text-orange-400">📦</span>
                                        Modo Rastreio
                                    </h3>
                                    <p className="text-xs text-zinc-500 mt-0.5">Quando ativo, a IA responde <span className="text-orange-400 font-semibold">apenas sobre status e rastreio de pedidos</span>. Ignora mensagens de venda.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={!!(config as any).modoRastreio}
                                        onChange={(e) => setConfig({ ...config, modoRastreio: e.target.checked } as any)}
                                    />
                                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                </label>
                            </div>

                            {/* Respostas em Áudio */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Volume2 size={15} className="text-purple-400" />
                                        Respostas em Áudio (TTS)
                                    </h3>
                                    <p className="text-xs text-zinc-500 mt-0.5">Se o cliente enviar áudio, a IA responderá em áudio via OpenAI ou ElevenLabs.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.respondWithAudio}
                                        onChange={(e) => setConfig({ ...config, respondWithAudio: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                                </label>
                            </div>

                            {config.respondWithAudio && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-4"
                                >
                                    {/* Provider toggle */}
                                    <div className="space-y-2">
                                        <label className="text-xs text-zinc-500 font-medium ml-1">Provedor TTS</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['openai', 'elevenlabs'] as TTSProvider[]).map(p => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setConfig({ ...config, ttsProvider: p })}
                                                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all ${
                                                        config.ttsProvider === p
                                                            ? 'border-purple-500 bg-purple-500/10 text-white'
                                                            : 'border-zinc-800 bg-black text-zinc-400 hover:border-zinc-600'
                                                    }`}
                                                >
                                                    <Volume2 size={13} className={config.ttsProvider === p ? 'text-purple-400' : 'text-zinc-600'} />
                                                    {p === 'openai' ? 'OpenAI' : 'ElevenLabs'}
                                                    {config.ttsProvider === p && (
                                                        <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">ativo</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* OpenAI voices */}
                                    {config.ttsProvider === 'openai' && (
                                        <div className="space-y-2">
                                            <label className="text-xs text-zinc-500 font-medium ml-1">Voz (OpenAI)</label>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {TTS_VOICES.map(v => (
                                                    <button
                                                        key={v.id}
                                                        type="button"
                                                        onClick={() => setConfig({ ...config, ttsVoice: v.id })}
                                                        className={`flex flex-col items-start text-left p-3 rounded-xl border transition-all ${
                                                            config.ttsVoice === v.id
                                                                ? 'border-purple-500 bg-purple-500/10'
                                                                : 'border-zinc-800 bg-black hover:border-zinc-600'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 w-full">
                                                            <Volume2
                                                                size={13}
                                                                className={config.ttsVoice === v.id ? 'text-purple-400' : 'text-zinc-600'}
                                                            />
                                                            <span className={`text-sm font-bold ${config.ttsVoice === v.id ? 'text-white' : 'text-zinc-300'}`}>
                                                                {v.label}
                                                            </span>
                                                            {config.ttsVoice === v.id && (
                                                                <span className="ml-auto text-[9px] font-bold text-purple-400 uppercase tracking-widest">ativo</span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-zinc-600 mt-1">{v.gender} · {v.desc}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* ElevenLabs voice ID */}
                                    {config.ttsProvider === 'elevenlabs' && (
                                        <div className="space-y-2">
                                            <label className="text-xs text-zinc-500 font-medium ml-1">Voice ID (ElevenLabs)</label>
                                            <input
                                                type="text"
                                                value={config.elevenLabsVoiceId}
                                                onChange={(e) => setConfig({ ...config, elevenLabsVoiceId: e.target.value })}
                                                placeholder="Ex: EXAVITQu4vr4xnSDxMaL"
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-purple-500 transition-colors"
                                            />
                                            <p className="text-[10px] text-zinc-600 ml-1">
                                                Encontre o Voice ID no painel ElevenLabs → Voices → clique na voz → copie o ID.
                                            </p>
                                        </div>
                                    )}

                                    {/* Audio mode conditions */}
                                    <div className="pt-3 border-t border-zinc-800 space-y-3">
                                        <div>
                                            <label className="text-xs text-zinc-400 font-semibold ml-1 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                                Condição para INICIAR áudio
                                            </label>
                                            <p className="text-[10px] text-zinc-600 ml-1 mb-1.5">Descreva quando a IA deve começar a responder em áudio. Ex: "quando o cliente enviar 2 ou mais áudios seguidos".</p>
                                            <textarea
                                                rows={2}
                                                value={config.audioStartCondition || ''}
                                                onChange={(e) => setConfig({ ...config, audioStartCondition: e.target.value })}
                                                placeholder="Ex: quando o cliente enviar áudio"
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors resize-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-zinc-400 font-semibold ml-1 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                                                Condição para PARAR áudio e voltar ao texto
                                            </label>
                                            <p className="text-[10px] text-zinc-600 ml-1 mb-1.5">Descreva quando a IA deve parar de usar áudio. Ex: "quando o cliente enviar texto por 2 mensagens consecutivas".</p>
                                            <textarea
                                                rows={2}
                                                value={config.audioStopCondition || ''}
                                                onChange={(e) => setConfig({ ...config, audioStopCondition: e.target.value })}
                                                placeholder="Ex: quando o cliente enviar mensagem de texto após estar em modo áudio"
                                                className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors resize-none"
                                            />
                                        </div>
                                        <p className="text-[10px] text-zinc-600 ml-1 leading-relaxed">
                                            Se ambos os campos estiverem vazios, o comportamento padrão é: responde em áudio somente se o cliente enviou áudio.
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </section>

                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-4">
                        <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                            <Shield size={16} className="text-emerald-400" /> Prompt Base (Backend Only)
                        </h2>
                        <p className="text-[10px] text-zinc-500 leading-relaxed italic">Esta instrução é injetada no início de cada processamento da IA para definir o mindset básico.</p>
                        <textarea
                            value={config.promptBase}
                            onChange={(e) => setConfig({ ...config, promptBase: e.target.value })}
                            className="w-full h-96 bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors resize-y text-sm"
                        />
                    </section>
                </div>

                {/* Live Preview */}
                <div className="space-y-6">
                    <div className="sticky top-8 space-y-6">
                        <section className="bg-gradient-to-br from-indigo-600/10 to-purple-600/10 border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Zap className="text-indigo-500/30" size={40} />
                            </div>
                            
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-6">WhatsApp Preview</h2>
                            
                            <div className="bg-zinc-950 rounded-2xl p-4 border border-zinc-800 shadow-2xl space-y-4">
                                <div className="flex items-center gap-3 pb-3 border-b border-zinc-800/50">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700 overflow-hidden">
                                        {config.avatar ? <img src={config.avatar} alt="Avatar" className="w-full h-full object-cover" /> : <Bot size={20} />}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">{config.agentName}</div>
                                        <div className="text-[10px] text-indigo-400 font-medium">{config.agentRole}</div>
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-3 rounded-bl-none max-w-[85%]">
                                        <p className="text-xs text-zinc-200">
                                            Oi! Eu sou {config.agentName}. Como posso te ajudar com as miniaturas hoje? 😊
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-1">
                                        <div className="flex gap-0.5">
                                            <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                                            <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                                            <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                                        </div>
                                        <span className="text-[9px] font-bold text-indigo-400/80 uppercase tracking-tighter">
                                            {config.typingLabel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                <Info size={14} /> Dicas de Branding
                            </h3>
                            <ul className="text-[10px] text-zinc-500 space-y-2 list-disc ml-4">
                                <li>Nomes reais (Laura, Sofia, Felipe) geram mais <b>empatia</b> que "Assistente".</li>
                                <li>Use um Cargo que explique o <b>benefício</b> (Especialista em Orcamentos).</li>
                                <li>A <b>Temperatura</b> acima de 0.7 pode gerar respostas mais humanas mas menos previsíveis.</li>
                            </ul>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};
