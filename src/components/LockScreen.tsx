import React, { useState } from "react";
import { Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AppUser } from "../types";
import { authService } from "../services/authService";

interface LockScreenProps {
    user: AppUser;
    onUnlock: () => void;
    onLogout: () => void;
}

export default function LockScreen({ user, onUnlock, onLogout }: LockScreenProps) {
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            await authService.login(user.username, password);
            onUnlock();
        } catch (err: any) {
            setError(err.message || "كلمة المرور غير صحيحة");
            setIsLoading(false);
        }
    };

    const handleNumpadPress = (num: string) => {
        setPassword(prev => prev + num);
    };

    const handleNumpadDelete = () => {
        setPassword(prev => prev.slice(0, -1));
    };

    return (
        <div className="absolute inset-0 w-full h-full bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 z-[100]" dir="rtl">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-sm sm:max-w-md bg-white dark:bg-[#131b2e] rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col"
            >
                <div className="p-8 pb-6 flex flex-col items-center border-b border-slate-100 dark:border-slate-800/60 transition-colors bg-slate-50 dark:bg-slate-900/40">
                    <div className="w-20 h-20 rounded-[1.25rem] bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center mb-4 text-4xl font-black text-indigo-600 dark:text-indigo-400">
                        {user.name.charAt(0)}
                    </div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white mb-1">{user.name}</h2>
                    <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-black uppercase tracking-widest">{user.role}</span>
                </div>

                <div className="p-6">
                    <AnimatePresence>
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-4 overflow-hidden"
                            >
                                <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold text-center">
                                    {error}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleUnlock} className="space-y-6">
                        <div className="relative group">
                            <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input 
                                required
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="أدخل كلمة المرور/المرور"
                                className="w-full pr-12 pl-12 py-4 bg-slate-50 dark:bg-slate-900/60 border-2 border-slate-200 dark:border-slate-800 rounded-2xl focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition-all font-black text-center text-xl tracking-[0.25em] text-slate-800 dark:text-slate-200 outline-none"
                                autoComplete="current-password"
                                autoFocus
                                dir="ltr"
                            />
                            <button 
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        {/* POS Numpad Logic */}
                        <div className="grid grid-cols-3 gap-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                <button 
                                    key={num}
                                    type="button"
                                    onClick={() => handleNumpadPress(num.toString())}
                                    className="h-14 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-black text-xl flex items-center justify-center transition-colors active:scale-95"
                                >
                                    {num}
                                </button>
                            ))}
                            <button 
                                type="button"
                                onClick={() => setPassword("")}
                                className="h-14 bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl font-bold text-sm flex items-center justify-center transition-colors active:scale-95"
                            >
                                مسح
                            </button>
                            <button 
                                type="button"
                                onClick={() => handleNumpadPress("0")}
                                className="h-14 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-black text-xl flex items-center justify-center transition-colors active:scale-95"
                            >
                                0
                            </button>
                            <button 
                                type="button"
                                onClick={handleNumpadDelete}
                                className="h-14 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold text-lg flex items-center justify-center transition-colors active:scale-95"
                            >
                                ⌫
                            </button>
                        </div>

                        <div className="pt-2 grid grid-cols-2 gap-3">
                            <button 
                                type="button" 
                                onClick={onLogout}
                                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                مستخدم آخر
                            </button>
                            <button 
                                disabled={isLoading || password.length === 0}
                                type="submit"
                                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                ) : (
                                    <>
                                        فتح النظام
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
