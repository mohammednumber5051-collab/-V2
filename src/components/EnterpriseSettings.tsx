import React, { useState, useEffect, useRef } from "react";
import { 
    Settings, 
    Shield, 
    Database, 
    HardDrive, 
    CloudOff, 
    Bell, 
    Moon, 
    Sun, 
    RefreshCw, 
    CheckCircle,
    AlertTriangle,
    Save,
    Trash2,
    Activity,
    Lock,
    Sliders,
    Upload,
    FileText,
    Store,
    Clock,
    Cloud,
    Info
} from "lucide-react";
import { dbService } from "../services/db";
import { migrationService } from "../services/migration";
import { BackupRecord } from "../types";
import { cn } from "../lib/utils";
import StoreSettingsForm from "./StoreSettingsForm";

type SettingsTab = 'store' | 'system' | 'about';

export default function EnterpriseSettings() {
    const [backups, setBackups] = useState<BackupRecord[]>([]);
    const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
    const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isMigrating, setIsMigrating] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [migrationNeeded, setMigrationNeeded] = useState(false);
    const [restoreProgress, setRestoreProgress] = useState("");
    const [activeMainTab, setActiveMainTab] = useState<SettingsTab>('store');

    // Auto Backup Settings State
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => localStorage.getItem("autoBackupEnabled") === "true");
    const [backupFrequency, setBackupFrequency] = useState(() => localStorage.getItem("backupFrequency") || "daily");
    const [backupDestination, setBackupDestination] = useState(() => localStorage.getItem("backupDestination") || "local");

    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const loadBackupLogs = async () => {
        try {
            const data = await dbService.getAll("backups");
            if (data && data.length > 0) {
                setBackups(data as BackupRecord[]);
            } else {
                // Return default fallback list if Firestore is empty
                setBackups([
                    { id: "b1", fileName: "backup_optics_init_setup.json", createdBy: "النظام", sizeBytes: 154800, status: "completed", createdAt: "2026-05-20T12:00:00.000Z" }
                ]);
            }
        } catch (e) {
            console.error("Failed to load backup records:", e);
        }
    };

    const checkMigration = () => {
        setMigrationNeeded(migrationService.isMigrationNeeded());
    };

    useEffect(() => {
        loadBackupLogs();
        checkMigration();
    }, []);

    const handleMigration = async () => {
        if (!window.confirm("هل أنت متأكد من رغبتك في نقل جميع البيانات المحلية الحالية إلى السحابة (Firestore)؟ قد يؤدي هذا إلى تكرار البيانات إذا كانت موجودة بالفعل.")) {
            return;
        }

        setIsMigrating(true);
        try {
            const results = await migrationService.migrateAll();
            console.log("Migration results:", results);
            alert("تمت عملية النقل بنجاح! تم نقل البيانات إلى السحابة.");
            setMigrationNeeded(false);
        } catch (e) {
            console.error("Migration failed:", e);
            alert("فشلت عملية النقل التقني. يرجى التحقق من اتصال الإنترنت.");
        } finally {
            setIsMigrating(false);
        }
    };

    const toggleTheme = () => {
        const next = !isDarkMode;
        setIsDarkMode(next);
        if (next) {
            document.documentElement.classList.add('dark');
            localStorage.setItem("theme", "dark");
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem("theme", "light");
        }
    };

    const handleAutoBackupToggle = () => {
        const next = !autoBackupEnabled;
        setAutoBackupEnabled(next);
        localStorage.setItem("autoBackupEnabled", next.toString());
    };

    const handleBackupFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setBackupFrequency(val);
        localStorage.setItem("backupFrequency", val);
    };

    const handleBackupDestinationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setBackupDestination(val);
        localStorage.setItem("backupDestination", val);
    };

    const handleManualBackup = async () => {
        setIsBackingUp(true);
        try {
            // Retrieve all collection documents as a clean JSON
            const backupObj = await dbService.createFullDatabaseBackup();
            const textContent = JSON.stringify(backupObj, null, 2);
            const blob = new Blob([textContent], { type: "application/json" });
            
            // Trigger local download
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const fileDate = new Date().toISOString().slice(0, 10);
            const fileName = `assar_optical_backup_${fileDate}.json`;
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Log this action to the audit trails
            await dbService.logAudit('EXPORT', 'System', 'BACKUP', `تم تصدير نسخة احتياطية كاملة وتنزيلها كملف محلي (${(blob.size / 1024).toFixed(1)} KB)`, null, null, null);

            // Save the logs into Firestore and refresh local list
            const currentUserStr = localStorage.getItem("app_user");
            const currentUser = currentUserStr ? JSON.parse(currentUserStr) : { name: "النظام" };
            const newBackupRecord: BackupRecord = {
                fileName,
                createdBy: currentUser.name,
                sizeBytes: blob.size,
                status: 'completed',
                createdAt: new Date().toISOString()
            };
            
            await dbService.add("backups", newBackupRecord);
            await loadBackupLogs();
            alert("تم أخذ النسخة الاحتياطية وتنزيلها كملف محلي بنجاح.");
        } catch (e) {
            console.error("Backup failed:", e);
            alert("فشل إنشاء وحفظ النسخة الاحتياطية.");
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleRestoreBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const confirmRestore = window.confirm(
            "تحذير هام جداً:\nسيقوم هذا بتعديل واستيراد السجلات إلى قاعدة البيانات من الملف المحدد. هل أنت متأكد من رغبتك في استعادة هذه البيانات الآن؟"
        );
        if (!confirmRestore) {
            e.target.value = "";
            return;
        }

        setIsRestoring(true);
        setRestoreProgress("جاري فحص وقراءة الملف...");

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const content = event.target?.result as string;
                    const backupJson = JSON.parse(content);

                    await dbService.restoreFullDatabaseBackup(backupJson, (msg) => {
                        setRestoreProgress(msg);
                    });

                    alert("تمت استعادة البيانات بنجاح تام! سيتم تحديث الصفحة والبيانات تلقائياً.");
                    window.location.reload();
                } catch (parseError: any) {
                    console.error("Critical error in parsing JSON backup:", parseError);
                    alert("فشل استعادة البيانات: محتوى الملف غير صالح أو تالف.");
                } finally {
                    setIsRestoring(false);
                    setRestoreProgress("");
                }
            };
            reader.readAsText(file);
        } catch (err) {
            console.error("File reading failed:", err);
            alert("فشل قراءة ملف النسخة الاحتياطية.");
            setIsRestoring(false);
            setRestoreProgress("");
        }
    };

    const triggerFilePicker = () => {
        fileInputRef.current?.click();
    };

    const handleRecalculate = async () => {
        setIsRecalculating(true);
        try {
            await dbService.recalculateFinancials();
            alert("تمت إعادة حساب الأرصدة والتقارير بنجاح!");
            setShowRecalculateConfirm(false);
        } catch (e: any) {
            console.error("Recalculate error:", e);
            alert(e.message || "فشلت عملية إعادة الحساب.");
        } finally {
            setIsRecalculating(false);
        }
    };

    const handleResetFinancials = async () => {
        setIsResetting(true);
        try {
            await dbService.resetAllFinancialData();
            alert("تمت تهيئة ومسح جميع بيانات التطبيق وقاعدة البيانات بنجاح (بما في ذلك المستخدمين والصناديق)! سيتم إعادة توجيهك لإعداد النظام من جديد.");
            setShowResetConfirm(false);
            window.location.reload();
        } catch (e: any) {
            console.error("Reset error:", e);
            alert(e.message || "فشلت عملية التهيئة.");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="space-y-6 pb-20 max-w-5xl mx-auto">
            <div className="bg-white dark:bg-[#131b2e] p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-400">
                        <Settings className="animate-spin-slow" size={24} />
                    </div>
                    <div>
                        <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">إعدادات المنصة المتقدمة</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">إدارة الهوية، البيانات، والأمان</p>
                    </div>
                </div>

                <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-slate-800/40 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveMainTab('store')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                            activeMainTab === 'store' 
                                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" 
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                    >
                        <Store size={14} />
                        إعدادات المتجر الهوية
                    </button>
                    <button 
                        onClick={() => setActiveMainTab('system')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                            activeMainTab === 'system' 
                                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" 
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                    >
                        <Shield size={14} />
                        النظام والأمان والمزامنة
                    </button>
                    <button 
                        onClick={() => setActiveMainTab('about')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                            activeMainTab === 'about' 
                                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" 
                                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        )}
                    >
                        <Info size={14} />
                        حول النظام
                    </button>
                </div>
            </div>

            {activeMainTab === 'store' ? (
                <StoreSettingsForm />
            ) : activeMainTab === 'system' ? (
                <div className="space-y-6 animate-fade-up">
                    {/* Restoring progress overlay */}
                    {isRestoring && (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3 animate-pulse text-amber-700 dark:text-amber-400 text-sm font-black">
                            <RefreshCw className="animate-spin text-amber-500 shrink-0" size={18} />
                            <span>{restoreProgress}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        
                        {/* System Health / Offline Settings */}
                        <div className="bg-white dark:bg-[#131b2e] rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-6 transition-colors">
                            <div className="flex items-center gap-2 mb-4">
                                <Activity className="text-emerald-500" size={18} />
                                <h3 className="font-black text-slate-800 dark:text-slate-200">حالة النظام والاستقرار</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <Database className="text-blue-500" size={16} />
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">صحة قاعدة البيانات</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">آمنة وتعمل بكفاءة</p>
                                        </div>
                                    </div>
                                    <CheckCircle className="text-emerald-500" size={18} />
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <CloudOff className="text-indigo-500" size={16} />
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">حالة المزامنة الأوفلاين</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-0.5">تمت المزامنة بالكامل Local Caching</p>
                                        </div>
                                    </div>
                                    {syncStatus === 'synced' ? (
                                        <CheckCircle className="text-emerald-500" size={18} />
                                    ) : (
                                        <RefreshCw className="text-amber-500 animate-spin" size={18} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Display & Preferences */}
                        <div className="bg-white dark:bg-[#131b2e] rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-6 transition-colors">
                            <div className="flex items-center gap-2 mb-4">
                                <Sliders className="text-rose-500" size={18} />
                                <h3 className="font-black text-slate-800 dark:text-slate-200">تفضيلات الواجهة والأمان</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">الوضع الليلي (Dark Mode)</p>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">راحة للعين في الإضاءة المنخفضة</p>
                                    </div>
                                    <button onClick={toggleTheme} className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors">
                                        {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">تسجيل الخروج التلقائي (Session)</p>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5">للحماية من المتطفلين (30 دقيقة)</p>
                                    </div>
                                    <Lock className="text-slate-400" size={16} />
                                </div>
                            </div>
                        </div>

                        {/* Backup & Architecture */}
                        <div className="bg-white dark:bg-[#131b2e] rounded-2xl border border-slate-100 dark:border-slate-800 p-4 lg:col-span-2 space-y-6 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="text-blue-500" size={18} />
                                    <h3 className="font-black text-slate-800 dark:text-slate-200">نظام النسخ الاحتياطي وإدارة البيانات</h3>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Hidden file selector for Restore */}
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        accept=".json" 
                                        className="hidden" 
                                        onChange={handleRestoreBackupFile} 
                                    />
                                    
                                    <button 
                                        onClick={triggerFilePicker}
                                        disabled={isRestoring}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-black transition-colors disabled:opacity-70 cursor-pointer"
                                    >
                                        <Upload size={14} className={isRestoring ? "animate-bounce" : ""} />
                                        <span>استيراد واستعادة البيانات</span>
                                    </button>

                                    <button 
                                        onClick={handleManualBackup}
                                        disabled={isBackingUp}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white rounded-xl text-xs font-black transition-colors disabled:opacity-70 cursor-pointer"
                                    >
                                        <Save size={14} className={isBackingUp ? "animate-pulse" : ""} />
                                        {isBackingUp ? "جاري النسخ..." : "نسخة احتياطية"}
                                    </button>

                                    {migrationNeeded && (
                                        <button 
                                            onClick={handleMigration}
                                            disabled={isMigrating}
                                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-colors disabled:opacity-70 cursor-pointer shadow-md shadow-amber-500/20"
                                        >
                                            <RefreshCw size={14} className={isMigrating ? "animate-spin" : ""} />
                                            {isMigrating ? "جاري النقل..." : "نقل للسحابة"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 mb-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Clock className="text-indigo-500" size={18} />
                                        <div>
                                            <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">النسخ الاحتياطي التلقائي (Cloud / Local)</h4>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">قم بجدولة حفظ النسخ الاحتياطية لتأمين بياناتك دورياً</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleAutoBackupToggle}
                                        className={cn(
                                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none",
                                            autoBackupEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                autoBackupEnabled ? "-translate-x-2" : "translate-x-2"
                                            )}
                                        />
                                    </button>
                                </div>

                                {autoBackupEnabled && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 animate-fade-up">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">معدل التكرار</label>
                                            <select
                                                value={backupFrequency}
                                                onChange={handleBackupFrequencyChange}
                                                className="w-full bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                                            >
                                                <option value="daily">يومياً (مستحسن للعاملين بكثرة)</option>
                                                <option value="weekly">أسبوعياً</option>
                                                <option value="monthly">شهرياً</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">وجهة الحفظ</label>
                                            <select
                                                value={backupDestination}
                                                onChange={handleBackupDestinationChange}
                                                className="w-full bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                                            >
                                                <option value="local">تحميل محلي (يحتاج إبقاء المتصفح مفتوحاً)</option>
                                                <option value="cloud">مزامنة سحابية (Firestore Storage)</option>
                                                <option value="external">تصدير خارجي (Drive/Dropbox مستقبلاً)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs">
                                    <thead>
                                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                                            <th className="px-4 py-2.5">اسم ملف النسخة الاحتياطية</th>
                                            <th className="px-4 py-2.5">بواسطة</th>
                                            <th className="px-4 py-2.5">التاريخ والوقت</th>
                                            <th className="px-4 py-2.5">الحجم</th>
                                            <th className="px-4 py-2.5">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800 font-bold">
                                        {backups.map(b => (
                                            <tr key={b.id || b.createdAt} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                                <td className="px-4 py-3.5 font-mono text-blue-600 dark:text-blue-400 select-all">{b.fileName}</td>
                                                <td className="px-4 py-3.5 text-slate-800 dark:text-slate-300">{b.createdBy}</td>
                                                <td className="px-4 py-3.5 text-slate-500" dir="ltr">
                                                    {b.createdAt ? new Date(b.createdAt).toLocaleString('ar-EG') : 'غير محدد'}
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-500 font-mono">
                                                    {b.sizeBytes ? (b.sizeBytes / 1024).toFixed(1) + " KB" : "---"}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    {b.status === 'completed' ? (
                                                        <span className="text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg text-[10px]">مكتمل</span>
                                                    ) : (
                                                        <span className="text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-lg text-[10px]">فشل</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-2xl mx-auto mt-10 animate-fade-up">
                    <div className="bg-white dark:bg-[#131b2e] border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center relative overflow-hidden shadow-sm">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
                        <div className="w-20 h-20 bg-blue-50 dark:bg-blue-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-blue-600 dark:text-blue-400 rotate-3">
                            <Store size={40} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">ASSAR Optical Accounting</h2>
                        <div className="inline-block bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full text-[10px] font-bold font-mono mb-8">
                            Version 1.0
                        </div>
                        
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-8 mt-4">
                            <p className="text-xs text-slate-400 font-medium mb-1 uppercase tracking-widest">Designed & Developed By</p>
                            <p className="text-lg font-black text-slate-800 dark:text-slate-200 mb-2">Mohammed Assubaihi</p>
                            <p className="text-sm font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 py-2 px-4 rounded-xl inline-block mb-4">
                                Mobile: 779391682
                            </p>
                        </div>
                        
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-8 mt-4 relative space-y-4">
                            {showRecalculateConfirm ? (
                                <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-4 rounded-xl text-right">
                                    <h4 className="text-rose-700 dark:text-rose-400 font-bold mb-2 flex items-center gap-2">
                                        <AlertTriangle size={18} />
                                        تأكيد إعادة الحساب
                                    </h4>
                                    <p className="text-sm text-rose-600 dark:text-rose-300 mb-4">
                                        هل أنت متأكد من إعادة حساب جميع الأرصدة والتقارير؟ سيتم مراجعة كافة الفواتير والعمليات المالية وإعادة ضبط جميع أرصدة الصناديق والعملاء والموردين.
                                    </p>
                                    <div className="flex gap-2 justify-end">
                                        <button 
                                            onClick={() => setShowRecalculateConfirm(false)}
                                            className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                                            disabled={isRecalculating}
                                        >
                                            إلغاء
                                        </button>
                                        <button 
                                            onClick={handleRecalculate}
                                            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
                                            disabled={isRecalculating}
                                        >
                                            {isRecalculating ? <RefreshCw className="animate-spin" size={16} /> : null}
                                            نعم، ابدأ إعادة الحساب
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <button
                                        onClick={() => setShowRecalculateConfirm(true)}
                                        className="px-6 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 font-bold rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all text-sm w-full flex items-center justify-center gap-2"
                                    >
                                        <RefreshCw size={18} />
                                        إصلاح الأخطاء المحاسبية وإعادة ضبط الأرصدة ⚠️
                                    </button>
                                    <p className="text-xs text-slate-500 mt-3 font-medium">استخدم هذا الزر فقط في حالة وجود خلل في الأرصدة (كالرصيد السالب غير المبرر). سيقوم النظام بمراجعة كافة الفواتير والعمليات وإعادة حساب جميع الأرصدة.</p>
                                </div>
                            )}

                            {showResetConfirm ? (
                                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 rounded-xl text-right">
                                    <h4 className="text-red-700 dark:text-red-400 font-black mb-2 flex items-center gap-2">
                                        <Trash2 size={18} />
                                        تأكيد تهيئة وحذف جميع بيانات التطبيق وقاعدة البيانات بالكامل ‼️
                                    </h4>
                                    <p className="text-sm text-red-600 dark:text-red-300 mb-4 font-bold">
                                        هذا الإجراء خطير جداً ولا يمكن التراجع عنه! سيتم حذف ومسح كافة الفواتير، السندات، العمليات، القيود اليومية، المنتجات، العملاء، الموردين، الصناديق، وحسابات المستخدمين بالكامل. سيبدأ التطبيق وقاعدة البيانات من الصفر تماماً كأنه تثبيت جديد.
                                    </p>
                                    <div className="flex gap-2 justify-end">
                                        <button 
                                            onClick={() => setShowResetConfirm(false)}
                                            className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                                            disabled={isResetting}
                                        >
                                            تراجع
                                        </button>
                                        <button 
                                            onClick={handleResetFinancials}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-black hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                                            disabled={isResetting}
                                        >
                                            {isResetting ? <RefreshCw className="animate-spin" size={16} /> : null}
                                            نعم، احذف كافة البيانات وابدأ من الصفر
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <button
                                        onClick={() => setShowResetConfirm(true)}
                                        className="px-6 py-3 bg-red-50 dark:bg-red-500/10 text-red-600 font-black rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-all text-sm w-full flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={18} />
                                        تهيئة كامل التطبيق وقاعدة البيانات (البدء من الصفر كلياً) ‼️
                                    </button>
                                    <p className="text-xs text-red-400/80 mt-3 font-medium">سيقوم هذا الخيار بمسح كامل قاعدة البيانات وحذف جميع المنتجات، الصناديق، المستخدمين، العملاء، الموردين، والفواتير للبدء من جديد تماماً.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Enterprise Settings Footer */}
            <div className="mt-16 text-center text-[10px] text-slate-400 dark:text-slate-500 font-medium pb-8">
                <div>Designed & Developed By Mohammed Assubaihi</div>
                <div className="font-mono mt-1">Mobile: 779391682</div>
            </div>
        </div>
    );
}
