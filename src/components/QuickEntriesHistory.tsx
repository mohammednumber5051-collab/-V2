import React, { useState, useEffect } from "react";
import { 
    Search, Filter, ArrowRight, Printer, FileText, Calendar, 
    Trash2, Edit3, User, Wallet, MoreHorizontal, ChevronLeft, 
    ChevronRight, X, Info, Download, LayoutGrid, List as ListIcon 
} from "lucide-react";
import { dbService } from "../services/db";
import { FinancialEngineService } from "../services/financialEngineService";
import { syncEngine } from "../services/syncEngine";
import { QuickFinancialEntry, StoreSettings, CashBox, AppUser } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import PrintPreviewModal from "./PrintPreviewModal";
import { format, isToday, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ar } from "date-fns/locale";

const safeNewDate = (val: any): Date => {
    if (!val) return new Date();
    if (typeof val === 'object' && val !== null && 'seconds' in val) {
        return new Date(val.seconds * 1000);
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) {
        return new Date();
    }
    return d;
};

interface QuickEntriesHistoryProps {
    onNavigate: (page: any, params?: any) => void;
    currentUser: AppUser;
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
    manual_sale: "مبيعات يدوية",
    manual_purchase: "مشتريات يدوية",
    receipt: "سند قبض",
    payment: "سند صرف",
    adjustment: "تسوية مالية"
};

const STATUS_COLORS: Record<string, string> = {
    "مدفوع": "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    "جزئي": "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    "آجل": "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
};

export default function QuickEntriesHistory({ onNavigate, currentUser }: QuickEntriesHistoryProps) {
    const [entries, setEntries] = useState<QuickFinancialEntry[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState<string>("all");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterBox, setFilterBox] = useState<string>(() => {
        const savedUser = localStorage.getItem("app_user");
        const u = savedUser ? JSON.parse(savedUser) : null;
        if (u?.assignedBoxId && u?.role !== 'SUPER_ADMIN' && u?.role !== 'ADMIN') {
            return u.assignedBoxId;
        }
        return "all";
    });
    const [filterDate, setFilterDate] = useState<string>("all"); // all, today, week, month, custom
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [showFilters, setShowFilters] = useState(false);

    // Print Preview State
    const [printPreview, setPrintPreview] = useState<{
        isOpen: boolean;
        html: string;
        title: string;
        size: 'a4' | 'thermal';
    }>({ isOpen: false, html: '', title: '', size: 'a4' });

    useEffect(() => {
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadData(true);
        });
        loadData();
        const fetchUsers = async () => {
            const allUsers = await dbService.getAll("users") as AppUser[];
            setUsers(allUsers);
        };
        fetchUsers();
        return unsubscribe;
    }, []);

    const loadData = async (reset: boolean = true) => {
        if (reset) {
            setIsLoadingInitial(true);
            setEntries([]);
            setLastDoc(null);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const [data, s, boxes] = await Promise.all([
                dbService.getPaginated("quick_financial_entries", 100, reset ? null : lastDoc, []),
                dbService.getStoreSettings(),
                dbService.getAll("cashBoxes")
            ]);
            
            const processedData = (data.data as QuickFinancialEntry[]).reduce((acc: QuickFinancialEntry[], entry: QuickFinancialEntry) => {
                if (!entry.referenceNumber) {
                    acc.push(entry);
                    return acc;
                }
                const existingIndex = acc.findIndex(e => e.referenceNumber === entry.referenceNumber);
                if (existingIndex !== -1) {
                    // If we have manual_sale, keep it
                    if (acc[existingIndex].entryType === 'manual_sale') return acc;
                    // If current is manual_sale, replace
                    if (entry.entryType === 'manual_sale') {
                        acc[existingIndex] = entry;
                    }
                    return acc;
                }
                acc.push(entry);
                return acc;
            }, []);

            setEntries(prev => {
                if (reset) return processedData;
                const existingIds = new Set(prev.map(e => e.id).filter(Boolean));
                const filteredNew = processedData.filter(e => !existingIds.has(e.id));
                return [...prev, ...filteredNew];
            });
            setLastDoc(data.lastDoc);
            setHasMore(data.hasMore);
            if (reset) {
                setSettings(s);
                setCashBoxes(boxes as CashBox[]);
            }
        } catch (error) {
            console.error("Failed to load data", error);
        } finally {
            setIsLoadingInitial(false);
            setIsLoadingMore(false);
        }
    };

    const handleDelete = async (entry: QuickFinancialEntry) => {
        if (!confirm("هل أنت متأكد من حذف هذه العملية المالية؟ سيتم التراجع عن كافه الآثار المالية (رصيد الصندوق ورصيد الطرف).")) return;
        
        // Check for negative cashbox balance before deletion
        if (entry.cashBoxId && entry.paidAmount > 0) {
            const isIncoming = ['sale', 'manual_sale', 'customer_receipt'].includes(entry.entryType);
            if (isIncoming) {
                const box = cashBoxes.find(b => b.id === entry.cashBoxId);
                if (box && ((box.balance || 0) - entry.paidAmount) < 0) {
                    alert("لا يمكن حذف هذه العملية لأنها ستؤدي إلى رصيد سالب في الصندوق.");
                    return;
                }
            }
        }

        try {
            await FinancialEngineService.deleteQuickEntry(entry, currentUser);
            setEntries(prev => prev.filter(e => e.id !== entry.id));
        } catch (error) {
            console.error("DELETE BATCH COMMIT FAILED", error);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const [selectedEntry, setSelectedEntry] = useState<QuickFinancialEntry | null>(null);

    const handleEdit = (entry: QuickFinancialEntry) => {
        console.log("EDIT BUTTON CLICKED");
        console.log("EDIT RECORD ID:", entry.id);
        console.log("NAVIGATION STARTED");
        onNavigate('quick_entry', { editId: entry.id });
        console.log("NAVIGATION COMPLETED");
    };

    const doPrint = (entry: QuickFinancialEntry) => {
        const isThermal = settings?.defaultPrintSize?.includes('80mm');
        const typeLabel = ENTRY_TYPE_LABELS[entry.entryType];

        const html = `
                <style>
                    * { box-sizing: border-box; }
                    .report-container { direction: rtl; padding: ${isThermal ? '1px' : '20px'}; font-family: 'Cairo', sans-serif; font-size: ${isThermal ? '11px' : '14px'}; max-width: 100%; overflow: hidden; color: #000; }
                    .header { text-align: center; border-bottom: ${isThermal ? '1px dashed #000' : '2px solid #3b82f6'}; padding-bottom: ${isThermal ? '6px' : '10px'}; margin-bottom: ${isThermal ? '12px' : '15px'}; }
                    .title { font-size: ${isThermal ? '14px' : '20px'}; font-weight: 900; color: ${isThermal ? '#000' : '#1e3a8a'}; margin: 5px 0; }
                    .info-grid { display: grid; grid-template-columns: ${isThermal ? '1fr' : 'repeat(2, 1fr)'}; gap: ${isThermal ? '2px' : '10px'}; margin-bottom: ${isThermal ? '10px' : '15px'}; background: ${isThermal ? '#fff' : '#f8fafc'}; padding: ${isThermal ? '2px' : '10px'}; border-radius: 6px; }
                    .info-item { display: flex; justify-content: space-between; border-bottom: 1px dashed ${isThermal ? '#000' : '#cbd5e1'}; padding: 3px 0; }
                    .label { font-weight: 700; color: ${isThermal ? '#000' : '#64748b'}; font-size: ${isThermal ? '10px' : '13px'}; }
                    .value { font-weight: 900; color: ${isThermal ? '#000' : '#0f172a'}; font-size: ${isThermal ? '10px' : '13px'}; }
                    .amount-box { margin-top: ${isThermal ? '10px' : '15px'}; border: ${isThermal ? '1px dashed #000' : '2px solid #3b82f6'}; padding: ${isThermal ? '8px' : '10px'}; text-align: center; border-radius: ${isThermal ? '4px' : '6px'}; background: ${isThermal ? '#fff' : '#eff6ff'}; }
                    .amount-value { font-size: ${isThermal ? '16px' : '24px'}; font-weight: 900; color: ${isThermal ? '#000' : '#1e40af'}; }
                    .prescription-box { margin-top: ${isThermal ? '10px' : '15px'}; padding: ${isThermal ? '4px' : '10px'}; border: 1px dashed #000; border-radius: 4px; background: #fff; overflow-x: hidden; }
                    .prescription-title { font-weight: 900; color: #000; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 6px; font-size: ${isThermal ? '11px' : '14px'}; text-align: center; }
                    .prescription-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; text-align: center; font-size: ${isThermal ? '9px' : '12px'}; }
                    .p-header { background: #f1f5f9; font-weight: 700; padding: 2px; border: 1px solid #000; }
                    .p-cell { border: 1px solid #000; padding: 2px; }
                    .footer { margin-top: ${isThermal ? '15px' : '20px'}; text-align: center; font-size: ${isThermal ? '9px' : '12px'}; color: #000; border-top: 1px dashed #000; padding-top: 10px; }
                </style>
                <div class="report-container">
                    <div class="header">
                        <div class="title">${settings?.storeNameAr || 'مركز البصريات'}</div>
                        <div style="font-weight: 700; color: #000;">${entry.referenceNumber ? 'إيصال مالي رقم: ' + entry.referenceNumber : 'إيصال مالي سريع'}</div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item"><span class="label">نوع العملية:</span> <span class="value">${typeLabel}</span></div>
                        <div class="info-item"><span class="label">التاريخ:</span> <span class="value">${safeNewDate(entry.createdAt).toLocaleDateString('ar-YE')}</span></div>
                        <div class="info-item"><span class="label">الطرف:</span> <span class="value">${entry.partnerName}</span></div>
                        <div class="info-item"><span class="label">الهاتف:</span> <span class="value">${entry.partnerPhone || '---'}</span></div>
                        <div class="info-item"><span class="label">الصندوق:</span> <span class="value">${entry.cashBoxName || '---'}</span></div>
                        <div class="info-item"><span class="label">بواسطة:</span> <span class="value">${users.find(u => u.id === entry.createdBy)?.name || entry.createdBy}</span></div>
                    </div>

                    ${entry.entryType === 'manual_sale' && entry.opticalPrescription ? `
                    <div class="prescription-box">
                        <div class="prescription-title">فحص النظر (وصفة طبية) / Prescription</div>
                        <div class="prescription-grid" dir="ltr">
                            <div class="p-header">Eye</div><div class="p-header">SPH</div><div class="p-header">CYL</div><div class="p-header">AXIS</div>
                            <div class="p-cell" style="font-weight: bold; color: #000;">R (D)</div><div class="p-cell">${entry.opticalPrescription.rightEye?.distance?.sph || '-'}</div><div class="p-cell">${entry.opticalPrescription.rightEye?.distance?.cyl || '-'}</div><div class="p-cell">${entry.opticalPrescription.rightEye?.distance?.ax || '-'}</div>
                            <div class="p-cell" style="font-weight: bold; color: #000;">L (D)</div><div class="p-cell">${entry.opticalPrescription.leftEye?.distance?.sph || '-'}</div><div class="p-cell">${entry.opticalPrescription.leftEye?.distance?.cyl || '-'}</div><div class="p-cell">${entry.opticalPrescription.leftEye?.distance?.ax || '-'}</div>
                            <div class="p-cell" style="font-weight: bold; color: #000;">R (N)</div><div class="p-cell">${entry.opticalPrescription.rightEye?.near?.sph || '-'}</div><div class="p-cell">${entry.opticalPrescription.rightEye?.near?.cyl || '-'}</div><div class="p-cell">${entry.opticalPrescription.rightEye?.near?.ax || '-'}</div>
                            <div class="p-cell" style="font-weight: bold; color: #000;">L (N)</div><div class="p-cell">${entry.opticalPrescription.leftEye?.near?.sph || '-'}</div><div class="p-cell">${entry.opticalPrescription.leftEye?.near?.cyl || '-'}</div><div class="p-cell">${entry.opticalPrescription.leftEye?.near?.ax || '-'}</div>
                        </div>
                        <div style="margin-top: 10px; display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; flex-wrap: wrap; gap: 4px;">
                            <span>IPD: <b>${entry.opticalPrescription.ipd || '---'}</b></span>
                            <span>العدسة: <b>${entry.opticalPrescription.lensType || '---'}</b></span>
                            <span>الإطار: <b>${entry.opticalPrescription.frameType || '---'}</b></span>
                        </div>
                    </div>
                    ` : ''}

                    <div class="amount-box">
                        <div class="label" style="color: #000; font-weight: 700;">صافي المبلغ</div>
                        <div class="amount-value">${entry.netAmount.toLocaleString()} ${entry.currency || 'YER'}</div>
                        ${isThermal ? `
                        <div style="font-size: 10px; margin-top: 8px; font-weight: 700; color: #000; display: flex; flex-direction: column; border-top: 1px dashed #000; padding-top: 6px; gap: 4px;">
                            <div style="display: flex; justify-content: space-between;"><span>الإجمالي:</span> <span>${entry.amount.toLocaleString()}</span></div>
                            <div style="display: flex; justify-content: space-between;"><span>الخصم:</span> <span>${entry.discount.toLocaleString()}</span></div>
                            <div style="display: flex; justify-content: space-between;"><span>المدفوع:</span> <span>${entry.paidAmount.toLocaleString()}</span></div>
                            <div style="display: flex; justify-content: space-between; font-weight: 900; border-top: 1px dotted #000; padding-top: 4px;"><span>المتبقي:</span> <span>${entry.remainingAmount.toLocaleString()}</span></div>
                        </div>
                        ` : `
                        <div style="font-size: 13px; margin-top: 15px; font-weight: 700; color: #1e3a8a; display: flex; flex-wrap: wrap; justify-content: space-around; border-top: 1px dashed #bfdbfe; padding-top: 10px; gap: 5px;">
                            <span style="color: #475569;">الإجمالي: ${entry.amount.toLocaleString()}</span>
                            <span style="color: #e11d48;">الخصم: ${entry.discount.toLocaleString()}</span>
                            <span style="color: #059669;">المدفوع: ${entry.paidAmount.toLocaleString()}</span>
                            <span style="color: #d97706;">المتبقي: ${entry.remainingAmount.toLocaleString()}</span>
                        </div>
                        `}
                    </div>

                    <div style="margin-top: ${isThermal ? '10px' : '20px'}; padding: ${isThermal ? '6px' : '10px'}; background: #fffbeb; border: 1px solid #fef3c7; border-radius: ${isThermal ? '4px' : '8px'};">
                        <div class="label" style="margin-bottom: 3px;">الملاحظات:</div>
                        <div style="font-size: ${isThermal ? '11px' : '14px'}; font-weight: 700; line-height: 1.5;">${entry.notes || '---'}</div>
                    </div>

                    <div class="footer">
                        <div>العنوان: ${settings?.address || 'اليمن - صنعاء'}</div>
                        <div>هاتف التواصل: ${settings?.phone || '777XXXXXX'}</div>
                        <p style="margin: 4px 0 0 0; font-weight: bold;">${settings?.printFooterText || 'شكراً لتعاملكم معنا'}</p>
                    </div>
                </div>
        `;

        setPrintPreview({
            isOpen: true,
            html,
            title: `وصل مالي - ${entry.referenceNumber || 'جديد'}`,
            size: isThermal ? 'thermal' : 'a4'
        });
    };

    const filteredEntries = entries.filter(e => {
        const d = safeNewDate(e.createdAt);
        
        // Search
        const matchesSearch = 
            String(e.partnerName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
            String(e.referenceNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(e.notes || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(e.partnerPhone || "").includes(searchTerm);
        
        // Type
        const matchesType = filterType === "all" || e.entryType === filterType;
        
        // Status
        const matchesStatus = filterStatus === "all" || e.paymentStatus === filterStatus;

        // Box
        const matchesBox = filterBox === "all" || e.cashBoxId === filterBox;

        // Date
        let matchesDate = true;
        if (filterDate === "today") matchesDate = isToday(d);
        else if (filterDate === "week") matchesDate = isWithinInterval(d, { start: startOfWeek(new Date(), { weekStartsOn: 6 }), end: endOfWeek(new Date(), { weekStartsOn: 6 }) });
        else if (filterDate === "month") matchesDate = isWithinInterval(d, { start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
        else if (filterDate === "custom" && dateRange.start && dateRange.end) {
            try {
                matchesDate = isWithinInterval(d, { start: safeNewDate(dateRange.start), end: safeNewDate(dateRange.end) });
            } catch(e) { matchesDate = true; }
        }

        return matchesSearch && matchesType && matchesStatus && matchesBox && matchesDate;
    });

    // Summary Stats
    const summary = {
        totalEntries: filteredEntries.length,
        totalNet: filteredEntries.reduce((sum, e) => sum + e.netAmount, 0),
        totalPaid: filteredEntries.reduce((sum, e) => sum + e.paidAmount, 0),
        totalRemaining: filteredEntries.reduce((sum, e) => sum + e.remainingAmount, 0)
    };

    return (
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 p-4 md:p-6 pb-24">
            <PrintPreviewModal 
                isOpen={printPreview.isOpen}
                onClose={() => setPrintPreview(prev => ({ ...prev, isOpen: false }))}
                htmlContent={printPreview.html}
                title={printPreview.title}
                paperSize={printPreview.size}
            />
            {/* Warning Message */}
            <div className="mb-6 bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 p-3 rounded-2xl flex items-center justify-center gap-3">
                <Info size={18} className="text-blue-500 shrink-0" />
                <p className="text-[11px] font-black text-blue-800 dark:text-blue-200">هذه العمليات مالية فقط ولا تؤثر على المخزون أو الكميات المتوفرة.</p>
            </div>

            {/* Header Content */}
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
                            <FileText className="text-white" size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">السجل المالي السريع</h2>
                            <p className="text-sm text-slate-500 font-bold">إدارة عمليات الإدخال المباشر V2</p>
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
                        className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-all hidden md:block"
                    >
                        {viewMode === 'table' ? <LayoutGrid size={20} /> : <ListIcon size={20} />}
                    </button>
                    <button
                        onClick={() => onNavigate('quick_entry')}
                        className="flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95"
                    >
                        <ArrowRight size={18} className="rotate-180" />
                        إضافة إدخال جديد
                    </button>
                </div>
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: "إجمالي العمليات", value: summary.totalEntries, icon: FileText, color: "blue" },
                    { label: "صافي المبالغ", value: summary.totalNet, icon: Wallet, color: "slate" },
                    { label: "المقبوض / المدفوع", value: summary.totalPaid, icon: Download, color: "emerald" },
                    { label: "المتبقي (ديون)", value: summary.totalRemaining, icon: MoreHorizontal, color: "rose" }
                ].map((item, i) => (
                    <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                        <div className={`absolute -right-4 -bottom-4 w-16 h-16 bg-${item.color}-500/5 rounded-full group-hover:scale-150 transition-transform duration-700`} />
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                                <item.icon size={14} className={`text-${item.color}-500`} />
                            </div>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl font-black text-slate-900 dark:text-white font-mono leading-none">
                                    {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                                </p>
                                {i > 0 && <span className="text-[9px] font-black text-slate-400">YER</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search and Advanced Filters */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm mb-8 overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="بحث بالاسم، رقم المرجع، الهاتف أو الملاحظات..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pr-10 h-12 bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "flex items-center gap-2 h-12 px-6 rounded-2xl font-black text-sm transition-all",
                            showFilters ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                        )}
                    >
                        <Filter size={18} />
                        التصنيفات المتقدمة
                    </button>
                </div>

                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-slate-50 dark:bg-slate-800/20 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
                        >
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">نوع العملية</label>
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="w-full h-11 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-xs font-bold shadow-sm"
                                >
                                    <option value="all">كل الأنواع</option>
                                    {Object.entries(ENTRY_TYPE_LABELS).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">حالة السداد</label>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="w-full h-11 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-xs font-bold shadow-sm"
                                >
                                    <option value="all">كل الحالات</option>
                                    <option value="مدفوع">مدفوع بالكامل</option>
                                    <option value="جزئي">مدفوع جزئياً</option>
                                    <option value="آجل">غير مدفوع (آجل)</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">الصندوق المالي</label>
                                <select
                                    value={filterBox}
                                    onChange={(e) => setFilterBox(e.target.value)}
                                    className="w-full h-11 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-xs font-bold shadow-sm disabled:opacity-50"
                                    disabled={!!currentUser?.assignedBoxId && currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'ADMIN'}
                                >
                                    <option value="all">كل الصناديق</option>
                                    {cashBoxes.map(box => (
                                        <option key={box.id} value={box.id}>{box.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">الفترة الزمنية</label>
                                <select
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                    className="w-full h-11 bg-white dark:bg-slate-800 border-none rounded-xl px-4 text-xs font-bold shadow-sm"
                                >
                                    <option value="all">كل الأوقات</option>
                                    <option value="today">اليوم</option>
                                    <option value="week">هذا الأسبوع</option>
                                    <option value="month">هذا الشهر</option>
                                    <option value="custom">نطاق مخصص...</option>
                                </select>
                            </div>

                            {filterDate === "custom" && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full grid grid-cols-2 gap-4">
                                    <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="h-11 bg-white dark:bg-slate-800 rounded-xl px-4 text-xs font-bold border-none shadow-sm" />
                                    <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="h-11 bg-white dark:bg-slate-800 rounded-xl px-4 text-xs font-bold border-none shadow-sm" />
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Content View */}
            <div className="space-y-4">
                {isLoadingInitial ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin shadow-inner" />
                        <p className="text-sm text-slate-500 font-bold animate-pulse">جاري استرجاع السجلات المالية...</p>
                    </div>
                ) : filteredEntries.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-20 text-center">
                        <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <FileText size={48} className="text-slate-200 dark:text-slate-700" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">لا توجد سجلات مالية متطابقة</h3>
                        <p className="text-sm text-slate-500 font-bold mt-2 max-w-xs mx-auto">لم يتم العثور على أي عمليات مالية سريعة بهذا الوصف أو الفلتر حالياً.</p>
                        <button 
                            onClick={() => loadData(true)}
                            className="mt-6 text-blue-600 font-black text-sm hover:underline"
                        >
                            تحديث البيانات
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className={cn(
                            "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto",
                            viewMode === 'table' ? "hidden md:block" : "hidden"
                        )}>
                            <table className="w-full text-right border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16"># المرجع</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">نوع العملية</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الطرف (عميل/مورد)</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">المبلغ الصافي</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الحالة</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الصندوق</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">بواسطة</th>
                                        <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredEntries.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                                            <td className="px-5 py-4">
                                                <span className="text-xs font-black text-slate-400 group-hover:text-blue-600 transition-colors">{entry.referenceNumber || "---"}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "w-2 h-2 rounded-full",
                                                        entry.entryType === 'manual_sale' || entry.entryType === 'receipt' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                                                    )} />
                                                    <span className="text-sm font-black text-slate-700 dark:text-slate-200">{ENTRY_TYPE_LABELS[entry.entryType]}</span>
                                                </div>
                                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                                    {entry.createdAt ? safeNewDate(entry.createdAt).toISOString().slice(0, 10) : "---"}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-slate-900 dark:text-white capitalize">{entry.partnerName}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider">{entry.partnerPhone || "---"}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">{entry.netAmount.toLocaleString()}</span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black",
                                                    STATUS_COLORS[entry.paymentStatus]
                                                )}>
                                                    {entry.paymentStatus}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-[11px] font-black text-slate-500">{entry.cashBoxName || "---"}</span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-[11px] font-black text-slate-500">{users.find(u => u.id === entry.createdBy)?.name || entry.createdBy}</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-center gap-2 transition-all">
                                                    <button onClick={() => setSelectedEntry(entry)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-all"><FileText size={16} /></button>
                                                    <button onClick={() => doPrint(entry)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl transition-all"><Printer size={16} /></button>
                                                    <button onClick={() => handleEdit(entry)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-xl transition-all"><Edit3 size={16} /></button>
                                                    <button onClick={() => handleDelete(entry)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className={cn(
                            "grid grid-cols-1 gap-4",
                            viewMode === 'table' ? "md:hidden" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                        )}>
                            {filteredEntries.map((entry) => (
                                <motion.div
                                    key={entry.id}
                                    layout
                                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                                >
                                    <div className="p-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-2xl flex items-center justify-center",
                                                entry.entryType === 'manual_sale' || entry.entryType === 'receipt' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10" : "bg-rose-100 text-rose-600 dark:bg-rose-500/10"
                                            )}>
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{entry.referenceNumber || "---"}</span>
                                                <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight">{ENTRY_TYPE_LABELS[entry.entryType]}</h4>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "px-2.5 py-1 rounded-xl text-[10px] font-black",
                                            STATUS_COLORS[entry.paymentStatus]
                                        )}>
                                            {entry.paymentStatus}
                                        </span>
                                    </div>

                                    <div className="p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">الطرف</p>
                                                <p className="text-sm font-black text-slate-900 dark:text-white">{entry.partnerName}</p>
                                                <p className="text-[10px] font-bold text-slate-500 font-mono tracking-tighter">{entry.partnerPhone || "لا يوجد هاتف"}</p>
                                            </div>
                                            <div className="text-left space-y-0.5">
                                                <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider">الصافي</p>
                                                <p className="text-lg font-black font-mono text-slate-900 dark:text-white leading-none">{entry.netAmount.toLocaleString()}</p>
                                                <p className="text-[9px] font-black text-slate-400">YER</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 dark:border-slate-800">
                                            <div className="flex flex-col items-center">
                                                <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">المدفوع</p>
                                                <p className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">{entry.paidAmount.toLocaleString()}</p>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">المتبقي</p>
                                                <p className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">{entry.remainingAmount.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {entry.notes && (
                                            <div className="bg-blue-50/30 dark:bg-blue-500/5 p-3 rounded-2xl border border-blue-500/10">
                                                <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold leading-relaxed italic">{entry.notes}</p>
                                            </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 gap-3">
                                            <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1.5 whitespace-nowrap w-full sm:w-auto overflow-hidden text-ellipsis">
                                                <Calendar size={12} className="shrink-0" /> {format(safeNewDate(entry.createdAt), "do MMM h:mm a", { locale: ar })}
                                            </p>
                                            <div className="flex gap-1.5 md:gap-2 w-full sm:w-auto overflow-x-auto pb-1 no-scrollbar justify-end">
                                                <button onClick={() => setSelectedEntry(entry)} className="p-2 md:p-3 shrink-0 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-500 hover:text-blue-500 transition-all shadow-sm"><FileText size={18} /></button>
                                                <button onClick={() => doPrint(entry)} className="p-2 md:p-3 shrink-0 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-500 hover:text-emerald-500 transition-all shadow-sm"><Printer size={18} /></button>
                                                <button onClick={() => handleEdit(entry)} className="p-2 md:p-3 shrink-0 bg-slate-50 dark:bg-slate-800 rounded-2xl text-slate-500 hover:text-amber-500 transition-all shadow-sm"><Edit3 size={18} /></button>
                                                <button onClick={() => handleDelete(entry)} className="p-2 md:p-3 shrink-0 bg-rose-50 dark:bg-rose-500/10 rounded-2xl text-rose-500 hover:bg-rose-100 transition-all shadow-xl shadow-rose-500/5"><Trash2 size={18} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </>
                )}
                
                {hasMore && (
                    <div className="flex justify-center mt-6 pb-24">
                        <button
                            onClick={() => loadData(false)}
                            disabled={isLoadingMore}
                            className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {isLoadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                        </button>
                    </div>
                )}
            </div>

            {/* View Details Modal */}
            <AnimatePresence>
                {selectedEntry && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            onClick={() => setSelectedEntry(null)} 
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10 border border-slate-200 dark:border-slate-800"
                        >
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                                        <Info size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white">تفاصيل العملية المالية</h3>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">#{selectedEntry.referenceNumber || selectedEntry.id}</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedEntry(null)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">نوع العملية</p>
                                        <p className="font-black text-slate-900 dark:text-white">{ENTRY_TYPE_LABELS[selectedEntry.entryType]}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">الحالة</p>
                                        <span className={cn("inline-flex px-3 py-1 rounded-full text-[10px] font-black", STATUS_COLORS[selectedEntry.paymentStatus])}>
                                            {selectedEntry.paymentStatus}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">الطرف</p>
                                        <p className="font-black text-slate-900 dark:text-white">{selectedEntry.partnerName}</p>
                                        <p className="text-xs font-bold text-slate-500">{selectedEntry.partnerPhone || "---"}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">التاريخ</p>
                                        <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                                            {format(safeNewDate(selectedEntry.createdAt), "PPP p", { locale: ar })}
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4">
                                     <div className="flex justify-between items-center text-sm font-bold">
                                         <span className="text-slate-500">المبلغ الإجمالي</span>
                                         <span className="text-slate-900 dark:text-white">{selectedEntry.amount.toLocaleString()} {selectedEntry.currency || 'YER'}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-sm font-bold">
                                         <span className="text-slate-500">الخصم الممنوح</span>
                                         <span className="text-rose-500">-{selectedEntry.discount.toLocaleString()}</span>
                                     </div>
                                     <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                         <span className="text-sm font-black text-slate-900 dark:text-white">الصافي النهائي</span>
                                         <span className="text-lg font-black text-blue-600 dark:text-blue-400">{selectedEntry.netAmount.toLocaleString()}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-sm font-black pt-1">
                                         <span className="text-emerald-500">تم سداد</span>
                                         <span className="text-emerald-500">{selectedEntry.paidAmount.toLocaleString()}</span>
                                     </div>
                                     <div className="flex justify-between items-center text-sm font-black">
                                         <span className="text-rose-500">المتبقي</span>
                                         <span className="text-rose-500">{selectedEntry.remainingAmount.toLocaleString()}</span>
                                     </div>
                                </div>

                                {selectedEntry.notes && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">ملاحظات إضافية</p>
                                        <div className="p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 rounded-2xl italic text-xs font-bold text-amber-900 dark:text-amber-200">
                                            {selectedEntry.notes}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 bg-slate-50 dark:bg-slate-800/30 flex gap-4">
                                <button onClick={() => doPrint(selectedEntry)} className="flex-1 h-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-sm text-slate-700 dark:text-white flex items-center justify-center gap-2">
                                    <Printer size={18} /> طباعة الوصل
                                </button>
                                <button onClick={() => { handleEdit(selectedEntry); setSelectedEntry(null); }} className="flex-1 h-12 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2">
                                    <Edit3 size={18} /> تعديل البيانات
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
