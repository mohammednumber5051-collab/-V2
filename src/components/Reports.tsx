import React, { useState, useEffect } from "react";
import { 
    TrendingUp, 
    TrendingDown, 
    Calendar,
    Wallet,
    DollarSign,
    Briefcase,
    FileSpreadsheet,
    FileText
} from "lucide-react";
import * as XLSX from "xlsx";
import { dbService } from "../services/db";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { calculateUnifiedCashBalances } from "../lib/financialUtils";
import { CashBox, Transaction, Invoice, Voucher, QuickFinancialEntry } from "../types";
import PrintPreviewModal from "./PrintPreviewModal";

export default function Reports() {
    const [dailySummaries, setDailySummaries] = useState<any[]>([]);
    const [monthlySummaries, setMonthlySummaries] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [liveStats, setLiveStats] = useState({ totalCash: 0, totalSales: 0, totalExpenses: 0, netProfit: 0 });

    const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>("month");
    const [activeTab, setActiveTab] = useState<"executive" | "sales" | "profit">("executive");
    const [printPreview, setPrintPreview] = useState<{
        isOpen: boolean;
        html: string;
        title: string;
    }>({ isOpen: false, html: '', title: '' });

    const handleExportExcel = () => {
        const sheetData = [
            ["التقارير التحليلية والمالية - ملخص الأداء المالي"],
            [`تاريخ الإصدار: ${new Date().toLocaleString('ar-EG')}`],
            [],
            ["المؤشر المالي", "القيمة (YER)"],
            ["إجمالي الرصيد النقدي المتاح", liveStats.totalCash],
            ["إجمالي المبيعات للتاريخ", liveStats.totalSales],
            ["إجمالي المصروفات للتاريخ", liveStats.totalExpenses],
            ["صافي الأرباح التشغيلية", liveStats.netProfit],
            [],
            ["التاريخ", "المبيعات", "المشتريات", "المصروفات", "الأرباح"],
            ...dailySummaries.map(s => [
                s.date,
                s.salesTotal || 0,
                s.purchasesTotal || 0,
                s.expensesTotal || 0,
                s.profitsTotal || 0
            ])
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        worksheet['!dir'] = 'rtl';
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "التقرير المالي");
        XLSX.writeFile(workbook, `التقرير_المالي_التحليلي_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleExportPDF = () => {
        const pdfHTML = `
            <style>
                @page { size: A4 portrait; margin: 10mm; }
                body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 10px; color: #0f172a; }
                .header { border-bottom: 2px solid #1e1b4b; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
                .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; text-align: center; }
                .card-title { font-size: 11px; font-weight: bold; color: #64748b; }
                .card-val { font-size: 16px; font-weight: 900; font-family: monospace; color: #0f172a; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 15px; }
                th { background: #1e1b4b; color: white; padding: 8px; border: 1px solid #312e81; text-align: right; }
                td { padding: 8px; border: 1px solid #cbd5e1; text-align: right; }
                tr:nth-child(even) { background: #f8fafc; }
            </style>
            <div class="header">
                <div>
                    <h2 style="margin:0; font-size:20px; color:#1e1b4b;">التقرير التحليلي المالي الشامل</h2>
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}</div>
                </div>
            </div>

            <div class="grid">
                <div class="card">
                    <div class="card-title">إجمالي الرصيد النقدي</div>
                    <div class="card-val">${liveStats.totalCash.toLocaleString()} YER</div>
                </div>
                <div class="card">
                    <div class="card-title">إجمالي المبيعات</div>
                    <div class="card-val">${liveStats.totalSales.toLocaleString()} YER</div>
                </div>
                <div class="card">
                    <div class="card-title">إجمالي المصروفات</div>
                    <div class="card-val">${liveStats.totalExpenses.toLocaleString()} YER</div>
                </div>
                <div class="card" style="background:#ecfdf5; border-color:#a7f3d0;">
                    <div class="card-title" style="color:#047857;">صافي الأرباح الوظيفي</div>
                    <div class="card-val" style="color:#065f46;">${liveStats.netProfit.toLocaleString()} YER</div>
                </div>
            </div>

            <h3 style="font-size:14px; font-weight:bold; margin-top:20px; color:#1e1b4b;">سجل الملخصات اليومية الأخيرة</h3>
            <table>
                <thead>
                    <tr>
                        <th>التاريخ</th>
                        <th>المبيعات</th>
                        <th>المشتريات</th>
                        <th>المصروفات</th>
                        <th>الأرباح التشغيلية</th>
                    </tr>
                </thead>
                <tbody>
                    ${dailySummaries.slice(-15).map(s => `
                        <tr>
                            <td style="font-family:monospace; font-weight:bold;">${s.date}</td>
                            <td style="font-family:monospace; color:#312e81; font-weight:bold;">${(s.salesTotal || 0).toLocaleString()}</td>
                            <td style="font-family:monospace;">${(s.purchasesTotal || 0).toLocaleString()}</td>
                            <td style="font-family:monospace; color:#e11d48;">${(s.expensesTotal || 0).toLocaleString()}</td>
                            <td style="font-family:monospace; color:#059669; font-weight:bold;">${(s.profitsTotal || 0).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                    ${dailySummaries.length === 0 ? '<tr><td colSpan="5" style="text-align:center;">لا توجد بيانات مسجلة.</td></tr>' : ''}
                </tbody>
            </table>
        `;

        setPrintPreview({
            isOpen: true,
            html: pdfHTML,
            title: `التقرير_المالي_${new Date().toISOString().slice(0, 10)}`
        });
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [
                dailyData, 
                monthlyData, 
                boxes, 
                transactions, 
                invoices, 
                vouchers, 
                quickEntries
            ] = await Promise.all([
                dbService.getAll("daily_financial_summaries"),
                dbService.getAll("monthly_financial_summaries"),
                dbService.getAll("cashBoxes"),
                dbService.getAll("transactions"),
                dbService.getAll("invoices"),
                dbService.getAll("vouchers"),
                dbService.getAll("quick_financial_entries")
            ]);
            
            setDailySummaries(dailyData as any[]);
            setMonthlySummaries(monthlyData as any[]);

            // Calculate Live Stats
            let totalBalance = 0;
            (boxes as CashBox[]).forEach((b) => {
                if (b.recordStatus !== 'deleted' && b.isActive !== false) {
                    totalBalance += (b.balance || 0);
                }
            });

            // Calculate totals from daily summaries for now (or we could calculate from raw data)
            const sales = dailyData.reduce((sum, s: any) => sum + (s.salesTotal || 0), 0);
            const expenses = dailyData.reduce((sum, s: any) => sum + (s.expensesTotal || 0), 0);
            const profits = dailyData.reduce((sum, s: any) => sum + (s.profitsTotal || 0), 0);

            setLiveStats({
                totalCash: totalBalance,
                totalSales: sales,
                totalExpenses: expenses,
                netProfit: profits - expenses
            });

        } catch (e) {
            console.error("Failed to load reports data:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const getTimelineData = () => {
        const sorted = [...dailySummaries].sort((a,b) => a.date.localeCompare(b.date)).slice(-7);
        return sorted.map(s => ({
            date: new Date(s.date).toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }),
            sales: s.salesTotal || 0,
            purchases: s.purchasesTotal || 0,
            expenses: s.expensesTotal || 0
        }));
    };

    const timelineData = getTimelineData();

    // Summing current summaries
    const salesInYer = dailySummaries.reduce((sum, s) => sum + (s.salesTotal || 0), 0);
    const purchasesInYer = dailySummaries.reduce((sum, s) => sum + (s.purchasesTotal || 0), 0);
    const expensesInYer = dailySummaries.reduce((sum, s) => sum + (s.expensesTotal || 0), 0);
    const profitsInYer = dailySummaries.reduce((sum, s) => sum + (s.profitsTotal || 0), 0);
    const netProfitInYer = profitsInYer - expensesInYer;

    if (isLoading) {
        return <div className="text-center mt-10">جاري تحميل التقارير...</div>;
    }

    return (
        <div className="space-y-6 max-w-sm md:max-w-none mx-auto pb-10">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10 space-y-2">
                    <h1 className="text-2xl font-black">التقارير التحليلية والمالية</h1>
                    <p className="text-sm font-medium text-slate-400">لوحة تحكم الأداء المالي المبنية على محرك التجميع</p>
                </div>
                <div className="relative z-10 flex items-center gap-3 w-full md:w-auto">
                    <button
                        onClick={handleExportExcel}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
                        title="تصدير التقرير المالي إلى ملف Excel"
                    >
                        <FileSpreadsheet size={16} />
                        <span>تصدير Excel</span>
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
                        title="تصدير التقرير المالي إلى PDF بصفحة A4"
                    >
                        <FileText size={16} />
                        <span>تصدير PDF (A4)</span>
                    </button>
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
                    key={activeTab}
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
                                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400">إجمالي الرصيد النقدي</h3>
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono break-all leading-none">
                                        {liveStats.totalCash.toLocaleString()} <span className="text-[10px] text-slate-400">YER</span>
                                    </div>
                                </div>
                                
                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-500">
                                            <TrendingUp size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400">إجمالي المبيعات للتاريخ</h3>
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono break-all leading-none">
                                        {liveStats.totalSales.toLocaleString()} <span className="text-[10px] text-slate-400">YER</span>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-5 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-xl text-rose-600 dark:text-rose-500">
                                            <TrendingDown size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400">إجمالي المصروفات للتاريخ</h3>
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono break-all leading-none">
                                        {liveStats.totalExpenses.toLocaleString()} <span className="text-[10px] text-slate-400">YER</span>
                                    </div>
                                </div>

                                <div className="bg-emerald-500 dark:bg-emerald-600 rounded-3xl p-5 text-white">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-white/20 rounded-xl text-white">
                                            <DollarSign size={20} />
                                        </div>
                                        <h3 className="text-xs font-black text-emerald-50">صافي الأرباح الوظيفي</h3>
                                    </div>
                                    <div className="text-2xl font-black font-mono break-all leading-none">
                                        {liveStats.netProfit.toLocaleString()} <span className="text-[10px] opacity-80">YER</span>
                                    </div>
                                </div>
                            </div>

                            {/* 7 Day Trend Block (Stubbed visual) */}
                            <div className="bg-white dark:bg-[#131b2e] rounded-[2rem] border border-slate-100 dark:border-slate-800 p-6">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-6">مؤشر مبيعات ومصروفات السبعة أيام الأخيرة</h3>
                                <div className="h-64 flex items-end justify-between gap-1 w-full relative">
                                    {timelineData.map((d, i) => {
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
                            </div>
                        </div>
                    )}

                    {activeTab === 'sales' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-6 border border-slate-100 dark:border-slate-800 flex items-center justify-center min-h-[300px]">
                                <p className="text-slate-500 text-sm font-bold flex flex-col items-center gap-4">
                                    <TrendingUp size={48} className="text-indigo-400 opacity-50"/>
                                    هذه الصفحة ستستخدم جداول المبيعات الشهرية والمجمعة (المرحلة القادمة)
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'profit' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-[#131b2e] rounded-3xl p-6 border border-slate-100 dark:border-slate-800 flex items-center justify-center min-h-[300px]">
                                <p className="text-slate-500 text-sm font-bold flex flex-col items-center gap-4">
                                    <Wallet size={48} className="text-emerald-400 opacity-50"/>
                                    هذه الصفحة ستعرض الأرباح التفصيلية المعتمدة على تقارير الأرباح المجمعة
                                </p>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <PrintPreviewModal
                isOpen={printPreview.isOpen}
                onClose={() => setPrintPreview(prev => ({ ...prev, isOpen: false }))}
                htmlContent={printPreview.html}
                title={printPreview.title}
                paperSize="a4"
                orientation="portrait"
            />
        </div>
    );
}
