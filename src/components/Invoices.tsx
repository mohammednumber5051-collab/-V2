import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
    Plus, Search, Eye, Printer, Trash2, ShoppingCart, User, Package, 
    Calendar, ArrowRight, Edit2, FileText, Check, X, Phone,
    Sparkles, RefreshCw, Languages, CreditCard, Wallet, AlertCircle, Share2, Info,
    Hash
} from "lucide-react";
import { dbService } from "../services/db";
import { syncEngine } from "../services/syncEngine";
import { Invoice, Product, Customer, Supplier, InvoiceItem, InvoiceStatus, Currency, PaymentType, CashBox } from "../types";
import { motion, AnimatePresence, useDragControls } from "motion/react";
import { cn, hasPermission } from "../lib/utils";
import { calculateUnifiedCashBalances } from "../lib/financialUtils";
import PrintPreviewModal from "./PrintPreviewModal";

const PAYMENT_TYPES: { value: PaymentType; label: string; en: string }[] = [
    { value: 'نقدآ', label: 'نقداً', en: 'Cash' },
    { value: 'آجل', label: 'آجل', en: 'On Credit' },
    { value: 'نقد_آجل', label: 'نقد + آجل', en: 'Cash & Credit' },
    { value: 'مجاني', label: 'مجاني', en: 'Free' },
];

interface InvoicesProps {
    type: 'sale' | 'purchase' | 'sale_return' | 'purchase_return';
    currentUser?: any;
}

type PrintTemplate = 'A4' | 'A3' | 'Thermal80' | 'Thermal58';
type PrintLanguage = 'AR' | 'EN' | 'BILINGUAL';

export default function Invoices({ type, currentUser: propCurrentUser }: InvoicesProps) {
    const [currentUser, setCurrentUser] = useState<any>(propCurrentUser || null);

    useEffect(() => {
        if (propCurrentUser) {
            setCurrentUser(propCurrentUser);
        } else {
            try {
                const u = localStorage.getItem("app_user");
                if (u) setCurrentUser(JSON.parse(u));
            } catch (e) {}
        }
    }, [propCurrentUser]);

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [displayCount, setDisplayCount] = useState(25);  // client-side pagination window
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    const [products, setProducts] = useState<Product[]>([]);
    const [partners, setPartners] = useState<(Customer | Supplier)[]>([]);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const posDragControls = useDragControls();
    const printDragControls = useDragControls();
    const paymentDragControls = useDragControls();
    const [searchTerm, setSearchTerm] = useState("");

    // Mobile POS Layout Toggle
    const [posActiveTab, setPosActiveTab] = useState<'cart' | 'picker'>('picker');

    // Form POS State
    const [searchPartnerTerm, setSearchPartnerTerm] = useState("");
    const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
    const [partnerPhone, setPartnerPhone] = useState<string>("");
    const [isNewPartner, setIsNewPartner] = useState(false);
    const [newPartnerName, setNewPartnerName] = useState<string>("");
    const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
    const [paidAmount, setPaidAmount] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [currency, setCurrency] = useState<Currency>("YER");
    const [paymentType, setPaymentType] = useState<PaymentType>("نقدآ");
    const [referenceNumber, setReferenceNumber] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedBoxId, setSelectedBoxId] = useState("");
    const [recordingBoxId, setRecordingBoxId] = useState("");
    const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
    const lastLoadedInvoiceIdRef = useRef<string | null>(null);
    const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
    const [calculatedBalances, setCalculatedBalances] = useState<Record<string, number>>({});

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
    
    const [originalInvoiceSearchTerm, setOriginalInvoiceSearchTerm] = useState("");
    const [originalInvoiceResults, setOriginalInvoiceResults] = useState<Invoice[]>([]);
    const [isSearchingOriginal, setIsSearchingOriginal] = useState(false);

    const searchOriginalInvoice = async (term: string) => {
        setOriginalInvoiceSearchTerm(term);
        if (term.length < 1) {
            setOriginalInvoiceResults([]);
            return;
        }
        setIsSearchingOriginal(true);
        try {
            const targetType = type === 'sale_return' ? 'sale' : 'purchase';
            const res = await dbService.getPaginated("invoices", 100, null, [{ field: 'type', op: '==', value: targetType }]);
            const matched = (res.data as Invoice[]).filter(inv => 
                (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(term.toLowerCase())) ||
                (inv.id && inv.id.toLowerCase().includes(term.toLowerCase())) ||
                (inv.partnerName && inv.partnerName.toLowerCase().includes(term.toLowerCase()))
            );
            setOriginalInvoiceResults(matched);
        } catch(e) {
            console.error(e);
        } finally {
            setIsSearchingOriginal(false);
        }
    };

    const selectOriginalInvoice = (inv: Invoice) => {
        setInvoiceItems(inv.items.map(item => ({ ...item })));
        setSelectedPartnerId(inv.partnerId);
        setSearchPartnerTerm(inv.partnerName || "");
        setPartnerPhone((inv as any).partnerPhone || "");
        setIsNewPartner(false);
        setDiscount(0);
        setPaidAmount(0); // Default to 0 refund, user can adjust
        setOriginalInvoiceSearchTerm(inv.invoiceNumber || inv.id || "");
        setOriginalInvoiceResults([]);
    };

    // UI Helpers
    const [showPartnerSuggestions, setShowPartnerSuggestions] = useState(false);
    const [productSearchTerm, setProductSearchTerm] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("الكل");
    const [validationError, setValidationError] = useState<string | null>(null);

    // Print & Templates settings State
    const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
    const [storeSettings, setStoreSettings] = useState<any>(null);
    const [printTemplate, setPrintTemplate] = useState<PrintTemplate>('A4');

    // Print Preview State
    const [printPreview, setPrintPreview] = useState<{
        isOpen: boolean;
        html: string;
        title: string;
        size: 'a4' | 'thermal';
    }>({ isOpen: false, html: '', title: '', size: 'a4' });

const frameTypeOptions = [
    "Men's Metal Frame (رجالي معدن)",
    "Men's Plastic Frame (رجالي بلاستيك)",
    "Women's Metal Frame (نسائي معدن)",
    "Women's Plastic Frame (نسائي بلاستيك)",
    "Children Frame (أطفال)",
    "Special Frame (خاص)",
    "Other"
];

const lensTypeOptions = [
    "Regular Lens",
    "Blue Cut",
    "Anti Reflective",
    "Photochromic",
    "Bifocal",
    "Progressive",
    "Sunglass Lens",
    "Other"
];
    const [printLanguage, setPrintLanguage] = useState<PrintLanguage>('BILINGUAL');
    const [showTerms, setShowTerms] = useState(true);
    const [showLogo, setShowLogo] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadSettings = async () => {
            const settings = await dbService.getStoreSettings();
            if (!settings) return;
            setStoreSettings(settings);
            if (settings.defaultPrintSize) {
                const map: Record<string, PrintTemplate> = {
                    "A4": "A4",
                    "A3": "A3",
                    "Thermal 80mm": "Thermal80",
                    "Thermal 58mm": "Thermal58"
                };
                setPrintTemplate(map[settings.defaultPrintSize] || 'A4');
            }
            if (settings.language) {
                setPrintLanguage(settings.language.toUpperCase() as PrintLanguage);
            }
        };
        loadSettings();
    }, []);

    // Recording custom pay modal
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [recordingInvoiceId, setRecordingInvoiceId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Dynamic Default Active Tab & refresh data
    useEffect(() => {
        if (isModalOpen) {
            loadStaticData();
        }
        if (invoiceItems.length > 0) {
            setPosActiveTab('cart');
        } else {
            setPosActiveTab('picker');
        }
    }, [isModalOpen]);

    useEffect(() => {
        loadData();
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadData();
            if (isModalOpen) loadStaticData();
        });
        return unsubscribe;
    }, [type, isModalOpen]);

    const loadStaticData = async () => {
        const [prodData, partData, boxData, txs, invs, vchs, qes] = await Promise.all([
            dbService.getAll("products"),
            dbService.getAll(type.includes('sale') ? 'customers' : 'suppliers'),
            dbService.getAll("cashBoxes"),
            dbService.getAll("transactions"),
            dbService.getAll("invoices"),
            dbService.getAll("vouchers"),
            dbService.getAll("quick_financial_entries")
        ]);

        const boxBalances: Record<string, number> = {};
        (boxData as CashBox[]).forEach(b => {
            boxBalances[b.id!] = b.balance || 0;
        });
        setCalculatedBalances(boxBalances);

        setProducts(prodData as Product[]);
        setPartners(partData as (Customer | Supplier)[]);
        const boxes = boxData as CashBox[];
        setCashBoxes(boxes);

        // Pre-select Cash Box based on User Policy
        const assignedBox = currentUser?.assignedBoxId ? boxes.find(b => b.id === currentUser.assignedBoxId) : null;
        if (assignedBox) {
            setSelectedBoxId(assignedBox.id || "");
            setRecordingBoxId(assignedBox.id || "");
        } else {
            const activeBox = boxes.find(b => b.isActive) || boxes[0];
            if (activeBox && !selectedBoxId) {
                setSelectedBoxId(activeBox.id || "");
                setRecordingBoxId(activeBox.id || "");
            }
        }
    };

    const loadInvoices = async () => {
        setIsLoadingMore(true);
        try {
            // Fetch ALL invoices and filter by type client-side.
            // This ensures every invoice is visible regardless of Firestore document-ID
            // ordering or any date filter that was previously active, and avoids the
            // composite-index requirement of a type-filtered + ordered Firestore query.
            const all = await dbService.getAll("invoices");
            setInvoices((all as Invoice[]).filter(inv => inv.type === type));
            setDisplayCount(25);  // reset display window on fresh load
        } catch (error) {
            console.error("Failed to load invoices", error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const loadData = async () => {
        loadStaticData();
        loadInvoices();
    };

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
        setNewPartnerName(searchPartnerTerm);
        setShowPartnerSuggestions(false);
    };

    const filteredPartners = partners.filter(p => 
        (p.name || '').toLowerCase().includes(searchPartnerTerm.toLowerCase()) ||
        (p.phone || '').toLowerCase().includes(searchPartnerTerm.toLowerCase())
    );

    const filteredProductsForModal = products.filter(p => {
        const matchesSearch = (p.name || '').toLowerCase().includes(productSearchTerm.toLowerCase()) ||
            (p.sku || '').toLowerCase().includes(productSearchTerm.toLowerCase());
        const matchesCat = activeCategory === "الكل" || p.category === activeCategory;
        return matchesSearch && matchesCat;
    });

    // Extract unique categories for quick filter chips
    const categories = ["الكل", ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

    const addItem = (product: Product) => {
        const existing = invoiceItems.find(i => i.productId === product.id);
        if (existing) {
            setInvoiceItems(invoiceItems.map(i => 
                i.productId === product.id 
                    ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } 
                    : i
            ));
        } else {
            const price = type.includes('sale') ? product.salePrice : product.purchasePrice;
            setInvoiceItems([...invoiceItems, {
                productId: product.id!,
                productName: product.name,
                quantity: 1,
                price: price,
                purchasePrice: product.purchasePrice || 0,
                total: price
            }]);
        }
        // Jump to cart page for overview on mobile
        if (invoiceItems.length === 0) {
            setPosActiveTab('cart');
        }
    };

    const removeItem = (productId: string) => {
        setInvoiceItems(invoiceItems.filter(i => i.productId !== productId));
    };

    const updateQuantity = (productId: string, newQty: number) => {
        if (newQty <= 0) {
            removeItem(productId);
            return;
        }
        setInvoiceItems(invoiceItems.map(i => 
            i.productId === productId 
                ? { ...i, quantity: newQty, total: newQty * i.price } 
                : i
        ));
    };

    const updateUnitPrice = (productId: string, newPrice: number) => {
        if (newPrice < 0) return;
        setInvoiceItems(invoiceItems.map(i => 
            i.productId === productId 
                ? { ...i, price: newPrice, total: i.quantity * newPrice } 
                : i
        ));
    };

    const calculateTotal = () => {
        return invoiceItems.reduce((acc, cur) => acc + cur.total, 0);
    };

    const remainingAmount = calculateTotal() - discount - paidAmount;
    
    const recordingInvoice = recordingInvoiceId ? invoices.find(i => i.id === recordingInvoiceId) : null;
    const currentInvoiceRemaining = recordingInvoice 
        ? Math.max(0, (Number(recordingInvoice.total || 0) - Number(recordingInvoice.discount || 0)) - Number(recordingInvoice.paid || 0))
        : 0;

    useEffect(() => {
        // If we just loaded this invoice for editing, do not run auto-calculations
        // that overwrite the loaded paid and discount values.
        if (editingInvoiceId && lastLoadedInvoiceIdRef.current === editingInvoiceId) {
            lastLoadedInvoiceIdRef.current = null;
            return;
        }

        const total = calculateTotal();
        if (paymentType === 'نقدآ') {
            setPaidAmount(Math.max(0, total - discount));
        } else if (paymentType === 'آجل') {
            setPaidAmount(0);
        } else if (paymentType === 'مجاني') {
            setPaidAmount(0);
            setDiscount(total);
        }
    }, [paymentType, invoiceItems, discount, editingInvoiceId]);

    const handleRecordPayment = async () => {
        if (!recordingInvoiceId || paymentAmount <= 0) return;
        if (!recordingBoxId) {
            setValidationError("يرجى اختيار الصندوق المالي لإيداع/صرف المبلغ");
            return;
        }

        const invoice = invoices.find(inv => inv.id === recordingInvoiceId);
        if (!invoice) return;

        // Check if paymentAmount is larger than remaining amount of the invoice
        const invoiceRemaining = Math.max(0, (Number(invoice.total || 0) - Number(invoice.discount || 0)) - Number(invoice.paid || 0));
        if (paymentAmount > invoiceRemaining) {
            setValidationError(`خطأ: مبلغ السداد (${paymentAmount.toLocaleString()}) أكبر من المبلغ المتبقي للفاتورة (${invoiceRemaining.toLocaleString()})`);
            return;
        }

        if (invoice.type === 'purchase') {
            const box = cashBoxes.find(b => b.id === recordingBoxId);
            const currentBalance = box ? (calculatedBalances[box.id!] || 0) : 0;
            if (box && (currentBalance - paymentAmount) < 0) {
                setValidationError("رصيد الصندوق غير كاف لإتمام هذه العملية (لا يمكن أن يكون بالسالب)");
                return;
            }
        }

        setIsSaving(true);
        try {
            const newPaid = Number(invoice.paid || 0) + Number(paymentAmount);
            const remaining = (Number(invoice.total || 0) - Number(invoice.discount || 0)) - newPaid;
            const newStatus: InvoiceStatus = remaining <= 0 ? 'مدفوع' : 'جزئي';

            await dbService.recordInvoicePayment(
                invoice,
                Number(paymentAmount),
                recordingBoxId,
                newPaid,
                newStatus
            );

            // Update local state immediately so changes are reflected instantly in the UI/window
            const updatedInvoice = {
                ...invoice,
                paid: newPaid,
                status: newStatus,
                updatedAt: new Date().toISOString()
            };
            setInvoices(prev => prev.map(inv => inv.id === invoice.id ? updatedInvoice : inv));
            if (viewingInvoice && viewingInvoice.id === invoice.id) {
                setViewingInvoice(updatedInvoice);
            }

            setIsRecordingPayment(false);
            setRecordingInvoiceId(null);
            setPaymentAmount(0);
            loadData();
        } catch (error: any) {
            console.error("Error recording payment:", error);
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes("Connection failed")) {
                setValidationError("فشل الاتصال بقاعدة البيانات. يرجى التأكد من إكمال إعداد Firebase في لوحة التحكم والتأكد من اتصال الإنترنت.");
            } else {
                setValidationError("حدث خطأ أثناء تسجيل الدفعة: " + errorMsg);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async (printAfter: boolean = false) => {
        if (editingInvoiceId && !hasPermission(currentUser, 'edit_invoices')) {
            setValidationError("عذراً، لا تملك صلاحية تعديل البيانات.");
            return;
        }
        const oldInvoice = editingInvoiceId ? invoices.find(inv => inv.id === editingInvoiceId) : null;

        if (invoiceItems.length === 0) {
            setValidationError("يرجى إضافة منتج واحد على الأقل للفاتورة");
            return;
        }

        if (isNewPartner && !newPartnerName) {
            setValidationError("يرجى إدخال اسم العميل/المورد الجديد");
            return;
        }

        if (!isNewPartner && !selectedPartnerId) {
            setValidationError("يرجى اختيار العميل أو المورد أو كتابة اسم جديد");
            return;
        }

        if (discount < 0 || paidAmount < 0) {
            setValidationError("لا يمكن أن يكون الخصم أو المبلغ المدفوع أقل من الصفر");
            return;
        }

        if (paidAmount > 0 && !selectedBoxId) {
            setValidationError("يرجى تحديد الصندوق لمبلغ الدفعة الحالية");
            return;
        }

        if (paidAmount > 0 && (type === 'purchase' || type === 'sale_return') && selectedBoxId) {
            const box = cashBoxes.find(b => b.id === selectedBoxId);
            if (box) {
                const currentBalance = calculatedBalances[box.id!] || 0;
                let futureBalance = currentBalance - paidAmount;
                if (editingInvoiceId && oldInvoice && oldInvoice.boxId === selectedBoxId) {
                    futureBalance += oldInvoice.paid || 0;
                }
                if (futureBalance < 0) {
                    setValidationError("رصيد الصندوق غير كاف لإتمام هذه العملية (لا يمكن أن يكون بالسالب)");
                    return;
                }
            }
        }

        // 1. Basic Validation - stop immediately if paid amount exceeds total
        const total = calculateTotal();
        const totalValue = total - discount;

        if (paidAmount > totalValue) {
            setValidationError(`خطأ: المبلغ المدفوع (${paidAmount.toLocaleString()}) أكبر من صافي قيمة الفاتورة (${totalValue.toLocaleString()})`);
            return;
        }

        setIsSaving(true);

        const partner = partners.find(p => p.id === selectedPartnerId);

        let finalPaymentType = paymentType;
        if (paidAmount > 0 && paidAmount < totalValue) {
            finalPaymentType = 'نقد_آجل';
        } else if (paidAmount === 0 && totalValue > 0 && finalPaymentType !== 'مجاني') {
            finalPaymentType = 'آجل';
        } else if (paidAmount >= totalValue && totalValue > 0) {
            finalPaymentType = 'نقدآ';
        }

        const status: InvoiceStatus = paidAmount === 0 
            ? 'آجل' 
            : (paidAmount >= (total - discount) ? 'مدفوع' : 'جزئي');

        const invoiceData: any = {
            isReturn: type.includes('return'),
            type,
            partnerId: isNewPartner ? "" : selectedPartnerId,
            partnerName: isNewPartner ? newPartnerName : (partner?.name || searchPartnerTerm || "عام"),
            partnerPhone: isNewPartner ? partnerPhone : (partner?.phone || partnerPhone || ""),
            items: invoiceItems,
            total,
            paid: paidAmount,
            discount,
            status,
            paymentType: finalPaymentType,
            referenceNumber,
            notes,
            currency,
            boxId: selectedBoxId,
            autoCreatePartner: isNewPartner,
            lifecycleStatus: 'معتمد'
        };

        if (type.includes('sale') && showOpticalSection) {
            invoiceData.opticalPrescription = {
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
            };
        }

        try {
            let savedId = editingInvoiceId;
            if (editingInvoiceId) {
                if (oldInvoice) {
                    await dbService.updateInvoiceData(oldInvoice, invoiceData);
                } else {
                    throw new Error("لا يمكن تعديل الفاتورة لعدم العثور على البيانات القديمة");
                }
            } else {
                savedId = await dbService.createInvoice(invoiceData);
            }
            
            setIsModalOpen(false);
            resetForm();
            await loadData();
            
            if (printAfter && savedId) {
                const finalInvoice: Invoice = {
                    ...invoiceData,
                    id: savedId,
                    partnerName: isNewPartner ? newPartnerName : (partners.find(p => p.id === selectedPartnerId)?.name || searchPartnerTerm || "عام"),
                };
                setViewingInvoice(finalInvoice);
            }
        } catch (error: any) {
            console.error("Error saving invoice:", error);
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes("Connection failed")) {
                setValidationError("فشل الاتصال بقاعدة البيانات. يرجى التأكد من إكمال إعداد Firebase في لوحة التحكم والتأكد من اتصال الإنترنت.");
            } else {
                setValidationError("حدث خطأ أثناء حفظ الفاتورة: " + errorMsg);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditInvoice = (inv: Invoice) => {
        if (!hasPermission(currentUser, 'edit_invoices')) {
            alert("عذراً، لا تملك صلاحية تعديل البيانات.");
            return;
        }
        lastLoadedInvoiceIdRef.current = inv.id!;
        setEditingInvoiceId(inv.id!);
        setSelectedPartnerId(inv.partnerId);
        setSearchPartnerTerm(inv.partnerName);
        setPartnerPhone((inv as any).partnerPhone || "");
        setIsNewPartner(false);
        setInvoiceItems(inv.items);
        setPaidAmount(inv.paid);
        setDiscount(inv.discount);
        setPaymentType(inv.paymentType);
        setCurrency(inv.currency);
        setReferenceNumber(inv.referenceNumber || "");
        setNotes(inv.notes || "");
        if (inv.boxId) setSelectedBoxId(inv.boxId);
        
        if (inv.opticalPrescription) {
            setShowOpticalSection(true);
            setOptRightSph(inv.opticalPrescription.rightEye?.distance?.sph || "");
            setOptRightCyl(inv.opticalPrescription.rightEye?.distance?.cyl || "");
            setOptRightAx(inv.opticalPrescription.rightEye?.distance?.ax || "");
            setOptRightNearSph(inv.opticalPrescription.rightEye?.near?.sph || "");
            setOptRightNearCyl(inv.opticalPrescription.rightEye?.near?.cyl || "");
            setOptRightNearAx(inv.opticalPrescription.rightEye?.near?.ax || "");
            setOptLeftSph(inv.opticalPrescription.leftEye?.distance?.sph || "");
            setOptLeftCyl(inv.opticalPrescription.leftEye?.distance?.cyl || "");
            setOptLeftAx(inv.opticalPrescription.leftEye?.distance?.ax || "");
            setOptLeftNearSph(inv.opticalPrescription.leftEye?.near?.sph || "");
            setOptLeftNearCyl(inv.opticalPrescription.leftEye?.near?.cyl || "");
            setOptLeftNearAx(inv.opticalPrescription.leftEye?.near?.ax || "");
            setOptIpd(inv.opticalPrescription.ipd || "");
            const initLens = inv.opticalPrescription.lensType || "";
            setOptLensType(initLens);
            setOptLensTypeSelect(lensTypeOptions.includes(initLens) ? initLens : (initLens ? "Other" : ""));
            
            const initFrame = inv.opticalPrescription.frameType || "";
            setOptFrameType(initFrame);
            setOptFrameTypeSelect(frameTypeOptions.includes(initFrame) ? initFrame : (initFrame ? "Other" : ""));
        } else {
            setShowOpticalSection(false);
            setOptRightSph(""); setOptRightCyl(""); setOptRightAx("");
            setOptRightNearSph(""); setOptRightNearCyl(""); setOptRightNearAx("");
            setOptLeftSph(""); setOptLeftCyl(""); setOptLeftAx("");
            setOptLeftNearSph(""); setOptLeftNearCyl(""); setOptLeftNearAx("");
            setOptIpd(""); setOptLensType(""); setOptFrameType(""); setOptLensTypeSelect(""); setOptFrameTypeSelect("");
        }

        setIsModalOpen(true);
    };

    const confirmDeleteInvoice = async () => {
        if (!invoiceToDelete?.id) return;
        if (!hasPermission(currentUser, 'delete_invoices')) {
            alert("عذراً، لا تملك صلاحية حذف البيانات.");
            setInvoiceToDelete(null);
            return;
        }
        setIsSaving(true);
        
        // Check for negative cashbox balance
        if (invoiceToDelete.type === 'sale' && invoiceToDelete.boxId && (invoiceToDelete.paid || 0) > 0) {
            const box = cashBoxes.find(b => b.id === invoiceToDelete.boxId);
            const currentBalance = box ? (calculatedBalances[box.id!] || 0) : 0;
            if (box && (currentBalance - invoiceToDelete.paid!) < 0) {
                setValidationError("لا يمكن حذف الفاتورة لأنها ستؤدي إلى رصيد سالب في الصندوق.");
                setIsSaving(false);
                setInvoiceToDelete(null);
                return;
            }
        }
        
        try {
            await dbService.deleteInvoiceData(invoiceToDelete);
            setInvoiceToDelete(null);
            loadData();
        } catch (error: any) {
            console.error("Error deleting invoice:", error);
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes("Connection failed")) {
                setValidationError("فشل الاتصال بقاعدة البيانات. يرجى التأكد من إكمال إعداد Firebase في لوحة التحكم والتأكد من اتصال الإنترنت.");
            } else {
                setValidationError("فشل حذف الفاتورة: " + errorMsg);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setEditingInvoiceId(null);
        setSelectedPartnerId("");
        setSearchPartnerTerm("");
        setPartnerPhone("");
        setNewPartnerName("");
        setIsNewPartner(false);
        setInvoiceItems([]);
        setPaidAmount(0);
        setDiscount(0);
        setPaymentType("نقدآ");
        setCurrency("YER");
        setReferenceNumber("");
        setNotes("");
        setShowOpticalSection(false);
        setOptRightSph(""); setOptRightCyl(""); setOptRightAx("");
        setOptRightNearSph(""); setOptRightNearCyl(""); setOptRightNearAx("");
        setOptLeftSph(""); setOptLeftCyl(""); setOptLeftAx("");
        setOptLeftNearSph(""); setOptLeftNearCyl(""); setOptLeftNearAx("");
        setOptIpd(""); setOptLensType(""); setOptFrameType(""); setOptLensTypeSelect(""); setOptFrameTypeSelect("");
        // Reset to first cash box
        const defaultBox = cashBoxes.find(b => b.isActive) || cashBoxes[0];
        if (defaultBox) {
            setSelectedBoxId(defaultBox.id || "");
        }
    };

    const [statusFilter, setStatusFilter] = useState<'الكل' | InvoiceStatus>('الكل');
    const [dateFilterType, setDateFilterType] = useState<'today' | 'specific_date' | 'date_range' | 'all'>('all');
    const [filterSpecificDate, setFilterSpecificDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [filterStartDate, setFilterStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [filterEndDate, setFilterEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

    const filteredInvoices = [...invoices].filter(inv => {
        if (inv.recordStatus === 'deleted') return false;
        const matchesSearch = (inv.partnerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.referenceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.id || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'الكل' || inv.status === statusFilter;

        let matchesDate = true;
        const dateVal = inv.createdAt || (inv as any).updatedAt;
        if (dateVal) {
            try {
                // Ensure we parse the date properly to local date string (YYYY-MM-DD)
                const invDate = new Date(dateVal);
                // Adjusting for local timezone offset safely to get correct YYYY-MM-DD locally
                const offset = invDate.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(invDate.getTime() - offset)).toISOString().split('T')[0];
                
                if (dateFilterType === 'today') {
                    const today = new Date();
                    const todayOffset = today.getTimezoneOffset() * 60000;
                    const todayLocal = (new Date(today.getTime() - todayOffset)).toISOString().split('T')[0];
                    matchesDate = localISOTime === todayLocal;
                } else if (dateFilterType === 'specific_date') {
                    matchesDate = localISOTime === filterSpecificDate;
                } else if (dateFilterType === 'date_range') {
                    matchesDate = localISOTime >= filterStartDate && localISOTime <= filterEndDate;
                }
            } catch (e) {
                console.error("Error parsing date", e);
            }
        }

        return matchesSearch && matchesStatus && matchesDate;
    }).sort((a, b) => {
        const numA = Number(a.invoiceNumber) || 0;
        const numB = Number(b.invoiceNumber) || 0;
        return numA - numB;
    });

    const stats = {
        total: filteredInvoices.reduce((acc, inv) => acc + (inv.total - (inv.discount || 0)), 0),
        paid: filteredInvoices.reduce((acc, inv) => acc + (inv.paid || 0), 0),
        remaining: filteredInvoices.reduce((acc, inv) => acc + ((inv.total - (inv.discount || 0)) - (inv.paid || 0)), 0)
    };

    // Client-side pagination — stats above see all filtered invoices; the grid shows a window
    const visibleInvoices = filteredInvoices.slice(0, displayCount);
    const hasMoreInvoices = filteredInvoices.length > displayCount;

    // Bilingual labels database
    const t = {
        AR: {
            title: type === 'sale' ? 'فاتورة مبيعات' : type === 'purchase' ? 'فاتورة مشتريات' : type === 'sale_return' ? 'فاتورة مرتجع مبيعات' : 'فاتورة مرتجع مشتريات',
            invoice_no: "رقم الفاتورة",
            date: "تاريخ الإصدار",
            customer: "العميل",
            supplier: "المورد",
            phone: "رقم الهاتف",
            cashier: "المحاسب",
            product: "المنتج",
            qty: "الكمية",
            price: "السعر",
            total: "الإجمالي",
            subtotal: "الإجمالي الفرعي",
            discount: "الخصم الممنوح",
            net_total: "المجموع الصافي",
            paid: "المبلغ المدفوع",
            remaining: "المبلغ المتبقي",
            status: "حالة السداد",
            notes: "ملاحظات الفاتورة",
            company_name: "مركز الصبيحي للبصريات والنظارات",
            company_address: "اليمن - صنعاء - شارع البصريات الرئيسي",
            company_mobile: "تلفون: 777123456",
            terms_title: "شروط الضمان وسياسة الاستبدال",
            terms_1: "1. يرجى فحص النظارة الطبية جيداً قبل مغادرة المركز.",
            terms_2: "2. فحص النظر مجاني عند شراء النظارة والعدسات من المركز.",
            terms_3: "3. الضمان يشمل العيوب المصنعية فقط ولا يشمل الكسر أو الخدش.",
            terms_4: "4. يجب إحضار أصل هذه الفاتورة للحصول على الضمان أو خدمات الصيانة المعتمدة.",
            footer_message: "نشكر زيارتكم الكريمة وثقتكم الغالية بنا!"
        },
        EN: {
            title: type === 'sale' ? 'SALES INVOICE' : type === 'purchase' ? 'PURCHASE INVOICE' : type === 'sale_return' ? 'SALES RETURN INVOICE' : 'PURCHASE RETURN INVOICE',
            invoice_no: "Invoice No",
            date: "Issue Date",
            customer: "Customer",
            supplier: "Supplier",
            phone: "Phone Number",
            cashier: "Cashier",
            product: "Product Item",
            qty: "Qty",
            price: "Price",
            total: "Total",
            subtotal: "Subtotal",
            discount: "Discount",
            net_total: "Net Amount",
            paid: "Amount Paid",
            remaining: "Remaining Debt",
            status: "Payment Status",
            notes: "Invoice Notes",
            company_name: "Al-Sobeihi Optical & Eyewear Center",
            company_address: "Yemen, Sana'a, Main Optics St.",
            company_mobile: "Tel: +967 777123456",
            terms_title: "Warranty & Exchange Terms",
            terms_1: "1. Please inspect your optical eyewear before leaving the shop.",
            terms_2: "2. Eye prescription is free with purchases of lenses & frames.",
            terms_3: "3. Warranty covers manufacture defects only; physical damage is excluded.",
            terms_4: "4. Original copy of this invoice is required for claims & adjustments.",
            footer_message: "Thank you for shopping with us! Looking forward to your next visit."
        }
    };

    // Vector QR code SVG generator (seeded layout)
    const generateQR = (id: string, total: number) => {
        const content = `INV-${id?.slice(0, 8)}-${total}`;
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            hash = content.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const modules = [];
        const size = 21; 
        for (let r = 0; r < size; r++) {
            const row = [];
            for (let c = 0; c < size; c++) {
                const isTopLeft = r < 7 && c < 7;
                const isTopRight = r < 7 && c >= size - 7;
                const isBottomLeft = r >= size - 7 && c < 7;
                
                if (isTopLeft || isTopRight || isBottomLeft) {
                    const localR = isTopLeft ? r : (isTopRight ? r : r - (size - 7));
                    const localC = isTopLeft ? c : (isTopRight ? c - (size - 7) : c);
                    const isBorder = localR === 0 || localR === 6 || localC === 0 || localC === 6;
                    const isCenter = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
                    row.push(isBorder || isCenter ? 1 : 0);
                } else {
                    const noise = Math.sin((r * 12.9898 + c * 78.233) + hash) * 43758.5453;
                    row.push((noise - Math.floor(noise)) > 0.45 ? 1 : 0);
                }
            }
            modules.push(row);
        }

        return (
            <svg width="100%" height="100%" viewBox="0 0 21 21" shapeRendering="crispEdges" className="text-slate-900 fill-current">
                {modules.map((row, r) => 
                    row.map((active, c) => 
                        active ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" /> : null
                    )
                )}
            </svg>
        );
    };

    // Client-side instant high fidelity PDF file direct printer export
    const handlePdfExport = () => {
        if (!viewingInvoice) return;
        const originalTitle = document.title;
        const formattedDate = new Date().toISOString().split('T')[0];
        document.title = `${type === 'sale' ? 'فاتورة_بيع' : type === 'purchase' ? 'فاتورة_شراء' : type === 'sale_return' ? 'مرتجع_مبيعات' : 'مرتجع_مشتريات'}_${viewingInvoice.partnerName || 'عام'}_${viewingInvoice.invoiceNumber || viewingInvoice.id?.slice(0, 8).toUpperCase()}_${formattedDate}`;
        triggerBrowserPrint();
        document.title = originalTitle;
    };

    // Trigger browser print using custom layout injects
    const triggerBrowserPrint = () => {
        if (!viewingInvoice || !printRef.current) return;
        
        let customStyles = '';
        if (printTemplate === 'Thermal80') {
            customStyles = `
                @page { size: 80mm auto; margin: 0; }
                body { width: 80mm; padding: 4mm; margin: 0; direction: ${printLanguage === 'EN' ? 'ltr' : 'rtl'}; font-family: monospace, system-ui, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .print-card { width: 100%; border: none; padding: 0; margin: 0; }
                #invoice_wrapper { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; }
                table { width: 100%; border-collapse: collapse; margin: 5px 0; }
                th, td { padding: 4px 1px; border-bottom: 1px dashed #000; font-size: 11px; text-align: start; }
                .divider { border-top: 1px dashed #000; margin: 6px 0; }
                .thermal-hide { display: none !important; }
            `;
        } else if (printTemplate === 'Thermal58') {
            customStyles = `
                @page { size: 58mm auto; margin: 0; }
                body { width: 58mm; padding: 2mm; margin: 0; direction: ${printLanguage === 'EN' ? 'ltr' : 'rtl'}; font-family: monospace, system-ui, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .print-card { width: 100%; border: none; padding: 0; margin: 0; }
                #invoice_wrapper { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important; }
                table { width: 100%; border-collapse: collapse; margin: 4px 0; }
                th, td { padding: 3px 1px; border-bottom: 1px dashed #000; font-size: 9px; text-align: start; }
                .divider { border-top: 1px dashed #000; margin: 4px 0; }
                .thermal-hide { display: none !important; }
            `;
        } else if (printTemplate === 'A3') {
            customStyles = `
                @page { size: A3; margin: 15mm; }
                body { direction: ${printLanguage === 'EN' ? 'ltr' : 'rtl'}; font-family: system-ui, sans-serif; background-color: #fff; padding: 20px; color: #000; }
                .print-card { border: 1px solid #ccc; border-radius: 12px; padding: 40px; }
                table { width: 100%; border-collapse: collapse; margin: 25px 0; }
                th, td { padding: 12px 10px; border-bottom: 1px solid #ddd; text-align: start; }
                th { background-color: #f8fafc; font-weight: bold; }
            `;
        } else { // A4
            customStyles = `
                @page { size: A4; margin: 10mm; }
                body { direction: ${printLanguage === 'EN' ? 'ltr' : 'rtl'}; font-family: system-ui, sans-serif; background-color: #fff; padding: 10px; color: #000; }
                .print-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th, td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: start; }
                th { background-color: #f8fafc; font-weight: bold; }
            `;
        }

        const html = `
            <style>
                ${customStyles}
            </style>
            <div class="print-wrapper">
                ${printRef.current.innerHTML}
            </div>
        `;

        setPrintPreview({
            isOpen: true,
            html,
            title: `${type === 'sale' ? 'فاتورة بيع' : type === 'purchase' ? 'فاتورة شراء' : type === 'sale_return' ? 'مرتجع مبيعات' : 'مرتجع مشتريات'} #${viewingInvoice?.invoiceNumber || viewingInvoice?.id?.slice(0, 8)}`,
            size: (printTemplate === 'Thermal80' || printTemplate === 'Thermal58') ? 'thermal' : 'a4'
        });
    };

    return (
        <div className="space-y-2.5 animate-fade-up">
            <PrintPreviewModal 
                isOpen={printPreview.isOpen}
                onClose={() => setPrintPreview(prev => ({ ...prev, isOpen: false }))}
                htmlContent={printPreview.html}
                title={printPreview.title}
                paperSize={printPreview.size}
            />
            {/* Metric Overview Cards */}
            <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                <div className="bg-white dark:bg-[#131b2e] p-2 md:p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden transition-all hover:border-slate-200">
                    <div className="absolute top-0 right-0 w-12 h-12 -mr-4 -mt-4 bg-blue-50 dark:bg-blue-500/5 rounded-full" />
                    <div className="relative">
                        <div className="text-[8px] sm:text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">إجمالي النشط</div>
                        <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-mono tracking-tight mt-0.5">{(stats.total || 0).toLocaleString()} <span className="text-[9px] text-slate-400">YER</span></div>
                        <div className="text-[8px] text-blue-500 font-bold mt-1 flex items-center gap-0.5 truncate">
                            <ShoppingCart size={10} className="shrink-0" /> {filteredInvoices.length} فواتير
                        </div>
                    </div>
                </div>
                
                <div className="bg-white dark:bg-[#131b2e] p-2 md:p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden transition-all hover:border-slate-200">
                    <div className="absolute top-0 right-0 w-12 h-12 -mr-4 -mt-4 bg-emerald-50 dark:bg-emerald-500/5 rounded-full" />
                    <div className="relative">
                        <div className="text-[8px] sm:text-[9px] font-black text-emerald-500 uppercase tracking-wider truncate">المقبوض كاش</div>
                        <div className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">{(stats.paid || 0).toLocaleString()} <span className="text-[9px] text-slate-450">YER</span></div>
                        <div className="text-[8px] text-emerald-500 font-bold mt-1 flex items-center gap-0.5 truncate">
                            <Check size={10} className="shrink-0" /> {((stats.paid / (stats.total || 1)) * 100).toFixed(0)}% تغطية
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#131b2e] p-2 md:p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden transition-all hover:border-slate-200">
                    <div className="absolute top-0 right-0 w-12 h-12 -mr-4 -mt-4 bg-rose-50 dark:bg-rose-500/5 rounded-full" />
                    <div className="relative">
                        <div className="text-[8px] sm:text-[9px] font-black text-rose-400 uppercase tracking-wider truncate">المتبقي ديون</div>
                        <div className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight mt-0.5">{(stats.remaining || 0).toLocaleString()} <span className="text-[9px] text-slate-450">YER</span></div>
                        <div className="text-[8px] text-rose-500 font-bold mt-1 flex items-center gap-0.5 truncate">
                            <AlertCircle size={10} className="shrink-0" /> تجميع وتحصيل
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions Filters Table controls */}
            <div className="space-y-1.5">
                <div className="flex flex-col sm:flex-row gap-1.5 sm:items-center justify-between">
                    <div className="relative w-full sm:w-48 md:w-52 shrink-0">
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input
                            type="text"
                            placeholder="ابحث برقم الفاتورة أو اسم المستفيد..."
                            className="w-full pr-8 pl-2.5 py-2 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold transition-all focus:ring-4 focus:ring-primary/10 focus:border-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm shadow-slate-100/50 dark:shadow-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {hasPermission(currentUser, 'add_invoices') && (
                        <button
                            onClick={() => {
                                resetForm();
                                setIsModalOpen(true);
                            }}
                            className={cn(
                              "w-full sm:w-auto flex items-center justify-center gap-1 text-white px-3 py-1.5 rounded-lg transition-all shadow-md active:scale-95 text-[11px] font-black cursor-pointer shrink-0",
                              type === 'sale' 
                                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/15" 
                                : type === 'purchase'
                                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/15"
                                : type === 'sale_return'
                                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/15"
                                : "bg-red-600 hover:bg-red-700 shadow-red-500/15"
                            )}
                        >
                            <Plus size={13} className="stroke-[3]" />
                            {type === 'sale' 
                              ? "إنشاء كاشير مبيعات سريعة" 
                              : type === 'purchase' 
                              ? "إنشاء كاشير مشتريات سريعة" 
                              : type === 'sale_return' 
                              ? "إنشاء مرتجع مبيعات" 
                              : "إنشاء مرتجع مشتريات"}
                        </button>
                    )}
                </div>

                {/* Horizontal Quick filter categories and Date Filters */}
                <div className="flex flex-col xl:flex-row gap-2 xl:items-center justify-between">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 xl:pb-0 scroll-smooth custom-scrollbar w-full max-w-full">
                        {(['الكل', 'مدفوع', 'جزئي', 'آجل'] as const).map((tab) => {
                            const isActive = statusFilter === tab;
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setStatusFilter(tab)}
                                    className={cn(
                                        "px-2.5 py-1.5 rounded-xl text-[10px] font-black transition-all border shrink-0 cursor-pointer shadow-sm",
                                        isActive
                                            ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/10"
                                            : "bg-white dark:bg-[#131b2e] text-slate-600 dark:text-slate-450 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    )}
                                >
                                    {tab === 'الكل' ? 'جميع معاملات السداد' : tab}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 xl:pb-0 scroll-smooth custom-scrollbar w-full xl:w-auto shrink-0">
                        <div className="flex items-center gap-1.5 bg-white dark:bg-[#131b2e] border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm shrink-0">
                            <select
                                value={dateFilterType}
                                onChange={(e) => setDateFilterType(e.target.value as any)}
                                className="bg-transparent text-slate-700 dark:text-slate-300 text-[10px] font-bold px-2 py-1 outline-none cursor-pointer border-none"
                            >
                                <option value="today">اليوم</option>
                                <option value="specific_date">تاريخ محدد</option>
                                <option value="date_range">خلال فترة</option>
                                <option value="all">كل الأوقات</option>
                            </select>

                            {dateFilterType === 'specific_date' && (
                                <div className="flex items-center border-r border-slate-200 dark:border-slate-700 pr-1.5 pl-1">
                                    <input
                                        type="date"
                                        value={filterSpecificDate}
                                        onChange={(e) => setFilterSpecificDate(e.target.value)}
                                        className="bg-transparent text-slate-700 dark:text-slate-300 text-[10px] font-bold outline-none border-none cursor-pointer"
                                    />
                                </div>
                            )}

                            {dateFilterType === 'date_range' && (
                                <div className="flex items-center gap-1 border-r border-slate-200 dark:border-slate-700 pr-1.5 pl-1">
                                    <input
                                        type="date"
                                        value={filterStartDate}
                                        onChange={(e) => setFilterStartDate(e.target.value)}
                                        className="bg-transparent text-slate-700 dark:text-slate-300 text-[10px] font-bold outline-none border-none cursor-pointer max-w-[100px]"
                                    />
                                    <span className="text-slate-400 text-[10px]">-</span>
                                    <input
                                        type="date"
                                        value={filterEndDate}
                                        onChange={(e) => setFilterEndDate(e.target.value)}
                                        className="bg-transparent text-slate-700 dark:text-slate-300 text-[10px] font-bold outline-none border-none cursor-pointer max-w-[100px]"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* List Table Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {visibleInvoices.map((inv) => {
                    const netTotal = (inv.total || 0) - (inv.discount || 0);
                    const remaining = Math.max(0, netTotal - (inv.paid || 0));
                    return (
                        <div 
                            key={inv.id} 
                            className="bg-white dark:bg-[#131b2e] rounded-xl border border-slate-100 dark:border-slate-800/80 p-2.5 md:p-3 flex flex-col justify-between gap-2.5 transition-all hover:shadow-md dark:hover:border-slate-700/80 relative overflow-hidden"
                        >
                            <div>
                                <div className="flex justify-between items-start">
                                    <div className="space-y-0.5">
                                        <div className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider font-mono flex flex-wrap items-center gap-1.5">
                                            {inv.invoiceNumber ? (
                                                <span className="bg-blue-50 dark:bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100/60 font-extrabold">فاتورة #{inv.invoiceNumber}</span>
                                            ) : (
                                                <span>#{inv.invoiceNumber || inv.id?.slice(0, 8).toUpperCase()}</span>
                                            )}
                                            {inv.referenceNumber && (
                                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200/50 font-bold">مرجع: {inv.referenceNumber}</span>
                                            )}
                                        </div>
                                        <div className="font-extrabold text-slate-800 dark:text-slate-100 text-xs leading-tight flex items-center gap-1">
                                            <User size={12} className="text-slate-450 shrink-0" />
                                            <span className="truncate max-w-[120px]">{inv.partnerName}</span>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-black border uppercase flex items-center gap-1 shrink-0",
                                        inv.status === 'مدفوع' 
                                            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100/60" 
                                            : inv.status === 'جزئي' 
                                                ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100/60" 
                                                : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-100/60"
                                    )}>
                                        <span className={cn(
                                            "w-1 h-1 rounded-full",
                                            inv.status === 'مدفوع' ? "bg-emerald-500" : inv.status === 'جزئي' ? "bg-amber-500" : "bg-rose-500"
                                        )} />
                                        <span>{inv.status}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-1 py-1.5 border-t border-b border-slate-100/70 dark:border-slate-800/40 my-2 text-center">
                                    <div>
                                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">الصافي</span>
                                        <span className="font-mono text-[11px] font-black text-slate-900 dark:text-white">{(netTotal || 0).toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">المدفوع</span>
                                        <span className="font-mono text-[11px] font-black text-emerald-600 dark:text-emerald-400">{(inv.paid || 0).toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">المتبقي</span>
                                        <span className="font-mono text-[11px] font-black text-rose-600 dark:text-rose-400">{(remaining || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                                    <span className="bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100/60 font-mono text-[8px]">{inv.currency || 'YER'}</span>
                                    <span className="flex items-center gap-1 text-[9px]">
                                        <Calendar size={9} />
                                        {new Date(inv.createdAt || (inv as any).updatedAt || new Date()).toLocaleDateString('ar-EG')}
                                    </span>
                                </div>

                                <div className="grid grid-cols-4 gap-1 pt-1">
                                    <button 
                                        onClick={() => {
                                            setViewingInvoice(inv);
                                            setPrintTemplate('A4');
                                        }}
                                        className="flex flex-col items-center justify-center py-1.5 px-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer text-[9px] font-extrabold gap-0.5"
                                    >
                                        <Eye size={12} className="text-blue-500" /> عرض
                                    </button>
                                    {hasPermission(currentUser, 'edit_invoices') && (
                                        <button 
                                            onClick={() => handleEditInvoice(inv)}
                                            className="flex flex-col items-center justify-center py-1.5 px-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer text-[9px] font-extrabold gap-0.5"
                                        >
                                            <Edit2 size={11} className="text-indigo-500" /> تعديل
                                        </button>
                                    )}
                                    {hasPermission(currentUser, 'add_invoices') && (
                                        <button 
                                            onClick={() => {
                                                if (inv.status === 'مدفوع' || remaining <= 0) return;
                                                setRecordingInvoiceId(inv.id!);
                                                setPaymentAmount(remaining);
                                                setIsRecordingPayment(true);
                                            }}
                                            disabled={inv.status === 'مدفوع' || remaining <= 0}
                                            className={cn(
                                                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all text-[9px] font-extrabold gap-0.5",
                                                (inv.status === 'مدفوع' || remaining <= 0)
                                                    ? "bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-600 opacity-60 cursor-not-allowed"
                                                    : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                                            )}
                                        >
                                            <CreditCard size={12} className={(inv.status === 'مدفوع' || remaining <= 0) ? "text-slate-400 dark:text-slate-600" : "text-emerald-500"} /> سداد
                                        </button>
                                    )}
                                    {hasPermission(currentUser, 'delete_invoices') && (
                                        <button 
                                            onClick={() => setInvoiceToDelete(inv)}
                                            className="flex flex-col items-center justify-center py-1.5 px-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer text-[9px] font-extrabold gap-0.5"
                                        >
                                            <Trash2 size={11} className="text-rose-500" /> حذف
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {hasMoreInvoices && (
                <div className="flex justify-center mt-6 pb-24">
                    <button
                        onClick={() => setDisplayCount(prev => prev + 25)}
                        disabled={isLoadingMore}
                        className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {isLoadingMore ? "جاري التحميل..." : `تحميل المزيد (${filteredInvoices.length - displayCount} متبقية)`}
                    </button>
                </div>
            )}

            {/* UPGRADED SMART POS CHECKOUT SYSTEM MODAL */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isModalOpen && (
                        <div className="fixed inset-0 z-[100] flex items-stretch md:items-center justify-center p-0 md:p-4 animate-fade-in">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsModalOpen(false)}
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, y: "100%" }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: "100%" }}
                                drag
                                dragListener={false}
                                dragControls={posDragControls}
                                dragMomentum={false}
                                className="bg-slate-50 dark:bg-[#0c1222] w-full max-w-6xl h-[100dvh] md:h-[90dvh] rounded-none md:rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col"
                            >
                                
                                {/* POS Header */}
                                <div 
                                    className="px-4 py-2 bg-white dark:bg-[#131b2e] border-b border-slate-100 dark:border-slate-850 flex items-center justify-between shrink-0 cursor-move"
                                    onPointerDown={(e) => posDragControls.start(e)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-550/10 rounded-xl text-blue-600 dark:text-blue-400">
                                            <ShoppingCart size={16} className="stroke-[2.5]" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white">
                                                {editingInvoiceId ? "تعديل الفاتورة المحددة" : `نظام الفواتير / ${type === 'sale' ? 'بيع' : type === 'purchase' ? 'شراء' : type === 'sale_return' ? 'مرتجع مبيعات' : 'مرتجع مشتريات'}`}
                                            </h3>
                                            <p className="text-[9px] text-slate-450 dark:text-slate-500 font-bold">
                                                {type.includes('return') 
                                                  ? "بوابة مخصصة لتسجيل مرتجعات البضائع وتحديث الحسابات والمخازن فوراً" 
                                                  : "بوابة مخصصة لإنهاء الفاتورة في ثوانٍ معدودة"}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsModalOpen(false)} className="text-slate-450 hover:text-slate-650 dark:hover:text-white p-2 cursor-pointer border-none bg-transparent">
                                        <X size={18} />
                                    </button>
                                </div>

                                
                                {/* Original Invoice Picker (Returns Only) */}
                                {type.includes('return') && !editingInvoiceId && (
                                    <div className="bg-rose-50 dark:bg-rose-950/20 px-4 py-2 border-b border-rose-100 dark:border-rose-900/30">
                                        <label className="text-[10px] font-black text-rose-600 dark:text-rose-400 block mb-1">استيراد من فاتورة أصلية (اختياري)</label>
                                        <div className="relative">
                                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400" />
                                            <input 
                                                type="text"
                                                placeholder="ابحث برقم الفاتورة أو اسم العميل/المورد..."
                                                className="w-full pr-8 pl-3 py-1.5 bg-white dark:bg-[#131b2e] border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500"
                                                value={originalInvoiceSearchTerm}
                                                onChange={(e) => searchOriginalInvoice(e.target.value)}
                                            />
                                            {isSearchingOriginal && <RefreshCw size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400 animate-spin" />}
                                        </div>
                                        {originalInvoiceResults.length > 0 && (
                                            <div className="absolute left-4 right-4 mt-1 bg-white dark:bg-[#162035] border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg z-50 max-h-48 overflow-y-auto custom-scrollbar">
                                                {originalInvoiceResults.map(inv => (
                                                    <button
                                                        key={inv.id}
                                                        onClick={() => selectOriginalInvoice(inv)}
                                                        className="w-full text-right px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between"
                                                    >
                                                        <div>
                                                            <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                                {inv.partnerName}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                                                رقم الفاتورة: {inv.invoiceNumber || inv.id?.slice(0,8)} | الإجمالي: {inv.total}
                                                            </div>
                                                        </div>
                                                        <ArrowRight size={14} className="text-slate-400 rtl:rotate-180" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* COMPACT CUSTOMER PICKER for MOBILE (Always on top below header) */}
                                <div className="lg:hidden bg-white dark:bg-[#131b2e] px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-850 relative z-35 shrink-0">
                                    <div className="grid grid-cols-2 gap-1.5 relative">
                                        {/* Partner input and autocompletes */}
                                        <div className="relative">
                                            <div className="relative">
                                                <User size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input 
                                                    type="text"
                                                    placeholder="اسم العميل أو المورد..."
                                                    className="w-full pr-7 pl-2 py-1 h-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                                                    value={searchPartnerTerm}
                                                    onChange={(e) => handleSearchPartnerChange(e.target.value)}
                                                    onFocus={() => setShowPartnerSuggestions(true)}
                                                />
                                            </div>
                                            
                                            {showPartnerSuggestions && (
                                                <div className="absolute right-0 top-full mt-1 w-full max-h-40 overflow-y-auto bg-white dark:bg-[#162035] border border-slate-100 dark:border-slate-750 shadow-xl rounded-lg z-[100] divide-y divide-slate-150 dark:divide-slate-800 custom-scrollbar">
                                                    {filteredPartners.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => selectPartnerSuggestion(p)}
                                                            className="w-full px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-black flex justify-between items-center transition-colors dark:text-white cursor-pointer"
                                                        >
                                                             <span>{p.name}</span>
                                                             <span className="text-[9px] text-slate-400 font-bold">{p.phone}</span>
                                                        </button>
                                                    ))}
                                                    {filteredPartners.length === 0 && (
                                                        <div className="p-2 text-center bg-slate-50 dark:bg-slate-900">
                                                            <button
                                                                type="button"
                                                                onClick={activateQuickNewPartner}
                                                                className="text-[10px] text-blue-550 dark:text-blue-400 font-black cursor-pointer bg-transparent border-none"
                                                            >
                                                                + إضافة سريعة: "{searchPartnerTerm}"
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Phone number field */}
                                        <div className="relative">
                                            <Phone size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="text"
                                                placeholder="رقم الهاتف..."
                                                className="w-full pr-7 pl-2 py-1 h-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold dark:text-white focus:outline-none focus:border-blue-550"
                                                value={partnerPhone}
                                                onChange={(e) => setPartnerPhone(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Mobile reference number and notes inputs */}
                                    <div className="grid grid-cols-2 gap-1.5 mt-1.5 relative">
                                        <div className="relative">
                                            <Hash size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="text"
                                                placeholder="رقم المرجع..."
                                                className="w-full pr-7 pl-2 py-1 h-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold dark:text-white focus:outline-none focus:border-blue-550"
                                                value={referenceNumber}
                                                onChange={(e) => setReferenceNumber(e.target.value)}
                                            />
                                        </div>
                                        <div className="relative">
                                            <FileText size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="text"
                                                placeholder="ملاحظات..."
                                                className="w-full pr-7 pl-2 py-1 h-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-bold dark:text-white focus:outline-none focus:border-blue-550"
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {isNewPartner && (
                                        <div className="mt-1 flex items-center gap-1 p-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-450 rounded-lg text-[8px] font-bold leading-none">
                                            <Sparkles size={8} className="shrink-0" />
                                            سيتم تسجيل العميل "{newPartnerName}" تلقائياً
                                        </div>
                                    )}
                                </div>

                                {/* MOBILE NAVIGATION TABS (Only below lg screen) */}
                                <div className="lg:hidden flex border-b border-slate-100 dark:border-slate-850 bg-white dark:bg-[#131b2e] shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setPosActiveTab('picker')}
                                        className={cn(
                                            "flex-1 py-2 text-center text-xs font-black flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer",
                                            posActiveTab === 'picker'
                                                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                                                : "border-transparent text-slate-500 dark:text-slate-400"
                                        )}
                                    >
                                        <Package size={13} />
                                        <span>أصناف المخزون</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPosActiveTab('cart')}
                                        className={cn(
                                            "flex-1 py-2 text-center text-xs font-black flex items-center justify-center gap-2 border-b-2 transition-all relative cursor-pointer",
                                            posActiveTab === 'cart'
                                                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                                                : "border-transparent text-slate-500 dark:text-slate-400"
                                        )}
                                    >
                                        <ShoppingCart size={13} />
                                        <span>السلة المحددة</span>
                                        {invoiceItems.length > 0 && (
                                            <span className="absolute top-1/2 -translate-y-1/2 left-3 px-1.5 py-0.5 text-[8px] bg-red-500 text-white rounded-full font-black scale-90">
                                                {invoiceItems.length}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {/* Split Grid: Right Checkout Form vs Left Catalog Picker */}
                                <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:grid lg:grid-cols-12 gap-0">
                                    
                                    {/* checkout Billing panel - Tab 1 (Cart & Customer details) */}
                                    <div className={cn(
                                        "lg:col-span-7 flex flex-col h-full p-3 md:p-4 space-y-3 bg-slate-50 dark:bg-slate-950 custom-scrollbar flex-1 min-h-0 w-full overflow-y-auto",
                                        posActiveTab !== 'cart' ? "hidden lg:flex" : "flex"
                                    )}>
                                        
                                        {/* Customer Picker card */}
                                        <div className="hidden lg:block bg-white dark:bg-[#131b2e] p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm relative shrink-0">
                                            <label className="text-[10px] font-black text-slate-450 dark:text-slate-400 block mb-2 tracking-wide uppercase">
                                                بيانات العميل / المورد
                                            </label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 relative">
                                                
                                                {/* Partner input and autocompletes */}
                                                <div className="relative">
                                                    <div className="relative">
                                                        <User size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                        <input 
                                                            type="text"
                                                            placeholder="ابحث بالنقر واكتب اسم العميل..."
                                                            className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                                                            value={searchPartnerTerm}
                                                            onChange={(e) => handleSearchPartnerChange(e.target.value)}
                                                            onFocus={() => setShowPartnerSuggestions(true)}
                                                        />
                                                    </div>
                                                    
                                                    {showPartnerSuggestions && (
                                                        <div className="absolute right-0 top-full mt-2 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#162035] border border-slate-100 dark:border-slate-755 shadow-xl rounded-xl z-50 divide-y divide-slate-550 dark:divide-slate-800 custom-scrollbar">
                                                            {filteredPartners.map(p => (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() => selectPartnerSuggestion(p)}
                                                                    className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-805 text-xs font-black flex justify-between items-center transition-colors dark:text-white cursor-pointer"
                                                                >
                                                                     <span>{p.name}</span>
                                                                     <span className="text-[10px] text-slate-400 font-bold">{p.phone}</span>
                                                                </button>
                                                            ))}
                                                            {filteredPartners.length === 0 && (
                                                                <div className="p-3 text-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={activateQuickNewPartner}
                                                                        className="text-xs text-blue-550 dark:text-blue-400 font-black cursor-pointer bg-transparent border-none"
                                                                    >
                                                                        + إضافة سريعة للطرف: "{searchPartnerTerm}"
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
     
                                                {/* Phone number field */}
                                                <div className="relative">
                                                    <Phone size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input 
                                                        type="text"
                                                        placeholder="رقم هاتف العميل للتواصل..."
                                                        className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold dark:text-white focus:outline-none focus:border-blue-550"
                                                        value={partnerPhone}
                                                        onChange={(e) => setPartnerPhone(e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            {/* Reference Number & Notes fields */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                                <div className="relative">
                                                    <Hash size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input 
                                                        type="text"
                                                        placeholder="رقم المرجع (رقم مرجعي للفاتورة)..."
                                                        className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold dark:text-white focus:outline-none focus:border-blue-550"
                                                        value={referenceNumber}
                                                        onChange={(e) => setReferenceNumber(e.target.value)}
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <FileText size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input 
                                                        type="text"
                                                        placeholder="ملاحظات وتفاصيل الفاتورة..."
                                                        className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold dark:text-white focus:outline-none focus:border-blue-550"
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                    />
                                                </div>
                                            </div>
     
                                            {isNewPartner && (
                                                <div className="mt-2.5 flex items-center gap-1.5 p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-450 rounded-xl text-[10px] font-black">
                                                    <Sparkles size={12} className="shrink-0" />
                                                    سيتم إدراج العميل الجديد "{newPartnerName}" في الفهرس كعميل نشط فورياً عند تأكيد الحفظ
                                                </div>
                                            )}
                                        </div>
     
                                        {/* Optical Prescription Section (Sales only) */}
                                        {type === 'sale' && (
                                            <div className="bg-white dark:bg-[#131b2e] rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0 overflow-hidden flex flex-col max-h-[400px]">
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowOpticalSection(!showOpticalSection)} 
                                                    className="w-full flex items-center justify-between text-left cursor-pointer bg-slate-50 dark:bg-slate-800/50 p-3 md:p-4 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-blue-100 dark:bg-blue-500/20 p-2 rounded-xl shrink-0">
                                                            <Eye size={18} className="text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                        <div>
                                                            <div className="text-slate-900 dark:text-white font-black text-xs md:text-sm">Optical Prescription</div>
                                                            <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                                                                {!showOpticalSection && (optRightSph || optLeftSph || optIpd) ? 'RIGHT / LEFT / IPD Completed' : '(بيانات القياس البصري)'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] px-3 py-1.5 rounded-full font-black transition-colors shrink-0",
                                                        showOpticalSection 
                                                            ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                                                            : "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                                                    )}>
                                                        {showOpticalSection ? 'إخفاء' : 'فتح وتعديل'}
                                                    </span>
                                                </button>

                                                <AnimatePresence>
                                                    {showOpticalSection && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            className="overflow-y-auto custom-scrollbar p-3 md:p-4 space-y-4"
                                                        >
                                                            {/* Right Eye */}
                                                            <div className="border border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10 rounded-xl p-3 md:p-4">
                                                                <h4 className="text-[11px] font-black text-rose-600 dark:text-rose-400 mb-3 flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                                                                    RIGHT EYE (العين اليمنى)
                                                                </h4>
                                                                <div className="space-y-3">
                                                                    <div>
                                                                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold mb-1.5 text-right">Distance (D)</div>
                                                                        <div className="grid grid-cols-3 gap-2 md:gap-3" dir="ltr">
                                                                            <input type="number" step="0.25" placeholder="SPH" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm" value={optRightSph} onChange={e => setOptRightSph(e.target.value)} />
                                                                            <input type="number" step="0.25" placeholder="CYL" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm" value={optRightCyl} onChange={e => setOptRightCyl(e.target.value)} />
                                                                            <input type="number" placeholder="AX" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm" value={optRightAx} onChange={e => setOptRightAx(e.target.value)} />
                                                                        </div>
                                                                    </div>
                                                                    <div className="h-px bg-rose-100 dark:bg-rose-900/30 w-full my-3"></div>
                                                                    <div>
                                                                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold mb-1.5 text-right">Near (N)</div>
                                                                        <div className="grid grid-cols-3 gap-2 md:gap-3" dir="ltr">
                                                                            <input type="number" step="0.25" placeholder="SPH" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm" value={optRightNearSph} onChange={e => setOptRightNearSph(e.target.value)} />
                                                                            <input type="number" step="0.25" placeholder="CYL" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm" value={optRightNearCyl} onChange={e => setOptRightNearCyl(e.target.value)} />
                                                                            <input type="number" placeholder="AX" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm" value={optRightNearAx} onChange={e => setOptRightNearAx(e.target.value)} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Left Eye */}
                                                            <div className="border border-blue-100 dark:border-blue-900/30 bg-blue-50/30 dark:bg-blue-900/10 rounded-xl p-3 md:p-4">
                                                                <h4 className="text-[11px] font-black text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                                    LEFT EYE (العين اليسرى)
                                                                </h4>
                                                                <div className="space-y-3">
                                                                    <div>
                                                                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold mb-1.5 text-right">Distance (D)</div>
                                                                        <div className="grid grid-cols-3 gap-2 md:gap-3" dir="ltr">
                                                                            <input type="number" step="0.25" placeholder="SPH" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" value={optLeftSph} onChange={e => setOptLeftSph(e.target.value)} />
                                                                            <input type="number" step="0.25" placeholder="CYL" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" value={optLeftCyl} onChange={e => setOptLeftCyl(e.target.value)} />
                                                                            <input type="number" placeholder="AX" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" value={optLeftAx} onChange={e => setOptLeftAx(e.target.value)} />
                                                                        </div>
                                                                    </div>
                                                                    <div className="h-px bg-blue-100 dark:bg-blue-900/30 w-full my-3"></div>
                                                                    <div>
                                                                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold mb-1.5 text-right">Near (N)</div>
                                                                        <div className="grid grid-cols-3 gap-2 md:gap-3" dir="ltr">
                                                                            <input type="number" step="0.25" placeholder="SPH" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" value={optLeftNearSph} onChange={e => setOptLeftNearSph(e.target.value)} />
                                                                            <input type="number" step="0.25" placeholder="CYL" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" value={optLeftNearCyl} onChange={e => setOptLeftNearCyl(e.target.value)} />
                                                                            <input type="number" placeholder="AX" className="w-full text-center text-xs py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm" value={optLeftNearAx} onChange={e => setOptLeftNearAx(e.target.value)} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Additional Info */}
                                                            <div className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 md:p-4">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                                                    <div className="md:col-span-2">
                                                                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1.5 flex items-center gap-1.5"><Sparkles size={12} className="text-amber-500"/> IPD (المسافة بين الحدقتين)</label>
                                                                        <input type="number" step="0.5" placeholder="Enter IPD..." className="w-full text-center text-xs py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all shadow-sm" value={optIpd} onChange={e => setOptIpd(e.target.value)} />
                                                                    </div>
                                                                    <div className="flex flex-col gap-1.5">
                                                                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block">Lens Type (نوع العدسات)</label>
                                                                        <select
                                                                            title="Select Lens Type"
                                                                            value={optLensTypeSelect}
                                                                            onChange={(e) => {
                                                                                setOptLensTypeSelect(e.target.value);
                                                                                if (e.target.value !== "Other") {
                                                                                    setOptLensType(e.target.value);
                                                                                } else {
                                                                                    setOptLensType("");
                                                                                }
                                                                            }}
                                                                            className="w-full text-xs py-1.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all shadow-sm cursor-pointer"
                                                                        >
                                                                            <option value="" disabled>Select Lens Type</option>
                                                                            {lensTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                        </select>
                                                                        {optLensTypeSelect === "Other" && (
                                                                            <input type="text" placeholder="Specify other lens..." className="w-full mt-1.5 text-xs py-2.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all shadow-sm" value={optLensType} onChange={e => setOptLensType(e.target.value)} />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col gap-1.5">
                                                                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block">Frame Type (نوع الإطار)</label>
                                                                        <select
                                                                            title="Select Frame Type"
                                                                            value={optFrameTypeSelect}
                                                                            onChange={(e) => {
                                                                                setOptFrameTypeSelect(e.target.value);
                                                                                if (e.target.value !== "Other") {
                                                                                    setOptFrameType(e.target.value);
                                                                                } else {
                                                                                    setOptFrameType("");
                                                                                }
                                                                            }}
                                                                            className="w-full text-xs py-1.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all shadow-sm cursor-pointer"
                                                                        >
                                                                            <option value="" disabled>Select Frame Type</option>
                                                                            {frameTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                        </select>
                                                                        <input type="text" placeholder="Specify frame details (نوع/تفاصيل الإطار)..." className="w-full mt-1.5 text-xs py-1.5 px-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500 transition-all shadow-sm" value={optFrameType} onChange={e => setOptFrameType(e.target.value)} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}
     
                                        {/* Invoice items table panel */}
                                        <div className="bg-white dark:bg-[#131b2e] p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex-1 lg:flex-1 lg:min-h-0 flex flex-col overflow-hidden">
                                            <div className="flex justify-between items-center mb-2.5">
                                                <span className="text-[10px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-wider">المنتجات في الفاتورة الحالية</span>
                                                <span className="text-xs font-black text-blue-600 dark:text-blue-400">{invoiceItems.length} صنف مختار</span>
                                            </div>
     
                                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0 lg:max-h-none">
                                            {invoiceItems.length === 0 ? (
                                                <div className="py-8 flex flex-col items-center justify-center text-center text-slate-400">
                                                    <ShoppingCart size={32} className="opacity-20 mb-2 text-slate-400" />
                                                    <p className="text-xs font-black">الفاتورة فارغة حالياً</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">اختر الأصناف من القائمة للبيع المباشر</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPosActiveTab('picker')}
                                                        className="mt-2.5 text-[10px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-755 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg font-bold cursor-pointer hover:bg-slate-100 transition-colors"
                                                    >
                                                        استعراض منتجات المعرض
                                                    </button>
                                                </div>
                                            ) : (
                                                invoiceItems.map((item) => (
                                                    <div 
                                                        key={item.productId} 
                                                        className="bg-slate-50 dark:bg-slate-900/50 p-2 md:p-3 rounded-lg md:rounded-xl border border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2 md:gap-3 relative"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs font-black text-slate-800 dark:text-white truncate">{item.productName}</div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] text-slate-400">السعر:</span>
                                                                <input
                                                                    type="number"
                                                                    value={item.price}
                                                                    onChange={(e) => updateUnitPrice(item.productId, Number(e.target.value))}
                                                                    className="w-16 px-1 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono text-[10px] font-bold text-center dark:text-white"
                                                                />
                                                                <span className="text-[10px] text-slate-400">{currency}</span>
                                                            </div>
                                                        </div>
 
                                                        {/* TOUCH FRIENDLY LARGER QUANTITY TOUCH TARGETS (At least 40px blocks) */}
                                                        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
                                                            <div className="flex items-center bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-755 rounded-lg md:rounded-xl overflow-hidden p-0.5 shadow-sm">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                                                    className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-slate-650 dark:text-slate-400 font-extrabold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-sm select-none cursor-pointer"
                                                                >
                                                                    -
                                                                </button>
                                                                <span className="w-6 md:w-8 text-center text-xs font-black font-mono dark:text-white">
                                                                    {item.quantity}
                                                                </span>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                                                    className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-slate-650 dark:text-slate-400 font-extrabold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-sm select-none cursor-pointer"
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
 
                                                            <div className="text-left font-mono text-xs font-black text-slate-900 dark:text-white min-w-[50px] md:min-w-[65px]">
                                                                {item.total.toLocaleString()}
                                                            </div>
 
                                                            <button 
                                                                type="button"
                                                                onClick={() => removeItem(item.productId)}
                                                                className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors cursor-pointer"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
 

 


                                {/* Product catalog panel - Tab 2 (Fast item picker catalog) */}
                                <div className={cn(
                                    "lg:col-span-5 h-full border-r lg:border-r-0 border-l border-slate-150 dark:border-slate-850 flex flex-col bg-white dark:bg-[#131b2e] p-3 md:p-4 overflow-hidden flex-1 lg:flex-none min-h-0 w-full",
                                    posActiveTab !== 'picker' ? "hidden lg:flex" : "flex"
                                )}>
                                    <div className="space-y-2.5 shrink-0">
                                        <div className="relative">
                                            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input 
                                                type="text"
                                                placeholder="ابحث بباركود أو اسم صنف بالمخزون..."
                                                className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-black dark:text-white focus:outline-none focus:border-blue-550"
                                                value={productSearchTerm}
                                                onChange={(e) => setProductSearchTerm(e.target.value)}
                                            />
                                        </div>

                                        {/* Categories horizontal list selector */}
                                        <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                                            {categories.map(cat => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setActiveCategory(cat)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-full text-[10px] font-black shrink-0 transition-all active:scale-95 cursor-pointer",
                                                        activeCategory === cat
                                                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200"
                                                    )}
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Products Catalog Grid */}
                                    <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-1.5 mt-2 pr-1 custom-scrollbar">
                                        {filteredProductsForModal.map(p => {
                                            const activePrice = type === 'sale' ? p.salePrice : p.purchasePrice;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => addItem(p)}
                                                    className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 rounded-xl text-right flex flex-col justify-between hover:border-blue-500/30 transition-all select-none group cursor-pointer"
                                                >
                                                    <div className="space-y-0.5">
                                                        <div className="text-[9px] text-slate-400 font-bold block truncate">{p.sku}</div>
                                                        <div className="text-[10px] font-black text-slate-850 dark:text-slate-100 leading-tight block group-hover:text-blue-500 transition-colors line-clamp-2">{p.name}</div>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-1.5">
                                                        <span className="text-[10px] font-mono font-black text-blue-600 dark:text-blue-400">
                                                            {activePrice.toLocaleString()} {currency}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[8px] px-1 py-0.5 rounded-md font-bold",
                                                            p.stock > (p.minStock || 5) 
                                                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-550/10" 
                                                                : "bg-rose-50 text-rose-600 dark:bg-rose-550/10"
                                                        )}>
                                                            {p.stock}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {filteredProductsForModal.length === 0 && (
                                            <div className="col-span-2 py-10 text-center text-slate-400">
                                                <Package className="mx-auto opacity-20 mb-2" size={24} />
                                                <p className="text-xs font-black">لا توجد منتجات مطابقة حالياً</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Financial & Box selections on bottom catalog */}
                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1 mt-1 grid grid-cols-2 gap-1.5 shrink-0 bg-white dark:bg-[#131b2e]">
                                        <select
                                            className="w-full px-2 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold dark:text-white rounded-lg cursor-pointer h-6"
                                            style={{ height: '30.9915px' }}
                                            value={paymentType}
                                            onChange={(e) => setPaymentType(e.target.value as any)}
                                        >
                                            {PAYMENT_TYPES.map(op => (
                                                <option key={op.value} value={op.value}>{op.label}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="w-full px-2 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold dark:text-white rounded-lg cursor-pointer h-6 disabled:opacity-50"
                                            style={{ height: '30.9915px' }}
                                            value={selectedBoxId}
                                            onChange={(e) => setSelectedBoxId(e.target.value)}
                                            disabled={currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'ADMIN'}
                                        >
                                            <option value="">-- الصندوق المالي --</option>
                                            {cashBoxes.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* 3) MANDATORY BOTTOM STICKY ACTION BAR */}
                            <div className="shrink-0 p-2 md:p-4 bg-white dark:bg-[#131b2e] border-t border-slate-150 dark:border-slate-850 shadow-2xl relative z-20">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-1.5 md:gap-3 items-center">
                                    
                                    {/* Discount & received Cash Inputs */}
                                    <div className="md:col-span-4 grid grid-cols-2 gap-1.5 md:gap-3">
                                        <div className="relative">
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-rose-500">الخصم</span>
                                            <input 
                                                type="number"
                                                className="w-full pr-10 pl-2 py-1 h-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[11px] font-black text-rose-500 text-left"
                                                value={discount || ""}
                                                onChange={(e) => setDiscount(Number(e.target.value))}
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="relative">
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-500">المدفوع</span>
                                            <input 
                                                type="number"
                                                className="w-full pr-10 pl-2 py-1 h-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[11px] font-black text-emerald-600 text-left cursor-text"
                                                value={paidAmount || ""}
                                                onChange={(e) => setPaidAmount(Number(e.target.value))}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>

                                    {/* Sizable, High Contrast final balance details */}
                                    <div className="md:col-span-4 flex items-center justify-around bg-slate-100 dark:bg-slate-900/80 p-1 md:p-2 rounded-xl border border-slate-200/50 dark:border-slate-800 select-none">
                                        <div className="text-center">
                                            <span className="text-[8px] text-slate-400 font-black block">صافي الإجمالي</span>
                                            <span className="text-xs md:text-sm font-black text-slate-900 dark:text-white font-mono tracking-tight">
                                                {(calculateTotal() - discount).toLocaleString()} <span className="text-[8px]">YER</span>
                                            </span>
                                        </div>
                                        <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700" />
                                        <div className="text-center">
                                            <span className="text-[8px] text-slate-400 font-black block">المتبقي المطلوب</span>
                                            <span className={cn(
                                                "text-xs md:text-sm font-black font-mono tracking-tight block",
                                                remainingAmount > 0 ? "text-rose-600" : (remainingAmount < 0 ? "text-amber-500" : "text-emerald-500")
                                            )}>
                                                {remainingAmount.toLocaleString()} <span className="text-[8px]">YER</span>
                                            </span>
                                            {remainingAmount < 0 && (
                                                <div className="text-[8px] text-rose-500 font-black animate-pulse">تنبيه: المبلغ المدفوع يتجاوز الإجمالي</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* TACTILE checkout CTAs inside the sticky bottom */}
                                    <div className="md:col-span-4 grid grid-cols-3 gap-1.5">
                                        <button 
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="w-full h-[29px] py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg font-bold text-[10px] active:scale-95 transition-all text-center shrink-0 cursor-pointer border-none"
                                        >
                                            إلغاء وتراجع
                                        </button>
                                        <button 
                                            type="button"
                                            disabled={isSaving || invoiceItems.length === 0 || remainingAmount < 0}
                                            onClick={() => handleSubmit(false)}
                                            className="w-full h-[29px] py-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg font-black text-[10px] active:scale-95 transition-all text-center shrink-0 cursor-pointer disabled:opacity-40 border-none"
                                        >
                                            {type === 'sale' 
                                               ? "حفظ الفاتورة" 
                                               : type === 'purchase' 
                                               ? "حفظ الفاتورة" 
                                               : type === 'sale_return' 
                                               ? "حفظ مرتجع المبيعات" 
                                               : "حفظ مرتجع المشتريات"}
                                        </button>
                                        <button 
                                            type="button"
                                            disabled={isSaving || invoiceItems.length === 0 || remainingAmount < 0}
                                            onClick={() => handleSubmit(true)}
                                            className="w-full h-[29px] py-1.5 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-black text-[10px] shadow-md shadow-blue-500/10 active:scale-95 transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer disabled:opacity-40 border-none"
                                        >
                                            <Printer size={11} className="shrink-0" />
                                            <span>حفظ وطباعة</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body
        )}

            {/* UPGRADED PROFESSIONAL PRINTING OR CORRESPONDING CUSTOM PDF EXPORT AREA */}
            <AnimatePresence>
                {viewingInvoice && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in"
                            onClick={() => setViewingInvoice(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            drag
                            dragListener={false}
                            dragControls={printDragControls}
                            dragMomentum={false}
                            className="bg-[#111827] w-full max-w-5xl h-[100dvh] md:h-[90dvh] md:rounded-3xl shadow-2xl relative flex flex-col md:flex-row overflow-hidden"
                        >
                            
                            {/* Controller parameters Left Rail */}
                            <div className="w-full md:w-80 shrink-0 max-h-[50dvh] md:max-h-full min-h-0 bg-white dark:bg-[#131b2e] border-b md:border-b-0 md:border-l border-slate-100 dark:border-slate-850 p-4 md:p-5 flex flex-col overflow-y-auto">
                                <div className="space-y-4 md:space-y-6 flex-1 min-h-0">
                                    <div 
                                        className="flex items-center justify-between cursor-move pb-2"
                                        onPointerDown={(e) => printDragControls.start(e)}
                                    >
                                        <div>
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white">تنسيق المستند المطبوع</h4>
                                            <p className="text-[10px] text-slate-450 dark:text-slate-500 font-bold">بوابة المستندات والطباعة الفورية</p>
                                        </div>
                                        <button onClick={() => setViewingInvoice(null)} className="md:hidden p-2 -mr-2 text-slate-400 bg-slate-100 rounded-lg cursor-pointer">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    {/* Template selection form */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">قالب الورقة / Form Sizing</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {(['A4', 'A3', 'Thermal80', 'Thermal58'] as const).map(style => (
                                                <button
                                                    key={style}
                                                    type="button"
                                                    onClick={() => setPrintTemplate(style)}
                                                    className={cn(
                                                        "py-2 px-1 rounded-xl text-[10px] font-black tracking-wide border transition-all cursor-pointer",
                                                        printTemplate === style
                                                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                                            : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-755"
                                                    )}
                                                >
                                                    {style === 'A4' ? 'نموذج A4' : style === 'A3' ? 'نموذج A3' : style === 'Thermal80' ? 'حراري 80مم' : 'حراري 58مم'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Languages bilingual selections */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">اللغة / Bilingual Configuration</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            {(['AR', 'EN', 'BILINGUAL'] as const).map(lang => (
                                                <button
                                                    key={lang}
                                                    type="button"
                                                    onClick={() => setPrintLanguage(lang)}
                                                    className={cn(
                                                        "py-2 px-1 rounded-xl text-[9px] font-black border transition-all cursor-pointer",
                                                        printLanguage === lang
                                                            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                                            : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-755"
                                                    )}
                                                >
                                                    {lang === 'AR' ? 'العربية' : lang === 'EN' ? 'English' : 'ثنائي / Both'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Display checkboxes */}
                                    <div className="space-y-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                                        <label className="text-[10px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-widest block">خيارات إضافية</label>
                                        <div className="space-y-2">
                                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold dark:text-white select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={showTerms}
                                                    onChange={(e) => setShowTerms(e.target.checked)}
                                                    className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-550"
                                                />
                                                إدراج شروط الضمان والمحل
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold dark:text-white select-none">
                                                <input 
                                                    type="checkbox" 
                                                    checked={showLogo}
                                                    onChange={(e) => setShowLogo(e.target.checked)}
                                                    className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-550"
                                                />
                                                إظهار الشعار ومعلومات المحل
                                            </label>
                                        </div>
                                    </div>
                                    
                                    {/* Information alert about PDF Export */}
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex gap-2.5 items-start">
                                        <Info size={15} className="text-blue-650 shrink-0 mt-0.5" />
                                        <div className="text-[10px] leading-relaxed text-blue-800 dark:text-blue-350 font-bold">
                                            يرجى اختيار <span className="font-extrabold text-blue-600 dark:text-blue-400">"حفظ بتنسيق PDF" (Save to PDF)</span> كطابعة مستهدفة لتنزيل الفاتورة رقمياً بجودة عالية بدون فقدان تماسك الخط العربي.
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        onClick={triggerBrowserPrint}
                                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-500/10 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
                                    >
                                        <Printer size={16} /> طباعة الفاتورة الفورية
                                    </button>
                                    
                                    <button
                                        onClick={handlePdfExport}
                                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-500/10 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
                                    >
                                        <Share2 size={15} /> تصدير كمستند PDF ذكي
                                    </button>

                                    <button
                                        onClick={() => setViewingInvoice(null)}
                                        className="w-full py-3 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-xs font-bold rounded-xl text-center active:scale-95 transition-all cursor-pointer border-none"
                                    >
                                        إغلاق والعودة
                                    </button>
                                </div>
                            </div>

                            {/* Live Interactive Sizing Grid Canvas */}
                            <div className="flex-1 bg-slate-900/40 custom-scrollbar flex flex-col items-center w-full min-h-0">
                                <div className="w-full h-full p-4 md:p-8 overflow-y-auto overflow-x-auto flex" style={{ height: '100%', overflowY: 'auto' }}>
                                    <div className="m-auto">
                                        <div 
                                            ref={printRef}
                                            id="invoice_wrapper"
                                            className={cn(
                                            "bg-white text-slate-900 shadow-xl transition-all relative overflow-hidden",
                                            printTemplate === 'Thermal80' ? "w-[80mm] min-h-[140mm] text-[10px] p-3 leading-tight rounded-none border border-black/10" : 
                                            printTemplate === 'Thermal58' ? "w-[58mm] min-h-[100mm] text-[8px] p-2 leading-[1.25] rounded-none border border-black/10" : 
                                            printTemplate === 'A3' ? "w-[297mm] min-h-[420mm] text-sm p-14 rounded-2xl" : 
                                            "w-[210mm] min-h-[297mm] text-xs p-8 rounded-2xl" // default A4
                                        )}
                                        dir={printLanguage === 'EN' ? 'ltr' : 'rtl'}
                                        style={{
                                            fontSize: printTemplate === 'Thermal80' ? '11px' : printTemplate === 'Thermal58' ? '9px' : undefined
                                        }}
                                    >
                                        
                                        {/* ================= BRANCH A: STANDARD A4 / A3 PRINT LAYOUT ================= */}
                                        {!printTemplate.startsWith('Thermal') ? (
                                            <div className="h-full flex flex-col justify-between">
                                                <div>
                                                    {/* Company Logo Header */}
                                                    {(showLogo && storeSettings?.printLogo) && (
                                                        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                                                            <div>
                                                                {storeSettings?.printStoreName && (
                                                                   <h1 className="text-xl md:text-2xl font-black text-slate-900">
                                                                       {printLanguage === 'EN' ? (storeSettings?.storeNameEn || storeSettings?.storeNameAr) : storeSettings?.storeNameAr}
                                                                   </h1>
                                                                )}
                                                                {(printLanguage === 'BILINGUAL' && storeSettings?.storeNameEn) && (
                                                                    <p className="text-[10px] text-slate-500 font-bold tracking-mono">{storeSettings.storeNameEn}</p>
                                                                )}
                                                                <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                                                                   {storeSettings?.printAddress && <p>{storeSettings.address}</p>}
                                                                   <div className="flex gap-3">
                                                                       {storeSettings?.printPhone && <p>Tel: {storeSettings.phone}</p>}
                                                                       {(storeSettings?.printWhatsapp && storeSettings?.whatsapp) && <p>WA: {storeSettings.whatsapp}</p>}
                                                                   </div>
                                                                   {storeSettings?.taxNumber && <p className="font-mono">VAT: {storeSettings.taxNumber}</p>}
                                                                </div>
                                                            </div>

                                                            <div className="w-16 h-16 border-2 border-slate-200 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden bg-slate-50">
                                                                {storeSettings?.logoUrl ? (
                                                                    <img src={storeSettings.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                                                ) : (
                                                                   <span className="text-3xl">🕶️</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Document Title header banner */}
                                                    <div className="text-center bg-slate-900 text-white py-2 font-black uppercase text-xs md:text-sm tracking-widest mb-4">
                                                        {printLanguage === 'BILINGUAL' 
                                                            ? `${t.AR.title} / ${t.EN.title}` 
                                                            : (printLanguage === 'AR' ? t.AR.title : t.EN.title)}
                                                    </div>

                                                    {/* Client customer card block details */}
                                                    <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-slate-50 rounded-xl">
                                                        <div className="space-y-1.5 text-[11px] md:text-xs text-slate-800">
                                                            <div>
                                                                <span className="text-slate-500 font-bold block md:inline md:mr-1">
                                                                    {printLanguage === 'EN' ? t.EN.invoice_no : t.AR.invoice_no}:
                                                                </span>
                                                                <span className="font-mono font-black text-slate-900">{viewingInvoice.invoiceNumber || viewingInvoice.id?.toUpperCase().slice(0, 8)}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-slate-500 font-bold block md:inline md:mr-1">
                                                                    {printLanguage === 'EN' ? t.EN.date : t.AR.date}:
                                                                </span>
                                                                <span className="font-bold text-slate-900">
                                                                    {new Date(viewingInvoice.createdAt || (viewingInvoice as any).updatedAt || new Date()).toLocaleDateString(printLanguage === 'EN' ? 'en-US' : 'ar-EG')}
                                                                </span>
                                                            </div>
                                                            {viewingInvoice.referenceNumber && (
                                                                <div>
                                                                    <span className="text-slate-500 font-bold block md:inline md:mr-1">المرجع / Ref:</span>
                                                                    <span className="font-mono font-bold text-slate-900">{viewingInvoice.referenceNumber}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="space-y-1.5 text-[11px] md:text-xs text-slate-800">
                                                            <div>
                                                                <span className="text-slate-500 font-bold block md:inline md:mr-1">
                                                                    {printLanguage === 'EN' ? (viewingInvoice.type === 'sale' ? 'Issued To' : 'Issued By') : (viewingInvoice.type === 'sale' ? 'العميل المستفيد' : 'المورد المعتمد')}:
                                                                </span>
                                                                <span className="font-black text-slate-900">{viewingInvoice.partnerName}</span>
                                                            </div>
                                                            {(viewingInvoice as any).partnerPhone && (
                                                                <div>
                                                                    <span className="text-slate-500 font-bold block md:inline md:mr-1">
                                                                        {printLanguage === 'EN' ? t.EN.phone : t.AR.phone}:
                                                                    </span>
                                                                    <span className="font-mono font-black text-slate-900">{(viewingInvoice as any).partnerPhone}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {viewingInvoice?.type === 'sale' && viewingInvoice?.opticalPrescription && (
                                                        <div className="mb-5 border border-slate-300 dark:border-slate-700/50 rounded-xl overflow-hidden p-3 bg-white dark:bg-slate-900/50">
                                                            <div className="font-black text-xs border-b border-slate-200 dark:border-slate-800 pb-2 mb-2 text-slate-800 dark:text-slate-200">بيانات القياس البصري / Optical Prescription</div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <div className="font-bold text-[10px] text-rose-600 mb-1 border-b dark:border-slate-800 pb-0.5">RIGHT EYE (العين اليمنى)</div>
                                                                    <table className="w-full text-[9px] text-center border-collapse" dir="ltr">
                                                                        <thead><tr className="bg-slate-50 dark:bg-slate-800/80"><th className="border dark:border-slate-700 p-1"></th><th className="border dark:border-slate-700 p-1">SPH</th><th className="border dark:border-slate-700 p-1">CYL</th><th className="border dark:border-slate-700 p-1">AX</th></tr></thead>
                                                                        <tbody>
                                                                            <tr><td className="border dark:border-slate-700 p-1 font-bold text-slate-600 dark:text-slate-400">D</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.rightEye?.distance?.sph || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.rightEye?.distance?.cyl || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.rightEye?.distance?.ax || '-'}</td></tr>
                                                                            <tr><td className="border dark:border-slate-700 p-1 font-bold text-slate-600 dark:text-slate-400">N</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.rightEye?.near?.sph || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.rightEye?.near?.cyl || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.rightEye?.near?.ax || '-'}</td></tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-[10px] text-blue-600 mb-1 border-b dark:border-slate-800 pb-0.5">LEFT EYE (العين اليسرى)</div>
                                                                    <table className="w-full text-[9px] text-center border-collapse" dir="ltr">
                                                                        <thead><tr className="bg-slate-50 dark:bg-slate-800/80"><th className="border dark:border-slate-700 p-1"></th><th className="border dark:border-slate-700 p-1">SPH</th><th className="border dark:border-slate-700 p-1">CYL</th><th className="border dark:border-slate-700 p-1">AX</th></tr></thead>
                                                                        <tbody>
                                                                            <tr><td className="border dark:border-slate-700 p-1 font-bold text-slate-600 dark:text-slate-400">D</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.leftEye?.distance?.sph || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.leftEye?.distance?.cyl || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.leftEye?.distance?.ax || '-'}</td></tr>
                                                                            <tr><td className="border dark:border-slate-700 p-1 font-bold text-slate-600 dark:text-slate-400">N</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.leftEye?.near?.sph || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.leftEye?.near?.cyl || '-'}</td><td className="border dark:border-slate-700 p-1">{viewingInvoice?.opticalPrescription?.leftEye?.near?.ax || '-'}</td></tr>
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 text-[9px]">
                                                                <div><span className="font-bold text-slate-500">IPD:</span> <span className="font-black">{viewingInvoice?.opticalPrescription?.ipd || '-'}</span></div>
                                                                <div><span className="font-bold text-slate-500">Lens / نوع العدسات:</span> <span className="font-black">{viewingInvoice?.opticalPrescription?.lensType || '-'}</span></div>
                                                                <div><span className="font-bold text-slate-500">Frame / نوع الإطار:</span> <span className="font-black">{viewingInvoice?.opticalPrescription?.frameType || '-'}</span></div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Accounting items list table */}
                                                    <table className="w-full mb-6 text-[11px] md:text-xs">
                                                        <thead>
                                                            <tr className="border-b-2 border-slate-900 bg-slate-50">
                                                                <th className="py-2.5 text-slate-900 text-right font-black">
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.product} / ${t.EN.product}` : (printLanguage === 'AR' ? t.AR.product : t.EN.product)}
                                                                </th>
                                                                <th className="py-2.5 text-slate-900 text-center w-20 font-black">
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.qty} / ${t.EN.qty}` : (printLanguage === 'AR' ? t.AR.qty : t.EN.qty)}
                                                                </th>
                                                                <th className="py-2.5 text-slate-900 text-left w-28 font-black">
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.price} / ${t.EN.price}` : (printLanguage === 'AR' ? t.AR.price : t.EN.price)}
                                                                </th>
                                                                <th className="py-2.5 text-slate-900 text-left w-28 font-black">
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.total} / ${t.EN.total}` : (printLanguage === 'AR' ? t.AR.total : t.EN.total)}
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {viewingInvoice.items.map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50">
                                                                    <td className="py-3 font-bold text-slate-900 text-right">{item.productName}</td>
                                                                    <td className="py-3 text-slate-900 text-center font-mono font-black">{item.quantity}</td>
                                                                    <td className="py-3 text-slate-800 text-left font-mono">{(item.price || 0).toLocaleString()}</td>
                                                                    <td className="py-3 text-slate-950 text-left font-black font-mono">{(item.total || 0).toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>

                                                    {/* Totals math card rows */}
                                                    <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                                                        <div className="w-20 h-20 bg-slate-100 p-1.5 rounded-lg border border-slate-200 shadow-inner shrink-0">
                                                            {storeSettings?.printQR !== false && generateQR(viewingInvoice.id || "SYS", (viewingInvoice.total - viewingInvoice.discount))}
                                                        </div>

                                                        <div className="w-full md:w-80 space-y-2 text-[11px] md:text-xs">
                                                            <div className="flex justify-between py-1 border-b border-slate-100">
                                                                <span className="text-slate-500 font-bold">
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.subtotal} / ${t.EN.subtotal}` : (printLanguage === 'AR' ? t.AR.subtotal : t.EN.subtotal)}
                                                                </span>
                                                                <span className="font-mono text-slate-900 font-bold">{(viewingInvoice.total || 0).toLocaleString()} {viewingInvoice.currency || 'YER'}</span>
                                                            </div>
                                                            {viewingInvoice.discount > 0 && (
                                                                <div className="flex justify-between py-1 border-b border-rose-100 text-rose-600 font-bold">
                                                                    <span>
                                                                        {printLanguage === 'BILINGUAL' ? `${t.AR.discount} / ${t.EN.discount}` : (printLanguage === 'AR' ? t.AR.discount : t.EN.discount)}
                                                                    </span>
                                                                    <span className="font-mono">-{(viewingInvoice.discount || 0).toLocaleString()} {viewingInvoice.currency || 'YER'}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between py-2 bg-slate-900 text-white px-3 rounded-lg text-xs font-black">
                                                                <span>
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.net_total} / ${t.EN.net_total}` : (printLanguage === 'AR' ? t.AR.net_total : t.EN.net_total)}
                                                                </span>
                                                                <span className="font-mono">{(viewingInvoice.total - viewingInvoice.discount || 0).toLocaleString()} {viewingInvoice.currency || 'YER'}</span>
                                                            </div>
                                                            <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-600 font-bold">
                                                                <span>
                                                                    {printLanguage === 'BILINGUAL' ? `${t.AR.paid} / ${t.EN.paid}` : (printLanguage === 'AR' ? t.AR.paid : t.EN.paid)}
                                                                </span>
                                                                <span className="font-mono">{(viewingInvoice.paid || 0).toLocaleString()} {viewingInvoice.currency || 'YER'}</span>
                                                            </div>
                                                            {(viewingInvoice.total - viewingInvoice.discount - viewingInvoice.paid) > 0 && (
                                                                <div className="flex justify-between py-1 text-rose-600 font-mono font-bold">
                                                                    <span>
                                                                        {printLanguage === 'BILINGUAL' ? `${t.AR.remaining} / ${t.EN.remaining}` : (printLanguage === 'AR' ? t.AR.remaining : t.EN.remaining)}
                                                                    </span>
                                                                    <span className="font-mono font-black">{(viewingInvoice.total - viewingInvoice.discount - viewingInvoice.paid || 0).toLocaleString()} {viewingInvoice.currency || 'YER'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {viewingInvoice.notes && (
                                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] text-slate-500 mb-4 font-bold leading-relaxed">
                                                            <span className="font-black text-slate-800">ملاحظات الفاتورة / Notes: </span>
                                                            {viewingInvoice.notes}
                                                        </div>
                                                    )}

                                                    {/* Terms policy section */}
                                                    {showTerms && (
                                                        <div className="border-t border-slate-200 pt-3 my-4 text-[9px] md:text-[10px] text-slate-500 space-y-1 font-bold">
                                                            <div className="text-slate-900 font-extrabold text-xs">
                                                                {printLanguage === 'EN' ? t.EN.terms_title : t.AR.terms_title}
                                                            </div>
                                                            <p>{printLanguage === 'EN' ? t.EN.terms_1 : t.AR.terms_1}</p>
                                                            <p>{printLanguage === 'EN' ? t.EN.terms_2 : t.AR.terms_2}</p>
                                                            <p>{printLanguage === 'EN' ? t.EN.terms_3 : t.AR.terms_3}</p>
                                                            <p>{printLanguage === 'EN' ? t.EN.terms_4 : t.AR.terms_4}</p>
                                                        </div>
                                                    )}

                                                    {/* Audit Tracking Section */}
                                                    <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-3 my-4 grid grid-cols-2 gap-4 text-[9px] text-slate-500 font-medium print:break-inside-avoid">
                                                        <div>
                                                            <div className="text-slate-400 font-bold mb-1 uppercase tracking-wider text-[8px]">Created By / تم الإنشاء بواسطة</div>
                                                            <div className="font-bold text-slate-700">{(viewingInvoice as any).createdByName || 'System User'}</div>
                                                            <div>{new Date(viewingInvoice.createdAt || new Date()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                                                        </div>
                                                        {viewingInvoice.updatedAt && viewingInvoice.updatedAt !== viewingInvoice.createdAt && (
                                                            <div>
                                                                <div className="text-slate-400 font-bold mb-1 uppercase tracking-wider text-[8px]">Last Modified By / آخر تعديل بواسطة</div>
                                                                <div className="font-bold text-slate-700">{(viewingInvoice as any).updatedByName || (viewingInvoice as any).createdByName || 'System User'}</div>
                                                                <div>{new Date(viewingInvoice.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Corporate stamp labels footer */}
                                                <div className="border-t border-dotted border-slate-300 pt-5 mt-8">
                                                    <div className="grid grid-cols-2 text-center text-[10px] font-black text-slate-800 mb-6">
                                                        <div>توقيع المستلم / Receiver Signature</div>
                                                        <div>ختم واعتماد المركز / Center Stamp</div>
                                                    </div>
                                                    <p className="text-center text-slate-500 font-bold text-[10px] bg-slate-50 py-2 rounded-lg">
                                                        {storeSettings?.printFooterText || (printLanguage === 'EN' ? t.EN.footer_message : t.AR.footer_message)}
                                                    </p>
                                                    <div className="text-center text-[8px] text-slate-400 mt-4 font-medium leading-tight">
                                                        <div>Generated by ASSAR Optical Accounting</div>
                                                        <div>Designed & Developed By Mohammed Assubaihi | Mobile: 779391682</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            
                                            // ================= BRANCH B: THE THERMAL SLIP SYSTEM TEMPLATE =================
                                            <div className="thermal-layout">
                                                <div className="text-center space-y-1 mb-3">
                                                    {storeSettings?.printStoreName && (
                                                       <h2 className="text-xs font-black tracking-tight">
                                                           {printLanguage === 'EN' ? (storeSettings.storeNameEn || storeSettings.storeNameAr) : storeSettings.storeNameAr}
                                                       </h2>
                                                    )}
                                                    {(printLanguage === 'BILINGUAL' && storeSettings?.storeNameEn) && <p className="text-[8px] font-bold">{storeSettings.storeNameEn}</p>}
                                                    {storeSettings?.printPhone && <p className="text-[9px]">Tel: {storeSettings.phone}</p>}
                                                    {storeSettings?.printAddress && <p className="text-[8px] text-slate-500">{storeSettings.address}</p>}
                                                </div>

                                                <div className="border-t border-dashed border-black/80 my-2" />

                                                {/* Header fields */}
                                                <div className="space-y-1 text-[9px] leading-tight">
                                                    <div>
                                                        <span>رقم الفاتورة / No:</span>
                                                        <span className="font-mono font-black ml-1">
                                                            {viewingInvoice.invoiceNumber || viewingInvoice.id?.toUpperCase().slice(0, 8)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span>التاريخ / Date:</span>
                                                        <span className="font-mono font-bold ml-1">
                                                            {new Date(viewingInvoice.createdAt || (viewingInvoice as any).updatedAt || new Date()).toLocaleDateString(printLanguage === 'EN' ? 'en-US' : 'ar-EG')}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span>الطرف / Partner:</span>
                                                        <span className="font-black font-mono ml-1">{viewingInvoice.partnerName}</span>
                                                    </div>
                                                    {(viewingInvoice as any).partnerPhone && (
                                                        <div>
                                                            <span>الحساب / Phone:</span>
                                                            <span className="font-mono ml-1">{(viewingInvoice as any).partnerPhone}</span>
                                                        </div>
                                                    )}
                                                    {viewingInvoice.referenceNumber && (
                                                        <div>
                                                            <span>المرجع / Ref No:</span>
                                                            <span className="font-mono font-bold ml-1">{viewingInvoice.referenceNumber}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="border-t border-dashed border-black/80 my-2" />

                                                {/* Thermal Optical Prescription */}
                                                {viewingInvoice.type === 'sale' && viewingInvoice.opticalPrescription && (
                                                    <div className="mb-2 text-[8px] leading-tight space-y-1" dir="ltr">
                                                        <div className="font-black text-center border-b border-dashed border-black/30 pb-0.5 mb-1">Optical Prescription / قياسات النظر</div>
                                                        
                                                        <table className="w-full text-[8px] text-center border border-dashed border-black/30 my-1 font-mono">
                                                            <thead>
                                                                <tr className="border-b border-dashed border-black/30 bg-black/5">
                                                                    <th className="p-0.5 font-bold border-r border-dashed border-black/30">Eye</th>
                                                                    <th className="p-0.5 font-bold border-r border-dashed border-black/30">SPH</th>
                                                                    <th className="p-0.5 font-bold border-r border-dashed border-black/30">CYL</th>
                                                                    <th className="p-0.5 font-bold">AX</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                <tr className="border-b border-dashed border-black/30">
                                                                    <td className="p-0.5 font-bold border-r border-dashed border-black/30">R (D)</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.rightEye?.distance?.sph || '-'}</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.rightEye?.distance?.cyl || '-'}</td>
                                                                    <td className="p-0.5">{viewingInvoice.opticalPrescription.rightEye?.distance?.ax || '-'}</td>
                                                                </tr>
                                                                <tr className="border-b border-dashed border-black/30">
                                                                    <td className="p-0.5 font-bold border-r border-dashed border-black/30">L (D)</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.leftEye?.distance?.sph || '-'}</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.leftEye?.distance?.cyl || '-'}</td>
                                                                    <td className="p-0.5">{viewingInvoice.opticalPrescription.leftEye?.distance?.ax || '-'}</td>
                                                                </tr>
                                                                <tr className="border-b border-dashed border-black/30">
                                                                    <td className="p-0.5 font-bold border-r border-dashed border-black/30">R (N)</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.rightEye?.near?.sph || '-'}</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.rightEye?.near?.cyl || '-'}</td>
                                                                    <td className="p-0.5">{viewingInvoice.opticalPrescription.rightEye?.near?.ax || '-'}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td className="p-0.5 font-bold border-r border-dashed border-black/30">L (N)</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.leftEye?.near?.sph || '-'}</td>
                                                                    <td className="p-0.5 border-r border-dashed border-black/30">{viewingInvoice.opticalPrescription.leftEye?.near?.cyl || '-'}</td>
                                                                    <td className="p-0.5">{viewingInvoice.opticalPrescription.leftEye?.near?.ax || '-'}</td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                        
                                                        <div className="flex justify-between font-mono text-[8px] pt-1">
                                                            <span>IPD: <b>{viewingInvoice.opticalPrescription.ipd || '-'}</b></span>
                                                            <span className="truncate max-w-[90px]">Lens: <b>{viewingInvoice.opticalPrescription.lensType || '-'}</b></span>
                                                            <span className="truncate max-w-[90px]">Frame: <b>{viewingInvoice.opticalPrescription.frameType || '-'}</b></span>
                                                        </div>
                                                        
                                                        <div className="border-t border-dashed border-black/80 my-2" />
                                                    </div>
                                                )}

                                                {/* Slender simple table */}
                                                <table className="w-full text-[9px]">
                                                    <thead>
                                                        <tr className="border-b border-dashed border-black/80">
                                                            <th className="text-right py-1 font-black">الصنف Item</th>
                                                            <th className="text-center py-1 w-8">QTY</th>
                                                            <th className="text-left py-1 w-16">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-dashed divide-black/30">
                                                        {viewingInvoice.items.map((it, idx) => (
                                                            <tr key={idx}>
                                                                <td className="py-1.5 font-bold leading-snug">{it.productName}</td>
                                                                <td className="py-1.5 text-center font-mono font-black">{it.quantity}</td>
                                                                <td className="py-1.5 text-left font-mono">{(it.total || 0).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                <div className="border-t border-dashed border-black/80 my-2" />

                                                {/* Totals table elements */}
                                                <div className="space-y-1 text-[9px] leading-relaxed">
                                                    <div className="flex justify-between font-bold">
                                                        <span>الإجمالي الفرعي / Subtotal:</span>
                                                        <span className="font-mono">{(viewingInvoice.total || 0).toLocaleString()} YER</span>
                                                    </div>
                                                    {viewingInvoice.discount > 0 && (
                                                        <div className="flex justify-between text-black font-bold">
                                                            <span>الخصم الممنوح / Discount:</span>
                                                            <span className="font-mono">-{(viewingInvoice.discount || 0).toLocaleString()} YER</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between font-black border-t border-black border-double pt-1">
                                                        <span>المجموع الصافي / Net:</span>
                                                        <span className="font-mono">{(viewingInvoice.total - viewingInvoice.discount || 0).toLocaleString()} YER</span>
                                                    </div>
                                                    <div className="flex justify-between text-[9px]">
                                                        <span>المبلغ الكاش / Paid:</span>
                                                        <span className="font-mono font-bold">{(viewingInvoice.paid || 0).toLocaleString()} YER</span>
                                                    </div>
                                                    {(viewingInvoice.total - viewingInvoice.discount - viewingInvoice.paid) > 0 && (
                                                        <div className="flex justify-between font-black">
                                                            <span>الديون المتبقية / Unpaid:</span>
                                                            <span className="font-mono">{(viewingInvoice.total - viewingInvoice.discount - viewingInvoice.paid || 0).toLocaleString()} YER</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="border-t border-dashed border-black/80 my-2" />

                                                {/* Thermal guarantees */}
                                                {showTerms && (
                                                    <div className="text-[8px] text-black font-bold space-y-0.5 leading-tight mb-3">
                                                        <p className="font-black text-[9px]">شروط الضمان وسياسة المحل:</p>
                                                        <p>* الضمان يشمل العيوب المصنعية فقط.</p>
                                                        <p>* يرجى إحضار أصل الفاتورة لإجراء أي صيانة.</p>
                                                    </div>
                                                )}

                                                {/* Audit Tracking Section Thermal */}
                                                <div className="border-t border-b border-dashed border-black/80 py-1 my-2 text-[7px] text-center font-mono">
                                                    <div>Created By: {(viewingInvoice as any).createdByName || 'System'}</div>
                                                    <div>{new Date(viewingInvoice.createdAt || new Date()).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</div>
                                                    {viewingInvoice.updatedAt && viewingInvoice.updatedAt !== viewingInvoice.createdAt && (
                                                        <>
                                                            <div className="mt-1">Mod By: {(viewingInvoice as any).updatedByName || (viewingInvoice as any).createdByName || 'System'}</div>
                                                            <div>{new Date(viewingInvoice.updatedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</div>
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex justify-center my-3">
                                                    <div className="w-14 h-14 bg-slate-150 p-0.5">
                                                        {generateQR(viewingInvoice.id || "SYS", (viewingInvoice.total - viewingInvoice.discount))}
                                                    </div>
                                                </div>

                                                <div className="text-center text-[9px] font-black tracking-tight mt-2">
                                                    {printLanguage === 'EN' ? t.EN.footer_message : t.AR.footer_message}
                                                    <p className="text-[8px] mt-0.5 font-bold">⭐⭐⭐⭐⭐</p>
                                                    <div className="mt-2 text-[6px] text-slate-600 font-medium leading-tight">
                                                        <div>Generated by ASSAR Optical Accounting</div>
                                                        <div>Developed By Mohammed Assubaihi | 779391682</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal payment record widget */}
            <AnimatePresence>
                {isRecordingPayment && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                            onClick={() => setIsRecordingPayment(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            drag
                            dragListener={false}
                            dragControls={paymentDragControls}
                            dragMomentum={false}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-md rounded-3xl shadow-2xl relative max-h-[90dvh] flex flex-col overflow-hidden"
                        >
                            <div 
                                className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 shrink-0 cursor-move"
                                onPointerDown={(e) => paymentDragControls.start(e)}
                            >
                                <h3 className="font-bold text-slate-800 dark:text-white">تسجيل دفعة جزئية للفاتورة</h3>
                                <button onClick={() => setIsRecordingPayment(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-5 space-y-4 overflow-y-auto">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-500/5 rounded-xl border border-emerald-100 dark:border-emerald-500/10 text-center">
                                        <div className="text-[10px] font-black text-emerald-650 uppercase">المسجل سابقاً</div>
                                        <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
                                            {(invoices.find(i => i.id === recordingInvoiceId)?.paid || 0).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-blue-50 dark:bg-blue-500/5 rounded-xl border border-blue-100 dark:border-blue-500/10 text-center">
                                        <div className="text-[10px] font-black text-blue-500 uppercase">المتبقي المطلوب</div>
                                        <div className="text-sm font-black text-blue-700 dark:text-blue-400 mt-1 font-mono">
                                            {( (invoices.find(i => i.id === recordingInvoiceId)?.total || 0) - (invoices.find(i => i.id === recordingInvoiceId)?.discount || 0) - (invoices.find(i => i.id === recordingInvoiceId)?.paid || 0) ).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5 animate-pulse">
                                    <label className="text-xs font-bold text-slate-500">المبلغ الدفعة الحالية</label>
                                    <div className="relative">
                                        <Wallet className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                        <input 
                                            type="number"
                                            className="w-full pr-10 pl-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-755 rounded-xl font-black text-sm text-emerald-600 focus:outline-none focus:border-emerald-500 dark:text-white"
                                            value={paymentAmount}
                                            onChange={(e) => setPaymentAmount(Number(e.target.value))}
                                            autoFocus
                                            min="1"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500">الصندوق المستلم</label>
                                    <select 
                                        required
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-755 rounded-xl font-bold text-xs cursor-pointer dark:text-white disabled:opacity-50"
                                        value={recordingBoxId}
                                        onChange={(e) => setRecordingBoxId(e.target.value)}
                                        disabled={currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'ADMIN'}
                                    >
                                        <option value="">-- اختر وجهة الصندوق --</option>
                                        {cashBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                <button 
                                    onClick={handleRecordPayment}
                                    disabled={isSaving || paymentAmount <= 0}
                                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-xs shadow-md shadow-emerald-500/10 hover:bg-emerald-700 transition-all flex justify-center items-center gap-1.5 disabled:opacity-40 cursor-pointer border-none"
                                >
                                    {isSaving ? "جاري التوثيق..." : "تأكيد واستلام النقد"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Simple Delete Confirmation Card */}
            <AnimatePresence>
                {invoiceToDelete && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setInvoiceToDelete(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-sm rounded-[2rem] shadow-2xl relative overflow-hidden animate-zoom-in"
                        >
                            <div className="p-5 text-center space-y-4">
                                <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                                    <Trash2 size={24} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">تأكيد حذف الفاتورة</h3>
                                    <p className="text-xs text-slate-400 mt-1">
                                        هل أنت متأكد من حذف الفاتورة رقم <span className="font-bold text-rose-600">#{invoiceToDelete.invoiceNumber || invoiceToDelete.id?.slice(0, 8).toUpperCase()}</span>؟ هذه العملية لا تراجع فيها.
                                    </p>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => setInvoiceToDelete(null)}
                                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-black cursor-pointer border-none"
                                    >
                                        تراجع
                                    </button>
                                    <button
                                        onClick={confirmDeleteInvoice}
                                        disabled={isSaving}
                                        className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-rose-700 disabled:opacity-50 cursor-pointer border-none"
                                    >
                                        تأكيد الحذف
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
                                    <AlertCircle size={32} />
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
