import React, { useState, useEffect, useRef } from "react";
import { Save, Plus, ArrowRight, Wallet, User, Hash, FileText, Phone, Printer, Info, List as ListIcon, X } from "lucide-react";
import { dbService } from "../services/db";
import { QuickFinancialEntry, QuickEntryType, Currency, InvoiceStatus, CashBox, StoreSettings, AppUser } from "../types";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface QuickEntryProps {
    onNavigate: (page: string, params?: any) => void;
    editId?: string | null;
}

const ENTRY_TYPES: { value: QuickEntryType; label: string; color: string }[] = [
    { value: 'manual_sale', label: 'مبيعات يدوية', color: 'blue' },
    { value: 'manual_purchase', label: 'مشتريات يدوية', color: 'rose' },
    { value: 'receipt', label: 'سند قبض', color: 'emerald' },
    { value: 'payment', label: 'سند صرف', color: 'amber' },
    { value: 'adjustment', label: 'تسوية مالية', color: 'slate' }
];

const ENTRY_TYPE_LABELS: Record<string, string> = {
    manual_sale: "مبيعات يدوية",
    manual_purchase: "مشتريات يدوية",
    receipt: "سند قبض",
    payment: "سند صرف",
    adjustment: "تسوية مالية"
};

export default function QuickEntry({ onNavigate, editId }: QuickEntryProps) {
    const [entryType, setEntryType] = useState<QuickEntryType>('manual_sale');
    const [referenceNumber, setReferenceNumber] = useState("");
    const [partnerType, setPartnerType] = useState<'customer' | 'supplier' | 'none'>('customer');
    const [partnerName, setPartnerName] = useState("");
    const [partnerPhone, setPartnerPhone] = useState("");
    
    // Financial Fields
    const [amount, setAmount] = useState("");
    const [discount, setDiscount] = useState("");
    const [paidAmount, setPaidAmount] = useState("");
    const [currency, setCurrency] = useState<Currency>("YER");
    
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [selectedCashBoxId, setSelectedCashBoxId] = useState("");
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
    const [oldEntryData, setOldEntryData] = useState<QuickFinancialEntry | null>(null);
    
    const partnerRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const amountRef = useRef<HTMLInputElement>(null);

    // Computations
    const numAmount = parseFloat(amount) || 0;
    const numDiscount = parseFloat(discount) || 0;
    const netAmount = Math.max(0, numAmount - numDiscount);
    const numPaid = paidAmount === "" ? netAmount : (parseFloat(paidAmount) || 0);
    const remainingAmount = netAmount - numPaid;

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            try {
                const [boxes, allSettings] = await Promise.all([
                    dbService.getAll("cashBoxes"),
                    dbService.getStoreSettings()
                ]);
                setCashBoxes(boxes as CashBox[]);
                setSettings(allSettings);

                const savedUser = localStorage.getItem("app_user");
                if (savedUser) setCurrentUser(JSON.parse(savedUser));

                if (editId) {
                    const allEntries = await dbService.getAll("quick_financial_entries") as QuickFinancialEntry[];
                    const toEdit = allEntries.find(e => e.id === editId);
                    if (toEdit) {
                        setOldEntryData(toEdit);
                        setEntryType(toEdit.entryType);
                        setReferenceNumber(toEdit.referenceNumber || "");
                        setPartnerType(toEdit.partnerType);
                        setPartnerName(toEdit.partnerName);
                        setPartnerPhone(toEdit.partnerPhone || "");
                        setAmount(toEdit.amount.toString());
                        setDiscount(toEdit.discount.toString());
                        setPaidAmount(toEdit.paidAmount.toString());
                        setCurrency(toEdit.currency || "YER");
                        setNotes(toEdit.notes || "");
                        setSelectedCashBoxId(toEdit.cashBoxId || "");
                    }
                } else if (boxes.length === 1) {
                    setSelectedCashBoxId((boxes as CashBox[])[0].id || "");
                }
            } catch (err) {
                console.error("Failed to init QuickEntry", err);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [editId]);

    const handleSave = async (printAfter: boolean = false) => {
        if (partnerType !== 'none' && !partnerName.trim()) {
            alert("يرجى إدخال اسم العميل/المورد");
            return;
        }

        if (!amount || isNaN(numAmount) || numAmount <= 0) {
            alert("يرجى إدخال مبلغ صحيح");
            return;
        }

        if (numPaid > 0 && (!cashBoxes.length || !selectedCashBoxId)) {
            alert("يرجى اختيار الصندوق المالي للاستلام/الصرف");
            return;
        }

        setIsSaving(true);
        try {
            const status: InvoiceStatus = numPaid === 0 ? 'آجل' : (numPaid >= netAmount ? 'مدفوع' : 'جزئي');
            const selectedBox = cashBoxes.find(b => b.id === selectedCashBoxId);

            const entry: QuickFinancialEntry = {
                entryType,
                partnerType,
                partnerName: partnerType === 'none' ? 'إدخال عام' : partnerName.trim(),
                partnerPhone: partnerPhone.trim(),
                amount: numAmount,
                discount: numDiscount,
                netAmount,
                paidAmount: numPaid,
                remainingAmount,
                paymentStatus: status,
                cashBoxId: numPaid > 0 ? selectedCashBoxId : undefined,
                cashBoxName: numPaid > 0 ? selectedBox?.name : undefined,
                notes,
                currency,
                referenceNumber,
                printCount: printAfter ? 1 : (oldEntryData?.printCount || 0),
                updatedAt: new Date().toISOString(),
                createdAt: oldEntryData?.createdAt || new Date().toISOString(),
                createdBy: oldEntryData?.createdBy || currentUser?.name || "مستخدم غير معرف"
            };

            let savedId = editId;
            if (editId && oldEntryData) {
                await dbService.updateQuickFinancialEntry(oldEntryData, entry);
            } else {
                savedId = await dbService.createQuickFinancialEntry(entry);
                entry.id = savedId;
            }

            if (printAfter) {
                doPrint({ ...entry, id: savedId || "" });
            }

            onNavigate('quick_entries_history');
        } catch (error) {
            console.error("Error QuickEntry:", error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setIsSaving(false);
        }
    };

    const doPrint = (entry: QuickFinancialEntry) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const isThermal = settings?.defaultPrintSize?.includes('80mm');
        const typeLabel = ENTRY_TYPE_LABELS[entry.entryType];

        printWindow.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <title>وصل مالي - ${entry.referenceNumber || 'جديد'}</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; margin: 0; padding: 20px; color: #333; }
                    .container { max-width: ${isThermal ? '80mm' : '800px'}; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px; }
                    .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
                    .title { font-size: 24px; font-weight: 900; color: #1e3a8a; margin: 10px 0; }
                    .info-grid { display: grid; grid-cols: 2; gap: 15px; margin-bottom: 20px; background: #f8fafc; padding: 15px; rounded: 8px; }
                    .info-item { display: flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding: 5px 0; }
                    .label { font-weight: 700; color: #64748b; }
                    .value { font-weight: 900; color: #0f172a; }
                    .amount-box { margin-top: 20px; border: 2px solid #3b82f6; padding: 15px; text-align: center; border-radius: 8px; background: #eff6ff; }
                    .amount-value { font-size: 28px; font-weight: 900; color: #1e40af; }
                    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        ${settings?.printLogo ? '<h2>[LOGO]</h2>' : ''}
                        <div class="title">${settings?.storeNameAr || 'مركز البصريات'}</div>
                        <div style="font-weight: 700; color: #3b82f6;">${entry.referenceNumber ? 'إيصال مالي رقم: ' + entry.referenceNumber : 'إيصال مالي سريع'}</div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item"><span class="label">نوع العملية:</span> <span class="value">${typeLabel}</span></div>
                        <div class="info-item"><span class="label">التاريخ:</span> <span class="value">${new Date(entry.createdAt).toLocaleDateString('ar-YE')}</span></div>
                        <div class="info-item"><span class="label">الطرف:</span> <span class="value">${entry.partnerName}</span></div>
                        <div class="info-item"><span class="label">الهاتف:</span> <span class="value">${entry.partnerPhone || '---'}</span></div>
                        <div class="info-item"><span class="label">الحالة:</span> <span class="value">${entry.paymentStatus}</span></div>
                        <div class="info-item"><span class="label">المستخدم:</span> <span class="value">${entry.createdBy}</span></div>
                    </div>

                    <div class="amount-box">
                        <div class="label">إجمالي المبلغ المقبوض/المصروف</div>
                        <div class="amount-value">${entry.amount.toLocaleString()} ${entry.currency}</div>
                        ${entry.discount > 0 ? `<div style="font-size: 14px; margin-top: 5px;">خصم: ${entry.discount.toLocaleString()}</div>` : ''}
                    </div>

                    <div style="margin-top: 20px; padding: 10px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
                        <div class="label" style="margin-bottom: 5px;">الملاحظات:</div>
                        <div style="font-size: 14px; font-weight: 700; line-height: 1.6;">${entry.notes || '---'}</div>
                    </div>

                    <div class="footer">
                        <div>العنوان: ${settings?.address || 'اليمن - صنعاء'}</div>
                        <div>هاتف التواصل: ${settings?.phone || '777XXXXXX'}</div>
                        <p>${settings?.printFooterText || 'شكراً لتعاملكم معنا'}</p>
                    </div>
                </div>
                <script>
                    window.onload = () => { window.print(); window.close(); };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm font-bold text-slate-500">جاري تحميل البيانات...</p>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto bg-slate-50 dark:bg-slate-950 min-h-full flex flex-col relative pb-[90px]">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => onNavigate('quick_entries_history')} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500">
                            <ArrowRight size={20} className="rotate-180" />
                        </button>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                {editId ? "تعديل العملية المالية" : "نظام الإدخال المالي السريع"}
                            </h2>
                            <div className="flex items-center gap-1.5 leading-none">
                                <span className={cn("inline-block w-1.5 h-1.5 rounded-full animate-pulse", editId ? "bg-amber-500" : "bg-blue-500")} />
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">النسخة الثانية V2 - مالي فقط</p>
                            </div>
                        </div>
                    </div>
                    {editId && (
                         <button 
                         onClick={() => onNavigate('quick_entries_history')}
                         className="p-2.5 bg-rose-50 dark:bg-rose-500/10 rounded-xl text-rose-600 transition-colors"
                     >
                         <X size={20} />
                     </button>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Warning Message */}
                <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3 rounded-2xl flex items-start gap-3">
                    <Info className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
                        الإدخال السريع مخصص للعمليات المالية اليدوية ونقل الحسابات. 
                        <span className="block mt-1 font-black underline decoration-amber-500/30 font-Cairo">تنبيه: هذا النظام لا يؤثر على المخزون أو كميات الأصناف.</span>
                    </p>
                </div>

                {/* Entry Type Selector */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {ENTRY_TYPES.map((type) => (
                        <button
                            key={type.value}
                            onClick={() => {
                                setEntryType(type.value);
                                if (type.value === 'manual_sale' || type.value === 'receipt') setPartnerType('customer');
                                else if (type.value === 'manual_purchase' || type.value === 'payment') setPartnerType('supplier');
                            }}
                            className={cn(
                                "py-2 px-1 rounded-xl text-[10px] font-black transition-all border text-center flex flex-col items-center justify-center gap-1",
                                entryType === type.value 
                                    ? `bg-${type.color}-600 border-${type.color}-600 text-white shadow-lg shadow-${type.color}-500/20` 
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300 dark:hover:border-slate-700"
                            )}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>

                {/* Main Form Card */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">نوع الطرف</label>
                            <select
                                value={partnerType}
                                onChange={(e) => setPartnerType(e.target.value as any)}
                                className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm font-bold focus:ring-1 focus:ring-blue-500/20 transition-all appearance-none"
                            >
                                <option value="customer">عميل</option>
                                <option value="supplier">مورد</option>
                                <option value="none">بدون طرف (عام)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">رقم المرجع (يدوي)</label>
                            <div className="relative">
                                <Hash className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-9 pl-4 text-sm font-bold font-mono focus:ring-1 focus:ring-blue-500/20 transition-all"
                                    placeholder="مثلاً: 2024/001"
                                />
                            </div>
                        </div>
                    </div>

                    {partnerType !== 'none' && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">الاسم</label>
                                <div className="relative">
                                    <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input
                                        ref={partnerRef}
                                        type="text"
                                        value={partnerName}
                                        onChange={(e) => setPartnerName(e.target.value)}
                                        className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-9 pl-4 text-sm font-bold focus:ring-1 focus:ring-blue-500/20 transition-all"
                                        placeholder={partnerType === 'customer' ? "اسم العميل" : "اسم المورد"}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">رقم الهاتف</label>
                                <div className="relative">
                                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input
                                        ref={phoneRef}
                                        type="tel"
                                        value={partnerPhone}
                                        onChange={(e) => setPartnerPhone(e.target.value)}
                                        className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-9 pl-4 text-sm font-bold font-mono focus:ring-1 focus:ring-blue-500/20 transition-all"
                                        placeholder="7XX XXX XXX"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <hr className="border-slate-100 dark:border-slate-800" />

                    {/* Money Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">إجمالي المبلغ</label>
                            <div className="relative">
                                <input
                                    ref={amountRef}
                                    type="number"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full h-[48px] bg-slate-100 dark:bg-slate-800/80 border-none rounded-xl px-4 text-xl font-black text-slate-900 dark:text-white text-center transition-all outline-none"
                                    placeholder="0.00"
                                />
                                <div className="absolute top-1/2 -translate-y-1/2 right-3 p-1 bg-white dark:bg-slate-700 rounded text-[9px] font-black text-slate-400 pointer-events-none">{currency}</div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">الخصم</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={discount}
                                onChange={(e) => setDiscount(e.target.value)}
                                className="w-full h-[48px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-center text-lg font-bold text-slate-600 dark:text-slate-300 font-mono"
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">المدفوع حالياً</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={paidAmount}
                                onChange={(e) => setPaidAmount(e.target.value)}
                                className="w-full h-[48px] bg-emerald-50 dark:bg-emerald-900/10 border-none rounded-xl text-center text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono"
                                placeholder={netAmount > 0 ? netAmount.toString() : "0"}
                            />
                        </div>
                    </div>

                    {numPaid > 0 && (
                        <div className="space-y-1.5 animate-fade-up">
                            <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">تأثير الصندوق المالي</label>
                            <div className="relative">
                                <Wallet className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500" size={14} />
                                <select
                                    value={selectedCashBoxId}
                                    onChange={(e) => setSelectedCashBoxId(e.target.value)}
                                    className="w-full h-[44px] bg-blue-50/50 dark:bg-blue-900/10 border-none rounded-xl pr-9 pl-4 text-sm font-bold text-blue-700 dark:text-blue-300 appearance-none"
                                >
                                    <option value="" disabled>اختر الصندوق المتأثر...</option>
                                    {cashBoxes.map(box => (
                                        <option key={box.id} value={box.id}>{box.name} ({box.balance.toLocaleString()} {box.currency})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-900 p-5 rounded-3xl flex flex-col justify-center">
                        <div className="flex justify-between items-center mb-2">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تحليل العملية</p>
                             <span className="text-white text-sm font-black font-mono">{netAmount.toLocaleString()} {currency}</span>
                        </div>
                        <div className="space-y-1">
                            <h4 className={cn(
                                "text-3xl font-black font-mono tracking-tighter",
                                remainingAmount > 0 ? "text-rose-400" : "text-emerald-400"
                            )}>
                                {remainingAmount.toLocaleString()}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">
                                {remainingAmount > 0 ? "يضاف إلى رصيد المديونية" : remainingAmount < 0 ? "مبلغ دفع زائد" : "مدفوعة بالكامل"}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">ملاحظات العملية</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full h-[90px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 text-xs font-bold text-slate-600 dark:text-slate-400 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none shadow-sm"
                            placeholder="اكتب ملاحظاتك البنكية أو اليدوية هنا..."
                        />
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="w-full px-4 pt-4 pb-6 mt-auto">
                <div className="max-w-md mx-auto flex gap-3">
                    <button
                        disabled={isSaving}
                        onClick={() => handleSave(false)}
                        className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-500/30 transition-all duration-300 flex items-center justify-center gap-2"
                    >
                        {isSaving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                        {editId ? "تحديث العملية" : "حفظ العملية"}
                    </button>
                    <button
                        disabled={isSaving}
                        onClick={() => handleSave(true)}
                        className="p-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 active:scale-95 text-slate-800 dark:text-white rounded-2xl transition-all"
                        title="حفظ وطباعة وصل"
                    >
                        <Printer size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
}
