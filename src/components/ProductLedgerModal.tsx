import React, { useState, useEffect } from "react";
import { 
    X, 
    Calendar, 
    ArrowUpRight, 
    ArrowDownLeft, 
    Clock, 
    Info, 
    Filter, 
    RotateCcw, 
    Printer, 
    TrendingUp, 
    TrendingDown, 
    Package,
    Coins,
    Sparkles
} from "lucide-react";
import { dbService } from "../services/db";
import { Product, Invoice } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface ProductLedgerModalProps {
    product: Product;
    onClose: () => void;
}

interface ProductMovement {
    id: string;
    createdAt: string;
    invoiceId: string;
    invoiceNumber: string;
    type: 'sale' | 'purchase' | 'sale_return' | 'purchase_return';
    partnerName: string;
    quantity: number;
    price: number;
    total: number;
    notes: string;
    stockChange: number;
    runningStock?: number;
}

export default function ProductLedgerModal({ product, onClose }: ProductLedgerModalProps) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");
    const [showFilters, setShowFilters] = useState(true);

    useEffect(() => {
        const fetchInvoices = async () => {
            setIsLoading(true);
            try {
                const data = await dbService.getAll("invoices") as Invoice[];
                // Filter out deleted invoices
                const activeInvoices = data.filter(inv => inv.recordStatus !== "deleted");
                setInvoices(activeInvoices);
            } catch (error) {
                console.error("Failed to load invoices for ledger", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInvoices();
    }, [product.id]);

    // Calculate all movements for this product chronologically
    const allMovements: ProductMovement[] = React.useMemo(() => {
        const list: ProductMovement[] = [];

        invoices.forEach(inv => {
            if (!inv.items) return;
            
            inv.items.forEach(item => {
                if (item.productId === product.id) {
                    // Determine stock change
                    // Sale: decreases stock (-quantity)
                    // Purchase: increases stock (+quantity)
                    // Sale Return: increases stock (+quantity)
                    // Purchase Return: decreases stock (-quantity)
                    let stockChange = 0;
                    if (inv.type === 'sale') {
                        stockChange = -item.quantity;
                    } else if (inv.type === 'purchase') {
                        stockChange = item.quantity;
                    } else if (inv.type === 'sale_return') {
                        stockChange = item.quantity;
                    } else if (inv.type === 'purchase_return') {
                        stockChange = -item.quantity;
                    }

                    list.push({
                        id: `${inv.id}-${item.productId}`,
                        createdAt: inv.createdAt,
                        invoiceId: inv.id || "",
                        invoiceNumber: inv.invoiceNumber || "بدون رقم",
                        type: inv.type,
                        partnerName: inv.partnerName || "زبون نقدي/مورد عام",
                        quantity: item.quantity,
                        price: item.price,
                        total: item.total || (item.quantity * item.price),
                        notes: inv.notes || "",
                        stockChange
                    });
                }
            });
        });

        // Sort chronologically ascending to compute correct running balance
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Calculate initial stock before these recorded movements
        const totalChange = list.reduce((sum, m) => sum + m.stockChange, 0);
        const currentStock = product.stock || 0;
        const initialStock = currentStock - totalChange;

        // Populate running stock balances
        let currentRunning = initialStock;
        return list.map(m => {
            currentRunning += m.stockChange;
            return {
                ...m,
                runningStock: currentRunning
            };
        });
    }, [invoices, product.id, product.stock]);

    // Apply date filters to the calculated list
    const filteredMovements = React.useMemo(() => {
        return allMovements.filter(m => {
            if (filterDateFrom) {
                const itemDate = m.createdAt.split('T')[0];
                if (itemDate < filterDateFrom) return false;
            }
            if (filterDateTo) {
                const itemDate = m.createdAt.split('T')[0];
                if (itemDate > filterDateTo) return false;
            }
            return true;
        });
    }, [allMovements, filterDateFrom, filterDateTo]);

    // Calculate aggregated stats for the filtered period
    const stats = React.useMemo(() => {
        let incomingQty = 0;
        let outgoingQty = 0;
        let incomingVal = 0;
        let outgoingVal = 0;

        filteredMovements.forEach(m => {
            if (m.stockChange > 0) {
                incomingQty += m.quantity;
                incomingVal += m.total;
            } else {
                outgoingQty += m.quantity;
                outgoingVal += m.total;
            }
        });

        // Get calculated initial stock for the filtered period
        // It should be the running stock before the first visible movement
        let periodInitialStock = 0;
        if (allMovements.length > 0) {
            if (filteredMovements.length > 0) {
                const firstFilteredIndex = allMovements.findIndex(m => m.id === filteredMovements[0].id);
                if (firstFilteredIndex > 0) {
                    periodInitialStock = allMovements[firstFilteredIndex - 1].runningStock || 0;
                } else {
                    // It is the first overall movement
                    periodInitialStock = (allMovements[0].runningStock || 0) - allMovements[0].stockChange;
                }
            } else {
                periodInitialStock = product.stock || 0;
            }
        } else {
            periodInitialStock = product.stock || 0;
        }

        return {
            incomingQty,
            outgoingQty,
            incomingVal,
            outgoingVal,
            periodInitialStock
        };
    }, [allMovements, filteredMovements, product.stock]);

    // Handle Print
    const handlePrint = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const dateFromStr = filterDateFrom ? `من تاريخ: ${filterDateFrom}` : "";
        const dateToStr = filterDateTo ? `إلى تاريخ: ${filterDateTo}` : "";
        const filterStr = [dateFromStr, dateToStr].filter(Boolean).join(" - ");

        const rowsHtml = filteredMovements.map(m => {
            const isIncoming = m.stockChange > 0;
            const typeText = m.type === 'sale' ? 'مبيعات' : 
                             m.type === 'purchase' ? 'مشتريات' : 
                             m.type === 'sale_return' ? 'مرتجع مبيعات' : 'مرتجع مشتريات';
            
            return `
                <tr>
                    <td>${new Date(m.createdAt).toLocaleDateString('ar-YE')} ${new Date(m.createdAt).toLocaleTimeString('ar-YE', {hour: '2-digit', minute:'2-digit'})}</td>
                    <td>${typeText}</td>
                    <td>${m.invoiceNumber}</td>
                    <td>${m.partnerName}</td>
                    <td class="text-emerald-700 font-bold">${isIncoming ? m.quantity : '-'}</td>
                    <td class="text-rose-700 font-bold">${!isIncoming ? m.quantity : '-'}</td>
                    <td>${m.price.toLocaleString()} YER</td>
                    <td>${m.total.toLocaleString()} YER</td>
                    <td class="font-bold">${m.runningStock}</td>
                    <td>${m.notes}</td>
                </tr>
            `;
        }).join("");

        printWindow.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <title>كشف حركة الصنف - ${product.name}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1e293b; }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 24px; color: #1e3a8a; }
                    .header p { margin: 5px 0 0; font-size: 14px; color: #64748b; }
                    .info-grid { display: grid; grid-template-cols: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
                    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; rounded: 8px; border-radius: 8px; }
                    .info-card h4 { margin: 0 0 5px; font-size: 11px; color: #64748b; text-transform: uppercase; }
                    .info-card p { margin: 0; font-size: 15px; font-weight: bold; color: #0f172a; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                    th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; }
                    th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; }
                    tr:nth-child(even) { background-color: #f8fafc; }
                    .text-emerald-700 { color: #047857; }
                    .text-rose-700 { color: #be123c; }
                    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 15px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>كشف حركة الصنف التفصيلي</h1>
                    <p>${product.name}</p>
                    ${filterStr ? `<p style="font-weight: bold; color: #4f46e5; margin-top: 8px;">${filterStr}</p>` : ''}
                </div>
                
                <div class="info-grid">
                    <div class="info-card">
                        <h4>بيانات المنتج</h4>
                        <p>رمز الصنف (SKU): ${product.sku || 'N/A'}</p>
                        <p>التصنيف: ${product.category}</p>
                    </div>
                    <div class="info-card">
                        <h4>الكميات الإجمالية للفترة</h4>
                        <p>إجمالي الوارد: ${stats.incomingQty} قطعة</p>
                        <p>إجمالي الصادر: ${stats.outgoingQty} قطعة</p>
                    </div>
                    <div class="info-card">
                        <h4>أرصدة المخزون</h4>
                        <p>الرصيد الافتتاحي للفترة: ${stats.periodInitialStock} قطعة</p>
                        <p>الرصيد الحالي المتوفر: ${product.stock} قطعة</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>التاريخ والوقت</th>
                            <th>نوع الحركة</th>
                            <th>رقم السند</th>
                            <th>الطرف الآخر</th>
                            <th>وارد (+)</th>
                            <th>صادر (-)</th>
                            <th>سعر الوحدة</th>
                            <th>الإجمالي</th>
                            <th>الرصيد المتبقي</th>
                            <th>الملاحظات</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #94a3b8;">لا توجد حركات مسجلة للصنف خلال الفترة المحددة.</td></tr>`}
                    </tbody>
                </table>

                <div class="footer">
                    تم إصدار هذا الكشف تلقائياً بواسطة نظام إدارة البصريات والمخازن الذكي - تاريخ الطباعة: ${new Date().toLocaleString('ar-YE')}
                </div>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 md:p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />

            {/* Modal Box */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="bg-white dark:bg-[#0b101f] w-full max-w-5xl h-full md:h-[88dvh] md:rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800/60"
            >
                {/* Visual Top Highlight Ribbon */}
                <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                {/* Modal Header */}
                <div className="bg-slate-50/80 dark:bg-slate-900/40 px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                            <Clock size={20} className="animate-spin-slow" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-800 dark:text-white">كشف حركة الصنف التفصيلي</h3>
                                <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                    <Sparkles size={10} />
                                    <span>مخزني ذكي</span>
                                </span>
                            </div>
                            <p className="text-xs font-bold text-slate-400 mt-0.5">
                                {product.name} • <span className="font-mono text-indigo-600 dark:text-indigo-400">SKU: {product.sku || 'N/A'}</span>
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handlePrint}
                            className="p-2.5 bg-white dark:bg-[#131b2e] text-slate-600 dark:text-slate-350 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                            title="طباعة كشف الحركة"
                        >
                            <Printer size={18} />
                        </button>
                        <button 
                            onClick={onClose} 
                            className="p-2.5 bg-white dark:bg-[#131b2e] text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 custom-scrollbar bg-white dark:bg-[#0b101f]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-3">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-bold text-slate-400">جاري تحميل بيانات السجلات والحركات المخزنية...</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Analytics Panel */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {/* Current Stock */}
                                <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10 p-4 rounded-3xl border border-indigo-100/50 dark:border-indigo-950/30 flex items-center gap-3">
                                    <div className="p-3 bg-indigo-500 text-white rounded-2xl shadow-md shadow-indigo-500/20">
                                        <Package size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">مجموع المتوفر حالياً</p>
                                        <h4 className="text-base font-black text-slate-800 dark:text-slate-200 mt-0.5">
                                            {product.stock} <span className="text-[10px] text-slate-400 font-bold">قطعة</span>
                                        </h4>
                                    </div>
                                </div>

                                {/* Total Incoming */}
                                <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10 p-4 rounded-3xl border border-emerald-100/50 dark:border-emerald-950/30 flex items-center gap-3">
                                    <div className="p-3 bg-emerald-500 text-white rounded-2xl shadow-md shadow-emerald-500/20">
                                        <TrendingUp size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">إجمالي الوارد للفترة</p>
                                        <h4 className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                                            {stats.incomingQty} <span className="text-[10px] text-slate-400 font-bold">قطعة</span>
                                        </h4>
                                    </div>
                                </div>

                                {/* Total Outgoing */}
                                <div className="bg-gradient-to-br from-rose-50/50 to-pink-50/30 dark:from-rose-950/20 dark:to-pink-950/10 p-4 rounded-3xl border border-rose-100/50 dark:border-rose-950/30 flex items-center gap-3">
                                    <div className="p-3 bg-rose-500 text-white rounded-2xl shadow-md shadow-rose-500/20">
                                        <TrendingDown size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">إجمالي الصادر للفترة</p>
                                        <h4 className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">
                                            {stats.outgoingQty} <span className="text-[10px] text-slate-400 font-bold">قطعة</span>
                                        </h4>
                                    </div>
                                </div>

                                {/* Initial Stock */}
                                <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 p-4 rounded-3xl border border-amber-100/50 dark:border-amber-950/30 flex items-center gap-3">
                                    <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-md shadow-amber-500/20">
                                        <Info size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">الرصيد الافتتاحي للفترة</p>
                                        <h4 className="text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">
                                            {stats.periodInitialStock} <span className="text-[10px] text-slate-400 font-bold">قطعة</span>
                                        </h4>
                                    </div>
                                </div>
                            </div>

                            {/* Date Filters Container */}
                            <div className="bg-slate-50/60 dark:bg-[#131b2e]/60 rounded-[2rem] border border-slate-100 dark:border-slate-800/80 p-5 space-y-4">
                                <div className="flex justify-between items-center">
                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className="flex items-center gap-2 text-xs font-black text-slate-650 dark:text-slate-350 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                                    >
                                        <Filter size={16} className={showFilters ? "text-indigo-500" : "text-slate-400"} />
                                        <span>تصفية وفلترة حركات الصنف</span>
                                    </button>
                                    
                                    {(filterDateFrom || filterDateTo) && (
                                        <button
                                            onClick={() => {
                                                setFilterDateFrom("");
                                                setFilterDateTo("");
                                            }}
                                            className="text-[10px] font-black text-rose-550 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                                        >
                                            <RotateCcw size={11} />
                                            إلغاء التصفية
                                        </button>
                                    )}
                                </div>

                                <AnimatePresence>
                                    {showFilters && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                                {/* Date From */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Calendar size={12} className="text-indigo-500" />
                                                        <span>من تاريخ الحركة</span>
                                                    </label>
                                                    <input
                                                        type="date"
                                                        className="w-full px-3 py-2 bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                        value={filterDateFrom}
                                                        onChange={(e) => setFilterDateFrom(e.target.value)}
                                                    />
                                                </div>

                                                {/* Date To */}
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Calendar size={12} className="text-indigo-500" />
                                                        <span>إلى تاريخ الحركة</span>
                                                    </label>
                                                    <input
                                                        type="date"
                                                        className="w-full px-3 py-2 bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                        value={filterDateTo}
                                                        onChange={(e) => setFilterDateTo(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Detailed Ledger Table */}
                            <div className="bg-white dark:bg-[#0b101f] rounded-3xl border border-slate-100 dark:border-slate-800/80 overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 font-bold">
                                                <th className="px-4 py-3.5">تاريخ ووقت الحركة</th>
                                                <th className="px-4 py-3.5">نوع الحركة</th>
                                                <th className="px-4 py-3.5">رقم السند/الفاتورة</th>
                                                <th className="px-4 py-3.5">العميل / المورد</th>
                                                <th className="px-4 py-3.5 text-center">وارد (+)</th>
                                                <th className="px-4 py-3.5 text-center">صادر (-)</th>
                                                <th className="px-4 py-3.5 text-left">سعر الوحدة</th>
                                                <th className="px-4 py-3.5 text-left">إجمالي القيمة</th>
                                                <th className="px-4 py-3.5 text-center bg-indigo-50/10 dark:bg-indigo-950/5">الرصيد التراكمي</th>
                                                <th className="px-4 py-3.5 w-1/5">الملاحظات والتفاصيل</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredMovements.length === 0 ? (
                                                <tr>
                                                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400 font-bold bg-white dark:bg-[#0b101f]">
                                                        لا توجد حركات مسجلة لهذا الصنف تطابق الفلترة المحددة.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredMovements.map((m, idx) => {
                                                    const isIncoming = m.stockChange > 0;
                                                    
                                                    // Dynamic movement types branding
                                                    let badgeStyle = "bg-slate-100 text-slate-600 border-slate-200";
                                                    let typeLabel = "حركة غير معروفة";
                                                    if (m.type === 'sale') {
                                                        badgeStyle = "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20";
                                                        typeLabel = "فاتورة مبيعات";
                                                    } else if (m.type === 'purchase') {
                                                        badgeStyle = "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-500/20";
                                                        typeLabel = "فاتورة مشتريات";
                                                    } else if (m.type === 'sale_return') {
                                                        badgeStyle = "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20";
                                                        typeLabel = "مرتجع مبيعات";
                                                    } else if (m.type === 'purchase_return') {
                                                        badgeStyle = "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-500/20";
                                                        typeLabel = "مرتجع مشتريات";
                                                    }

                                                    const displayDate = new Date(m.createdAt).toLocaleDateString('ar-YE');
                                                    const displayTime = new Date(m.createdAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' });

                                                    return (
                                                        <tr 
                                                            key={m.id}
                                                            className="border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors"
                                                        >
                                                            {/* Date & Time */}
                                                            <td className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                                <span className="block font-bold">{displayDate}</span>
                                                                <span className="block text-[10px] text-slate-400 font-mono">{displayTime}</span>
                                                            </td>

                                                            {/* Movement Type Badge */}
                                                            <td className="px-4 py-3">
                                                                <span className={cn(
                                                                    "px-2.5 py-1 rounded-xl text-[10px] font-black border tracking-wider inline-block text-center whitespace-nowrap",
                                                                    badgeStyle
                                                                )}>
                                                                    {typeLabel}
                                                                </span>
                                                            </td>

                                                            {/* Invoice Ref Number */}
                                                            <td className="px-4 py-3 font-mono font-bold text-indigo-650 dark:text-indigo-400">
                                                                #{m.invoiceNumber}
                                                            </td>

                                                            {/* Partner Name */}
                                                            <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                                                                {m.partnerName}
                                                            </td>

                                                            {/* Quantity Incoming */}
                                                            <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono">
                                                                {isIncoming ? `+${m.quantity}` : "-"}
                                                            </td>

                                                            {/* Quantity Outgoing */}
                                                            <td className="px-4 py-3 text-center font-bold text-rose-500 dark:text-rose-400 text-sm font-mono">
                                                                {!isIncoming ? `-${m.quantity}` : "-"}
                                                            </td>

                                                            {/* Unit Price */}
                                                            <td className="px-4 py-3 text-left font-mono font-semibold text-slate-500 dark:text-slate-400">
                                                                {m.price.toLocaleString()} <span className="text-[10px] font-normal opacity-50">YER</span>
                                                            </td>

                                                            {/* Total Line Amount */}
                                                            <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 dark:text-slate-200">
                                                                {m.total.toLocaleString()} <span className="text-[10px] font-normal opacity-50">YER</span>
                                                            </td>

                                                            {/* Running Balance after Movement */}
                                                            <td className="px-4 py-3 text-center font-mono font-black text-sm bg-indigo-50/10 dark:bg-indigo-950/5 text-slate-850 dark:text-indigo-250">
                                                                {m.runningStock}
                                                            </td>

                                                            {/* Line Notes */}
                                                            <td className="px-4 py-3 text-slate-400 font-medium truncate max-w-xs" title={m.notes}>
                                                                {m.notes || <span className="opacity-20 italic">لا توجد ملاحظات</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer bar */}
                <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20 text-slate-400 dark:text-slate-500 text-[10px] font-black flex justify-between items-center shrink-0">
                    <span>* الحسابات التراكمية تعتمد على جميع فواتير الشراء والبيع والترجيع المعتمدة في النظام.</span>
                    <span>النظام المخزني لخدمات البصريات الحديثة</span>
                </div>
            </motion.div>
        </div>
    );
}
