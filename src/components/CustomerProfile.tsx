import { useState, useEffect } from "react";
import { ArrowRight, Phone, MapPin, Receipt, Wallet, Calendar, Sparkles, Save, Edit, Eye, UserPlus, Printer, FileText, FileDown } from "lucide-react";
import { dbService } from "../services/db";
import { Customer, Supplier, Invoice, Transaction, OpticalCustomerProfileData } from "../types";
import { cn } from "../lib/utils";

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

        setInvoices(allI.filter(i => i.partnerId === partnerId));
        setTransactions(allT.filter(t => t.partnerId === partnerId));
    };

    useEffect(() => {
        loadData();
    }, [partnerId, partnerType]);

    if (!partner) return <div className="p-10 text-center text-slate-400 font-bold block text-sm">جاري تنزيل الملف...</div>;

    const totalPurchases = invoices.filter(i => i.lifecycleStatus === 'معتمد' || !i.lifecycleStatus).reduce((acc, curr) => acc + (curr.total - curr.discount), 0);
    const totalPayments = transactions.reduce((acc, curr) => acc + curr.amount, 0);

    const timeline = [
        ...invoices.map(i => ({ type: 'invoice', date: i.createdAt, amount: (i.total - i.discount), notes: `فاتورة رقم ${i.id?.slice(0, 6)} - ${i.items.length} منتجات` })),
        ...transactions.map(t => ({ type: 'transaction', date: t.createdAt, amount: t.amount, notes: t.description || 'حركة مالية' }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

        // Open a new blank window to isolate styles and print cleanly
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("يرجى السماح بالنوافذ المنبثقة لطباعة كشف الحساب");
            return;
        }

        // Set page or document title to match customer name for PDF download suggestion
        if (printFormat === 'pdf') {
            printWindow.document.title = `كشف حساب - ${partner.name}`;
        } else {
            printWindow.document.title = `تقرير كشف حساب - ${partner.name}`;
        }

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
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8">
                    <title>كشف حساب حراري - ${partner.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
                        @page {
                            size: 80mm auto;
                            margin: 0;
                        }
                        body {
                            font-family: 'Cairo', sans-serif;
                            color: #000000;
                            background-color: #ffffff;
                            margin: 0;
                            padding: 4mm 3mm;
                            width: 74mm;
                            direction: rtl;
                            font-size: 11px;
                            line-height: 1.4;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .text-center { text-align: center; }
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
                </head>
                <body>
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

                    <div class="table-title">سجل المعاملات والمدفوعات</div>
                    <table class="thermal-table">
                        <thead>
                            <tr>
                                <th style="width: 25%;">التاريخ</th>
                                <th style="width: 45%;">نوع الحركة</th>
                                <th style="width: 30%; text-align: left;">المبلغ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${timeline.slice(0, 20).map(item => `
                                <tr>
                                    <td>${new Date(item.date).toLocaleDateString('ar-YE', {month: 'numeric', day: 'numeric'})}</td>
                                    <td>${item.type === 'invoice' ? 'فاتورة بيع' : 'سند مالي'}</td>
                                    <td style="text-align: left; font-family: monospace; font-weight: bold;">${(item.amount || 0).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div>شكراً لتعاملكم الراقي معنا</div>
                        <div style="font-weight: 900; margin-top: 3px; font-size: 10px;">مركز البصريات الحديث المتطور</div>
                        <div style="font-size: 8px; color: #475569; margin-top: 4px;">نظام البصريات الذكي الحديث</div>
                    </div>

                    <script>
                        window.onload = function() {
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 500);
                        };
                    </script>
                </body>
                </html>
            `;
        } else {
            // Professional A4 Format (also used for PDF export format)
            const timelineRows = timeline.map(item => `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 12px;">
                        ${new Date(item.date).toLocaleDateString('ar-YE')}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: ${item.type === 'invoice' ? '#4f46e5' : '#059669'};">
                        ${item.type === 'invoice' ? 'فاتورة مبيعات بصريات' : 'سند قبض نقدي / دفع'}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left;">
                        ${(item.amount || 0).toLocaleString()} YER
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 11px;">
                        ${item.notes || '-'}
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
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8">
                    <title>تقرير كشف حساب - ${partner.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
                        body {
                            font-family: 'Cairo', sans-serif;
                            color: #1e293b;
                            background-color: #ffffff;
                            margin: 0;
                            padding: 35px;
                            direction: rtl;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
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
                        @media print {
                            body {
                                padding: 15px;
                            }
                        }
                    </style>
                </head>
                <body>
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

                    <div class="section-title">سجل الحركات المالية والمبيعات التاريخية</div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th style="width: 15%;">تاريخ الحركة</th>
                                <th style="width: 25%;">نوع الحركة</th>
                                <th style="width: 20%; text-align: left;">المبلغ</th>
                                <th style="width: 40%;">ملاحظات وتفاصيل المعاملة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${timelineRows.length > 0 ? timelineRows : '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">لا يوجد أي عمليات مدونة في الأرشيف المالي للعميل.</td></tr>'}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div>
                            نظام إدارة البصريات الذكي - تم توليد التقرير إلكترونياً
                        </div>
                        <div class="signature-box">
                            توقيع المحاسب / الإدارة
                            <div class="signature-line"></div>
                        </div>
                    </div>

                    <script>
                        window.onload = function() {
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 500);
                        };
                    </script>
                </body>
                </html>
            `;
        }

        printWindow.document.open();
        printWindow.document.write(printHTML);
        printWindow.document.close();
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

            <div className="flex-1 overflow-y-auto p-4 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-6 bg-white dark:bg-[#0b0f19] transition-colors">
                
                {/* Column 1: Financial & Optometric Details */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Financial Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className={cn(
                            "p-4 rounded-2xl border flex flex-col justify-between transition-colors", 
                            partner.balance > 0 
                                ? "bg-rose-50/70 border-rose-100 dark:bg-rose-500/5 dark:border-rose-500/20" 
                                : "bg-emerald-50/70 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20"
                        )}>
                            <span className={cn("text-[9px] uppercase font-black mb-1", partner.balance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                                الرصيد المستحق
                            </span>
                            <span className={cn("font-mono font-black text-sm sm:text-base tracking-tighter", partner.balance > 0 ? "text-rose-950 dark:text-rose-200" : "text-emerald-950 dark:text-emerald-200")}>
                                {(partner.balance || 0).toLocaleString()} <span className="text-[10px]">YER</span>
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
                                إجمالي الدفعات المقبوضة
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
                        {timeline.map((item, idx) => (
                            <div key={idx} className="relative flex items-start gap-3">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-[#0b0f19] relative z-10 shadow-sm transition-colors",
                                    item.type === 'invoice' ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                )}>
                                    {item.type === 'invoice' ? <Receipt size={14} /> : <Wallet size={14} />}
                                </div>
                                <div className="bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl p-3 flex-1 text-xs transition-colors">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <p className="text-[10px] font-black text-slate-800 dark:text-slate-200">{item.type === 'invoice' ? 'فاتورة بيع نظارة' : 'قبض نقدي / سند'}</p>
                                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold flex items-center gap-0.5 shrink-0">
                                            <Calendar size={10} /> {item.date ? new Date(item.date).toLocaleDateString("ar-EG") : 'غير محدد'}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-mono font-black text-xs text-slate-900 dark:text-white">{(item.amount || 0).toLocaleString()} YER</span>
                                        <span className="text-[9px] text-slate-450 dark:text-slate-400 leading-normal">{item.notes}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {timeline.length === 0 && (
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
