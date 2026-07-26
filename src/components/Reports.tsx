import React, { useState, useEffect, useMemo } from "react";
import { 
    TrendingUp, 
    TrendingDown, 
    Wallet,
    DollarSign,
    Briefcase,
    FileSpreadsheet,
    FileText,
    Activity,
    Filter,
    Info
} from "lucide-react";
import * as XLSX from "xlsx";
import { dbService } from "../services/db";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { calculateUnifiedCashBalances } from "../lib/financialUtils";
import { CashBox, Transaction, Invoice, Voucher, QuickFinancialEntry } from "../types";
import PrintPreviewModal from "./PrintPreviewModal";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function Reports() {
    const [isLoading, setIsLoading] = useState(false);
    
    // Raw Data
    const [rawInvoices, setRawInvoices] = useState<Invoice[]>([]);
    const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
    const [rawVouchers, setRawVouchers] = useState<Voucher[]>([]);
    const [rawQuickEntries, setRawQuickEntries] = useState<QuickFinancialEntry[]>([]);
    const [rawBoxes, setRawBoxes] = useState<CashBox[]>([]);

    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('month');
    const [activeTab, setActiveTab] = useState<"executive" | "sales" | "profit">("executive");
    const [printPreview, setPrintPreview] = useState<{
        isOpen: boolean;
        html: string;
        title: string;
    }>({ isOpen: false, html: '', title: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [
                boxes, 
                transactions, 
                invoices, 
                vouchers, 
                quickEntries
            ] = await Promise.all([
                dbService.getAll("cashBoxes"),
                dbService.getAll("transactions"),
                dbService.getAll("invoices"),
                dbService.getAll("vouchers"),
                dbService.getAll("quick_financial_entries")
            ]);
            
            setRawBoxes(boxes as CashBox[]);
            setRawTransactions(transactions as Transaction[]);
            setRawInvoices(invoices as Invoice[]);
            setRawVouchers(vouchers as Voucher[]);
            setRawQuickEntries(quickEntries as QuickFinancialEntry[]);
        } catch (e) {
            console.error("Failed to load reports data:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const isDateInRange = (dateString: string, filter: string) => {
        if (filter === 'all') return true;
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return true; // Include if no valid date

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (filter === 'today') {
            return d >= today;
        } else if (filter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return d >= weekAgo;
        } else if (filter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return d >= monthAgo;
        } else if (filter === 'year') {
            const yearAgo = new Date(today);
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            return d >= yearAgo;
        }
        return true;
    };

    // Calculate metrics
    const metrics = useMemo(() => {
        // Use all data to calculate correct current balances, regardless of date filter
        const allActiveInvoices = rawInvoices.filter(i => i.recordStatus !== 'deleted');
        const allActiveVouchers = rawVouchers.filter(v => v.recordStatus !== 'deleted');
        const allActiveQuickEntries = rawQuickEntries.filter(q => q.recordStatus !== 'deleted');
        const allActiveTransactions = rawTransactions.filter(t => t.recordStatus !== 'deleted');
        const activeBoxes = rawBoxes.filter(b => b.recordStatus !== 'deleted');
        
        const { totalBalance } = calculateUnifiedCashBalances(activeBoxes, allActiveTransactions, allActiveInvoices, allActiveVouchers, allActiveQuickEntries);

        // Date filtered data
        const activeInvoices = allActiveInvoices.filter(i => isDateInRange(i.createdAt || '', dateFilter));
        const activeVouchers = allActiveVouchers.filter(v => isDateInRange(v.createdAt || '', dateFilter));
        const activeQuickEntries = allActiveQuickEntries.filter(q => isDateInRange(q.createdAt || '', dateFilter));
        const activeTransactions = allActiveTransactions.filter(t => isDateInRange(t.createdAt || '', dateFilter));

        // Sales Metrics
        const invoiceSales = activeInvoices.filter(i => i.type === 'sale').reduce((sum, i) => sum + ((i.total || 0) - (i.discount || 0)), 0);
        const qeSales = activeQuickEntries.filter(q => q.entryType === 'manual_sale').reduce((sum, q) => sum + Number(q.netAmount || 0), 0);
        const totalSales = invoiceSales + qeSales;
        
        const invoiceReturns = activeInvoices.filter(i => i.type === 'sale_return').reduce((sum, i) => sum + ((i.total || 0) - (i.discount || 0)), 0);
        const netSales = totalSales - invoiceReturns;

        // Purchases Metrics
        const invoicePurchases = activeInvoices.filter(i => i.type === 'purchase').reduce((sum, i) => sum + ((i.total || 0) - (i.discount || 0)), 0);
        const qePurchases = activeQuickEntries.filter(q => q.entryType === 'manual_purchase').reduce((sum, q) => sum + Number(q.netAmount || 0), 0);
        const invoicePurchaseReturns = activeInvoices.filter(i => i.type === 'purchase_return').reduce((sum, i) => sum + ((i.total || 0) - (i.discount || 0)), 0);
        const totalPurchases = invoicePurchases + qePurchases - invoicePurchaseReturns;

        // Expenses Metrics
        const voucherExpenses = activeVouchers.filter(v => v.type === 'payment' && (!v.partnerType || v.partnerType === 'none' || !v.partnerId)).reduce((sum, v) => sum + Number(v.amount || 0), 0);
        const qeExpenses = activeQuickEntries.filter(q => q.entryType === 'payment' && (!q.partnerType || q.partnerType === 'none' || !q.partnerId)).reduce((sum, q) => sum + Number(q.netAmount || 0), 0);
        const txExpenses = activeTransactions.filter(t => t.type === 'صرف' && (!t.partnerId) && !t.sourceType).reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const totalExpenses = voucherExpenses + qeExpenses + txExpenses;

        // Profit Metrics
        const cogs = activeInvoices.filter(i => i.type === 'sale').reduce((sum, i) => {
            return sum + (i.items || []).reduce((itemSum, item) => itemSum + (Number(item.purchasePrice || 0) * Number(item.quantity || 0)), 0);
        }, 0);
        
        const cogsReturns = activeInvoices.filter(i => i.type === 'sale_return').reduce((sum, i) => {
            return sum + (i.items || []).reduce((itemSum, item) => itemSum + (Number(item.purchasePrice || 0) * Number(item.quantity || 0)), 0);
        }, 0);
        
        const totalGrossProfit = netSales - (cogs - cogsReturns);
        const netProfit = totalGrossProfit - totalExpenses;
        
        // Additional analytics for other tabs
        const unpaidInvoiceSales = activeInvoices.filter(i => i.type === 'sale').reduce((sum, i) => sum + Math.max(0, ((i.total || 0) - (i.discount || 0)) - Number(i.paid || 0)), 0);
        const unpaidQESales = activeQuickEntries.filter(q => q.entryType === 'manual_sale').reduce((sum, q) => sum + Math.max(0, Number(q.netAmount || 0) - Number(q.paidAmount || 0)), 0);
        const unpaidSales = unpaidInvoiceSales + unpaidQESales;
                            
        const expenseVouchersList = [
            ...activeVouchers.filter(v => v.type === 'payment' && (!v.partnerType || v.partnerType === 'none' || !v.partnerId)).map(v => ({ date: v.createdAt || '', amount: v.amount, desc: v.notes || 'سند صرف عام' })),
            ...activeQuickEntries.filter(q => q.entryType === 'payment' && (!q.partnerType || q.partnerType === 'none' || !q.partnerId)).map(q => ({ date: q.createdAt || '', amount: q.netAmount, desc: q.notes || 'قيد مالي مصروف' })),
            ...activeTransactions.filter(t => t.type === 'صرف' && (!t.partnerId) && !t.sourceType).map(t => ({ date: t.createdAt || '', amount: t.amount, desc: t.description || 'مصروف عام (سند)' }))
        ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                     
        const salesList = [
            ...activeInvoices.filter(i => i.type === 'sale' || i.type === 'sale_return').map(i => ({ date: i.createdAt || '', amount: i.type === 'sale_return' ? -((i.total || 0) - (i.discount || 0)) : ((i.total || 0) - (i.discount || 0)), desc: i.type === 'sale' ? 'مبيعات' : 'مرتجع مبيعات', paid: i.paid || 0 })),
            ...activeQuickEntries.filter(q => q.entryType === 'manual_sale').map(q => ({ date: q.createdAt || '', amount: q.netAmount, desc: 'مبيعات سريعة', paid: q.paidAmount || 0 }))
        ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                           
                           
        // Group Data by Day for Charts
        const dailyData: Record<string, { sales: number, expenses: number, profit: number }> = {};
        
        salesList.forEach(s => {
            const d = s.date.slice(0,10);
            if (!dailyData[d]) dailyData[d] = { sales: 0, expenses: 0, profit: 0 };
            dailyData[d].sales += s.amount;
        });

        expenseVouchersList.forEach(e => {
            const d = e.date.slice(0,10);
            if (!dailyData[d]) dailyData[d] = { sales: 0, expenses: 0, profit: 0 };
            dailyData[d].expenses += e.amount;
        });

        // Simple profit estimation per day for the chart (Gross Profit - Expenses)
        // Note: this is an approximation for the chart since COGS isn't mapped per day perfectly here
        Object.keys(dailyData).forEach(d => {
             // For chart purposes, assuming average margin if exact COGS per day isn't easily mapped.
             // We'll just map Sales - Expenses for the 'cash flow' trend.
             dailyData[d].profit = dailyData[d].sales - dailyData[d].expenses;
        });

        const chartData = Object.entries(dailyData)
            .map(([date, data]) => ({ date, ...data }))
            .sort((a,b) => a.date.localeCompare(b.date))
            .slice(-14); // Last 14 active days

        return {
            totalBalance,
            totalSales: netSales,
            totalPurchases,
            totalExpenses,
            totalGrossProfit,
            netProfit,
            unpaidSales,
            expenseVouchersList,
            salesList,
            chartData
        };
    }, [rawInvoices, rawTransactions, rawVouchers, rawQuickEntries, rawBoxes, dateFilter]);

    const handleExportExcel = () => {
        const sheetData = [
            ["التقارير التحليلية والمالية - ملخص الأداء المالي"],
            [`تاريخ الإصدار: ${new Date().toLocaleString('ar-EG')}`],
            [],
            ["المؤشر المالي", "القيمة (YER)"],
            ["إجمالي الرصيد النقدي المتاح", metrics.totalBalance],
            ["إجمالي المبيعات (الصافي)", metrics.totalSales],
            ["إجمالي المشتريات", metrics.totalPurchases],
            ["إجمالي المصروفات", metrics.totalExpenses],
            ["صافي الأرباح التشغيلية", metrics.netProfit],
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
                    <div class="card-val">${metrics.totalBalance.toLocaleString()} YER</div>
                </div>
                <div class="card">
                    <div class="card-title">إجمالي المبيعات (الصافي)</div>
                    <div class="card-val">${metrics.totalSales.toLocaleString()} YER</div>
                </div>
                <div class="card">
                    <div class="card-title">إجمالي المصروفات</div>
                    <div class="card-val">${metrics.totalExpenses.toLocaleString()} YER</div>
                </div>
                <div class="card" style="background:#ecfdf5; border-color:#a7f3d0;">
                    <div class="card-title" style="color:#047857;">صافي الأرباح الوظيفي</div>
                    <div class="card-val" style="color:#065f46; ${metrics.netProfit < 0 ? 'color:#e11d48;' : ''}">${metrics.netProfit.toLocaleString()} YER</div>
                </div>
            </div>
        `;
        setPrintPreview({
            isOpen: true,
            html: pdfHTML,
            title: `التقرير_المالي_${new Date().toISOString().slice(0, 10)}`
        });
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-4 text-slate-500">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="font-bold">جاري تحميل التقارير وتحليل البيانات...</div>
            </div>
        </div>;
    }

    // Formatters for charts
    const formatYAxis = (tickItem: any) => {
        if (tickItem === 0) return '0';
        if (tickItem >= 1000000) return (tickItem / 1000000).toFixed(1) + 'M';
        if (tickItem >= 1000) return (tickItem / 1000).toFixed(0) + 'k';
        return tickItem;
    };

    const formatDateAxis = (tickItem: any) => {
        const date = new Date(tickItem);
        return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl text-sm" dir="rtl">
                    <p className="font-bold text-slate-800 dark:text-slate-200 mb-2">{new Date(label).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-4 py-1">
                            <span style={{ color: entry.color }} className="font-bold">{entry.name}:</span>
                            <span className="font-mono font-black text-slate-900 dark:text-white" dir="ltr">{Number(entry.value).toLocaleString()} YER</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const pieData = [
        { name: 'الأرباح التشغيلية', value: Math.max(0, metrics.netProfit), color: '#10b981' },
        { name: 'المصروفات', value: Math.max(0, metrics.totalExpenses), color: '#f43f5e' }
    ].filter(d => d.value > 0);

    return (
        <div className="space-y-6 max-w-sm md:max-w-none mx-auto pb-10">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10 space-y-2">
                    <h1 className="text-2xl font-black flex items-center gap-3">
                        <Activity className="text-indigo-400" size={28} />
                        لوحة تحكم الأداء المالي
                    </h1>
                    <p className="text-sm font-medium text-slate-400">تقارير تحليلية متكاملة بناءً على الحركات المالية والفواتير</p>
                </div>
                <div className="relative z-10 flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
                        <Filter size={14} className="text-slate-400 mx-2" />
                        <select 
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as any)}
                            className="bg-transparent text-sm font-bold text-white outline-none pr-8 py-1.5 cursor-pointer"
                        >
                            <option value="all" className="bg-slate-800">كل الأوقات</option>
                            <option value="today" className="bg-slate-800">اليوم</option>
                            <option value="week" className="bg-slate-800">آخر 7 أيام</option>
                            <option value="month" className="bg-slate-800">آخر 30 يوم</option>
                            <option value="year" className="bg-slate-800">آخر سنة</option>
                        </select>
                    </div>
                    
                    <button
                        onClick={handleExportExcel}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
                    >
                        <FileSpreadsheet size={16} />
                        <span className="hidden md:inline">تصدير Excel</span>
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-900/30 transition-all cursor-pointer"
                    >
                        <FileText size={16} />
                        <span className="hidden md:inline">تصدير PDF</span>
                    </button>
                </div>
            </div>

            {/* Core Report Tabs Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl no-scrollbar shrink-0">
                {[
                    { id: 'executive', title: 'الملخص التنفيذي', icon: Briefcase },
                    { id: 'sales', title: 'المبيعات والإيرادات', icon: TrendingUp },
                    { id: 'profit', title: 'الأرباح والمصروفات', icon: Wallet },
                ].map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id as any)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap outline-none flex-1 md:flex-none justify-center",
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between group">
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400">
                                                <Wallet size={24} />
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">إجمالي السيولة النقدية</h3>
                                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono break-all leading-none mb-4">
                                            {metrics.totalBalance.toLocaleString()} <span className="text-xs text-slate-400">YER</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                        <Info size={14} className="shrink-0 mt-0.5 text-blue-400" />
                                        <span>يمثل مجموع المبالغ الفعلية المتوفرة حالياً في جميع الصناديق. (لا يتأثر بفلتر التاريخ)</span>
                                    </div>
                                </div>
                                
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between group">
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                                                <TrendingUp size={24} />
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">صافي المبيعات</h3>
                                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono break-all leading-none mb-4">
                                            {metrics.totalSales.toLocaleString()} <span className="text-xs text-slate-400">YER</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                        <Info size={14} className="shrink-0 mt-0.5 text-indigo-400" />
                                        <span>إجمالي فواتير المبيعات مطروحاً منها مردودات المبيعات خلال الفترة المحددة.</span>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between group">
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 rounded-2xl text-rose-600 dark:text-rose-400">
                                                <TrendingDown size={24} />
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">إجمالي المصروفات</h3>
                                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono break-all leading-none mb-4">
                                            {metrics.totalExpenses.toLocaleString()} <span className="text-xs text-slate-400">YER</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                        <Info size={14} className="shrink-0 mt-0.5 text-rose-400" />
                                        <span>مجموع سندات الصرف والقيود المالية للمصروفات الإدارية والتشغيلية.</span>
                                    </div>
                                </div>

                                <div className={cn(
                                    "rounded-3xl p-6 shadow-sm flex flex-col justify-between group text-white",
                                    metrics.netProfit >= 0 ? "bg-emerald-500 dark:bg-emerald-600 border border-emerald-400" : "bg-rose-500 dark:bg-rose-600 border border-rose-400"
                                )}>
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-3 bg-white/20 rounded-2xl text-white">
                                                <DollarSign size={24} />
                                            </div>
                                        </div>
                                        <h3 className="text-sm font-bold text-white/90 mb-1">صافي الأرباح التشغيلية</h3>
                                        <div className="text-3xl font-black font-mono break-all leading-none mb-4 flex items-center gap-2">
                                            <span dir="ltr">{metrics.netProfit.toLocaleString()}</span> <span className="text-xs opacity-80">YER</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-white/80 flex items-start gap-1 bg-black/10 p-2 rounded-lg">
                                        <Info size={14} className="shrink-0 mt-0.5" />
                                        <span>الربح الإجمالي (المبيعات - تكلفة البضاعة) مطروحاً منه إجمالي المصروفات. {metrics.netProfit < 0 && 'الرقم السالب يعني خسارة.'}</span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Trend Chart Area */}
                            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-6">مؤشر التدفقات: المبيعات مقابل المصروفات</h3>
                                <div className="h-[300px] w-full" dir="ltr">
                                    {metrics.chartData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={metrics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                    </linearGradient>
                                                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="date" tickFormatter={formatDateAxis} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                                                <Area type="monotone" dataKey="sales" name="المبيعات" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                                                <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                                            <Activity size={48} className="opacity-20" />
                                            <p className="text-sm font-bold">لا توجد بيانات مالية لعرضها في هذه الفترة.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sales' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">إجمالي المبيعات (الصافي)</div>
                                        <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono mb-4">{metrics.totalSales.toLocaleString()} <span className="text-sm">YER</span></div>
                                    </div>
                                    <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg leading-relaxed">
                                        إجمالي الفواتير الصادرة للمبيعات مطروحاً منها قيمة المرتجعات. تعكس إجمالي قيمة ما تم بيعه سواء نقدياً أو آجلاً.
                                    </p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">المبيعات الآجلة (غير المسددة)</div>
                                        <div className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono mb-4">{metrics.unpaidSales.toLocaleString()} <span className="text-sm">YER</span></div>
                                    </div>
                                    <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg leading-relaxed">
                                        جزء من المبيعات لم يتم تحصيله نقداً بعد (ديون على العملاء). يجب متابعة تحصيلها لتعزيز السيولة النقدية.
                                    </p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">إجمالي العمليات</div>
                                        <div className="text-3xl font-black text-slate-800 dark:text-white font-mono mb-4">{metrics.salesList.length} <span className="text-sm">حركة</span></div>
                                    </div>
                                    <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg leading-relaxed">
                                        إجمالي عدد الفواتير وحركات المبيعات خلال الفترة المحددة.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white mb-6">حجم المبيعات اليومي</h3>
                                    <div className="h-[250px] w-full" dir="ltr">
                                        {metrics.chartData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={metrics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                    <XAxis dataKey="date" tickFormatter={formatDateAxis} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                                    <Bar dataKey="sales" name="المبيعات" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400">لا توجد بيانات كافية</div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">أحدث المبيعات</h3>
                                    <div className="overflow-y-auto flex-1 pr-2 space-y-3">
                                        {metrics.salesList.slice(0, 8).map((s, i) => (
                                            <div key={i} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                                <div>
                                                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{s.desc}</div>
                                                    <div className="text-[10px] text-slate-400">{new Date(s.date).toLocaleDateString('ar-EG')}</div>
                                                </div>
                                                <div className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400" dir="ltr">
                                                    {s.amount.toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                        {metrics.salesList.length === 0 && (
                                            <div className="text-center text-sm font-bold text-slate-400 py-10">لا توجد حركات</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'profit' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">الربح الإجمالي (قبل المصروفات)</div>
                                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono mb-4">{metrics.totalGrossProfit.toLocaleString()} <span className="text-sm">YER</span></div>
                                    </div>
                                    <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg leading-relaxed">
                                        يحسب بطرح تكلفة البضاعة المباعة (سعر الشراء × الكمية) من إيرادات المبيعات. يمثل ربح التجارة المباشر.
                                    </p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">إجمالي المصروفات</div>
                                        <div className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono mb-4">{metrics.totalExpenses.toLocaleString()} <span className="text-sm">YER</span></div>
                                    </div>
                                    <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg leading-relaxed">
                                        إجمالي المبالغ المنصرفة كسندات صرف أو مصروفات إدارية وتشغيلية أخرى (مثل الرواتب، الإيجار، الخ).
                                    </p>
                                </div>
                                <div className={cn(
                                    "rounded-3xl p-6 border shadow-sm flex flex-col justify-between",
                                    metrics.netProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800"
                                )}>
                                    <div>
                                        <div className={cn("text-sm font-bold mb-2", metrics.netProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>صافي الأرباح التشغيلية</div>
                                        <div className={cn("text-3xl font-black font-mono mb-4", metrics.netProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")} dir="ltr">{metrics.netProfit.toLocaleString()} <span className="text-sm">YER</span></div>
                                    </div>
                                    <p className={cn("text-[11px] p-2 rounded-lg leading-relaxed", metrics.netProfit >= 0 ? "bg-emerald-100/50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300" : "bg-rose-100/50 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300")}>
                                        هو النتيجة النهائية للنشاط (الربح الإجمالي - إجمالي المصروفات). هذا هو المؤشر الحقيقي لنجاح الأعمال خلال هذه الفترة.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm flex flex-col items-center justify-center">
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white mb-6 w-full text-right">توزيع الأرباح والمصروفات</h3>
                                    <div className="h-[200px] w-full relative" dir="ltr">
                                        {pieData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={pieData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {pieData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip formatter={(val: number) => val.toLocaleString() + ' YER'} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-400 text-sm">لا توجد بيانات</div>
                                        )}
                                        
                                        {pieData.length > 0 && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <div className="text-2xl font-black text-slate-800 dark:text-white font-mono">
                                                    {Math.round((Math.max(0, metrics.netProfit) / (Math.max(0, metrics.netProfit) + metrics.totalExpenses)) * 100 || 0)}%
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400">هامش الربح</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-center gap-4 mt-4 w-full">
                                        {pieData.map((entry, i) => (
                                            <div key={i} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                                                {entry.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">أحدث المصروفات</h3>
                                    <div className="overflow-y-auto max-h-[250px] pr-2 space-y-3">
                                        {metrics.expenseVouchersList.map((s, i) => (
                                            <div key={i} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                                <div>
                                                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{s.desc}</div>
                                                    <div className="text-[10px] text-slate-400">{new Date(s.date).toLocaleDateString('ar-EG')}</div>
                                                </div>
                                                <div className="text-sm font-black font-mono text-rose-600 dark:text-rose-400" dir="ltr">
                                                    {s.amount.toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                        {metrics.expenseVouchersList.length === 0 && (
                                            <div className="text-center text-sm font-bold text-slate-400 py-10">لا توجد مصروفات</div>
                                        )}
                                    </div>
                                </div>
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
