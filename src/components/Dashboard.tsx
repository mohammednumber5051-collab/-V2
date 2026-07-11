import { syncEngine } from "../services/syncEngine";
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
    Sparkles,
    FileText
} from "lucide-react";
import { dbService } from "../services/db";
import { motion } from "motion/react";
import { cn, hasPermission } from "../lib/utils";
import { AppUser, CashBox } from "../types";
import { calculateUnifiedCashBalances } from "../lib/financialUtils";

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
        let isMounted = true;
        const loadDashStats = async () => {
            try {
                const dashCache = await dbService.getAll("dashboard_cache");
                const globalCache = dashCache.find(c => c.id === 'global') || {};
                
                // Fetch cash boxes and all movements directly for exact live calculation
                const [cashBoxes, txs, invs, vchs, qes] = await Promise.all([
                    dbService.getAll("cashBoxes"),
                    dbService.getAll("transactions"),
                    dbService.getAll("invoices"),
                    dbService.getAll("vouchers"),
                    dbService.getAll("quick_financial_entries")
                ]);
                
                const hasViewBalancePermission = hasPermission(currentUser, 'view_cash_balance');
                const userAssignedBoxId = currentUser?.assignedBoxId;

                let finalBalance = 0;
                if (hasViewBalancePermission) {
                    const role = (currentUser?.role || '').toUpperCase().trim();
                    const isManager = role.includes('ADMIN') || 
                                      role.includes('SUPER') || 
                                      role.includes('OWNER') || 
                                      role === 'مالك' || 
                                      role === 'المدير العام' || 
                                      role === 'مدير النظام' || 
                                      role === 'محاسب' || 
                                      role.includes('ACCOUNTANT') ||
                                      role === 'MANAGER';

                    const { boxBalances, totalBalance } = calculateUnifiedCashBalances(
                        cashBoxes as CashBox[],
                        txs as any[],
                        invs as any[],
                        vchs as any[],
                        qes as any[]
                    );

                    if (userAssignedBoxId && !isManager) {
                        finalBalance = boxBalances[userAssignedBoxId] || 0;
                    } else {
                        finalBalance = totalBalance;
                    }
                }

                if (isMounted) {
                    setStats({
                        balance: finalBalance,
                        lowStock: globalCache.lowStockCount || 0,
                        repairQueueCount: globalCache.repairQueueCount || 0,
                        specialOrdersReadyCount: globalCache.specialOrdersReadyCount || 0,
                        activeWarrantiesCount: globalCache.activeWarrantiesCount || 0,
                    });
                }
            } catch (err) {
                console.error("Failed to load dashboard stats", err);
            }
        };
        loadDashStats();
        return () => { isMounted = false; };
    }, [currentUser]);

    const mainActions = [
        { id: 'invoices', title: 'المبيعات', icon: ShoppingCart, color: 'bg-emerald-500', desc: 'إصدار فواتير بيع جديدة' },
        { id: 'partners', title: 'العملاء', icon: User, color: 'bg-blue-500', desc: 'إدارة حسابات الزبائن' },
        { id: 'inventory', title: 'الأصناف', icon: Package, color: 'bg-indigo-500', desc: 'المخزون والمنتجات' },
        { id: 'vouchers', title: 'سندات صرف وقبض', icon: Wallet, color: 'bg-amber-500', desc: 'سندات القبض والصرف المالية' },
        { id: 'quick_entry', title: 'الإدخال السريع', icon: Zap, color: 'bg-cyan-500', desc: 'تسجيل الحركات المالية السريعة' },
        { id: 'quick_entries_history', title: 'سجل الإدخال السريع', icon: FileText, color: 'bg-blue-600', desc: 'عرض وتعديل العمليات السريعة' },
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
                onClick={() => {
                    localStorage.setItem("transactions_active_tab", "boxes");
                    onNavigate?.('transactions');
                }}
                className="bg-slate-900 dark:bg-[#131b2e] rounded-3xl p-5 text-white shadow-xl relative overflow-hidden cursor-pointer active:scale-95 transition-all"
            >
                <div className="relative z-10 flex justify-between items-end">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">الرصيد النقدي المتوفر</span>
                            <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 text-[8px] px-1.5 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">
                                <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                                مباشر
                            </span>
                        </div>
                        <div className="text-3xl font-black font-mono">
                            {hasPermission(currentUser, 'view_cash_balance') ? (
                                <>
                                    {(stats.balance || 0).toLocaleString()} <span className="text-xs text-slate-400">YER</span>
                                </>
                            ) : (
                                "****"
                            )}
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
