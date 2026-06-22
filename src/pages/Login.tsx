import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, Lock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Login: React.FC = () => {
    const { loginWithGoogle, user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const from = location.state?.from?.pathname || '/dashboard';

    useEffect(() => {
        if (user) navigate(from, { replace: true });
    }, [user, navigate, from]);

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setIsLoggingIn(true);
            await loginWithGoogle();
            // NÃO navegue aqui — o useEffect que observa `user` cuida disso
            // após o onAuthStateChanged do Firebase disparar.
        } catch (err: any) {
            setError(err.message || 'Erro ao fazer login. Conta não autorizada.');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-[#050816] relative overflow-hidden font-sans selection:bg-[#6D5DFC]/30 p-4">
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#6D5DFC]/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#22C55E]/5 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)] pointer-events-none opacity-40" />

            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="w-full max-w-md">
                <div className="bg-[#0B1020]/80 backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.4)] relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#6D5DFC]/50 to-transparent" />
                    <div className="flex flex-col items-center justify-center mb-8">
                        <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-[#6D5DFC] to-[#5B4AE0] flex items-center justify-center shadow-[0_0_30px_rgba(109,93,252,0.4)] mb-4 relative group">
                            <MessageSquare size={32} className="text-white relative z-10" />
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight">3DFANS CRM</h1>
                        <p className="text-[#94A3B8] text-sm mt-1 text-center font-medium">Acesso Restrito ao Sistema Operacional</p>
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.div initial={{ opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0, y: -10 }}
                                className="mb-6 bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm px-4 py-3 rounded-2xl flex items-start gap-3">
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <span className="leading-relaxed font-medium">{error}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="h-px bg-white/10 flex-1" />
                            <span className="text-xs font-bold text-[#94A3B8] uppercase tracking-widest">Autenticação</span>
                            <div className="h-px bg-white/10 flex-1" />
                        </div>
                        <button onClick={handleGoogleLogin} disabled={loading || isLoggingIn}
                            className="w-full relative group overflow-hidden rounded-[20px] bg-white hover:bg-zinc-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                            <div className="relative px-6 py-4 flex items-center justify-center gap-3">
                                {isLoggingIn ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-zinc-300 border-t-[#6D5DFC] rounded-full animate-spin" />
                                        <span className="text-zinc-900 font-bold text-[15px]">Autenticando...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" width="22" height="22"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 41.939 C -8.804 40.009 -11.514 38.899 -14.754 38.899 C -19.444 38.899 -23.494 41.599 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
                                        <span className="text-zinc-900 font-bold text-[15px]">Continuar com Google</span>
                                    </>
                                )}
                            </div>
                        </button>
                    </div>
                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-[#94A3B8] text-xs font-medium">
                        <Lock size={12} className="text-[#6D5DFC]" /> Ambiente Seguro & Monitorado
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
