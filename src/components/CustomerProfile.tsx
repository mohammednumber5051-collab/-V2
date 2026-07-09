import { useState, useEffect } from "react";
import { ArrowRight, Phone, MapPin, Receipt, Wallet, Calendar, Sparkles, Save, Edit, Eye, UserPlus, Printer, FileText, FileDown, Trash2 } from "lucide-react";
import { dbService } from "../services/db";
import { syncEngine } from "../services/syncEngine";
import { Customer, Supplier, Invoice, Transaction, OpticalCustomerProfileData } from "../types";
import { cn, hasPermission } from "../lib/utils";
import PrintPreviewModal from "./PrintPreviewModal";

interface CustomerProfileProps {
    partnerId: string;
    partnerType: 'customer' | 'supplier';
    onClose: () => void;
}

export default function CustomerProfile({ partnerId, partnerType, onClose }: CustomerProfileProps) {
    const [partner, setPartner] = useState<Customer | Supplier | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    
    // Optical Profile editing states
    const [isEditingOptical, setIsEditingOptical] = useState(false);
    const [opticalProfileForm, setOpticalProfileForm] = useState<OpticalCustomerProfileData>({
        preferredFrameType: "",
        preferredBrand: "",
        customerNotes: "",
        lastPurchaseDate: "",
        purchaseFrequency: "نشط"
    });
    const [updating, setUpdating] = useState(false);
    const [printFormat, setPrintFormat] = useState<'a4' | 'thermal' | 'pdf'>('a4');

    // Print Preview State
    const [printPreview, setPrintPreview] = useState<{
        isOpen: boolean;
        html: string;
        title: string;
        size: 'a4' | 'thermal';
    }>({ isOpen: false, html: '', title: '', size: 'a4' });

    const loadData = async () => {
        const collName = partnerType === 'customer' ? "customers" : "suppliers";
        const [allP, allI, allT] = await Promise.all([
            dbService.getAll(collName) as Promise<(Customer|Supplier)[]>,
            dbService.getAll("invoices") as Promise<Invoice[]>,
            dbService.getAll("transactions") as Promise<Transaction[]>
        ]);

        const p = allP.find(x => x.id === partnerId);
        if (p) {
            setPartner(p);
            if (partnerType === 'customer') {
                const customerObj = p as Customer;
                setOpticalProfileForm(customerObj.opticalProfile || {
                    preferredFrameType: "",
                    preferredBrand: "",
                    customerNotes: "",
                    lastPurchaseDate: "",
                    purchaseFrequency: "نشط"
                });
            }
        }

        const filteredInvoices = allI.filter(i => i.partnerId === partnerId);
        const filteredTransactions = allT.filter(t => t.partnerId === partnerId);

        setInvoices(filteredInvoices);
        setTransactions(filteredTransactions);

        // Auto-reconcile balance to repair any historical or deleted invoice mismatches
        if (p) {
            const activeInvs = filteredInvoices.filter(i => i.recordStatus !== 'deleted' && (i.lifecycleStatus === 'معتمد' || !i.lifecycleStatus));
            const activeInvIds = new Set(activeInvs.map(i => i.id).filter(Boolean));
            
            const activeTrans = filteredTransactions.filter(t => {
                if (t.recordStatus === 'deleted') return false;
                if (t.sourceId && (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice' || t.sourceType === 'manual_receipt' || t.sourceType === 'manual_payment')) {
                    if (!activeInvIds.has(t.sourceId)) {
                        return false;
                    }
                }
                return true;
            });

            const totalPurch = activeInvs.reduce((acc, curr) => acc + (curr.total - (curr.discount || 0)), 0);
            const totalPay = activeTrans
                .filter(t => t.sourceType !== 'sales_invoice' && t.sourceType !== 'purchase_invoice')
                .filter(t => partnerType === 'customer' 
                    ? t.type === 'قبض' 
                    : t.type === 'صرف'
                )
                .reduce((acc, curr) => acc + curr.amount, 0);

            const calcBal = totalPurch - totalPay;

            // Removing auto-reconciliation as requested: UI should not update balances directly.
            if (p.balance !== calcBal) {
                console.warn(`Balance mismatch detected for ${partnerId}. DB: ${p.balance}, Calculated: ${calcBal}`);
                // Only update local state for display if needed, but do not write to DB.
                // p.balance = calcBal;
                // setPartner({ ...p });
            }
        }
    };

    useEffect(() => {
        loadData();
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadData();
        });
        return unsubscribe;
    }, [partnerId, partnerType]);

    const handleDeleteTransaction = async (transId: string) => {
        if (!hasPermission(null, 'global_delete')) {
            alert("عذراً، لا تملك الصلاحيات لحذف السندات المالية من الحساب. (خاص بالمدير)");
            return;
        }

        if (window.confirm("هل أنت متأكد من رغبتك في حذف هذا السند؟ سيتم عكس تأثيره المالي من حساب العميل والفاتورة المرتبطة إن وجدت.")) {
            try {
                const transToDelete = transactions.find(t => t.id === transId);
                if (transToDelete) {
                    await dbService.deleteTransactionData(transToDelete);
                    alert("تم حذف السند بنجاح.");
                    loadData();
                }
            } catch (error: any) {
                alert(error.message || "خطأ أثناء حذف السند");
            }
        }
    };

    if (!partner) return <div className="p-10 text-center text-slate-400 font-bold block text-sm">جاري تنزيل الملف...</div>;

    const activeInvoices = invoices.filter(i => i.recordStatus !== 'deleted' && (i.lifecycleStatus === 'معتمد' || !i.lifecycleStatus));
    const activeInvoiceIds = new Set(activeInvoices.map(i => i.id).filter(Boolean));

    const activeTransactions = transactions.filter(t => {
        if (t.recordStatus === 'deleted') return false;
        
        // Dynamic cleanup: ignore payments/receipts whose referenced invoice has been deleted
        if (t.sourceId && (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice' || t.sourceType === 'manual_receipt' || t.sourceType === 'manual_payment')) {
            if (!activeInvoiceIds.has(t.sourceId)) {
                return false;
            }
        }
        return true;
    });

    const totalPurchases = activeInvoices.reduce((acc, curr) => acc + (curr.total - (curr.discount || 0)), 0);
    
    // Real payments received from customer or made to supplier (excluding invoice proof transactions to avoid double counting)
    const totalPayments = activeTransactions
        .filter(t => t.sourceType !== 'sales_invoice' && t.sourceType !== 'purchase_invoice')
        .filter(t => partnerType === 'customer' 
            ? t.type === 'قبض' 
            : t.type === 'صرف'
        )
        .reduce((acc, curr) => acc + curr.amount, 0);

    const calculatedBalance = totalPurchases - totalPayments;

    // Build the clean Accounting Ledger (دفتر أستاذ تفصيلي)
    const ledgerItems: any[] = [];

    // 1. Add invoices as Debit entries (for customer) or Credit entries (for supplier)
    activeInvoices.forEach(i => {
        const netAmount = i.total - (i.discount || 0);
        ledgerItems.push({
            id: i.id,
            date: i.createdAt,
            description: i.type === 'sale' ? `فاتورة مبيعات رقم #${i.invoiceNumber || i.id?.slice(0, 6).toUpperCase()}` : `فاتورة مشتريات رقم #${i.invoiceNumber || i.id?.slice(0, 6).toUpperCase()}`,
            debit: partnerType === 'customer' ? netAmount : 0,
            credit: partnerType === 'supplier' ? netAmount : 0,
        });
    });

    // 2. Add transactions (excluding invoice proofs to avoid duplicates)
    activeTransactions.forEach(t => {
        if (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice') return;

        let debit = 0;
        let credit = 0;
        
        if (partnerType === 'customer') {
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

        ledgerItems.push({
            id: t.id,
            sourceId: t.sourceId,
            date: t.createdAt,
            description: t.description || (t.type === 'قبض' ? 'سند قبض نقدي' : 'سند صرف نقدي'),
            debit,
            credit
        });
    });

    // Sort by date ascending to compute running balance chronologically
    ledgerItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const timeline = ledgerItems.map(item => {
        if (partnerType === 'customer') {
            runningBalance += (item.debit - item.credit);
        } else {
            runningBalance += (item.credit - item.debit);
        }
        return {
            ...item,
            balance: runningBalance
        };
    });

    const displayTimeline = [...timeline].reverse();

    // Build a beautiful consolidated visual timeline (سجل المبيعات والمدفوعات البصرية الموحد)
    const visualTimeline: any[] = [];

    // Add active invoices as single consolidated cards
    activeInvoices.forEach(i => {
        const netAmount = i.total - (i.discount || 0);
        visualTimeline.push({
            id: i.id,
            type: 'invoice',
            date: i.createdAt,
            title: i.type === 'sale' ? 'فاتورة مبيعات بصريات' : 'فاتورة مشتريات',
            description: i.type === 'sale' ? `فاتورة مبيعات رقم #${i.invoiceNumber || i.id?.slice(0, 6).toUpperCase()}` : `فاتورة مشتريات رقم #${i.invoiceNumber || i.id?.slice(0, 6).toUpperCase()}`,
            total: i.total,
            discount: i.discount || 0,
            netAmount: netAmount,
            paid: i.paid || 0,
            remaining: netAmount - (i.paid || 0),
            notes: i.notes || '',
        });
    });

    // Add standalone or subsequent transactions
    activeTransactions.forEach(t => {
        if (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice') return;
        
        // Skip initial payments linked to active invoices since they are already summarized inside the invoice cards
        const isInitialPayment = (t.sourceType === 'manual_receipt' || t.sourceType === 'manual_payment') && 
            activeInvoices.some(i => i.id === t.sourceId);
        if (isInitialPayment) return;

        visualTimeline.push({
            id: t.id,
            type: 'transaction',
            date: t.createdAt,
            title: t.type === 'قبض' ? 'سند قبض نقدي' : 'سند صرف نقدي',
            description: t.description || (t.type === 'قبض' ? 'سند قبض نقدي' : 'سند صرف نقدي'),
            amount: t.amount,
        });
    });

    // Sort visual timeline descending by date (newest first)
    visualTimeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Link each visual timeline item to its accurate ledger running balance at that point in time
    const visualTimelineWithBalance = visualTimeline.map(item => {
        let ledgerMatch;
        if (item.type === 'invoice') {
            // If the invoice has an initial payment, its final running balance is the balance after that payment transaction
            const paymentMatch = timeline.find(x => 
                (x.id === item.id || x.sourceId === item.id) && 
                (x.credit > 0 || x.debit > 0) &&
                x.id !== item.id
            );
            ledgerMatch = paymentMatch || timeline.find(x => x.id === item.id);
        } else {
            ledgerMatch = timeline.find(x => x.id === item.id);
        }
        return {
            ...item,
            balance: ledgerMatch ? ledgerMatch.balance : calculatedBalance
        };
    });

    const saveOpticalProfile = async () => {
        setUpdating(true);
        try {
            await dbService.update("customers", partnerId, {
                ...partner,
                opticalProfile: opticalProfileForm
            });
            setIsEditingOptical(false);
            loadData();
            alert("تم حفظ وتحديث المقاسات والمواصفات البصرية للعميل بنجاح");
        } catch (e) {
            alert("فشل تحديث الملف البصري للعميل");
        } finally {
            setUpdating(false);
        }
    };

    const handlePrintStatement = () => {
        if (!partner) return;

        const dateStr = new Date().toLocaleDateString('ar-YE', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let printHTML = "";

        if (printFormat === 'thermal') {
            // Cashier/Thermal (80mm) receipt format
            printHTML = `
                    <style>
                        .thermal-header {
                            text-align: center;
                            border-bottom: 2px dashed #000000;
                            padding-bottom: 8px;
                            margin-bottom: 8px;
                        }
                        .store-logo {
                            font-size: 14px;
                            font-weight: 950;
                            color: #000000;
                            margin-bottom: 2px;
                        }
                        .report-title {
                            font-size: 11px;
                            font-weight: 900;
                            border: 1px solid #000000;
                            background-color: #000000;
                            color: #ffffff;
                            display: inline-block;
                            padding: 2px 10px;
                            margin-top: 4px;
                            border-radius: 4px;
                        }
                        .info-block {
                            border-bottom: 1px dashed #000000;
                            padding-bottom: 6px;
                            margin-bottom: 6px;
                            font-size: 10px;
                        }
                        .info-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 3px;
                        }
                        .info-row strong {
                            font-weight: 800;
                        }
                        .financial-box {
                            border: 1px solid #000000;
                            border-radius: 6px;
                            padding: 6px;
                            margin: 8px 0;
                            background-color: #f8fafc;
                        }
                        .fin-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 3px;
                            font-size: 10px;
                        }
                        .fin-row.total {
                            border-top: 1px dashed #000000;
                            padding-top: 3px;
                            font-weight: 950;
                            font-size: 11px;
                        }
                        .table-title {
                            font-size: 10px;
                            font-weight: 950;
                            margin-top: 8px;
                            margin-bottom: 4px;
                            text-align: center;
                            border-bottom: 1px solid #000000;
                            padding-bottom: 2px;
                        }
                        .thermal-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 9px;
                        }
                        .thermal-table th {
                            border-bottom: 1px solid #000000;
                            padding: 3px 1px;
                            text-align: right;
                            font-weight: 800;
                        }
                        .thermal-table td {
                            padding: 4px 1px;
                            border-bottom: 1px solid #f1f5f9;
                        }
                        .footer {
                            border-top: 2px dashed #000000;
                            padding-top: 8px;
                            margin-top: 12px;
                            text-align: center;
                            font-size: 9px;
                        }
                    </style>
                    <div class="thermal-header">
                        <div class="store-logo">مركز البصريات الحديث المتطور</div>
                        <div style="font-size: 10px; font-weight: bold;">سند كشف حساب محاسبي مبسط</div>
                        <div class="report-title">${partnerType === 'customer' ? 'كشف العميل' : 'كشف المورد'}</div>
                    </div>

                    <div class="info-block">
                        <div class="info-row">
                            <span>الاسم الكامل:</span>
                            <strong style="font-size: 11px;">${partner.name}</strong>
                        </div>
                        <div class="info-row">
                            <span>رقم الهاتف:</span>
                            <strong style="font-family: monospace;">${partner.phone || 'غير مدرج'}</strong>
                        </div>
                        <div class="info-row">
                            <span>تاريخ الإصدار:</span>
                            <span>${dateStr}</span>
                        </div>
                    </div>

                    <div class="financial-box">
                        <div class="fin-row">
                            <span>المبيعات/المشتريات:</span>
                            <strong>${(totalPurchases || 0).toLocaleString()} YER</strong>
                        </div>
                        <div class="fin-row">
                            <span>إجمالي المدفوع:</span>
                            <strong>${(totalPayments || 0).toLocaleString()} YER</strong>
                        </div>
                        <div class="fin-row total" style="color: ${partner.balance > 0 ? '#b91c1c' : '#047857'}">
                            <span>الرصيد المتبقي:</span>
                            <strong>${(partner.balance || 0).toLocaleString()} YER</strong>
                        </div>
                    </div>

                    ${partnerType === 'customer' && opticalProfileForm.customerNotes ? `
                    <div style="border: 1px dashed #000000; border-radius: 4px; padding: 6px; margin: 8px 0; font-size: 9px; bg: #fffbeb;">
                        <strong style="display: block; font-size: 10px; margin-bottom: 2px; color: #7c2d12;">مقاسات ومواصفات النظر:</strong>
                        <p style="margin: 0; white-space: pre-wrap; font-weight: bold; font-size: 10px; line-height: 1.3;">${opticalProfileForm.customerNotes}</p>
                    </div>
                    ` : ''}

                    <div class="table-title">كشف حساب تفصيلي (مدين / دائن)</div>
                    <table class="thermal-table">
                        <thead>
                            <tr>
                                <th style="width: 22%;">التاريخ</th>
                                <th style="width: 33%;">البيان</th>
                                <th style="width: 15%; text-align: left;">عليه</th>
                                <th style="width: 15%; text-align: left;">له</th>
                                <th style="width: 15%; text-align: left;">رصيد</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${displayTimeline.slice(0, 30).map(item => `
                                <tr>
                                    <td>${new Date(item.date).toLocaleDateString('ar-YE', {month: 'numeric', day: 'numeric'})}</td>
                                    <td>${item.description}</td>
                                    <td style="text-align: left; font-family: monospace;">${item.debit > 0 ? item.debit.toLocaleString() : '-'}</td>
                                    <td style="text-align: left; font-family: monospace;">${item.credit > 0 ? item.credit.toLocaleString() : '-'}</td>
                                    <td style="text-align: left; font-family: monospace; font-weight: bold;">${item.balance.toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div>شكراً لتعاملكم الراقي معنا</div>
                        <div style="font-weight: 900; margin-top: 3px; font-size: 10px;">مركز البصريات الحديث المتطور</div>
                        <div style="font-size: 8px; color: #475569; margin-top: 4px;">Generated by ASSAR Optical Accounting<br>Designed & Developed By Mohammed Assubaihi | 779391682</div>
                    </div>
            `;
        } else {
            // Professional A4 Format (also used for PDF export format)
            const timelineRows = displayTimeline.map(item => `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 12px;">
                        ${new Date(item.date).toLocaleDateString('ar-YE')}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e293b;">
                        ${item.description}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left; color: #b91c1c;">
                        ${item.debit > 0 ? item.debit.toLocaleString() : '-'}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left; color: #047857;">
                        ${item.credit > 0 ? item.credit.toLocaleString() : '-'}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 900; font-size: 13px; text-align: left;">
                        ${item.balance.toLocaleString()}
                    </td>
                </tr>
            `).join('');

            const opticalSection = partnerType === 'customer' ? `
                <div class="section-title">المواصفات ومقاسات النظر الطبية للعميل</div>
                <div class="optical-grid">
                    <div class="spec-card">
                        <strong>تكرارية الزيارة والشراء:</strong>
                        <span>${opticalProfileForm.purchaseFrequency || 'مستمر / نشط'}</span>
                    </div>
                    <div class="spec-card">
                        <strong>نوع الإطار المفضل للعميل:</strong>
                        <span>${opticalProfileForm.preferredFrameType || 'كامل الإطار'}</span>
                    </div>
                    <div class="spec-card">
                        <strong>الماركة المفضلة والنظارات:</strong>
                        <span>${opticalProfileForm.preferredBrand || 'Ray-Ban'}</span>
                    </div>
                    <div class="spec-card">
                        <strong>تاريخ الفحص البصري الأخير:</strong>
                        <span style="font-family: monospace;">${opticalProfileForm.lastPurchaseDate || 'لا يوجد'}</span>
                    </div>
                    <div class="spec-notes">
                        <strong>تفاصيل فحص ومقياس النظر المسجلة (SPH / CYL / AXIS):</strong>
                        <p style="margin: 5px 0 0 0; white-space: pre-wrap; font-weight: bold; color: #0f172a; line-height: 1.6;">
                            ${opticalProfileForm.customerNotes || 'لا يوجد ملاحظات طبية مضافة حالياً'}
                        </p>
                    </div>
                </div>
            ` : '';

            printHTML = `
                    <style>
                        .header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border-bottom: 3px solid #1e3a8a;
                            padding-bottom: 15px;
                            margin-bottom: 25px;
                        }
                        .store-logo {
                            font-size: 20px;
                            font-weight: 900;
                            color: #1e3a8a;
                        }
                        .report-title {
                            font-size: 18px;
                            font-weight: 800;
                            color: #0f172a;
                        }
                        .date-indicator {
                            font-size: 11px;
                            color: #64748b;
                            font-weight: bold;
                        }
                        .section-title {
                            font-size: 13px;
                            font-weight: 900;
                            color: #1e3a8a;
                            background: #eff6ff;
                            padding: 6px 12px;
                            border-right: 4px solid #3b82f6;
                            border-radius: 4px;
                            margin-top: 25px;
                            margin-bottom: 12px;
                        }
                        .info-grid {
                            display: grid;
                            grid-template-cols: 1fr 1fr;
                            gap: 15px;
                            margin-bottom: 25px;
                            font-size: 12px;
                        }
                        .info-item {
                            background: #f8fafc;
                            padding: 10px 14px;
                            border-radius: 8px;
                            border: 1px solid #e2e8f0;
                        }
                        .info-item strong {
                            color: #475569;
                            display: block;
                            font-size: 10px;
                            margin-bottom: 4px;
                        }
                        .financial-grid {
                            display: grid;
                            grid-template-cols: repeat(3, 1fr);
                            gap: 15px;
                            margin-bottom: 25px;
                        }
                        .financial-card {
                            border: 1px solid #e2e8f0;
                            border-radius: 12px;
                            padding: 12px;
                            text-align: center;
                        }
                        .financial-card.balance {
                            background: #fef2f2;
                            border-color: #fee2e2;
                        }
                        .financial-card.balance-zero {
                            background: #ecfdf5;
                            border-color: #d1fae5;
                        }
                        .card-label {
                            font-size: 10px;
                            font-weight: 700;
                            color: #64748b;
                            margin-bottom: 6px;
                        }
                        .card-val {
                            font-size: 16px;
                            font-weight: 900;
                            font-family: monospace;
                            color: #0f172a;
                        }
                        .optical-grid {
                            display: grid;
                            grid-template-cols: 1fr 1fr;
                            gap: 12px;
                            margin-bottom: 25px;
                            font-size: 11px;
                        }
                        .spec-card {
                            background: #fafaf9;
                            border: 1px solid #e7e5e4;
                            padding: 8px 12px;
                            border-radius: 8px;
                        }
                        .spec-card strong {
                            display: block;
                            color: #78716c;
                            margin-bottom: 3px;
                        }
                        .spec-notes {
                            grid-column: span 2;
                            background: #fffbeb;
                            border: 1px solid #fde68a;
                            padding: 12px;
                            border-radius: 10px;
                        }
                        .spec-notes strong {
                            display: block;
                            color: #b45309;
                            margin-bottom: 4px;
                        }
                        .table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 10px;
                            font-size: 11px;
                        }
                        .table th {
                            background-color: #f1f5f9;
                            color: #475569;
                            font-weight: 800;
                            text-align: right;
                            padding: 10px;
                            border-bottom: 2px solid #cbd5e1;
                        }
                        .table td {
                            padding: 10px;
                            border-bottom: 1px solid #e2e8f0;
                        }
                        .footer {
                            margin-top: 45px;
                            border-top: 1px solid #e2e8f0;
                            padding-top: 15px;
                            display: flex;
                            justify-content: space-between;
                            font-size: 11px;
                            color: #64748b;
                        }
                        .signature-box {
                            text-align: center;
                        }
                        .signature-line {
                            border-top: 1px dashed #cbd5e1;
                            width: 150px;
                            margin-top: 35px;
                            padding-top: 4px;
                        }
                    </style>
                    <div class="header">
                        <div>
                            <div class="store-logo">مركز البصريات الحديث المتطور</div>
                            <div class="report-title">تقرير كشف حساب مالي وتفصيلي</div>
                        </div>
                        <div class="date-indicator">
                            تاريخ الإصدار: ${dateStr}
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <strong>الاسم الكامل للـطرف:</strong>
                            <span style="font-size: 13px; font-weight: 800; color: #0f172a;">${partner.name}</span>
                        </div>
                        <div class="info-item">
                            <strong>طبيعة الحساب:</strong>
                            <span style="font-weight: bold; color: #1e3a8a;">${partnerType === 'customer' ? 'عميل كاشير مبيعات' : 'مورد مواد ومشتريات'}</span>
                        </div>
                        <div class="info-item">
                            <strong>رقم الجوال الفعال:</strong>
                            <span style="font-family: monospace; font-size: 12px; font-weight: bold;">${partner.phone || 'غير مدرج'}</span>
                        </div>
                        <div class="info-item">
                            <strong>العنوان ومحل القيد:</strong>
                            <span>${partner.address || 'اليمن'}</span>
                        </div>
                    </div>

                    <div class="section-title">الملخص والموقف المالي الحالي</div>
                    <div class="financial-grid">
                        <div class="financial-card">
                            <div class="card-label">إجمالي التعاملات المعتمدة</div>
                            <div class="card-val">${(totalPurchases || 0).toLocaleString()} <span style="font-size: 10px;">YER</span></div>
                        </div>
                        <div class="financial-card">
                            <div class="card-label">إجمالي الدفعات المقبوضة</div>
                            <div class="card-val" style="color: #2563eb;">${(totalPayments || 0).toLocaleString()} <span style="font-size: 10px;">YER</span></div>
                        </div>
                        <div class="financial-card ${partner.balance > 0 ? 'balance' : 'balance-zero'}">
                            <div class="card-label" style="color: ${partner.balance > 0 ? '#b91c1c' : '#047857'}">الرصيد المتبقي المستحق</div>
                            <div class="card-val" style="color: ${partner.balance > 0 ? '#b91c1c' : '#047857'}">${(partner.balance || 0).toLocaleString()} <span style="font-size: 10px;">YER</span></div>
                        </div>
                    </div>

                    ${opticalSection}

                    <div class="section-title">كشف حساب تفصيلي (مدين / دائن)</div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th style="width: 15%;">التاريخ</th>
                                <th style="width: 40%;">البيان والتفاصيل</th>
                                <th style="width: 15%; text-align: left;">مدين (عليه)</th>
                                <th style="width: 15%; text-align: left;">دائن (له)</th>
                                <th style="width: 15%; text-align: left;">الرصيد</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${timelineRows.length > 0 ? timelineRows : '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">لا يوجد أي عمليات مدونة في الأرشيف المالي للعميل.</td></tr>'}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div>
                            نظام إدارة البصريات الذكي - تم توليد التقرير إلكترونياً
                            <div style="font-size: 9px; font-weight: bold; margin-top: 5px;">Generated by ASSAR Optical Accounting<br>Designed & Developed By Mohammed Assubaihi | Mobile: 779391682</div>
                        </div>
                        <div class="signature-box">
                            توقيع المحاسب / الإدارة
                            <div class="signature-line"></div>
                        </div>
                    </div>
            `;
        }

        setPrintPreview({
            isOpen: true,
            html: printHTML,
            title: `كشف حساب - ${partner.name}`,
            size: printFormat === 'thermal' ? 'thermal' : 'a4'
        });
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#0b0f19] relative transition-colors duration-300">
            <header className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50 dark:bg-[#131b2e] sticky top-0 z-10 rounded-t-xl transition-colors">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 cursor-pointer">
                        <ArrowRight size={20} />
                    </button>
                    <div>
                        <h2 className="font-extrabold text-slate-800 dark:text-white text-sm leading-tight">{partner.name}</h2>
                        <span className="text-[10px] font-black uppercase text-slate-450 dark:text-slate-400">{partnerType === 'customer' ? 'العميل بـالمركز البصري' : 'المورد المعتمد للـنظارات'}</span>
                    </div>
                </div>
            </header>

            <PrintPreviewModal 
                isOpen={printPreview.isOpen}
                onClose={() => setPrintPreview(prev => ({ ...prev, isOpen: false }))}
                htmlContent={printPreview.html}
                title={printPreview.title}
                paperSize={printPreview.size}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 bg-white dark:bg-[#0b0f19] transition-colors">
                
                {/* Column 1: Financial & Optometric Details */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Financial Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className={cn(
                            "p-4 rounded-2xl border flex flex-col justify-between transition-colors", 
                            calculatedBalance > 0 
                                ? "bg-rose-50/70 border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/20" 
                                : "bg-emerald-50/70 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20"
                        )}>
                            <span className={cn("text-[9px] uppercase font-black mb-1", calculatedBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                                الرصيد المستحق
                            </span>
                            <span className={cn("font-mono font-black text-sm sm:text-base tracking-tighter", calculatedBalance > 0 ? "text-rose-950 dark:text-rose-200" : "text-emerald-950 dark:text-emerald-200")}>
                                {(calculatedBalance || 0).toLocaleString()} <span className="text-[10px]">YER</span>
                            </span>
                        </div>
                        
                        <div className="p-4 rounded-2xl border bg-slate-50 border-slate-200/60 dark:bg-slate-900/40 dark:border-slate-800 flex flex-col justify-between transition-colors">
                            <span className="text-[9px] uppercase font-black mb-1 text-slate-500 dark:text-slate-450">
                                إجمالي التعاملات المعتمدة
                            </span>
                            <span className="font-mono font-black text-sm sm:text-base tracking-tighter text-slate-800 dark:text-slate-100">
                                {(totalPurchases || 0).toLocaleString()} <span className="text-[10px]">YER</span>
                            </span>
                        </div>

                        <div className="col-span-2 p-3 rounded-xl border bg-blue-50/70 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-between transition-colors">
                            <span className="text-[10px] uppercase font-black text-blue-600 dark:text-blue-400">
                                {partnerType === 'customer' ? 'إجمالي الدفعات المقبوضة' : 'إجمالي الدفعات المصروفة'}
                            </span>
                            <span className="font-mono font-black text-xs sm:text-sm tracking-tighter text-blue-900 dark:text-blue-250">
                                {(totalPayments || 0).toLocaleString()} YER
                            </span>
                        </div>
                    </div>

                    {/* Patient/Ophthalmic Profile Section (Visible for Customers only) */}
                    {partnerType === 'customer' && (
                        <div className="bg-slate-50/50 dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-4 transition-colors">
                            <div className="flex justify-between items-center text-xs">
                                <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-1.5"><Sparkles size={16} className="text-blue-600 dark:text-blue-400 animate-pulse" /> وثيقة المقاسات البصرية للزبون</h3>
                                <button
                                    onClick={() => setIsEditingOptical(!isEditingOptical)}
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-extrabold flex items-center gap-1 cursor-pointer text-[10px]"
                                >
                                    {isEditingOptical ? "إلغاء التعديل" : <span className="flex items-center gap-1"><Edit size={12} />تعديل المقاسات</span>}
                                </button>
                            </div>

                            {isEditingOptical ? (
                                <div className="space-y-3.5 text-xs">
                                    <div className="space-y-1">
                                        <label className="text-slate-500 dark:text-slate-400 font-bold block">نوع الإطار المفضل:</label>
                                        <input 
                                            type="text"
                                            className="w-full px-3 py-2 border dark:border-slate-800 rounded-xl bg-white dark:bg-[#0b0f19] dark:text-white focus:outline-blue-500 text-xs"
                                            placeholder="كامل، نصف إطار، بدون إطار..."
                                            value={opticalProfileForm.preferredFrameType}
                                            onChange={(e) => setOpticalProfileForm({...opticalProfileForm, preferredFrameType: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-slate-500 dark:text-slate-400 font-bold block">الماركة التجارية المفضلة:</label>
                                        <input 
                                            type="text"
                                            className="w-full px-3 py-2 border dark:border-slate-800 rounded-xl bg-white dark:bg-[#0b0f19] dark:text-white focus:outline-blue-500 text-xs"
                                            placeholder="Ray-Ban, Carrera, etc."
                                            value={opticalProfileForm.preferredBrand}
                                            onChange={(e) => setOpticalProfileForm({...opticalProfileForm, preferredBrand: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-slate-500 dark:text-slate-400 font-bold block">معدل شراء النظارات:</label>
                                        <select 
                                            className="w-full px-3 py-2 border dark:border-slate-800 rounded-xl bg-white dark:bg-[#0b0f19] dark:text-white focus:outline-blue-500 text-xs"
                                            value={opticalProfileForm.purchaseFrequency}
                                            onChange={(e) => setOpticalProfileForm({...opticalProfileForm, purchaseFrequency: e.target.value})}
                                        >
                                            <option value="نشط (دائم)">نشط (دائم)</option>
                                            <option value="موسمي">موسمي</option>
                                            <option value="نادر">نادر</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-slate-500 dark:text-slate-400 font-bold block">توقيع آخر فحص/تاريخ شراء:</label>
                                        <input 
                                            type="date"
                                            className="w-full px-3 py-2 border dark:border-slate-800 rounded-xl bg-white dark:bg-[#0b0f19] dark:text-white font-mono text-[11px] focus:outline-blue-500"
                                            value={opticalProfileForm.lastPurchaseDate}
                                            onChange={(e) => setOpticalProfileForm({...opticalProfileForm, lastPurchaseDate: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-slate-500 dark:text-slate-400 font-bold block">تفاصيل مقاس النظر (SPH / CYL / AXIS) وملاحظات:</label>
                                        <textarea 
                                            className="w-full px-3 py-2 border dark:border-slate-800 rounded-xl bg-white dark:bg-[#0b0f19] dark:text-white h-20 text-xs focus:outline-blue-500"
                                            placeholder="العين اليمنى RE ... العين اليسرى LE ... متبقي الإضافة ADD"
                                            value={opticalProfileForm.customerNotes}
                                            onChange={(e) => setOpticalProfileForm({...opticalProfileForm, customerNotes: e.target.value})}
                                        />
                                    </div>
                                    <button
                                        onClick={saveOpticalProfile}
                                        disabled={updating}
                                        className="w-full bg-blue-600 text-white py-2 rounded-xl font-black flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 hover:bg-blue-700 cursor-pointer text-xs"
                                    >
                                        <Save size={14} /> {updating ? "جاري التحديث..." : "حفظ مواصفات النظر"}
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                    <div className="bg-white dark:bg-[#0b0f19] rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                                        <span className="text-slate-400 dark:text-slate-500 font-bold block text-[10px] mb-0.5">نوع الإطار المفضل:</span>
                                        {opticalProfileForm.preferredFrameType || "غير محدد"}
                                    </div>
                                    <div className="bg-white dark:bg-[#0b0f19] rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                                        <span className="text-slate-400 dark:text-slate-500 font-bold block text-[10px] mb-0.5">الماركة المفضلة:</span>
                                        {opticalProfileForm.preferredBrand || "غير محدد"}
                                    </div>
                                    <div className="bg-white dark:bg-[#0b0f19] rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                                        <span className="text-slate-400 dark:text-slate-500 font-bold block text-[10px] mb-0.5">تكرارية الزيارة:</span>
                                        {opticalProfileForm.purchaseFrequency || "نشط"}
                                    </div>
                                    <div className="bg-white dark:bg-[#0b0f19] rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                                        <span className="text-slate-400 dark:text-slate-500 font-bold block text-[10px] mb-0.5">تاريخ الفحص الأخير:</span>
                                        <span className="font-mono text-slate-800 dark:text-slate-200">{opticalProfileForm.lastPurchaseDate || "غير محدد"}</span>
                                    </div>
                                    <div className="col-span-2 bg-white dark:bg-[#0b0f19] rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                                        <span className="text-slate-400 dark:text-slate-500 font-bold block text-[10px] mb-1">تفاصيل ومقاس النظارة الحالي المقرّب:</span>
                                        {opticalProfileForm.customerNotes ? (
                                            <p className="text-[11px] text-slate-800 dark:text-slate-200 leading-relaxed font-black whitespace-pre-wrap">{opticalProfileForm.customerNotes}</p>
                                        ) : (
                                            <span className="text-slate-300 dark:text-slate-600 italic text-[11px]">لا يوجد ملاحظات نظر ومقاسات مضافة لهذه البطاقة حالياً.</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Info summary */}
                    <div className="bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-3 transition-colors">
                        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                            <Phone size={15} className="text-blue-500" />
                            <span className="font-bold text-xs font-mono">{partner.phone || 'غير مدرج'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                            <MapPin size={15} className="text-blue-500" />
                            <span className="font-medium text-xs leading-tight">{partner.address || 'غير مدرج'}</span>
                        </div>
                    </div>
                </div>

                {/* Column 2: Timeline (History of Invoices & Payments) */}
                <div className="lg:col-span-5 space-y-4">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white mb-2 px-1 uppercase tracking-wide">سجل المبيعات والمدفوعات البصرية</h3>
                    <div className="space-y-4 relative before:content-[''] before:absolute before:right-5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800/80">
                        {visualTimelineWithBalance.map((item, idx) => (
                            <div key={idx} className="relative flex items-start gap-3">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-[#0b0f19] relative z-10 shadow-sm transition-colors",
                                    item.type === 'invoice' 
                                        ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" 
                                        : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                )}>
                                    {item.type === 'invoice' ? <FileText size={14} /> : <Wallet size={14} />}
                                </div>
                                <div className="bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex-1 text-xs transition-colors space-y-3">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-black text-slate-850 dark:text-slate-100">{item.title}</p>
                                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">{item.description}</p>
                                        </div>
                                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold flex items-center gap-0.5 shrink-0">
                                            <Calendar size={10} /> {item.date ? new Date(item.date).toLocaleDateString("ar-EG") : 'غير محدد'}
                                        </p>
                                    </div>

                                    {item.type === 'invoice' ? (
                                        <>
                                            {/* Invoice Financial details */}
                                            <div className="grid grid-cols-2 gap-2 bg-slate-50/70 dark:bg-[#0c1222] p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800/80 text-[10px]">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-450 dark:text-slate-400 font-bold">الإجمالي:</span>
                                                    <span className="font-mono font-black text-slate-700 dark:text-slate-300">{item.total.toLocaleString()} YER</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-450 dark:text-slate-400 font-bold">الخصم:</span>
                                                    <span className="font-mono font-black text-rose-600 dark:text-rose-400">{item.discount > 0 ? `-${item.discount.toLocaleString()}` : '0'} YER</span>
                                                </div>
                                                <div className="col-span-2 border-t border-dashed border-slate-200 dark:border-slate-800 my-0.5"></div>
                                                <div className="flex justify-between">
                                                    <span className="text-blue-600 dark:text-blue-400 font-extrabold">الصافي:</span>
                                                    <span className="font-mono font-black text-blue-700 dark:text-blue-300">{item.netAmount.toLocaleString()} YER</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">المدفوع:</span>
                                                    <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">{item.paid.toLocaleString()} YER</span>
                                                </div>
                                                <div className="col-span-2 border-t border-dashed border-slate-200 dark:border-slate-800 my-0.5"></div>
                                                <div className="flex justify-between col-span-2 text-slate-800 dark:text-slate-200">
                                                    <span className="font-black">المتبقي بالفاتورة:</span>
                                                    <span className="font-mono font-black text-rose-600 dark:text-rose-400">{item.remaining.toLocaleString()} YER</span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center text-[9px] font-black text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                                                <span>الحالة: {item.remaining === 0 ? <span className="text-emerald-600">خالصة تماماً</span> : <span className="text-rose-600">عليها متبقي</span>}</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-black">الرصيد الجاري: {item.balance.toLocaleString()} YER</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-baseline gap-1 pt-1">
                                                <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">المبلغ المستلم:</span>
                                                <span className="font-mono font-black text-xs text-emerald-700 dark:text-emerald-300">{item.amount.toLocaleString()} YER</span>
                                            </div>
                                            <div className="flex justify-between items-center text-[9px] font-black text-blue-600 dark:text-blue-400 border-t border-slate-100 dark:border-slate-800 pt-2 text-left">
                                                {hasPermission(null, 'global_delete') && (
                                                    <button onClick={() => handleDeleteTransaction(item.id)} className="text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1 font-bold">
                                                        <Trash2 size={10} /> حذف
                                                    </button>
                                                )}
                                                <span>الرصيد الجاري: {item.balance.toLocaleString()} YER</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        {visualTimelineWithBalance.length === 0 && (
                            <div className="pl-6 text-center py-10 text-slate-400 dark:text-slate-600 text-xs font-bold">لا يوجد أي عمليات مدونة في الأرشيف المالي للعميل.</div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 shrink-0 transition-colors">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                        <Printer size={12} className="text-blue-500" />
                        تحديد شكل ونوع طباعة التقرير المحاسبي:
                    </span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-black">
                        {printFormat === 'a4' ? 'نموذج A4 رسمي' : printFormat === 'thermal' ? 'كاشير حراري 80mm' : 'حفظ كـ PDF'}
                    </span>
                </div>

                {/* Elegant Segmented Switcher */}
                <div className="grid grid-cols-3 gap-1 bg-slate-200/50 dark:bg-slate-900/60 p-1 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setPrintFormat('a4')}
                        className={cn(
                            "flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-black tracking-tight transition-all cursor-pointer",
                            printFormat === 'a4' 
                                ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm font-black" 
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        )}
                    >
                        <FileText size={13} />
                        <span>رسمي A4</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPrintFormat('thermal')}
                        className={cn(
                            "flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-black tracking-tight transition-all cursor-pointer",
                            printFormat === 'thermal' 
                                ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm font-black" 
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        )}
                    >
                        <Receipt size={13} />
                        <span>كاشير (80mm)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPrintFormat('pdf')}
                        className={cn(
                            "flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-black tracking-tight transition-all cursor-pointer",
                            printFormat === 'pdf' 
                                ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm font-black" 
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        )}
                    >
                        <FileDown size={13} />
                        <span>تحميل PDF</span>
                    </button>
                </div>

                {/* Explanatory subtitle helper based on selected print mode */}
                <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-normal font-black bg-slate-100/30 dark:bg-slate-900/20 py-1.5 px-2 rounded-lg">
                    {printFormat === 'a4' && "يولّد تقرير مالي ملوّن ومنسّق متوافق مع ورق A4 للمراسلات الرسمية الكبيرة."}
                    {printFormat === 'thermal' && "تنسيق مخصص لطابعات الفواتير الحرارية 80 ملم لحماية الورق والطباعة الفورية."}
                    {printFormat === 'pdf' && "يفتح نافذة الحفظ كملف PDF مع تسمية الحفظ باسم الطرف تلقائياً لتسهيل المشاركة."}
                </div>

                {/* Main Print Execution Button */}
                <button 
                    onClick={handlePrintStatement}
                    className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-extrabold rounded-xl py-3 flex items-center justify-center gap-2 shadow-lg cursor-pointer text-xs"
                >
                    <Printer size={15} /> 
                    {printFormat === 'a4' && "طباعة كشف حساب A4"}
                    {printFormat === 'thermal' && "طباعة إيصال كاشير حراري"}
                    {printFormat === 'pdf' && "تحميل وتصدير بصيغة PDF"}
                </button>
            </div>
        </div>
    );
}
