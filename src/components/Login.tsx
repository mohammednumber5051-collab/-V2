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
            const timeout = setTimeout(() => {
                console.warn("Login init timed out, forcing UI.");
                setIsLoading(false);
            }, 5000);

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
                clearTimeout(timeout);
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
        <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-4 transition-colors duration-300" dir="rtl">
            <div className="w-full max-w-sm bg-white rounded-xl shadow-md border border-slate-100 p-6">
                
                <div className="flex flex-col items-center mb-6 text-slate-800">
                    <Lock size={32} className="mb-2 text-blue-600" />
                    <h1 className="text-lg font-black">نظام إدارة البصريات</h1>
                    <p className="text-slate-500 font-bold text-xs mt-1">
                        {isSetupMode ? "تهيئة النظام" : "تسجيل الدخول"}
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-bold text-center">
                        {error}
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {isSetupMode ? (
                        <motion.form 
                            key="setup"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onSubmit={handleSetup} 
                            className="space-y-3"
                        >
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">اسم المتجر</label>
                                <input required type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 outline-none text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">اسم المدير</label>
                                <input required type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 outline-none text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">اسم المستخدم</label>
                                <input required type="text" dir="ltr" value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 outline-none text-sm text-left" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">كلمة المرور</label>
                                <input required type="password" dir="ltr" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 outline-none text-sm text-left" />
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full py-2.5 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors text-sm flex justify-center items-center">
                                {isLoading ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : 'حفظ ودخول'}
                            </button>
                        </motion.form>
                    ) : (
                        <motion.form 
                            key="login"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onSubmit={handleLogin} 
                            className="space-y-4"
                        >
                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">اسم المستخدم</label>
                                <select 
                                    required 
                                    value={username} 
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 outline-none text-sm appearance-none font-bold text-slate-800"
                                >
                                    <option value="" disabled>اختر...</option>
                                    {activeUsers.map(u => (
                                        <option key={u.id} value={u.username}>{u.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600 mb-1 block">الرمز السري</label>
                                <input 
                                    required 
                                    type="password"
                                    dir="ltr"
                                    value={password} 
                                    onChange={(e) => setPassword(e.target.value)} 
                                    className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 outline-none text-sm text-left tracking-widest font-mono"
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={isLoading || activeUsers.length === 0} 
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-all text-sm flex justify-center items-center gap-2 mt-2"
                            >
                                {isLoading ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                ) : (
                                    <>
                                        <span>تسجيل الدخول</span>
                                        <ArrowRight size={14} className="mr-1" />
                                    </>
                                )}
                            </button>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>
            
            <div className="absolute bottom-4 left-0 w-full text-center text-[10px] text-slate-400 font-medium">
                <p>&copy; ASSAR Optical Accounting</p>
                <p>Designed By Mohammed Assubaihi</p>
            </div>
        </div>
    );
}
