import React, { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Phone, MapPin, Calculator, Filter, ChevronDown, ChevronUp, Calendar, Coins, TrendingUp, X, Printer } from "lucide-react";
import { dbService } from "../services/db";
import { Customer, Supplier } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { syncEngine } from "../services/syncEngine";
import { cn, hasPermission } from "../lib/utils";
import { calculateUnifiedPartnerBalances } from "../lib/financialUtils";
import { Voucher } from "../types";

interface PartnersProps {
    type: 'customer' | 'supplier';
}

import CustomerProfile from "./CustomerProfile";

export default function Partners({ type }: PartnersProps) {
    const [partners, setPartners] = useState<(Customer | Supplier)[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [quickEntries, setQuickEntries] = useState<any[]>([]);
    const [allTransactions, setAllTransactions] = useState<any[]>([]);
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Customer | Supplier | null>(null);
    const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);

    // Advanced search states
    const [showFilters, setShowFilters] = useState(false);
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");
    const [filterBalanceStatus, setFilterBalanceStatus] = useState<"all" | "settled" | "due" | "credit">("all");
    const [isPrinting, setIsPrinting] = useState(false);

    const [formData, setFormData] = useState<Partial<Customer>>({
        name: "",
        phone: "",
        address: "",
        balance: 0
    });

    const collectionName = type === 'customer' ? "customers" : "suppliers";

    useEffect(() => {
        loadPartners();
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadPartners();
        });
        return unsubscribe;
    }, [type]);

    const loadPartners = async () => {
        const [partnersData, invoicesData, quickEntriesData, transactionsData, vouchersData] = await Promise.all([
            dbService.getAll(collectionName),
            dbService.getAll("invoices"),
            dbService.getAll("quick_financial_entries"),
            dbService.getAll("transactions"),
            dbService.getAll("vouchers")
        ]);
        setPartners(partnersData as (Customer | Supplier)[]);
        setInvoices(invoicesData as any[]);
        setQuickEntries(quickEntriesData as any[]);
        setAllTransactions(transactionsData as any[]);
        setVouchers(vouchersData as Voucher[]);
    };

    const [isSaving, setIsSaving] = useState(false);
    const [partnerToDelete, setPartnerToDelete] = useState<Customer | Supplier | null>(null);

    const confirmDeletePartner = async () => {
        if (!partnerToDelete || !partnerToDelete.id) return;
        if (!hasPermission(null, 'global_delete')) {
            alert("عذراً، لا تملك صلاحية حذف البيانات.");
            setPartnerToDelete(null);
            return;
        }
        setIsSaving(true);
        try {
            // Check for associated records
            const [invoicesRes, transRes] = await Promise.all([
                dbService.getPaginated("invoices", 1, null, [{ field: 'partnerId', op: '==', value: partnerToDelete.id }]),
                dbService.getPaginated("transactions", 1, null, [{ field: 'partnerId', op: '==', value: partnerToDelete.id }])
            ]);
            
            if (invoicesRes.data.length > 0 || transRes.data.length > 0) {
                alert("لا يمكن حذف هذا الحساب لارتباطه بعمليات مالية أو فواتير. لا يمكن حذف مورد أو عميل لديه حركات سابقة.");
                setPartnerToDelete(null);
                return;
            }

            await dbService.softDelete(collectionName, partnerToDelete.id);
            setPartnerToDelete(null);
            loadPartners();
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء حذف الحساب");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || formData.name.trim().length < 3) {
            alert("الاسم يجب أن يكون 3 أحرف على الأقل");
            return;
        }
        if (formData.phone && formData.phone.trim().length > 0 && formData.phone.trim().length < 9) {
            alert("يرجى إدخال رقم هاتف صحيح يتكون من 9 أرقام على الأقل أو تركه فارغاً");
            return;
        }

        setIsSaving(true);
        try {
            const submitData = { ...formData };
            if (type === 'customer') {
                submitData.balance = 0;
            }
            if (editingPartner?.id) {
                if (!hasPermission(null, 'global_edit')) {
                    alert("عذراً، لا تملك صلاحية تعديل البيانات.");
                    setIsSaving(false);
                    return;
                }
                await dbService.update(collectionName, editingPartner.id, submitData);
                alert("تم تحديث البيانات بنجاح");
            } else {
                await dbService.add(collectionName, submitData);
                alert("تم إضافة الطرف بنجاح");
            }
            setIsModalOpen(false);
            setEditingPartner(null);
            setFormData({ name: "", phone: "", address: "", balance: 0 });
            loadPartners();
        } catch (error) {
            console.error("Error saving partner:", error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (p: Customer | Supplier) => {
        if (!hasPermission(null, 'global_delete')) {
            alert("عذراً، لا تملك صلاحية حذف البيانات.");
            return;
        }
        setPartnerToDelete(p);
    };

    const partnerTotalsMap = React.useMemo(() => {
        return calculateUnifiedPartnerBalances(
            partners,
            allTransactions,
            invoices,
            vouchers,
            quickEntries,
            type
        );
    }, [partners, allTransactions, invoices, vouchers, quickEntries, type]);

    const getPartnerTotals = (partnerId: string) => {
        return partnerTotalsMap[partnerId] || { total: 0, paid: 0, remaining: 0 };
    };

    const handlePrintAll = async () => {
        setIsPrinting(true);
        try {
            const [allTransactions, allQuickEntries] = await Promise.all([
                dbService.getAll("transactions"),
                dbService.getAll("quick_financial_entries")
            ]) as [any[], any[]];
            
            const activeQEIds = new Set(allQuickEntries.filter(qe => qe.recordStatus !== 'deleted').map(qe => qe.id).filter(Boolean));

            const printWindow = window.open("", "_blank");
            if (!printWindow) {
                alert("يرجى السماح بفتح النوافذ المنبثقة للطباعة");
                return;
            }

            const isCustomer = type === 'customer';
            const titleText = isCustomer ? "تقرير أرصدة وكشوفات حسابات العملاء" : "تقرير أرصدة وكشوفات حسابات الموردين";
            const partnerLabel = isCustomer ? "العميل" : "المورد";
            
            let filtersAppliedHtml = "";
            if (searchTerm || filterDateFrom || filterDateTo || filterBalanceStatus !== 'all') {
                filtersAppliedHtml = `
                    <div class="filters-info">
                        <strong>الفلاتر المطبقة:</strong>
                        ${searchTerm ? `<span>البحث: ${searchTerm}</span>` : ""}
                        ${filterDateFrom ? `<span>من تاريخ: ${filterDateFrom}</span>` : ""}
                        ${filterDateTo ? `<span>إلى تاريخ: ${filterDateTo}</span>` : ""}
                        ${filterBalanceStatus !== 'all' ? `<span>حالة الرصيد: ${
                            filterBalanceStatus === 'settled' ? 'مسدد' :
                            filterBalanceStatus === 'due' ? (isCustomer ? 'مدين' : 'دائن') :
                            (isCustomer ? 'دائن' : 'مدين')
                        }</span>` : ""}
                    </div>
                `;
            }

            // Build html for each filtered partner
            const partnersHtml = filteredPartners.map((p, idx) => {
                // Get totals
                const pTotals = getPartnerTotals(p.id!);
                
                // Calculate detailed ledger
                const partnerInvoices = invoices.filter(inv => inv.partnerId === p.id && inv.recordStatus !== 'deleted' && (inv.lifecycleStatus === 'معتمد' || !inv.lifecycleStatus));
                const activeInvoiceIds = new Set(partnerInvoices.map(i => i.id).filter(Boolean));

                const partnerTransactions = allTransactions.filter(t => {
                    if (t.partnerId !== p.id || t.recordStatus === 'deleted') return false;
                    if (t.sourceId && (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice' || t.sourceType === 'manual_receipt' || t.sourceType === 'manual_payment')) {
                        if (t.sourceType === 'manual_receipt' || t.sourceType === 'manual_payment') {
                            if (!activeInvoiceIds.has(t.sourceId) && !activeQEIds.has(t.sourceId)) {
                                return false;
                            }
                        } else {
                            if (!activeInvoiceIds.has(t.sourceId)) {
                                return false;
                            }
                        }
                    }
                    return true;
                });

                const ledgerItems: any[] = [];
                partnerInvoices.forEach(i => {
                    const netAmount = i.total - (i.discount || 0);
                    ledgerItems.push({
                        date: i.createdAt,
                        description: i.type === 'sale' ? `فاتورة مبيعات رقم #${i.invoiceNumber || i.id?.slice(0, 6).toUpperCase()}` : `فاتورة مشتريات رقم #${i.invoiceNumber || i.id?.slice(0, 6).toUpperCase()}`,
                        debit: isCustomer ? netAmount : 0,
                        credit: !isCustomer ? netAmount : 0,
                    });
                });

                partnerTransactions.forEach(t => {
                    if (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice') return;

                    let debit = 0;
                    let credit = 0;
                    
                    if (t.sourceType === 'quick_financial_entry') {
                        if (isCustomer) {
                            if (t.type === 'قبض') {
                                debit = t.amount;
                            } else {
                                credit = t.amount;
                            }
                        } else {
                            if (t.type === 'صرف') {
                                credit = t.amount;
                            } else {
                                debit = t.amount;
                            }
                        }
                    } else {
                        if (isCustomer) {
                            if (t.type === 'قبض') {
                                credit = t.amount;
                            } else {
                                debit = t.amount;
                            }
                        } else {
                            if (t.type === 'صرف') {
                                debit = t.amount;
                            } else {
                                credit = t.amount;
                            }
                        }
                    }

                    ledgerItems.push({
                        date: t.createdAt,
                        description: t.description || (t.type === 'قبض' ? 'سند قبض نقدي' : 'سند صرف نقدي'),
                        debit,
                        credit
                    });
                });

                ledgerItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                let runningBalance = 0;
                const timeline = ledgerItems.map(item => {
                    if (isCustomer) {
                        runningBalance += (item.debit - item.credit);
                    } else {
                        runningBalance += (item.credit - item.debit);
                    }
                    return {
                        ...item,
                        balance: runningBalance
                    };
                });

                const rowsHtml = timeline.map(item => {
                    const dateStr = new Date(item.date).toLocaleDateString('ar-YE');
                    const timeStr = new Date(item.date).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' });
                    return `
                        <tr>
                            <td>${dateStr} <span class="time-label">${timeStr}</span></td>
                            <td>${item.description}</td>
                            <td class="amount text-emerald">${item.debit > 0 ? item.debit.toLocaleString() : "-"}</td>
                            <td class="amount text-rose">${item.credit > 0 ? item.credit.toLocaleString() : "-"}</td>
                            <td class="amount font-bold">${item.balance.toLocaleString()} YER</td>
                        </tr>
                    `;
                }).join("");

                const balanceVal = p.balance || 0;
                let balanceClass = "balance-neutral";
                let balanceLabel = "مسدد";
                if (balanceVal > 0) {
                    balanceClass = "balance-due";
                    balanceLabel = isCustomer ? "متبقي عليه (مدين)" : "متبقي له (دائن)";
                } else if (balanceVal < 0) {
                    balanceClass = "balance-credit";
                    balanceLabel = isCustomer ? "له رصيد (دائن)" : "عليه رصيد (مدين)";
                }

                return `
                    <div class="partner-section">
                        <div class="partner-header">
                            <div class="partner-meta">
                                <h3>${idx + 1}. ${p.name}</h3>
                                <p>الهاتف: ${p.phone || "غير محدد"} | العنوان: ${p.address || "غير محدد"}</p>
                            </div>
                            <div class="partner-balance-badge ${balanceClass}">
                                <div class="badge-title">${balanceLabel}</div>
                                <div class="badge-value">${Math.abs(balanceVal).toLocaleString()} YER</div>
                            </div>
                        </div>

                        <div class="totals-row">
                            <div class="total-item">
                                <span class="lbl">${isCustomer ? 'إجمالي المبيعات:' : 'إجمالي المشتريات:'}</span>
                                <span class="val">${pTotals.total.toLocaleString()} YER</span>
                            </div>
                            <div class="total-item">
                                <span class="lbl">إجمالي المسدد:</span>
                                <span class="val text-emerald">${pTotals.paid.toLocaleString()} YER</span>
                            </div>
                            <div class="total-item">
                                <span class="lbl">إجمالي المتبقي:</span>
                                <span class="val text-rose">${pTotals.remaining.toLocaleString()} YER</span>
                            </div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th width="18%">التاريخ والوقت</th>
                                    <th>البيان والتفاصيل</th>
                                    <th width="15%" class="text-left">مدين (+)</th>
                                    <th width="15%" class="text-left">دائن (-)</th>
                                    <th width="18%" class="text-left">الرصيد المتبقي</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml || `<tr><td colspan="5" class="empty-row">لا توجد حركات مسجلة لهذا الحساب.</td></tr>`}
                            </tbody>
                        </table>
                    </div>
                `;
            }).join("");

            printWindow.document.write(`
                <html dir="rtl" lang="ar">
                <head>
                    <title>${titleText}</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            padding: 30px;
                            color: #0f172a;
                            background-color: #ffffff;
                            margin: 0;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                            border-bottom: 3px double #cbd5e1;
                            padding-bottom: 20px;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 26px;
                            color: #1e3a8a;
                            font-weight: 900;
                        }
                        .header p {
                            margin: 8px 0 0;
                            font-size: 14px;
                            color: #475569;
                            font-weight: bold;
                        }
                        .filters-info {
                            margin: 15px auto 0;
                            padding: 10px 15px;
                            background-color: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 10px;
                            font-size: 12px;
                            display: inline-block;
                            color: #334155;
                            text-align: right;
                        }
                        .filters-info span {
                            margin-right: 12px;
                            padding: 2px 8px;
                            background-color: #e2e8f0;
                            border-radius: 5px;
                            font-weight: bold;
                        }
                        
                        /* Stats Summary for the group */
                        .stats-summary {
                            display: grid;
                            grid-template-cols: repeat(3, 1fr);
                            gap: 15px;
                            margin-bottom: 35px;
                        }
                        .stat-card {
                            background: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 12px;
                            padding: 15px;
                            text-align: center;
                        }
                        .stat-card h4 {
                            margin: 0 0 6px;
                            font-size: 11px;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        }
                        .stat-card p {
                            margin: 0;
                            font-size: 18px;
                            font-weight: 850;
                            color: #1e293b;
                        }

                        /* Partner Individual Sections */
                        .partner-section {
                            page-break-inside: avoid;
                            border: 1px solid #e2e8f0;
                            border-radius: 20px;
                            padding: 22px;
                            margin-bottom: 30px;
                            background-color: #ffffff;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                        }
                        .partner-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border-bottom: 2px solid #f1f5f9;
                            padding-bottom: 12px;
                            margin-bottom: 15px;
                        }
                        .partner-meta h3 {
                            margin: 0 0 4px;
                            font-size: 18px;
                            color: #0f172a;
                            font-weight: 800;
                        }
                        .partner-meta p {
                            margin: 0;
                            font-size: 12px;
                            color: #64748b;
                            font-weight: 600;
                        }
                        
                        /* Balance Badges */
                        .partner-balance-badge {
                            padding: 8px 16px;
                            border-radius: 12px;
                            text-align: left;
                        }
                        .badge-title {
                            font-size: 9px;
                            font-weight: 800;
                            text-transform: uppercase;
                            opacity: 0.8;
                        }
                        .badge-value {
                            font-size: 15px;
                            font-weight: 900;
                        }
                        .balance-due {
                            background-color: #fef2f2;
                            color: #991b1b;
                            border: 1px solid #fca5a5;
                        }
                        .balance-credit {
                            background-color: #f0fdf4;
                            color: #166534;
                            border: 1px solid #86efac;
                        }
                        .balance-neutral {
                            background-color: #f8fafc;
                            color: #475569;
                            border: 1px solid #cbd5e1;
                        }

                        .totals-row {
                            display: flex;
                            gap: 20px;
                            margin-bottom: 15px;
                            background: #fafafa;
                            padding: 10px 15px;
                            border-radius: 10px;
                            font-size: 11px;
                        }
                        .total-item {
                            display: flex;
                            align-items: center;
                            gap: 5px;
                        }
                        .total-item .lbl {
                            color: #64748b;
                            font-weight: bold;
                        }
                        .total-item .val {
                            font-weight: 800;
                            color: #1e293b;
                        }

                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 5px;
                            font-size: 11px;
                        }
                        th, td {
                            border: 1px solid #cbd5e1;
                            padding: 8px 12px;
                            text-align: right;
                        }
                        th {
                            background-color: #f1f5f9;
                            color: #334155;
                            font-weight: 800;
                        }
                        tr:nth-child(even) {
                            background-color: #f8fafc;
                        }
                        .amount {
                            font-family: 'JetBrains Mono', monospace, Courier;
                            text-align: left;
                        }
                        .text-emerald {
                            color: #047857;
                            font-weight: bold;
                        }
                        .text-rose {
                            color: #be123c;
                            font-weight: bold;
                        }
                        .empty-row {
                            text-align: center;
                            padding: 20px !important;
                            color: #94a3b8;
                            font-weight: bold;
                        }
                        .time-label {
                            font-size: 9px;
                            color: #94a3b8;
                            margin-right: 5px;
                        }
                        .footer {
                            margin-top: 50px;
                            text-align: center;
                            font-size: 10px;
                            color: #94a3b8;
                            border-top: 1px dashed #cbd5e1;
                            padding-top: 15px;
                        }
                        @media print {
                            body {
                                padding: 10px;
                            }
                            .partner-section {
                                box-shadow: none;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${titleText}</h1>
                        <p>نظام إدارة حسابات ومبيعات البصريات الحديثة</p>
                        ${filtersAppliedHtml}
                    </div>

                    <div class="stats-summary">
                        <div class="stat-card">
                            <h4>إجمالي مبيعات/مشتريات المجموعة للفترة</h4>
                            <p>${stats.total.toLocaleString()} YER</p>
                        </div>
                        <div class="stat-card">
                            <h4>إجمالي المبالغ المسددة</h4>
                            <p>${stats.paid.toLocaleString()} YER</p>
                        </div>
                        <div class="stat-card">
                            <h4>إجمالي المبالغ المتبقية</h4>
                            <p>${stats.remaining.toLocaleString()} YER</p>
                        </div>
                    </div>

                    ${partnersHtml || `<div style="text-align:center; padding: 50px; color:#94a3b8; font-weight:bold;">لا توجد حسابات لعرضها طبقاً للفلترة.</div>`}

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
        } catch (error) {
            console.error("Error generating printable client list with details:", error);
            alert("حدث خطأ أثناء إعداد كشف الطباعة.");
        } finally {
            setIsPrinting(false);
        }
    };

    const filteredPartners = partners.filter(p => {
        // Name & Phone search
        const matchesSearch = (p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                              (p.phone || '').includes(searchTerm);
        if (!matchesSearch) return false;

        // Date filter
        if (filterDateFrom || filterDateTo) {
            if (!p.createdAt) return false;
            const createdDate = p.createdAt.split('T')[0]; // YYYY-MM-DD
            if (filterDateFrom && createdDate < filterDateFrom) return false;
            if (filterDateTo && createdDate > filterDateTo) return false;
        }

        // Balance Status filter
        const balance = p.balance || 0;
        if (filterBalanceStatus === "settled" && balance !== 0) return false;
        if (filterBalanceStatus === "due" && balance <= 0) return false;
        if (filterBalanceStatus === "credit" && balance >= 0) return false;

        return true;
    });

    const stats = filteredPartners.reduce((acc, p) => {
        const pTotals = getPartnerTotals(p.id!);
        return {
            total: acc.total + pTotals.total,
            paid: acc.paid + pTotals.paid,
            remaining: acc.remaining + pTotals.remaining
        };
    }, { total: 0, paid: 0, remaining: 0 });

    return (
        <div className="space-y-4 relative h-full">
            {viewingProfileId ? (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-white dark:bg-[#0b0f19] w-full max-w-5xl h-[95vh] md:h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-slate-100 dark:border-slate-800 relative"
                    >
                        <CustomerProfile 
                            partnerId={viewingProfileId} 
                            partnerType={type} 
                            onClose={() => setViewingProfileId(null)} 
                        />
                    </motion.div>
                </div>
            ) : null}

            <div className="flex items-center gap-3 bg-white dark:bg-[#131b2e] p-3 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder={`بحث في ${type === 'customer' ? 'العملاء' : 'الموردين'}...`}
                        className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold dark:text-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={handlePrintAll}
                    disabled={isPrinting}
                    title="طباعة كشف الحسابات التفصيلي"
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white p-3 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-90 shrink-0 flex items-center justify-center"
                >
                    <Printer size={24} className={isPrinting ? "animate-pulse" : ""} />
                </button>
                <button
                    onClick={() => {
                        setEditingPartner(null);
                        setFormData({ name: "", phone: "", address: "", balance: 0 });
                        setIsModalOpen(true);
                    }}
                    className="bg-indigo-600 text-white p-3 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-90 shrink-0"
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* Collapsible Filters Trigger and Reset Row */}
            <div className="flex justify-between items-center bg-white dark:bg-[#131b2e] px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm">
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 text-xs font-black text-slate-650 dark:text-slate-350 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer bg-transparent border-none"
                >
                    <Filter size={16} className={showFilters ? "text-indigo-600 dark:text-indigo-400 animate-pulse" : "text-slate-400"} />
                    <span>تصفية وفلترة متقدمة للـ{type === 'customer' ? 'عملاء' : 'موردين'}</span>
                    {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                
                {/* Reset Filters */}
                {(filterDateFrom || filterDateTo || filterBalanceStatus !== 'all' || searchTerm) && (
                    <button
                        onClick={() => {
                            setSearchTerm("");
                            setFilterDateFrom("");
                            setFilterDateTo("");
                            setFilterBalanceStatus("all");
                        }}
                        className="text-[10px] font-black text-rose-600 dark:text-rose-400 hover:underline cursor-pointer bg-transparent border-none"
                    >
                        إعادة تعيين الفلترة
                    </button>
                )}
            </div>

            {/* Collapsible Advanced Filter Container */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-slate-50/50 dark:bg-slate-900/20 p-5 rounded-3xl border border-slate-100 dark:border-slate-800/80 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {/* From Date */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Calendar size={12} className="text-indigo-500" />
                                        <span>من تاريخ التسجيل</span>
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        value={filterDateFrom}
                                        onChange={(e) => setFilterDateFrom(e.target.value)}
                                    />
                                </div>

                                {/* To Date */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Calendar size={12} className="text-indigo-500" />
                                        <span>إلى تاريخ التسجيل</span>
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        value={filterDateTo}
                                        onChange={(e) => setFilterDateTo(e.target.value)}
                                    />
                                </div>

                                {/* Balance State */}
                                <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Coins size={12} className="text-indigo-500" />
                                        <span>حالة رصيد الحساب</span>
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        value={filterBalanceStatus}
                                        onChange={(e) => setFilterBalanceStatus(e.target.value as any)}
                                    >
                                        <option value="all">الكل (بدون تحديد)</option>
                                        <option value="settled">مسدد (رصيد صفر)</option>
                                        <option value="due">
                                            {type === 'customer' ? 'متبقي عليه (مدين)' : 'متبقي له (دائن)'}
                                        </option>
                                        <option value="credit">
                                            {type === 'customer' ? 'رصيد له (دائن)' : 'رصيد عليه (مدين)'}
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Dynamic Totals Panel */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white dark:bg-[#131b2e] p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
                <div className="bg-indigo-50/40 dark:bg-indigo-950/10 p-4 rounded-2xl border border-indigo-100/40 dark:border-indigo-950/30 flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                        <Calculator size={18} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 dark:text-slate-450 uppercase">
                            {type === 'customer' ? 'إجمالي المبيعات' : 'إجمالي المشتريات'}
                        </p>
                        <h4 className="text-sm font-black text-indigo-950 dark:text-indigo-200 leading-tight mt-0.5">
                            {stats.total.toLocaleString()} <span className="text-[9px]">YER</span>
                        </h4>
                    </div>
                </div>

                <div className="bg-emerald-50/40 dark:bg-emerald-950/10 p-4 rounded-2xl border border-emerald-100/40 dark:border-emerald-950/30 flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                        <Coins size={18} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 dark:text-slate-450 uppercase">
                            إجمالي المسدد
                        </p>
                        <h4 className="text-sm font-black text-emerald-950 dark:text-emerald-200 leading-tight mt-0.5">
                            {stats.paid.toLocaleString()} <span className="text-[9px]">YER</span>
                        </h4>
                    </div>
                </div>

                <div className="bg-rose-50/40 dark:bg-rose-950/10 p-4 rounded-2xl border border-rose-100/40 dark:border-rose-950/30 flex items-center gap-3">
                    <div className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl">
                        <TrendingUp size={18} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 dark:text-slate-450 uppercase">
                            إجمالي المتبقي
                        </p>
                        <h4 className="text-sm font-black text-rose-950 dark:text-rose-200 leading-tight mt-0.5">
                            {stats.remaining.toLocaleString()} <span className="text-[9px]">YER</span>
                        </h4>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pb-10">
                <AnimatePresence mode="popLayout">
                    {filteredPartners.map((p) => (
                        <motion.div
                            key={p.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setViewingProfileId(p.id!)}
                            className="bg-white dark:bg-[#131b2e] p-4 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                        >
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-black text-slate-800 dark:text-white truncate leading-tight mb-1">{p.name}</h3>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                        <Phone size={12} className="text-blue-500" />
                                        {p.phone}
                                    </div>
                                    <div className={cn(
                                        "font-mono px-2 py-0.5 rounded-lg",
                                        p.balance > 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10" : p.balance < 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-slate-50 text-slate-400 dark:bg-slate-800"
                                    )}>
                                        {Math.abs(p.balance || 0).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 px-1">
                                {hasPermission(null, 'global_edit') && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingPartner(p);
                                            setFormData(p);
                                            setIsModalOpen(true);
                                        }}
                                        className="p-3 text-slate-400 hover:text-indigo-500 transition-colors"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                )}
                                {hasPermission(null, 'global_delete') && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                                        className="p-3 text-slate-400 hover:text-rose-500 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, y: "100%" }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: "100%" }}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-lg h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2.5rem] shadow-2xl relative flex flex-col overflow-hidden"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                                <h3 className="text-base font-black text-slate-800 dark:text-white">{editingPartner ? `تعديل البيانات` : `إضافة جديد`}</h3>
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-rose-500 p-2">
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white dark:bg-[#131b2e]">
                                <form id="partnerForm" onSubmit={handleSubmit} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">الاسم الكامل</label>
                                        <input
                                            required
                                            type="text"
                                            placeholder="أدخل الاسم..."
                                            className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-bold dark:text-white focus:ring-4 focus:ring-indigo-500/10"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">رقم الجوال (اختياري)</label>
                                        <input
                                            type="text"
                                            placeholder="أدخل الرقم..."
                                            className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-bold dark:text-white focus:ring-4 focus:ring-indigo-500/10"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">العنوان</label>
                                        <textarea
                                            placeholder="أدخل الموقع..."
                                            className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-bold dark:text-white focus:ring-4 focus:ring-indigo-500/10 h-24 resize-none"
                                            value={formData.address}
                                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        />
                                    </div>
                                    {type === 'supplier' && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">الرصيد الافتتاحي (اختياري)</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-black dark:text-white focus:ring-4 focus:ring-indigo-500/10"
                                                value={formData.balance || ""}
                                                onChange={(e) => setFormData({ ...formData, balance: e.target.value === "" ? 0 : Number(e.target.value) })}
                                                disabled={!!editingPartner}
                                                dir="ltr"
                                            />
                                        </div>
                                    )}
                                </form>
                            </div>
                            <div className="p-4 md:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#1c2436] shrink-0">
                                <button
                                    form="partnerForm"
                                    type="submit"
                                    disabled={isSaving}
                                    className={cn(
                                        "w-full bg-indigo-600 text-white py-4 rounded-[2rem] font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 flex justify-center items-center gap-2",
                                        isSaving && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {isSaving ? "جاري الحفظ..." : "حفــــظ البيانات"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Confirm Delete Modal */}
                {partnerToDelete && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPartnerToDelete(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden z-10"
                        >
                            <div className="p-4 text-center space-y-4">
                                <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-base font-black text-slate-800">تأكيد حذف الحساب</h3>
                                <p className="text-sm text-slate-500 leading-relaxed px-4 text-center">
                                    هل أنت متأكد من حذف الحساب <span className="font-bold text-slate-800">{partnerToDelete.name}</span>؟ 
                                    <br />
                                    <span className="text-rose-600 font-bold mt-2 block">تنبيه: الكشوفات والعمليات المالية المستندة إليه قد تتأثر!</span>
                                </p>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setPartnerToDelete(null)}
                                        className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        onClick={confirmDeletePartner}
                                        className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 cursor-pointer"
                                    >
                                        حذف نهائي
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
