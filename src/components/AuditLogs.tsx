import React, { useState, useEffect } from "react";
import { ShieldAlert, Search, Database, HardDrive, RefreshCw, AlertTriangle, CheckCircle, Smartphone, Activity, Filter, ChevronUp, ChevronDown } from "lucide-react";
import { dbService } from "../services/db";
import { db, collection, query, orderBy, limit, onSnapshot } from "../firebase";
import firebaseConfig from "../../firebase-applet-config.json";
import { AuditLog } from "../types";
import { motion, AnimatePresence } from "motion/react";

const isPlaceholder = !firebaseConfig || !firebaseConfig.projectId || firebaseConfig.projectId.startsWith("remixed-") || firebaseConfig.projectId.includes("placeholder") || firebaseConfig.projectId.includes("your-");

const FIELD_LABELS: Record<string, string> = {
    paid: 'المبلغ المدفوع',
    items: 'الأصناف',
    discount: 'الخصم',
    referenceNumber: 'رقم المرجع',
    currency: 'العملة',
    total: 'الإجمالي',
    lifecycleStatus: 'حالة الدورة',
    status: 'الحالة',
    notes: 'ملاحظات',
    autoCreatePartner: 'إنشاء شريك تلقائي',
    partnerName: 'اسم الشريك',
    partnerPhone: 'هاتف الشريك',
    boxId: 'رقم الصندوق',
    paymentType: 'طريقة الدفع',
    partnerId: 'رقم الشريك',
    type: 'النوع',
    createdAt: 'تاريخ الإنشاء',
    updatedAt: 'تاريخ التحديث',
    recordStatus: 'حالة السجل',
};

const LogDetailsTable = ({ action, oldValue, newValue }: { action: string, oldValue: any, newValue: any }) => {
    if (action === 'DELETE') {
        // Display deletion details as a clean list
        return (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                <h4 className="font-black text-rose-600 dark:text-rose-400 mb-3 text-sm">بيانات السجل المحذوف:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(oldValue || {}).map(([key, value]) => (
                        <div key={key} className="flex gap-2 bg-white dark:bg-slate-700 p-2 rounded-lg border border-slate-100 dark:border-slate-600">
                            <span className="font-bold text-slate-500 dark:text-slate-400 text-xs w-24 shrink-0">{FIELD_LABELS[key] || key}:</span>
                            <span className="font-mono text-[10px] text-slate-900 dark:text-white break-all">{JSON.stringify(value)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Get all unique keys and filter for only those that have changed
    const keys = Array.from(new Set([
        ...Object.keys(oldValue || {}), 
        ...Object.keys(newValue || {})
    ])).filter(key => JSON.stringify(oldValue?.[key]) !== JSON.stringify(newValue?.[key]));
    
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
                <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                        <th className="py-3 px-3 font-black">البيان</th>
                        <th className="py-3 px-3 font-black text-rose-500">قبل التعديل</th>
                        <th className="py-3 px-3 font-black text-emerald-500">بعد التعديل</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {keys.map(key => (
                        <tr key={key} className="text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-3 px-3 font-bold text-xs">{FIELD_LABELS[key] || key}</td>
                            <td className="py-3 px-3 font-mono text-[10px] text-slate-600 dark:text-slate-400">{oldValue?.[key] !== undefined ? JSON.stringify(oldValue[key]) : '-'}</td>
                            <td className="py-3 px-3 font-mono text-[10px] text-slate-900 dark:text-white font-bold">{newValue?.[key] !== undefined ? JSON.stringify(newValue[key]) : '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default function AuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterType, setFilterType] = useState<'day' | 'period' | 'all'>('day');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);

    const manualLoad = async () => {
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
        let unsubscribe: (() => void) | undefined;

        const loadLogs = async () => {
            setIsLoading(true);
            try {
                // Try real-time if not in placeholder mode
                if (!isPlaceholder) {
                    const q = query(
                        collection(db, "auditLogs"),
                        orderBy("updatedAt", "desc"),
                        limit(500) // Increased limit to allow filtering locally for now
                    );
                    
                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const logsData = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        })) as AuditLog[];
                        setLogs(logsData);
                        setIsLoading(false);
                    }, (error) => {
                        console.error("Firestore Audit Subscription Error:", error);
                        // Fallback to manual load
                        manualLoad();
                    });
                } else {
                    manualLoad();
                }
            } catch (e) {
                console.error("Audit load error:", e);
                manualLoad();
            }
        };

        loadLogs();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const filteredLogs = logs
        .filter(l => {
            // Search filter
            const matchesSearch = l.action.toLowerCase().includes(search.toLowerCase()) || 
                                l.userName.toLowerCase().includes(search.toLowerCase()) ||
                                l.description.toLowerCase().includes(search.toLowerCase());
            
            if (!matchesSearch) return false;

            // Date filter
            if (filterType === 'all') return true;

            const logDateStr = (l.updatedAt || l.createdAt || "").split('T')[0];
            if (!logDateStr) return false;

            if (filterType === 'day') {
                return logDateStr === startDate;
            }

            if (filterType === 'period') {
                return logDateStr >= startDate && logDateStr <= endDate;
            }

            return true;
        })
        .sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return dateB - dateA;
        });

    const setToday = () => {
        const today = new Date().toISOString().split('T')[0];
        setStartDate(today);
        setEndDate(today);
        setFilterType('day');
    };

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
            {selectedLog && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
                    <div className="flex min-h-screen items-center justify-center">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-4xl border border-slate-200 dark:border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white">تفاصيل السجل</h3>
                            <div className="text-xs bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-slate-600 dark:text-slate-300 font-mono space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4 border-slate-200 dark:border-slate-700">
                                    <p><strong>الإجراء:</strong> {selectedLog.action}</p>
                                    <p><strong>الوصف:</strong> {selectedLog.description}</p>
                                    <p><strong>التاريخ:</strong> {new Date(selectedLog.createdAt).toLocaleString()}</p>
                                    <p><strong>المستخدم:</strong> {selectedLog.userName}</p>
                                    {selectedLog.originalCreatedAt && <p><strong>تاريخ الإنشاء الأصلي:</strong> {new Date(selectedLog.originalCreatedAt).toLocaleString()}</p>}
                                    {selectedLog.originalCreatedBy && <p><strong>المستخدم الذي أنشأه:</strong> {selectedLog.originalCreatedBy}</p>}
                                    {selectedLog.cashBoxBalanceBefore !== undefined && <p><strong>رصيد الصندوق قبل:</strong> {selectedLog.cashBoxBalanceBefore}</p>}
                                    {selectedLog.cashBoxBalanceAfter !== undefined && <p><strong>رصيد الصندوق بعد:</strong> {selectedLog.cashBoxBalanceAfter}</p>}
                                </div>
                                
                                {(selectedLog.oldValue || selectedLog.newValue) && (
                                    <div className="mt-2">
                                        <h4 className="font-bold mb-2">التغيرات:</h4>
                                        <LogDetailsTable action={selectedLog.action} oldValue={selectedLog.oldValue} newValue={selectedLog.newValue} />
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSelectedLog(null)} className="mt-4 w-full bg-slate-100 dark:bg-slate-700 p-3 rounded-xl font-bold text-slate-700 dark:text-slate-200">إغلاق</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="bg-white dark:bg-[#131b2e] p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-5 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl text-rose-600 dark:text-rose-400">
                        <ShieldAlert className="animate-pulse" size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">سجل الرقابة وحركات النظام</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Audit Logs غير قابلة للتعديل أو المسح</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-100 dark:border-slate-700">
                        <button 
                            onClick={() => setFilterType('day')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${filterType === 'day' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500'}`}
                        >
                            يوم محدد
                        </button>
                        <button 
                            onClick={() => setFilterType('period')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${filterType === 'period' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500'}`}
                        >
                            فترة زمنية
                        </button>
                        <button 
                            onClick={() => setFilterType('all')}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${filterType === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600' : 'text-slate-500'}`}
                        >
                            الكل
                        </button>
                    </div>

                    {filterType !== 'all' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                            <input 
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-rose-500/20"
                            />
                            {filterType === 'period' && (
                                <>
                                    <span className="text-slate-400 text-[10px] font-black">إلى</span>
                                    <input 
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-rose-500/20"
                                    />
                                </>
                            )}
                        </div>
                    )}

                    <div className="h-8 w-px bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block"></div>

                    <button 
                        onClick={setToday}
                        className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black transition-colors"
                    >
                        اليوم
                    </button>
                    <button 
                        onClick={manualLoad}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black transition-colors"
                    >
                        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        تحديث
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
                                onClick={() => setSelectedLog(log)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="cursor-pointer flex flex-col md:flex-row gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                            >
                                <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black h-fit shrink-0 tracking-wider w-fit ${getActionColor(log.action)}`}>
                                    {log.action}
                                </div>
                                <div className="space-y-1.5 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-black text-slate-800 dark:text-slate-200">{log.description}</p>
                                        <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                                            {(log.createdAt || (log as any).updatedAt) ? new Date(log.createdAt || (log as any).updatedAt).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'غير محدد'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                                        <span className="flex items-center gap-1"><Activity size={12} /> {log.userName} ({log.userId})</span>
                                        <span className="flex items-center gap-1"><Smartphone size={12} /> {log.deviceInfo?.split(')')[0] + ')' || 'Unknown'}</span>
                                        {log.entityId && <span className="text-slate-400 font-normal">Entity: {log.entityType || (log as any).entity} | ID: {log.entityId}</span>}
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
