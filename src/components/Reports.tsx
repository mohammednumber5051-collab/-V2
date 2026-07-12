import React, { useState, useEffect } from "react";
import { 
    TrendingUp, 
    TrendingDown, 
    Calendar,
    Wallet,
    DollarSign,
    Briefcase
} from "lucide-react";
import { dbService } from "../services/db";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { CashBox } from "../types";

export default function Reports() {
    const [dailySummaries, setDailySummaries] = useState<any[]>([]);
    const [monthlySummaries, setMonthlySummaries] = useState<any[]>([]);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>("month");
    const [activeTab, setActiveTab] = useState<"executive" | "sales" | "profit">("executive");

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [dailyData, monthlyData, boxData] = await Promise.all([
                dbService.getAll("daily_financial_summaries"),
                dbService.getAll("monthly_financial_summaries"),
                dbService.getAll("cashBoxes"),
            ]);
            
            setDailySummaries(dailyData as any[]);
            setMonthlySummaries(monthlyData as any[]);
            setCashBoxes((boxData as CashBox[]).filter(b => b.recordStatus !== 'deleted' && b.isActive !== false));
        } catch (e) {
            console.error("Failed to load reports data:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Live cash balance from actual cashbox documents (same as Dashboard)
    const liveCashBalance = cashBoxes.reduce((sum, b) => sum + (Number(b.balance) || 0), 0);

    // Filter daily summaries by selected time range
    const getFilteredDailySummaries = () => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        return dailySummaries.filter(s => {
            if (!s.date) return false;
            if (timeRange === 'today') return s.date === todayStr;
            if (timeRange === 'week') {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                return s.date >= weekAgo && s.date <= todayStr;
            }
            if (timeRange === 'month') {
                const monthStr = todayStr.substring(0, 7);
                return s.date.startsWith(monthStr);
            }
            if (timeRange === 'year') {
                const yearStr = todayStr.substring(0, 4);
                return s.date.startsWith(yearStr);
            }
            return true;
        });
    };

    const filteredDaily = getFilteredDailySummaries();

    const getTimelineData = () => {
        const sorted = [...filteredDaily].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
        return sorted.map(s => ({
            date: new Date(s.date).toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }),
            sales: s.salesTotal || 0,
            purchases: s.purchasesTotal || 0,
            expenses: s.expensesTotal || 0
        }));
    };

    const timelineData = getTimelineData();

    const salesInYer      = filteredDaily.reduce((sum, s) => sum + (s.salesTotal || 0), 0);
    const purchasesInYer  = filteredDaily.reduce((sum, s) => sum + (s.purchasesTotal || 0), 0);
    const expensesInYer   = filteredDaily.reduce((sum, s) => sum + (s.expensesTotal || 0), 0);
    const profitsInYer    = filteredDaily.reduce((sum, s) => sum + (s.profitsTotal || 0), 0);
    const receiptsInYer   = filteredDaily.reduce((sum, s) => sum + (s.receiptsTotal || 0), 0);
    const paymentsInYer   = filteredDaily.reduce((sum, s) => sum + (s.paymentsTotal || 0), 0);
    const netProfitInYer  = profitsInYer - expensesInYer;

    const timeRangeLabel = {
        today: 'اليوم',
        week: 'آخر 7 أيام',
        month: 'هذا الشهر',
        year: 'هذه السنة',
    }[timeRange];

    if (isLoading) {
        return <div className="text-center mt-10">جاري تحميل التقارير...</div>;
    }

    return (
        <div className="space-y-6 max-w-sm md:max-w-none mx-auto pb-10">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10 space-y-2">
                    <h1 className="text-2xl font-black">التقارير التحليلية</h1>
                    <p className="text-sm font-medium text-slate-400">لوحة تحكم الأداء المالي</p>
                </div>
                {/* Time Range Selector */}
                <div className="relative z-10 flex items-center gap-1 bg-white/10 p-1 rounded-2xl">
                    {([
                        { id: 'today', label: 'اليوم' },
                        { id: 'week', label: '7 أيام' },
                        { id: 'month', label: 'الشهر' },
                        { id: 'year', label: 'السنة' },
                    ] as const).map(r => (
                        <button
                            key={r.id}
                            onClick={() => setTimeRange(r.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-xl text-xs font-black transition-all",
                                timeRange === r.id
                                    ? "bg-white text-slate-900"
                                    : "text-slate-300 hover:text-white"
                            )}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Core Report Tabs Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl no-scrollbar shrink-0">
                {[
                    { id: 'executive', title: 'الملخص التنفيذي', icon: Briefcase },
                    { id: 'sales', title: 'المبيعات والإيرادات', icon: TrendingUp },
                    { id: 'profit', title: 'الأرباح التشغيلية', icon: Wallet },
                ].map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id as any)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap outline-none",
                                isActive 
                                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-400 shadow-sm" 
                                : "text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50"
                            )}>
                            <item.icon size={16} />
                            {item.title}
                        </button>
                    )
                })}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab + timeRange}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                >
                    {activeTab === 'executive' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-blue-50 dark:bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-500">
                                            <Wallet size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400">الرصيد النقدي الحالي</h3>
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono break-all leading-none">
                                        {liveCashBalance.toLocaleString()} <span className="text-[10px] text-slate-400">YER</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1">من الصناديق الحية</div>
                                </div>
                                
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-500">
                                            <TrendingUp size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400">إجمالي المبيعات — {timeRangeLabel}</h3>
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono break-all leading-none">
                                        {salesInYer.toLocaleString()} <span className="text-[10px] text-slate-400">YER</span>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-xl text-rose-600 dark:text-rose-500">
                                            <TrendingDown size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400">إجمالي المصروفات — {timeRangeLabel}</h3>
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono break-all leading-none">
                                        {expensesInYer.toLocaleString()} <span className="text-[10px] text-slate-400">YER</span>
                                    </div>
                                </div>

                                <div className="bg-emerald-500 dark:bg-emerald-600 rounded-3xl p-5 text-white">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-white/20 rounded-xl text-white">
                                            <DollarSign size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-emerald-50">صافي الأرباح — {timeRangeLabel}</h3>
                                    </div>
                                    <div className="text-2xl font-black font-mono break-all leading-none">
                                        {profitsInYer.toLocaleString()} <span className="text-[10px] opacity-80">YER</span>
                                    </div>
                                </div>
                            </div>

                            {/* Secondary stats: purchases, receipts, payments */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white dark:bg-[#131b2e] rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">إجمالي المشتريات</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white font-mono">{purchasesInYer.toLocaleString()} <span className="text-[9px] text-slate-400">YER</span></p>
                                </div>
                                <div className="bg-white dark:bg-[#131b2e] rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">إجمالي المقبوضات</p>
                                    <p className="text-lg font-black text-emerald-600 font-mono">{receiptsInYer.toLocaleString()} <span className="text-[9px] text-slate-400">YER</span></p>
                                </div>
                                <div className="bg-white dark:bg-[#131b2e] rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">إجمالي المدفوعات</p>
                                    <p className="text-lg font-black text-rose-600 font-mono">{paymentsInYer.toLocaleString()} <span className="text-[9px] text-slate-400">YER</span></p>
                                </div>
                            </div>

                            {/* 7 Day Trend Block */}
                            <div className="bg-white dark:bg-[#131b2e] rounded-[2rem] border border-slate-100 dark:border-slate-800 p-6">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-6">مؤشر المبيعات والمصروفات — آخر 7 أيام من الفترة المختارة</h3>
                                <div className="h-64 flex items-end justify-between gap-1 w-full relative">
                                    {timelineData.length === 0 ? (
                                        <div className="w-full flex items-center justify-center text-slate-400 text-sm font-bold">لا توجد بيانات للفترة المختارة</div>
                                    ) : timelineData.map((d, i) => {
                                        const maxVal = Math.max(...timelineData.map(t => Math.max(t.sales, t.expenses, 1)));
                                        const hSales = (d.sales / maxVal) * 100;
                                        const hExp = (d.expenses / maxVal) * 100;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col justify-end items-center gap-2 group h-full relative">
                                                <div className="w-full flex justify-center items-end gap-1 h-[80%]">
                                                    <div className="w-1/3 bg-indigo-500 rounded-t-sm transition-all" style={{ height: `${Math.max(1, hSales)}%` }} />
                                                    <div className="w-1/3 bg-rose-400 rounded-t-sm transition-all" style={{ height: `${Math.max(1, hExp)}%` }} />
                                                </div>
                                                <div className="text-[9px] font-bold text-slate-400">{d.date}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="flex items-center gap-4 mt-4 justify-center">
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-indigo-500 rounded-sm"/><span className="text-[10px] font-bold text-slate-500">مبيعات</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-rose-400 rounded-sm"/><span className="text-[10px] font-bold text-slate-500">مصروفات</span></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sales' && (
                        <div className="space-y-6">
                            {/* Sales breakdown by month from monthly summaries */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <p className="text-xs font-black text-slate-400 mb-3">إجمالي المبيعات — {timeRangeLabel}</p>
                                    <p className="text-3xl font-black text-indigo-600 font-mono">{salesInYer.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">YER</p>
                                </div>
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <p className="text-xs font-black text-slate-400 mb-3">إجمالي المشتريات — {timeRangeLabel}</p>
                                    <p className="text-3xl font-black text-rose-500 font-mono">{purchasesInYer.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">YER</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-[#131b2e] rounded-[2rem] border border-slate-100 dark:border-slate-800 p-6 overflow-x-auto">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">تفاصيل الأيام — {timeRangeLabel}</h3>
                                <table className="w-full text-sm min-w-[400px]">
                                    <thead>
                                        <tr className="text-[10px] font-black text-slate-400 uppercase border-b border-slate-100">
                                            <th className="pb-2 text-right">التاريخ</th>
                                            <th className="pb-2 text-left">مبيعات</th>
                                            <th className="pb-2 text-left">مشتريات</th>
                                            <th className="pb-2 text-left">مقبوضات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {[...filteredDaily].sort((a,b) => b.date.localeCompare(a.date)).map((s, i) => (
                                            <tr key={i} className="text-xs">
                                                <td className="py-2 font-bold text-slate-600">{s.date}</td>
                                                <td className="py-2 font-mono text-indigo-600 text-left">{(s.salesTotal || 0).toLocaleString()}</td>
                                                <td className="py-2 font-mono text-rose-500 text-left">{(s.purchasesTotal || 0).toLocaleString()}</td>
                                                <td className="py-2 font-mono text-emerald-600 text-left">{(s.receiptsTotal || 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        {filteredDaily.length === 0 && (
                                            <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-bold">لا توجد بيانات للفترة المختارة</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'profit' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <p className="text-xs font-black text-slate-400 mb-3">إجمالي الأرباح — {timeRangeLabel}</p>
                                    <p className="text-3xl font-black text-emerald-600 font-mono">{profitsInYer.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">YER (مبيعات - تكلفة)</p>
                                </div>
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <p className="text-xs font-black text-slate-400 mb-3">إجمالي المصروفات — {timeRangeLabel}</p>
                                    <p className="text-3xl font-black text-rose-500 font-mono">{expensesInYer.toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">YER</p>
                                </div>
                            </div>
                            <div className={cn("rounded-3xl p-5 text-white", netProfitInYer >= 0 ? "bg-emerald-500" : "bg-rose-500")}>
                                <p className="text-xs font-black opacity-80 mb-2">صافي الربح التشغيلي — {timeRangeLabel}</p>
                                <p className="text-4xl font-black font-mono">{netProfitInYer.toLocaleString()} <span className="text-sm opacity-70">YER</span></p>
                                <p className="text-[10px] opacity-70 mt-1">= أرباح المبيعات − المصروفات</p>
                            </div>
                            <div className="bg-white dark:bg-[#131b2e] rounded-[2rem] border border-slate-100 dark:border-slate-800 p-6 overflow-x-auto">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">تفاصيل أرباح الأيام — {timeRangeLabel}</h3>
                                <table className="w-full text-sm min-w-[400px]">
                                    <thead>
                                        <tr className="text-[10px] font-black text-slate-400 uppercase border-b border-slate-100">
                                            <th className="pb-2 text-right">التاريخ</th>
                                            <th className="pb-2 text-left">أرباح</th>
                                            <th className="pb-2 text-left">مصروفات</th>
                                            <th className="pb-2 text-left">صافي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {[...filteredDaily].sort((a,b) => b.date.localeCompare(a.date)).map((s, i) => {
                                            const net = (s.profitsTotal || 0) - (s.expensesTotal || 0);
                                            return (
                                                <tr key={i} className="text-xs">
                                                    <td className="py-2 font-bold text-slate-600">{s.date}</td>
                                                    <td className="py-2 font-mono text-emerald-600 text-left">{(s.profitsTotal || 0).toLocaleString()}</td>
                                                    <td className="py-2 font-mono text-rose-500 text-left">{(s.expensesTotal || 0).toLocaleString()}</td>
                                                    <td className={cn("py-2 font-mono font-black text-left", net >= 0 ? "text-emerald-700" : "text-rose-700")}>{net.toLocaleString()}</td>
                                                </tr>
                                            );
                                        })}
                                        {filteredDaily.length === 0 && (
                                            <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-bold">لا توجد بيانات للفترة المختارة</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
