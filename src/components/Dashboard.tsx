import { useEffect, useState } from "react";
import { 
    TrendingUp, 
    TrendingDown, 
    Package, 
    Wallet, 
    Clock, 
    Plus, 
    Zap, 
    ListTodo, 
    Wrench, 
    ShoppingBag, 
    ShieldCheck, 
    ShoppingCart,
    User,
    Sparkles
} from "lucide-react";
import { dbService } from "../services/db";
import { motion } from "motion/react";
import { cn, hasPermission } from "../lib/utils";
import { AppUser } from "../types";

export default function Dashboard({ onNavigate, currentUser }: { onNavigate?: (page: any) => void, currentUser?: AppUser | null }) {
    const fallbackName = "المستخدم"; 
    const getRoleName = (role?: string) => {
        switch(role) {
            case 'SUPER_ADMIN':
            case 'مدير النظام':
                return 'مدير النظام';
            case 'Owner / General Manager':
            case 'مالك':
                return 'المدير العام';
            case 'Accountant':
            case 'محاسب':
                return 'المحاسب';
            case 'Cashier':
            case 'كاشير':
                return 'الكاشير';
            case 'Inventory Manager':
            case 'أمين مخزن':
                return 'أمين المخزن';
            case 'Read-Only User':
            case 'عرض فقط':
                return 'الزائر';
            default:
                return 'الموظف';
        }
    };

    const displayRole = getRoleName(currentUser?.role);
    const displayName = currentUser?.name || fallbackName;

    const [stats, setStats] = useState({
        balance: 0,
        lowStock: 0,
        repairQueueCount: 0,
        specialOrdersReadyCount: 0,
        activeWarrantiesCount: 0,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const dashCache = await dbService.getAll("dashboard_cache") as any[];
                const cache = (dashCache || []).find(d => d.id === 'global') || { 
                    totalCashBalance: 0,
                    lowStockCount: 0,
                    repairQueueCount: 0,
                    specialOrdersReadyCount: 0,
                    activeWarrantiesCount: 0
                };

                setStats({
                    balance: cache.totalCashBalance || 0,
                    lowStock: cache.lowStockCount || 0,
                    repairQueueCount: cache.repairQueueCount || 0,
                    specialOrdersReadyCount: cache.specialOrdersReadyCount || 0,
                    activeWarrantiesCount: cache.activeWarrantiesCount || 0,
                });
            } catch (err) {
                console.error("Dashboard data fetch error:", err);
            }
        };
        fetchData();
    }, []);

    const mainActions = [
        { id: 'invoices', title: 'المبيعات', icon: ShoppingCart, color: 'bg-emerald-500', desc: 'إصدار فواتير بيع جديدة' },
        { id: 'partners', title: 'العملاء', icon: User, color: 'bg-blue-500', desc: 'إدارة حسابات الزبائن' },
        { id: 'inventory', title: 'الأصناف', icon: Package, color: 'bg-indigo-500', desc: 'المخزون والمنتجات' },
        { id: 'transactions', title: 'سندات صرف وقبض', icon: Wallet, color: 'bg-amber-500', desc: 'الحركات المالية والصندوق' },
        { id: 'reports', title: 'التقارير', icon: TrendingUp, color: 'bg-purple-500', desc: 'الأداء المالي والنمو' },
        { id: 'settings', title: 'الإعدادات', icon: Wrench, color: 'bg-slate-600', desc: 'تهيئة النظام والمستخدمين' },
    ].filter(action => hasPermission(currentUser, action.id));

    return (
        <div className="space-y-6 w-full max-w-lg mx-auto pb-6 animate-fade-up">
            
            {/* Header Area */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-white">المركز البصري</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">مرحباً يا <span className="text-indigo-600 dark:text-indigo-400">{displayRole}</span>، {displayName}</p>
                </div>
                <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <Sparkles size={20} />
                </div>
            </div>

            {/* Quick Balance Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => onNavigate?.('transactions')}
                className="bg-slate-900 dark:bg-[#131b2e] rounded-3xl p-5 text-white shadow-xl relative overflow-hidden cursor-pointer active:scale-95 transition-all"
            >
                <div className="relative z-10 flex justify-between items-end">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">الرصيد النقدي المتوفر</span>
                        <div className="text-3xl font-black font-mono">
                            {(stats.balance || 0).toLocaleString()} <span className="text-xs text-slate-400">YER</span>
                        </div>
                    </div>
                    <div className="bg-white/10 p-2 rounded-xl">
                        <Wallet size={24} className="text-blue-400" />
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            </motion.div>

            {/* Main Action Grid */}
            <div className="grid grid-cols-2 gap-4">
                {mainActions.map((action, idx) => (
                    <motion.button
                        key={action.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => onNavigate?.(action.id as any)}
                        className="bg-white dark:bg-[#131b2e] p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center text-center gap-3 active:scale-95 transition-all group"
                    >
                        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:rotate-6", action.color)}>
                            <action.icon size={28} />
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-sm font-black text-slate-800 dark:text-slate-100 block">{action.title}</span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block leading-tight">{action.desc}</span>
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Low Stock Alert - Fast access */}
            {stats.lowStock > 0 && (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => onNavigate?.('inventory')}
                    className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 p-4 rounded-2xl flex items-center gap-4 cursor-pointer active:scale-95 transition-all"
                >
                    <div className="bg-amber-500 text-white p-2 rounded-xl">
                        <Package size={20} />
                    </div>
                    <div>
                        <p className="text-xs font-black text-amber-800 dark:text-amber-400">تنبيه المخزون المنخفض</p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-500/80 font-bold">يوجد {stats.lowStock} أصناف أوشكت على النفاذ من المستودع</p>
                    </div>
                </motion.div>
            )}

        </div>
    );
}
