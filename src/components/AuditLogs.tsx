import React, { useState, useEffect } from "react";
import { ShieldAlert, Search, Database, HardDrive, RefreshCw, AlertTriangle, CheckCircle, Smartphone, Activity } from "lucide-react";
import { dbService } from "../services/db";
import { AuditLog } from "../types";
import { motion, AnimatePresence } from "motion/react";

export default function AuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState("");

    const loadLogs = async () => {
        setIsLoading(true);
        try {
            const data = await dbService.getAll("auditLogs") as AuditLog[];
            setLogs(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, []);

    const filteredLogs = logs.filter(l => 
        l.action.toLowerCase().includes(search.toLowerCase()) || 
        l.userName.toLowerCase().includes(search.toLowerCase()) ||
        l.description.toLowerCase().includes(search.toLowerCase())
    );

    const getActionColor = (action: string) => {
        switch(action) {
            case 'CREATE': return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10';
            case 'UPDATE': return 'text-blue-500 bg-blue-50 dark:bg-blue-500/10';
            case 'DELETE': return 'text-rose-500 bg-rose-50 dark:bg-rose-500/10';
            case 'LOGIN': return 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10';
            case 'LOGOUT': return 'text-slate-500 bg-slate-50 dark:bg-slate-500/10';
            default: return 'text-slate-500 bg-slate-50 dark:bg-slate-500/10';
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="bg-white dark:bg-[#131b2e] p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl text-rose-600 dark:text-rose-400">
                        <ShieldAlert className="animate-pulse" size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">سجل الرقابة وحركات النظام</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Audit Logs غیر قابلة للتعديل أو المسح</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={loadLogs}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black transition-colors"
                    >
                        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        تحديث السجل
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-[#131b2e] rounded-[2rem] border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                <div className="relative">
                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="البحث في سجل العمليات..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                </div>

                <div className="space-y-3">
                    <AnimatePresence>
                        {filteredLogs.map(log => (
                            <motion.div 
                                key={log.id} 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col md:flex-row gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30"
                            >
                                <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black h-fit shrink-0 tracking-wider w-fit ${getActionColor(log.action)}`}>
                                    {log.action}
                                </div>
                                <div className="space-y-1.5 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.description}</p>
                                        <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                                            {log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'غير محدد'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                                        <span className="flex items-center gap-1"><Activity size={12} /> {log.userName} ({log.userId})</span>
                                        <span className="flex items-center gap-1"><Smartphone size={12} /> {log.deviceInfo?.split(')')[0] + ')' || 'Unknown'}</span>
                                        {log.entityId && <span className="text-slate-400 font-normal">Entity: {log.entityType} | ID: {log.entityId}</span>}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {filteredLogs.length === 0 && !isLoading && (
                        <div className="text-center py-10 text-slate-500 font-bold text-sm">
                            لا توجد حركات مسجلة تطابق بحثك.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
