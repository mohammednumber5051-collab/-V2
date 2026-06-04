import React, { useState, useEffect } from "react";
import { Lock, ArrowRight, ShieldCheck, Eye, EyeOff, User, Store } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authService } from "../services/authService";
import { AppUser } from "../types";
import { cn } from "../lib/utils";
import { waitForAuth } from "../firebase";
import { dbService } from "../services/db";

interface LoginProps {
    onLogin: (user: AppUser) => void;
}

export default function Login({ onLogin }: LoginProps) {
    const [isSetupMode, setIsSetupMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    // Setup State
    const [fullName, setFullName] = useState("");
    const [storeName, setStoreName] = useState("");
    const [setupUsername, setSetupUsername] = useState("");
    const [setupPassword, setSetupPassword] = useState("");
    
    // Login State
    const [activeUsers, setActiveUsers] = useState<AppUser[]>([]);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    
    const [error, setError] = useState("");

    // Load active users OR check setup
    useEffect(() => {
        const checkSetupAndLoadUsers = async () => {
            try {
                // Ensure Firebase Auth is ready
                await waitForAuth();
                
                const res = await authService.initialize();
                if (res.setupRequired) {
                    setIsSetupMode(true);
                } else {
                    // Fetch all users for selection
                    const allUsers = await dbService.getAll("users") as AppUser[];
                    // Only show active users in the selection list
                    const active = allUsers.filter(u => u.isActive !== false);
                    setActiveUsers(active);
                    if (active.length > 0) {
                        setUsername(active[0].username);
                    }
                }
            } catch (err) {
                console.error("Init Error", err);
            } finally {
                setIsLoading(false);
            }
        };
        checkSetupAndLoadUsers();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            if (!username) throw new Error("الرجاء اختيار مستخدم");
            const user = await authService.login(username, password);
            if (user) onLogin(user);
        } catch (err: any) {
            setError(err.message || "رمز الدخول غير صحيح");
            setIsLoading(false);
        }
    };

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            if (setupPassword.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
            await authService.setupFirstAdmin(fullName, setupUsername, setupPassword, storeName);
            // After setup, auto login
            const loggedInUser = await authService.login(setupUsername, setupPassword);
            if (loggedInUser) onLogin(loggedInUser);
        } catch (err: any) {
            setError(err.message || "خطأ أثناء التهيئة");
            setIsLoading(false);
        }
    };

    if (isLoading && activeUsers.length === 0 && !isSetupMode) {
        return (
            <div className="fixed inset-0 w-full h-full bg-slate-50 dark:bg-[#0b0f19] flex items-center justify-center p-4">
                <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 w-full h-full bg-slate-100 dark:bg-[#0f172a] flex items-center justify-center p-4 transition-colors duration-300" dir="rtl">
            <div className="w-full max-w-[400px] bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8">
                
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4">
                        <Store size={32} />
                    </div>
                    <h1 className="text-xl font-black text-slate-800 dark:text-white mb-2">نظام البصريات المتقدم</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">
                        {isSetupMode ? "تهيئة النظام الجديد" : "تسجيل الدخول للمتابعة"}
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold text-center">
                        {error}
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {isSetupMode ? (
                        <motion.form 
                            key="setup"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            onSubmit={handleSetup} 
                            className="space-y-4"
                        >
                            <div>
                                <label className="text-xs font-black text-slate-500 mb-1.5 block">اسم المتجر</label>
                                <input required type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="مثال: بصريات النور" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 mb-1.5 block">اسم المدير الكامل</label>
                                <input required type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 mb-1.5 block">اسم المستخدم</label>
                                <input required type="text" dir="ltr" value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-left" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 mb-1.5 block">كلمة المرور</label>
                                <input required type="password" dir="ltr" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-left" />
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-colors shadow-lg shadow-blue-500/30 flex justify-center items-center">
                                {isLoading ? <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : 'بدء التهيئة'}
                            </button>
                        </motion.form>
                    ) : (
                        <motion.form 
                            key="login"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            onSubmit={handleLogin} 
                            className="space-y-6"
                        >
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black text-slate-500 mb-1.5 block flex items-center gap-1.5">
                                        <User size={14} /> اسم المستخدم
                                    </label>
                                    <select 
                                        required 
                                        value={username} 
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-black appearance-none"
                                    >
                                        <option value="" disabled>اختر المستخدم...</option>
                                        {activeUsers.map(u => (
                                            <option key={u.id} value={u.username}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="relative">
                                    <label className="text-xs font-black text-slate-500 mb-1.5 block flex items-center gap-1.5">
                                        <Lock size={14} /> الرمز السري
                                    </label>
                                    <div className="relative">
                                        <input 
                                            required 
                                            type={showPassword ? "text" : "password"} 
                                            dir="ltr"
                                            value={password} 
                                            onChange={(e) => setPassword(e.target.value)} 
                                            placeholder="••••••••"
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-black text-left tracking-widest"
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isLoading || activeUsers.length === 0} 
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 group"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                ) : (
                                    <>
                                        <span>دخول النظام</span>
                                        <ArrowRight className="mr-1 group-hover:translate-x-[-4px] transition-transform" size={18} />
                                    </>
                                )}
                            </button>

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5 opacity-60">
                                <ShieldCheck size={14} className="text-emerald-500" />
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">نظام مشفر وآمن بالكامل</span>
                            </div>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
