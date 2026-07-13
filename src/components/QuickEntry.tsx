import { syncEngine } from "../services/syncEngine";
import React, { useState, useEffect, useRef } from "react";
import { Save, Plus, ArrowRight, Wallet, User, Hash, FileText, Phone, Printer, Info, List as ListIcon, X, Eye, Search, Trash2, Edit3, Filter, AlertCircle } from "lucide-react";
import { FinancialEngineService } from "../services/financialEngineService";
import { dbService } from "../services/db";
import { QuickFinancialEntry, QuickEntryType, Currency, InvoiceStatus, CashBox, StoreSettings, AppUser, OpticalPrescription , Customer , Supplier } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { calculateUnifiedCashBalances } from "../lib/financialUtils";
import PrintPreviewModal from "./PrintPreviewModal";

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

interface QuickEntryProps {
    onNavigate: (page: string, params?: any) => void;
    editId?: string | null;
    currentUser?: any;
}

const ENTRY_TYPES: { value: QuickEntryType; label: string; color: string }[] = [
    { value: 'manual_sale', label: 'مبيعات يدوية', color: 'blue' },
    { value: 'manual_purchase', label: 'مشتريات يدوية', color: 'rose' }
];

const ENTRY_TYPE_LABELS: Record<string, string> = {
    manual_sale: "مبيعات يدوية",
    manual_purchase: "مشتريات يدوية",
    receipt: "سند قبض",
    payment: "سند صرف",
    adjustment: "تسوية مالية"
};

const FRAME_TYPE_OPTIONS = [
    "رجالي معدن",
    "رجالي بلاستيك",
    "نسائي معدن",
    "نسائي بلاستيك",
    "أطفال",
    "خاص",
    "أخرى"
];

const LENS_TYPE_OPTIONS = [
    "عدسة عادية",
    "بلو كت",
    "مضاد انعكاس",
    "فوتوكروميك",
    "ثنائية البؤرة",
    "متعددة البؤر",
    "عدسة شمسية",
    "أخرى"
];

export default function QuickEntry({ onNavigate, editId, currentUser: propCurrentUser }: QuickEntryProps) {
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
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    
    const [selectedPartnerId, setSelectedPartnerId] = useState("");
    const [isNewPartner, setIsNewPartner] = useState(false);
    const [searchPartnerTerm, setSearchPartnerTerm] = useState("");
    const [showPartnerSuggestions, setShowPartnerSuggestions] = useState(false);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [selectedCashBoxId, setSelectedCashBoxId] = useState("");
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [currentUser, setCurrentUser] = useState<AppUser | null>(propCurrentUser || null);
    const [oldEntryData, setOldEntryData] = useState<QuickFinancialEntry | null>(null);
    const [calculatedBalances, setCalculatedBalances] = useState<Record<string, number>>({});
    const [validationError, setValidationError] = useState<string | null>(null);

    // Print Preview States
    const [printPreview, setPrintPreview] = useState<{
        isOpen: boolean;
        html: string;
        title: string;
        size: 'a4' | 'thermal';
    }>({ isOpen: false, html: '', title: '', size: 'a4' });

    // Optical Prescription State
    const [showOpticalSection, setShowOpticalSection] = useState(false);
    const [optRightSph, setOptRightSph] = useState("");
    const [optRightCyl, setOptRightCyl] = useState("");
    const [optRightAx, setOptRightAx] = useState("");
    const [optRightNearSph, setOptRightNearSph] = useState("");
    const [optRightNearCyl, setOptRightNearCyl] = useState("");
    const [optRightNearAx, setOptRightNearAx] = useState("");
    const [optLeftSph, setOptLeftSph] = useState("");
    const [optLeftCyl, setOptLeftCyl] = useState("");
    const [optLeftAx, setOptLeftAx] = useState("");
    const [optLeftNearSph, setOptLeftNearSph] = useState("");
    const [optLeftNearCyl, setOptLeftNearCyl] = useState("");
    const [optLeftNearAx, setOptLeftNearAx] = useState("");
    const [optIpd, setOptIpd] = useState("");
    const [optLensTypeSelect, setOptLensTypeSelect] = useState("");
    const [optLensType, setOptLensType] = useState("");
    const [optFrameTypeSelect, setOptFrameTypeSelect] = useState("");
    const [optFrameType, setOptFrameType] = useState("");

    // Recent Operations Log States
    const [recentEntries, setRecentEntries] = useState<QuickFinancialEntry[]>([]);
    const [logSearchTerm, setLogSearchTerm] = useState("");
    const [logFilterType, setLogFilterType] = useState<string>("all");
    
    const partnerRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const amountRef = useRef<HTMLInputElement>(null);

    // Computations
    const numAmount = parseFloat(amount.replace(/,/g, '')) || 0;
    const numDiscount = parseFloat(discount.replace(/,/g, '')) || 0;
    const netAmount = Math.max(0, numAmount - numDiscount);
    const numPaid = paidAmount === "" ? 0 : (parseFloat(paidAmount.replace(/,/g, '')) || 0);
    const remainingAmount = netAmount - numPaid;

    const resetForm = () => {
        setReferenceNumber("");
        setPartnerName("");
        setPartnerPhone("");
        setAmount("");
        setDiscount("");
        setPaidAmount("");
        setNotes("");
        setShowOpticalSection(false);
        setOptRightSph("");
        setOptRightCyl("");
        setOptRightAx("");
        setOptRightNearSph("");
        setOptRightNearCyl("");
        setOptRightNearAx("");
        setOptLeftSph("");
        setOptLeftCyl("");
        setOptLeftAx("");
        setOptLeftNearSph("");
        setOptLeftNearCyl("");
        setOptLeftNearAx("");
        setOptIpd("");
        setOptLensTypeSelect("");
        setOptLensType("");
        setOptFrameTypeSelect("");
        setOptFrameType("");
    };

    const loadRecentEntries = async () => {
        try {
            const entries = (await dbService.getAll("quick_financial_entries") as QuickFinancialEntry[]).filter(e => e.recordStatus !== 'deleted');
            // Sort by createdAt desc
            const sorted = entries.sort((a, b) => safeNewDate(b.createdAt).getTime() - safeNewDate(a.createdAt).getTime());
            setRecentEntries(sorted);
        } catch (error) {
            console.error("Failed to load recent entries:", error);
        }
    };

    const handleDelete = async (entry: QuickFinancialEntry) => {
        if (!confirm("هل أنت متأكد من حذف هذه العملية المالية؟ سيتم التراجع عن كافه الآثار المالية (رصيد الصندوق ورصيد الطرف).")) return;
        
        try {
            await FinancialEngineService.deleteQuickEntry(entry, currentUser!);
            setRecentEntries(prev => prev.filter(e => e.id !== entry.id));
            if (editId === entry.id) {
                onNavigate('quick_entry');
            }
        } catch (error: any) {
            console.error("DELETE BATCH COMMIT FAILED", error);
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes("Connection failed")) {
                setValidationError("فشل الاتصال بقاعدة البيانات. يرجى التأكد من إكمال إعداد Firebase في لوحة التحكم والتأكد من اتصال الإنترنت.");
            } else {
                setValidationError("حدث خطأ أثناء الحذف: " + errorMsg);
            }
        }
    };

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            try {
                const [boxes, allSettings, usersList, customersList, suppliersList, txs, invs, vchs, qes] = await Promise.all([
                    dbService.getAll("cashBoxes"),
                    dbService.getStoreSettings(),
                    dbService.getAll("users"),
                    dbService.getAll("customers"),
                    dbService.getAll("suppliers"),
                    dbService.getAll("transactions"),
                    dbService.getAll("invoices"),
                    dbService.getAll("vouchers"),
                    dbService.getAll("quick_financial_entries")
                ]);

                const boxBalances: Record<string, number> = {};
                (boxes as CashBox[]).forEach((b) => {
                    boxBalances[b.id!] = (b.balance || 0);
                });
                setCalculatedBalances(boxBalances);

                setCashBoxes(boxes as CashBox[]);
                setSettings(allSettings);
                setUsers(usersList as AppUser[]);
                setCustomers(customersList as Customer[]);
                setSuppliers(suppliersList as Supplier[]);

                let activeUser = propCurrentUser || null;
                if (!activeUser) {
                    const savedUser = localStorage.getItem("app_user");
                    if (savedUser) activeUser = JSON.parse(savedUser);
                }
                setCurrentUser(activeUser);

                await loadRecentEntries();

                if (editId) {
                    const allEntries = (await dbService.getAll("quick_financial_entries") as QuickFinancialEntry[]).filter(e => e.recordStatus !== 'deleted');
                    const toEdit = allEntries.find(e => e.id === editId);
                    if (toEdit) {
                        setOldEntryData(toEdit);
                        setEntryType(toEdit.entryType);
                        setReferenceNumber(toEdit.referenceNumber || "");
                        setPartnerType(toEdit.partnerType);
                        setPartnerName(toEdit.partnerName);
                        setSearchPartnerTerm(toEdit.partnerName || "");
                        setSelectedPartnerId(toEdit.partnerId || "");
                        setPartnerPhone(toEdit.partnerPhone || "");
                        setAmount(toEdit.amount.toString());
                        setDiscount(toEdit.discount.toString());
                        setPaidAmount(toEdit.paidAmount.toString());
                        setCurrency(toEdit.currency || "YER");
                        setNotes(toEdit.notes || "");
                        setSelectedCashBoxId(toEdit.cashBoxId || "");

                        // Load Prescription
                        if (toEdit.opticalPrescription) {
                            setShowOpticalSection(true);
                            setOptRightSph(toEdit.opticalPrescription.rightEye?.distance?.sph || "");
                            setOptRightCyl(toEdit.opticalPrescription.rightEye?.distance?.cyl || "");
                            setOptRightAx(toEdit.opticalPrescription.rightEye?.distance?.ax || "");
                            setOptRightNearSph(toEdit.opticalPrescription.rightEye?.near?.sph || "");
                            setOptRightNearCyl(toEdit.opticalPrescription.rightEye?.near?.cyl || "");
                            setOptRightNearAx(toEdit.opticalPrescription.rightEye?.near?.ax || "");
                            setOptLeftSph(toEdit.opticalPrescription.leftEye?.distance?.sph || "");
                            setOptLeftCyl(toEdit.opticalPrescription.leftEye?.distance?.cyl || "");
                            setOptLeftAx(toEdit.opticalPrescription.leftEye?.distance?.ax || "");
                            setOptLeftNearSph(toEdit.opticalPrescription.leftEye?.near?.sph || "");
                            setOptLeftNearCyl(toEdit.opticalPrescription.leftEye?.near?.cyl || "");
                            setOptLeftNearAx(toEdit.opticalPrescription.leftEye?.near?.ax || "");
                            setOptIpd(toEdit.opticalPrescription.ipd || "");
                            
                            const savedLens = toEdit.opticalPrescription.lensType || "";
                            setOptLensType(savedLens);
                            setOptLensTypeSelect(LENS_TYPE_OPTIONS.includes(savedLens) ? savedLens : (savedLens ? "أخرى" : ""));
                            
                            const savedFrame = toEdit.opticalPrescription.frameType || "";
                            setOptFrameType(savedFrame);
                            setOptFrameTypeSelect(FRAME_TYPE_OPTIONS.includes(savedFrame) ? savedFrame : (savedFrame ? "أخرى" : ""));
                        }
                    }
                } else {
                    setOldEntryData(null);
                    resetForm();
                    const assignedBox = activeUser?.assignedBoxId ? (boxes as CashBox[]).find(b => b.id === activeUser.assignedBoxId) : null;
                    if (assignedBox) {
                        setSelectedCashBoxId(assignedBox.id || "");
                    } else if (boxes.length === 1) {
                        setSelectedCashBoxId((boxes as CashBox[])[0].id || "");
                    } else {
                        const activeBox = (boxes as CashBox[]).find(b => b.isActive) || (boxes as CashBox[])[0];
                        if (activeBox) {
                            setSelectedCashBoxId(activeBox.id || "");
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to init QuickEntry", err);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, [editId]);

    const partners = partnerType === 'customer' ? customers : suppliers;
    const filteredPartners = partners.filter(p => 
        (p.name || '').toLowerCase().includes(searchPartnerTerm.toLowerCase()) ||
        (p.phone || '').toLowerCase().includes(searchPartnerTerm.toLowerCase())
    );

    const handleSearchPartnerChange = (val: string) => {
        setSearchPartnerTerm(val);
        setIsNewPartner(false);
        setSelectedPartnerId("");
        setShowPartnerSuggestions(true);
    };

    const selectPartnerSuggestion = (p: Customer | Supplier) => {
        setSelectedPartnerId(p.id || "");
        setSearchPartnerTerm(p.name);
        setPartnerPhone(p.phone || "");
        setIsNewPartner(false);
        setShowPartnerSuggestions(false);
    };

    const activateQuickNewPartner = () => {
        setIsNewPartner(true);
        setPartnerName(searchPartnerTerm);
        setShowPartnerSuggestions(false);
    };

    const handleSave = async (printAfter: boolean = false) => {
        console.log("STEP 1: Save button clicked");
        if (partnerType !== 'none' && !searchPartnerTerm.trim() && !partnerName.trim()) {
            setValidationError("يرجى إدخال اسم العميل/المورد");
            return;
        }

        if (!amount || isNaN(numAmount) || numAmount <= 0) {
            setValidationError("يرجى إدخال مبلغ صحيح");
            return;
        }

        if (numPaid > 0 && (!cashBoxes.length || !selectedCashBoxId)) {
            setValidationError("يرجى اختيار الصندوق المالي للاستلام/الصرف");
            return;
        }

        // Check for negative cashbox balance before saving an outgoing entry
        const isOutgoing = ['purchase', 'manual_purchase', 'supplier_payment', 'expense'].includes(entryType);
        if (numPaid > 0 && isOutgoing && selectedCashBoxId) {
            const box = cashBoxes.find(b => b.id === selectedCashBoxId);
            if (box) {
                let futureBalance = (box.balance || 0) - numPaid;
                if (editId && oldEntryData && oldEntryData.cashBoxId === selectedCashBoxId) {
                    futureBalance += oldEntryData.paidAmount || 0;
                }
                if (futureBalance < 0) {
                    setValidationError("رصيد الصندوق غير كاف لإتمام هذه العملية (لا يمكن أن يكون بالسالب)");
                    return;
                }
            }
        }

        console.log("STEP 2: Validation passed");

        if (numPaid > netAmount) {
            setValidationError(`خطأ: المبلغ المدفوع (${numPaid.toLocaleString()}) أكبر من صافي القيمة (${netAmount.toLocaleString()})`);
            return;
        }

        setIsSaving(true);
        try {
            const status: InvoiceStatus = numPaid === 0 ? 'آجل' : (numPaid >= netAmount ? 'مدفوع' : 'جزئي');
            const selectedBox = cashBoxes.find(b => b.id === selectedCashBoxId);

            const entry: QuickFinancialEntry = {
                entryType,
                partnerType,
                partnerId: isNewPartner ? "" : (selectedPartnerId || oldEntryData?.partnerId || ""),
                partnerName: partnerType === 'none' ? 'إدخال عام' : (isNewPartner ? searchPartnerTerm.trim() : (partners.find(p => p.id === selectedPartnerId)?.name || searchPartnerTerm.trim() || partnerName.trim())),
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
                autoCreatePartner: partnerType !== 'none' && (isNewPartner || (!selectedPartnerId && !oldEntryData?.partnerId)),
                opticalPrescription: entryType === 'manual_sale' ? {
                    rightEye: {
                        distance: { sph: optRightSph, cyl: optRightCyl, ax: optRightAx },
                        near: { sph: optRightNearSph, cyl: optRightNearCyl, ax: optRightNearAx }
                    },
                    leftEye: {
                        distance: { sph: optLeftSph, cyl: optLeftCyl, ax: optLeftAx },
                        near: { sph: optLeftNearSph, cyl: optLeftNearCyl, ax: optLeftNearAx }
                    },
                    ipd: optIpd,
                    lensType: optLensType,
                    frameType: optFrameType
                } : undefined,
                updatedAt: new Date().toISOString(),
                createdAt: oldEntryData?.createdAt || new Date().toISOString(),
                createdBy: oldEntryData?.createdBy || currentUser?.name || "مستخدم غير معرف"
            };

            let savedId = editId;
            if (editId && oldEntryData) {
                await FinancialEngineService.updateQuickEntry(oldEntryData, entry, currentUser!);
            } else {
                console.log("STEP 3: createQuickEntry called");
                savedId = await FinancialEngineService.createQuickEntry(entry, currentUser!);
                entry.id = savedId;
            }

            if (printAfter) {
                doPrint({ ...entry, id: savedId || "" });
            }

            if (editId) {
                onNavigate('quick_entry');
            } else {
                resetForm();
                await loadRecentEntries();
            }
        } catch (error: any) {
            console.error("Error QuickEntry:", error);
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes("Connection failed")) {
                setValidationError("فشل الاتصال بقاعدة البيانات. يرجى التأكد من إكمال إعداد Firebase في لوحة التحكم والتأكد من اتصال الإنترنت.");
            } else {
                setValidationError("حدث خطأ أثناء الحفظ: " + errorMsg);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const doPrint = (entry: QuickFinancialEntry) => {
        const isThermal = settings?.defaultPrintSize?.includes('80mm');
        const typeLabel = ENTRY_TYPE_LABELS[entry.entryType];

        const html = `
            <style>
                * { box-sizing: border-box; }
                .print-container { padding: ${isThermal ? '1px' : '20px'}; color: #000; direction: rtl; font-family: 'Cairo', sans-serif; font-size: ${isThermal ? '11px' : '14px'}; max-width: 100%; overflow: hidden; }
                .header { text-align: center; border-bottom: ${isThermal ? '1px dashed #000' : '2px solid #3b82f6'}; padding-bottom: ${isThermal ? '6px' : '15px'}; margin-bottom: ${isThermal ? '12px' : '20px'}; }
                .title { font-size: ${isThermal ? '14px' : '24px'}; font-weight: 900; color: ${isThermal ? '#000' : '#1e3a8a'}; margin: 3px 0; }
                .info-grid { display: grid; grid-template-columns: ${isThermal ? '1fr' : 'repeat(2, 1fr)'}; gap: ${isThermal ? '2px' : '15px'}; margin-bottom: ${isThermal ? '10px' : '20px'}; background: ${isThermal ? '#fff' : '#f8fafc'}; padding: ${isThermal ? '2px' : '15px'}; border-radius: 8px; }
                .info-item { display: flex; justify-content: space-between; border-bottom: 1px dashed ${isThermal ? '#000' : '#cbd5e1'}; padding: 3px 0; }
                .label { font-weight: 700; color: ${isThermal ? '#000' : '#64748b'}; font-size: ${isThermal ? '10px' : '13px'}; }
                .value { font-weight: 900; color: ${isThermal ? '#000' : '#0f172a'}; font-size: ${isThermal ? '10px' : '13px'}; }
                .amount-box { margin-top: ${isThermal ? '10px' : '20px'}; border: ${isThermal ? '1px dashed #000' : '2px solid #3b82f6'}; padding: ${isThermal ? '8px' : '15px'}; text-align: center; border-radius: ${isThermal ? '4px' : '8px'}; background: ${isThermal ? '#fff' : '#eff6ff'}; }
                .amount-value { font-size: ${isThermal ? '16px' : '28px'}; font-weight: 900; color: ${isThermal ? '#000' : '#1e40af'}; }
                .footer { margin-top: ${isThermal ? '15px' : '30px'}; text-align: center; font-size: ${isThermal ? '9px' : '12px'}; color: ${isThermal ? '#000' : '#94a3b8'}; border-top: 1px dashed ${isThermal ? '#000' : '#e2e8f0'}; padding-top: 10px; }
            </style>
            <div class="print-container">
                <div class="header">
                    <div class="title">${settings?.storeNameAr || 'مركز البصريات الحديث المتطور'}</div>
                    <div style="font-weight: 700; color: ${isThermal ? '#000' : '#3b82f6'};">${entry.referenceNumber ? 'إيصال مالي رقم: ' + entry.referenceNumber : 'إيصال مالي سريع'}</div>
                </div>

                <div class="info-grid">
                    <div class="info-item"><span class="label">نوع العملية:</span> <span class="value">${typeLabel}</span></div>
                    <div class="info-item"><span class="label">التاريخ:</span> <span class="value">${safeNewDate(entry.createdAt).toLocaleDateString('ar-YE')}</span></div>
                    <div class="info-item"><span class="label">الطرف:</span> <span class="value">${entry.partnerName}</span></div>
                    <div class="info-item"><span class="label">الهاتف:</span> <span class="value">${entry.partnerPhone || '---'}</span></div>
                    <div class="info-item"><span class="label">الحالة:</span> <span class="value">${entry.paymentStatus}</span></div>
                    <div class="info-item"><span class="label">المستخدم:</span> <span class="value">${users.find(u => u.id === entry.createdBy)?.name || entry.createdBy}</span></div>
                </div>

                <div class="amount-box">
                    <div class="label" style="color: #000; font-weight: 700;">صافي المبلغ</div>
                    <div class="amount-value">${entry.netAmount.toLocaleString()} ${entry.currency || 'YER'}</div>
                    ${isThermal ? `
                    <div style="font-size: 10px; margin-top: 8px; font-weight: 700; color: #000; display: flex; flex-direction: column; border-top: 1px dashed #000; padding-top: 6px; gap: 4px;">
                        <div style="display: flex; justify-content: space-between;"><span>الإجمالي:</span> <span>${entry.amount.toLocaleString()}</span></div>
                        <div style="display: flex; justify-content: space-between; color: #000;"><span>الخصم:</span> <span>${entry.discount.toLocaleString()}</span></div>
                        <div style="display: flex; justify-content: space-between; color: #000;"><span>المدفوع:</span> <span>${entry.paidAmount.toLocaleString()}</span></div>
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

                ${entry.entryType === 'manual_sale' && entry.opticalPrescription ? (
                    isThermal ? `
                    <div style="margin-top: 10px; border: 1px dashed #000; border-radius: 4px; overflow: hidden; background: #fff;">
                        <div style="background: #000; color: white; padding: 3px 5px; font-weight: 700; font-size: 10px; text-align: center;">بيانات القياس البصري / Prescription</div>
                        <div style="padding: 4px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center;" dir="ltr">
                                <thead>
                                    <tr style="background: #f1f5f9; font-weight: bold; border-bottom: 1px solid #000;">
                                        <th style="padding: 2px; border: 1px solid #000;">Eye</th>
                                        <th style="padding: 2px; border: 1px solid #000;">SPH</th>
                                        <th style="padding: 2px; border: 1px solid #000;">CYL</th>
                                        <th style="padding: 2px; border: 1px solid #000;">AX</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 1px solid #000;">
                                        <td style="padding: 2px; border: 1px solid #000; font-weight: bold; color: #000;">R (D)</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.rightEye?.distance?.sph || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.rightEye?.distance?.cyl || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.rightEye?.distance?.ax || '-'}</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #000;">
                                        <td style="padding: 2px; border: 1px solid #000; font-weight: bold; color: #000;">L (D)</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.leftEye?.distance?.sph || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.leftEye?.distance?.cyl || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.leftEye?.distance?.ax || '-'}</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #000;">
                                        <td style="padding: 2px; border: 1px solid #000; font-weight: bold; color: #000;">R (N)</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.rightEye?.near?.sph || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.rightEye?.near?.cyl || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.rightEye?.near?.ax || '-'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 2px; border: 1px solid #000; font-weight: bold; color: #000;">L (N)</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.leftEye?.near?.sph || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.leftEye?.near?.cyl || '-'}</td>
                                        <td style="padding: 2px; border: 1px solid #000;">${entry.opticalPrescription.leftEye?.near?.ax || '-'}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style="padding: 4px 6px; font-size: 9px; border-top: 1px dashed #000; background: #fafafa; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
                            <span>IPD: <b>${entry.opticalPrescription.ipd || '-'}</b></span>
                            <span>Lens: <b>${entry.opticalPrescription.lensType || '-'}</b></span>
                            <span>Frame: <b>${entry.opticalPrescription.frameType || '-'}</b></span>
                        </div>
                    </div>
                    ` : `
                    <div style="margin-top: 20px; border: 1px solid #3b82f6; border-radius: 8px; overflow: hidden;">
                        <div style="background: #3b82f6; color: white; padding: 5px 10px; font-weight: 700; font-size: 12px; text-align: center;">بيانات القياس البصري / Optical Prescription</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px;">
                            <div>
                                <div style="color: #ef4444; font-weight: 700; font-size: 10px; border-bottom: 1px solid #fee2e2; margin-bottom: 5px;">RIGHT EYE (اليمنى)</div>
                                <table style="width: 100%; text-align: center; font-size: 10px; border-collapse: collapse;" dir="ltr">
                                    <tr style="background: #f8fafc;"><th style="border: 1px solid #e2e8f0; padding: 4px;"></th><th style="border: 1px solid #e2e8f0; padding: 4px;">SPH</th><th style="border: 1px solid #e2e8f0; padding: 4px;">CYL</th><th style="border: 1px solid #e2e8f0; padding: 4px;">AX</th></tr>
                                    <tr><td style="border: 1px solid #e2e8f0; padding: 4px; font-weight: 700;">D</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.rightEye?.distance?.sph || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.rightEye?.distance?.cyl || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.rightEye?.distance?.ax || '-'}</td></tr>
                                    <tr><td style="border: 1px solid #e2e8f0; padding: 4px; font-weight: 700;">N</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.rightEye?.near?.sph || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.rightEye?.near?.cyl || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.rightEye?.near?.ax || '-'}</td></tr>
                                </table>
                            </div>
                            <div>
                                <div style="color: #3b82f6; font-weight: 700; font-size: 10px; border-bottom: 1px solid #dbeafe; margin-bottom: 5px;">LEFT EYE (اليسرى)</div>
                                <table style="width: 100%; text-align: center; font-size: 10px; border-collapse: collapse;" dir="ltr">
                                    <tr style="background: #f8fafc;"><th style="border: 1px solid #e2e8f0; padding: 4px;"></th><th style="border: 1px solid #e2e8f0; padding: 4px;">SPH</th><th style="border: 1px solid #e2e8f0; padding: 4px;">CYL</th><th style="border: 1px solid #e2e8f0; padding: 4px;">AX</th></tr>
                                    <tr><td style="border: 1px solid #e2e8f0; padding: 4px; font-weight: 700;">D</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.leftEye?.distance?.sph || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.leftEye?.distance?.cyl || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.leftEye?.distance?.ax || '-'}</td></tr>
                                    <tr><td style="border: 1px solid #e2e8f0; padding: 4px; font-weight: 700;">N</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.leftEye?.near?.sph || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.leftEye?.near?.cyl || '-'}</td><td style="border: 1px solid #e2e8f0; padding: 4px;">${entry.opticalPrescription.leftEye?.near?.ax || '-'}</td></tr>
                                </table>
                            </div>
                        </div>
                        <div style="padding: 5px 10px; font-size: 10px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between;">
                            <span>IPD: <b>${entry.opticalPrescription.ipd || '-'}</b></span>
                            <span>Lens: <b>${entry.opticalPrescription.lensType || '-'}</b></span>
                            <span>Frame: <b>${entry.opticalPrescription.frameType || '-'}</b></span>
                        </div>
                    </div>
                    `
                ) : ''}

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
            title: `إيصال مالي - ${entry.referenceNumber || 'جديد'}`,
            size: isThermal ? 'thermal' : 'a4'
        });
    };

    const filteredLogEntries = recentEntries.filter(entry => {
        const matchesSearch = !logSearchTerm || 
            String(entry.partnerName || "").toLowerCase().includes(logSearchTerm.toLowerCase()) ||
            String(entry.referenceNumber || "").toLowerCase().includes(logSearchTerm.toLowerCase()) ||
            String(entry.partnerPhone || "").includes(logSearchTerm);

        const matchesType = logFilterType === "all" || entry.entryType === logFilterType;

        return matchesSearch && matchesType;
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm font-bold text-slate-500">جاري تحميل البيانات...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto bg-slate-50 dark:bg-slate-950 min-h-full flex flex-col relative pb-[90px] p-4 md:p-6">
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

            <PrintPreviewModal 
                isOpen={printPreview.isOpen}
                onClose={() => setPrintPreview(prev => ({ ...prev, isOpen: false }))}
                htmlContent={printPreview.html}
                title={printPreview.title}
                paperSize={printPreview.size}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4 p-4">
                {/* Right / Top Column: Entry Form */}
                <div className="lg:col-span-5 space-y-4">
                    {/* Warning Message */}
                    <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3 rounded-2xl flex items-start gap-3">
                        <Info className="text-amber-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 leading-relaxed">
                            الإدخال السريع مخصص للعمليات المالية اليدوية ونقل الحسابات. 
                            <span className="block mt-1 font-black underline decoration-amber-500/30 font-Cairo">تنبيه: هذا النظام لا يؤثر على المخزون أو كميات الأصناف.</span>
                        </p>
                    </div>

                    {/* Entry Type Selector */}
                    <div className="grid grid-cols-2 gap-2">
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
                                    <div className="relative z-50">
                                        <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            ref={partnerRef}
                                            type="text"
                                            value={searchPartnerTerm}
                                            onChange={(e) => handleSearchPartnerChange(e.target.value)}
                                            onFocus={() => setShowPartnerSuggestions(true)}
                                            className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-9 pl-4 text-sm font-bold focus:ring-1 focus:ring-blue-500/20 transition-all"
                                            placeholder={partnerType === 'customer' ? "ابحث أو أضف عميل..." : "ابحث أو أضف مورد..."}
                                        />
                                        
                                        {showPartnerSuggestions && (
                                            <div className="absolute right-0 top-full mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#162035] border border-slate-100 dark:border-slate-755 shadow-xl rounded-xl z-50 divide-y divide-slate-50 dark:divide-slate-800 custom-scrollbar">
                                                {filteredPartners.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => selectPartnerSuggestion(p)}
                                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-black flex justify-between items-center transition-colors dark:text-white cursor-pointer"
                                                    >
                                                         <span>{p.name}</span>
                                                         <span className="text-[10px] text-slate-400 font-bold">{p.phone}</span>
                                                    </button>
                                                ))}
                                                {filteredPartners.length === 0 && searchPartnerTerm.trim() !== '' && (
                                                    <div className="p-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={activateQuickNewPartner}
                                                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                                        >
                                                            + إضافة سريعة: "{searchPartnerTerm}"
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">المدفوع حالياً</label>
                                    {netAmount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setPaidAmount(netAmount.toString())}
                                            className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline focus:outline-none"
                                        >
                                            كامل المبلغ ({netAmount.toLocaleString()})
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={paidAmount}
                                    onChange={(e) => setPaidAmount(e.target.value)}
                                    className="w-full h-[48px] bg-emerald-50 dark:bg-emerald-900/10 border-none rounded-xl text-center text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono"
                                    placeholder="0"
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
                                        className="w-full h-[44px] bg-blue-50/50 dark:bg-blue-900/10 border-none rounded-xl pr-9 pl-4 text-sm font-bold text-blue-700 dark:text-blue-300 appearance-none disabled:opacity-50"
                                        disabled={currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'ADMIN'}
                                    >
                                        <option value="" disabled>اختر الصندوق المتأثر...</option>
                                        {cashBoxes.map(box => (
                                            <option key={box.id} value={box.id}>{box.name} ({(calculatedBalances[box.id!] || 0).toLocaleString()} {box.currency})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Optical Prescription Section (Manual Sales only) */}
                    {entryType === 'manual_sale' && (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <button 
                                type="button" 
                                onClick={() => setShowOpticalSection(!showOpticalSection)} 
                                className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-xl shrink-0">
                                        <Eye size={18} className="text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="text-right">
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">بيانات القياس البصري</h3>
                                        <p className="text-[10px] text-slate-500 font-bold">Optical Prescription</p>
                                    </div>
                                </div>
                                <div className={cn(
                                    "text-[10px] px-3 py-1.5 rounded-full font-black transition-all",
                                    showOpticalSection 
                                        ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                                        : "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                )}>
                                    {showOpticalSection ? 'إخفاء' : 'إضافة قياس'}
                                </div>
                            </button>

                            <AnimatePresence>
                                {showOpticalSection && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="p-4 space-y-4"
                                    >
                                        {/* Right Eye */}
                                        <div className="border border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10 rounded-2xl p-4">
                                            <h4 className="text-[11px] font-black text-rose-600 dark:text-rose-400 mb-3 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                                                العين اليمنى (RIGHT EYE)
                                            </h4>
                                            <div className="space-y-4" dir="ltr">
                                                <div>
                                                    <p className="text-[10px] text-slate-500 font-bold mb-2 text-right">Distance (D)</p>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-slate-400 block text-center">SPH</label>
                                                            <input type="text" placeholder="0.00" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optRightSph} onChange={e => setOptRightSph(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-slate-400 block text-center">CYL</label>
                                                            <input type="text" placeholder="0.00" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optRightCyl} onChange={e => setOptRightCyl(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1 font-mono">
                                                            <label className="text-[9px] font-bold text-slate-400 block text-center">AX</label>
                                                            <input type="text" placeholder="0" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optRightAx} onChange={e => setOptRightAx(e.target.value)} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-rose-100 dark:bg-rose-900/30 w-full"></div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 font-bold mb-2 text-right">Near (N)</p>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <input type="text" placeholder="SPH" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optRightNearSph} onChange={e => setOptRightNearSph(e.target.value)} />
                                                        <input type="text" placeholder="CYL" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optRightNearCyl} onChange={e => setOptRightNearCyl(e.target.value)} />
                                                        <input type="text" placeholder="AX" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optRightNearAx} onChange={e => setOptRightNearAx(e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Left Eye */}
                                        <div className="border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-900/10 rounded-2xl p-4">
                                            <h4 className="text-[11px] font-black text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                العين اليسرى (LEFT EYE)
                                            </h4>
                                            <div className="space-y-4" dir="ltr">
                                                <div>
                                                    <p className="text-[10px] text-slate-500 font-bold mb-2 text-right">Distance (D)</p>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-slate-400 block text-center">SPH</label>
                                                            <input type="text" placeholder="SPH" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optLeftSph} onChange={e => setOptLeftSph(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-slate-400 block text-center">CYL</label>
                                                            <input type="text" placeholder="CYL" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optLeftCyl} onChange={e => setOptLeftCyl(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-bold text-slate-400 block text-center">AX</label>
                                                            <input type="text" placeholder="AX" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optLeftAx} onChange={e => setOptLeftAx(e.target.value)} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="h-px bg-blue-100 dark:bg-blue-900/30 w-full"></div>
                                                <div>
                                                    <p className="text-[10px] text-slate-500 font-bold mb-2 text-right">Near (N)</p>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <input type="text" placeholder="SPH" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optLeftNearSph} onChange={e => setOptLeftNearSph(e.target.value)} />
                                                        <input type="text" placeholder="CYL" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optLeftNearCyl} onChange={e => setOptLeftNearCyl(e.target.value)} />
                                                        <input type="text" placeholder="AX" className="w-full text-center text-xs py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg dark:text-white font-mono" value={optLeftNearAx} onChange={e => setOptLeftNearAx(e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Additional Info */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">IPD (المسافة بين الحدقتين)</label>
                                                <input type="text" placeholder="64/62" className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm font-bold font-mono focus:ring-1 focus:ring-blue-500/20" value={optIpd} onChange={e => setOptIpd(e.target.value)} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">نوع العدسة</label>
                                                <select
                                                    value={optLensTypeSelect}
                                                    onChange={(e) => {
                                                        setOptLensTypeSelect(e.target.value);
                                                        if (e.target.value !== "أخرى") setOptLensType(e.target.value);
                                                        else setOptLensType("");
                                                    }}
                                                    className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm font-bold appearance-none"
                                                >
                                                    <option value="" disabled>اختر نوع العدسة...</option>
                                                    {LENS_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                                {optLensTypeSelect === "أخرى" && (
                                                    <input type="text" placeholder="اكتب نوع العدسة..." className="w-full mt-2 h-[40px] bg-slate-50 dark:bg-slate-800 border border-blue-500/30 rounded-xl px-4 text-xs font-bold" value={optLensType} onChange={e => setOptLensType(e.target.value)} />
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">نوع الإطار</label>
                                                <select
                                                    value={optFrameTypeSelect}
                                                    onChange={(e) => {
                                                        setOptFrameTypeSelect(e.target.value);
                                                        if (e.target.value !== "أخرى") setOptFrameType(e.target.value);
                                                        else setOptFrameType("");
                                                    }}
                                                    className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 text-sm font-bold appearance-none"
                                                >
                                                    <option value="" disabled>اختر نوع الإطار...</option>
                                                    {FRAME_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                                {optFrameTypeSelect === "أخرى" && (
                                                    <input type="text" placeholder="اكتب نوع الإطار..." className="w-full mt-2 h-[40px] bg-slate-50 dark:bg-slate-800 border border-blue-500/30 rounded-xl px-4 text-xs font-bold" value={optFrameType} onChange={e => setOptFrameType(e.target.value)} />
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

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

                    {/* Actions */}
                    <div className="w-full pt-4 pb-6">
                        <div className="flex gap-3">
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

                {/* Left / Bottom Column: Operations Log (سجل العمليات الأخيرة) */}
                <div className="lg:col-span-7 space-y-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-xl">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">سجل العمليات الأخيرة</h3>
                                    <p className="text-[10px] text-slate-400 font-bold">آخر العمليات التي تمت عبر الإدخال المالي السريع</p>
                                </div>
                            </div>
                            <span className="text-[10px] font-black bg-blue-50 dark:bg-blue-500/10 text-blue-600 px-2.5 py-1 rounded-full">
                                {filteredLogEntries.length} عملية
                            </span>
                        </div>

                        {/* Search and filters for log */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="بحث بالاسم أو الرقم المرجعي..."
                                    value={logSearchTerm}
                                    onChange={(e) => setLogSearchTerm(e.target.value)}
                                    className="w-full pr-8 h-10 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl text-xs font-bold focus:ring-1 focus:ring-blue-500/20 text-slate-800 dark:text-white"
                                />
                            </div>
                            <select
                                value={logFilterType}
                                onChange={(e) => setLogFilterType(e.target.value)}
                                className="h-10 bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl px-3 text-xs font-bold text-slate-700 dark:text-slate-300"
                            >
                                <option value="all">كل أنواع العمليات</option>
                                {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>

                        {/* Entries List */}
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                            {filteredLogEntries.length === 0 ? (
                                <div className="text-center py-16">
                                    <FileText size={40} className="text-slate-200 dark:text-slate-800 mx-auto mb-3" />
                                    <p className="text-xs text-slate-400 font-bold">لا توجد عمليات مضافة مؤخراً تطابق البحث</p>
                                </div>
                            ) : (
                                filteredLogEntries.slice(0, 50).map((entry) => (
                                    <div 
                                        key={entry.id} 
                                        className={cn(
                                            "p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group",
                                            entry.id === editId 
                                                ? "bg-amber-50/50 dark:bg-amber-500/5 border-amber-500/40" 
                                                : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                                entry.entryType === 'manual_sale' || entry.entryType === 'receipt' 
                                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" 
                                                    : "bg-rose-50 text-rose-600 dark:bg-rose-500/10"
                                            )}>
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-black text-slate-900 dark:text-white">
                                                        {ENTRY_TYPE_LABELS[entry.entryType]}
                                                    </span>
                                                    {entry.referenceNumber && (
                                                        <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md text-blue-600 dark:text-blue-400 font-mono">
                                                            #{entry.referenceNumber}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-700 dark:text-slate-300 font-bold mt-1">
                                                    {entry.partnerName} {entry.partnerPhone ? `(${entry.partnerPhone})` : ''}
                                                </p>
                                                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold font-mono mt-0.5">
                                                    {entry.createdAt ? safeNewDate(entry.createdAt).toLocaleDateString('ar-YE') : "---"}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 pt-3 sm:pt-0">
                                            <div className="text-left sm:text-right">
                                                <div className="text-sm font-black text-slate-900 dark:text-white font-mono">
                                                    {entry.netAmount.toLocaleString()} {entry.currency || 'YER'}
                                                </div>
                                                <div className="text-[10px] font-black text-emerald-600 mt-0.5">
                                                    المسدد: {entry.paidAmount.toLocaleString()}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/30 p-1 rounded-xl">
                                                <button 
                                                    onClick={() => doPrint(entry)} 
                                                    className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
                                                    title="طباعة"
                                                >
                                                    <Printer size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => onNavigate('quick_entry', { editId: entry.id })} 
                                                    className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-all"
                                                    title="تعديل"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(entry)} 
                                                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                                                    title="حذف"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Validation Error Modal */}
            <AnimatePresence>
                {validationError && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setValidationError(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-sm rounded-3xl shadow-2xl relative overflow-hidden z-10 border border-rose-100 dark:border-rose-500/20"
                        >
                            <div className="p-6 text-center space-y-4">
                                <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                                    <AlertCircle className="text-rose-600" size={32} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">تنبيه: خطأ في المبلغ</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                        {validationError}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setValidationError(null)}
                                    className="w-full py-3.5 bg-rose-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all cursor-pointer border-none"
                                >
                                    إغلاق لتعديل المبلغ
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
