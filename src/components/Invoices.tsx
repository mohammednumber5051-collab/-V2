import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
    Plus, Search, Eye, Printer, Trash2, ShoppingCart, User, Package, 
    Calendar, ArrowRight, Edit2, FileText, Check, X, Phone,
    Sparkles, RefreshCw, Languages, CreditCard, Wallet, AlertCircle, Share2, Info
} from "lucide-react";
import { dbService } from "../services/db";
import { Invoice, Product, Customer, Supplier, InvoiceItem, InvoiceStatus, Currency, PaymentType, CashBox } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn, hasPermission } from "../lib/utils";

const PAYMENT_TYPES: { value: PaymentType; label: string; en: string }[] = [
    { value: 'نقدآ', label: 'نقداً', en: 'Cash' },
    { value: 'آجل', label: 'آجل', en: 'On Credit' },
    { value: 'نقد_آجل', label: 'نقد + آجل', en: 'Cash & Credit' },
    { value: 'مجاني', label: 'مجاني', en: 'Free' },
];

interface InvoicesProps {
    type: 'sale' | 'purchase';
}

type PrintTemplate = 'A4' | 'A3' | 'Thermal80' | 'Thermal58';
type PrintLanguage = 'AR' | 'EN' | 'BILINGUAL';

export default function Invoices({ type }: InvoicesProps) {
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        try {
            const u = localStorage.getItem("app_user");
            if (u) setCurrentUser(JSON.parse(u));
        } catch (e) {}
    }, []);

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [lastInvoiceDoc, setLastInvoiceDoc] = useState<any>(null);
    const [hasMoreInvoices, setHasMoreInvoices] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    const [products, setProducts] = useState<Product[]>([]);
    const [partners, setPartners] = useState<(Customer | Supplier)[]>([]);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
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
    const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
    
    // UI Helpers
    const [showPartnerSuggestions, setShowPartnerSuggestions] = useState(false);
    const [productSearchTerm, setProductSearchTerm] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("الكل");

    // Print & Templates settings State
    const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
    const [storeSettings, setStoreSettings] = useState<any>(null);
    const [printTemplate, setPrintTemplate] = useState<PrintTemplate>('A4');
    const [printLanguage, setPrintLanguage] = useState<PrintLanguage>('BILINGUAL');
    const [showTerms, setShowTerms] = useState(true);
    const [showLogo, setShowLogo] = useState(true);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadSettings = async () => {
            const settings = await dbService.getStoreSettings();
            setStoreSettings(settings);
            if (settings.defaultPrintSize) {
                setPrintTemplate(settings.defaultPrintSize);
            }
            if (settings.language) {
                setPrintLanguage(settings.language.toUpperCase());
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
    }, [type]);

    const loadStaticData = async () => {
        const [prodData, partData, boxData] = await Promise.all([
            dbService.getAll("products"),
            dbService.getAll(type === 'sale' ? "customers" : "suppliers"),
            dbService.getAll("cashBoxes")
        ]);
        setProducts(prodData as Product[]);
        setPartners(partData as (Customer | Supplier)[]);
        const boxes = boxData as CashBox[];
        setCashBoxes(boxes);

        // Pre-select first active Cash Box
        const activeBox = boxes.find(b => b.isActive) || boxes[0];
        if (activeBox && !selectedBoxId) {
            setSelectedBoxId(activeBox.id || "");
            setRecordingBoxId(activeBox.id || "");
        }
    };

    const loadInvoices = async (reset: boolean = false) => {
        if (reset) {
            setInvoices([]);
            setLastInvoiceDoc(null);
        } else {
            setIsLoadingMore(true);
        }
        
        try {
            const res = await dbService.getPaginated("invoices", 25, reset ? null : lastInvoiceDoc, [{ field: 'type', op: '==', value: type }]);
            setInvoices(prev => reset ? res.data as Invoice[] : [...prev, ...res.data as Invoice[]]);
            setLastInvoiceDoc(res.lastDoc);
            setHasMoreInvoices(res.hasMore);
        } catch (error) {
            console.error("Failed to load invoices", error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const loadData = async () => {
        loadStaticData();
        loadInvoices(true);
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
            const price = type === 'sale' ? product.salePrice : product.purchasePrice;
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

    const remainingAmount = Math.max(0, calculateTotal() - discount - paidAmount);

    useEffect(() => {
        const total = calculateTotal();
        if (paymentType === 'نقدآ') {
            setPaidAmount(Math.max(0, total - discount));
        } else if (paymentType === 'آجل') {
            setPaidAmount(0);
        } else if (paymentType === 'مجاني') {
            setPaidAmount(0);
            setDiscount(total);
        }
    }, [paymentType, invoiceItems, discount]);

    const handleRecordPayment = async () => {
        if (!recordingInvoiceId || paymentAmount <= 0) return;
        if (!recordingBoxId) {
            alert("يرجى اختيار الصندوق المالي لإيداع/صرف المبلغ");
            return;
        }
        setIsSaving(true);
        try {
            const invoice = invoices.find(inv => inv.id === recordingInvoiceId);
            if (!invoice) return;

            const newPaid = (invoice.paid || 0) + paymentAmount;
            const remaining = (invoice.total - (invoice.discount || 0)) - newPaid;
            const newStatus: InvoiceStatus = remaining <= 0 ? 'مدفوع' : 'جزئي';

            await dbService.update("invoices", recordingInvoiceId, {
                paid: newPaid,
                status: newStatus
            });

            await dbService.addTransaction({
                type: invoice.type === 'sale' ? 'قبض' : 'صرف',
                amount: paymentAmount,
                currency: invoice.currency || 'YER',
                description: `دفعة من الحساب للفاتورة: #${invoice.id?.slice(0, 8).toUpperCase()}`,
                partnerId: invoice.partnerId,
                partnerName: invoice.partnerName,
                boxId: recordingBoxId, 
                relatedId: invoice.id,
                createdAt: new Date().toISOString()
            });

            setIsRecordingPayment(false);
            setRecordingInvoiceId(null);
            setPaymentAmount(0);
            loadData();
        } catch (error) {
            alert("فشل تسجيل الدفعة");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async (printAfter: boolean = false) => {
        if (invoiceItems.length === 0) {
            alert("يرجى إضافة منتج واحد على الأقل للفاتورة");
            return;
        }

        if (isNewPartner && !newPartnerName) {
            alert("يرجى إدخال اسم العميل/المورد الجديد");
            return;
        }

        if (!isNewPartner && !selectedPartnerId) {
            alert("يرجى اختيار العميل أو المورد أو كتابة اسم جديد");
            return;
        }

        if (discount < 0 || paidAmount < 0) {
            alert("لا يمكن أن يكون الخصم أو المبلغ المدفوع أقل من الصفر");
            return;
        }

        if (paidAmount > 0 && !selectedBoxId) {
            alert("يرجى تحديد الصندوق لمبلغ الدفعة الحالية");
            return;
        }

        setIsSaving(true);
        const total = calculateTotal();
        const partner = partners.find(p => p.id === selectedPartnerId);

        const status: InvoiceStatus = paidAmount === 0 
            ? 'آجل' 
            : (paidAmount >= (total - discount) ? 'مدفوع' : 'جزئي');

        const invoiceData: any = {
            type,
            partnerId: isNewPartner ? "" : selectedPartnerId,
            partnerName: isNewPartner ? newPartnerName : (partner?.name || searchPartnerTerm || "عام"),
            partnerPhone: isNewPartner ? partnerPhone : (partner?.phone || partnerPhone || ""),
            items: invoiceItems,
            total,
            paid: paidAmount,
            discount,
            status,
            paymentType,
            referenceNumber,
            notes,
            currency,
            boxId: selectedBoxId,
            autoCreatePartner: isNewPartner,
            lifecycleStatus: 'معتمد'
        };

        try {
            let savedId = editingInvoiceId;
            if (editingInvoiceId) {
                const oldInvoice = invoices.find(inv => inv.id === editingInvoiceId);
                if (oldInvoice) {
                    await dbService.updateInvoiceData(oldInvoice, invoiceData);
                } else {
                    await dbService.update("invoices", editingInvoiceId, invoiceData);
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
        } catch (error) {
            console.error("Error saving invoice:", error);
            alert("حدث خطأ أثناء حفظ الفاتورة: " + error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditInvoice = (inv: Invoice) => {
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
        setIsModalOpen(true);
    };

    const confirmDeleteInvoice = async () => {
        if (!invoiceToDelete?.id) return;
        setIsSaving(true);
        try {
            await dbService.deleteInvoiceData(invoiceToDelete);
            setInvoiceToDelete(null);
            loadData();
        } catch (error) {
            alert("فشل حذف الفاتورة");
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
        // Reset to first cash box
        const defaultBox = cashBoxes.find(b => b.isActive) || cashBoxes[0];
        if (defaultBox) {
            setSelectedBoxId(defaultBox.id || "");
        }
    };

    const [statusFilter, setStatusFilter] = useState<'الكل' | InvoiceStatus>('الكل');

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = (inv.partnerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (inv.id || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = statusFilter === 'الكل' || inv.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: filteredInvoices.reduce((acc, inv) => acc + (inv.total - (inv.discount || 0)), 0),
        paid: filteredInvoices.reduce((acc, inv) => acc + (inv.paid || 0), 0),
        remaining: filteredInvoices.reduce((acc, inv) => acc + ((inv.total - (inv.discount || 0)) - (inv.paid || 0)), 0)
    };

    // Bilingual labels database
    const t = {
        AR: {
            title: type === 'sale' ? "فاتورة مبيعات" : "فاتورة مشتريات",
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
            title: type === 'sale' ? "SALES INVOICE" : "PURCHASE INVOICE",
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
        document.title = `${type === 'sale' ? 'فاتورة_بيع' : 'فاتورة_شراء'}_${viewingInvoice.partnerName || 'عام'}_${viewingInvoice.id?.slice(0, 8).toUpperCase()}_${formattedDate}`;
        triggerBrowserPrint();
        document.title = originalTitle;
    };

    // Trigger browser print using custom layout injects
    const triggerBrowserPrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow || !printRef.current) return;
        
        let customStyles = '';
        if (printTemplate === 'Thermal80') {
            customStyles = `
                @page { size: 80mm auto; margin: 0; }
                body { width: 80mm; padding: 4mm; margin: 0; direction: ${printLanguage === 'EN' ? 'ltr' : 'rtl'}; font-family: monospace, system-ui, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .print-card { width: 100%; border: none; padding: 0; margin: 0; }
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

        printWindow.document.write(`
            <html>
                <head>
                    <title>${t[printLanguage === 'EN' ? 'EN' : 'AR'].title} #${viewingInvoice?.id?.slice(0, 8)}</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        ${customStyles}
                        @media print {
                            body { background-color: #fff !important; }
                            .no-print { display: none !important; }
                        }
                    </style>
                </head>
                <body onload="setTimeout(function(){ window.print(); window.close(); }, 300);">
                    <div class="print-wrapper">
                        ${printRef.current.innerHTML}
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="space-y-2.5 animate-fade-up">
            
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
                                : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/15"
                            )}
                        >
                            <Plus size={13} className="stroke-[3]" />
                            {type === 'sale' ? "إنشاء كاشير مبيعات سريعة" : "إنشاء كاشير مشتريات سريعة"}
                        </button>
                    )}
                </div>

                {/* Horizontal Quick filter categories */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scroll-smooth custom-scrollbar w-full max-w-full">
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
            </div>

            {/* List Table Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredInvoices.map((inv) => {
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
                                        <div className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider font-mono">#{inv.id?.slice(0, 8).toUpperCase()}</div>
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
                                    {hasPermission(currentUser, 'add_invoices') && (
                                        <button 
                                            onClick={() => handleEditInvoice(inv)}
                                            className="flex flex-col items-center justify-center py-1.5 px-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer text-[9px] font-extrabold gap-0.5"
                                        >
                                            <Edit2 size={11} className="text-indigo-500" /> تعديل
                                        </button>
                                    )}
                                    {inv.status !== 'مدفوع' && hasPermission(currentUser, 'add_invoices') && (
                                        <button 
                                            onClick={() => {
                                                setRecordingInvoiceId(inv.id!);
                                                setPaymentAmount((inv.total - (inv.discount || 0)) - (inv.paid || 0));
                                                setIsRecordingPayment(true);
                                            }}
                                            className="flex flex-col items-center justify-center py-1.5 px-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-all cursor-pointer text-[9px] font-extrabold gap-0.5"
                                        >
                                            <CreditCard size={12} className="text-emerald-500" /> سداد
                                        </button>
                                    )}
                                    {hasPermission(currentUser, 'add_invoices') && (
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
                        onClick={() => loadInvoices(false)}
                        disabled={isLoadingMore}
                        className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {isLoadingMore ? "جاري التحميل..." : "تحميل المزيد"}
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
                                className="bg-slate-50 dark:bg-[#0c1222] w-full max-w-6xl h-full md:h-[90dvh] rounded-none md:rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col"
                            >
                                
                                {/* POS Header */}
                                <div className="px-4 py-2 bg-white dark:bg-[#131b2e] border-b border-slate-100 dark:border-slate-850 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-550/10 rounded-xl text-blue-600 dark:text-blue-400">
                                            <ShoppingCart size={16} className="stroke-[2.5]" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white">
                                                {editingInvoiceId ? "تعديل الفاتورة المحددة" : `نظام المبيعات السريعة / ${type === 'sale' ? 'بيع' : 'شراء'}`}
                                            </h3>
                                            <p className="text-[9px] text-slate-450 dark:text-slate-500 font-bold">بوابة مخصصة لإنهاء الفاتورة في ثوانٍ معدودة</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setIsModalOpen(false)} className="text-slate-450 hover:text-slate-650 dark:hover:text-white p-2 cursor-pointer border-none bg-transparent">
                                        <X size={18} />
                                    </button>
                                </div>

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
                                        "lg:col-span-7 flex flex-col h-full lg:h-full lg:overflow-hidden p-3 md:p-4 space-y-3 bg-slate-50 dark:bg-slate-950 custom-scrollbar flex-1 lg:flex-none min-h-0 w-full overflow-hidden",
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
     
                                            {isNewPartner && (
                                                <div className="mt-2.5 flex items-center gap-1.5 p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-450 rounded-xl text-[10px] font-black">
                                                    <Sparkles size={12} className="shrink-0" />
                                                    سيتم إدراج العميل الجديد "{newPartnerName}" في الفهرس كعميل نشط فورياً عند تأكيد الحفظ
                                                </div>
                                            )}
                                        </div>
     
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
                                    <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 mt-2 pr-1 custom-scrollbar">
                                        {filteredProductsForModal.map(p => {
                                            const activePrice = type === 'sale' ? p.salePrice : p.purchasePrice;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => addItem(p)}
                                                    className="p-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 rounded-2xl text-right flex flex-col justify-between hover:border-blue-500/30 transition-all select-none group cursor-pointer"
                                                >
                                                    <div className="space-y-1">
                                                        <div className="text-[10px] text-slate-400 font-bold block truncate">{p.sku}</div>
                                                        <div className="text-[11px] font-black text-slate-850 dark:text-slate-100 leading-tight block group-hover:text-blue-500 transition-colors line-clamp-2">{p.name}</div>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-3">
                                                        <span className="text-[10px] font-mono font-black text-blue-600 dark:text-blue-400">
                                                            {activePrice.toLocaleString()} {currency}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                                                            p.stock > (p.minStock || 5) 
                                                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-550/10" 
                                                                : "bg-rose-50 text-rose-600 dark:bg-rose-550/10"
                                                        )}>
                                                            {p.stock} قطعة
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
                                            className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold dark:text-white rounded-lg cursor-pointer h-8"
                                            value={paymentType}
                                            onChange={(e) => setPaymentType(e.target.value as any)}
                                        >
                                            {PAYMENT_TYPES.map(op => (
                                                <option key={op.value} value={op.value}>{op.label}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold dark:text-white rounded-lg cursor-pointer h-8"
                                            value={selectedBoxId}
                                            onChange={(e) => setSelectedBoxId(e.target.value)}
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
                                                remainingAmount > 0 ? "text-rose-600" : "text-emerald-500"
                                            )}>
                                                {remainingAmount.toLocaleString()} <span className="text-[8px]">YER</span>
                                            </span>
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
                                            disabled={isSaving || invoiceItems.length === 0}
                                            onClick={() => handleSubmit(false)}
                                            className="w-full h-[29px] py-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg font-black text-[10px] active:scale-95 transition-all text-center shrink-0 cursor-pointer disabled:opacity-40 border-none"
                                        >
                                            حفظ الفاتورة
                                        </button>
                                        <button 
                                            type="button"
                                            disabled={isSaving || invoiceItems.length === 0}
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
                            className="bg-[#111827] w-full max-w-5xl h-screen md:h-[90dvh] md:rounded-3xl shadow-2xl relative flex flex-col md:flex-row overflow-y-auto md:overflow-hidden md:max-h-none"
                        >
                            
                            {/* Controller parameters Left Rail */}
                            <div className="w-full md:w-80 shrink-0 max-h-[50vh] md:max-h-none bg-white dark:bg-[#131b2e] border-b md:border-b-0 md:border-l border-slate-100 dark:border-slate-850 p-4 md:p-5 flex flex-col justify-between overflow-y-auto">
                                <div className="space-y-4 md:space-y-6">
                                    <div className="flex items-center justify-between">
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
                                                                <span className="font-mono font-black text-slate-900">#{viewingInvoice.id?.toUpperCase().slice(0, 8)}</span>
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
                                                        <span className="font-mono font-black ml-1">#{viewingInvoice.id?.toUpperCase().slice(0, 8)}</span>
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
                                                </div>

                                                <div className="border-t border-dashed border-black/80 my-2" />

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

                                                <div className="flex justify-center my-3">
                                                    <div className="w-14 h-14 bg-slate-150 p-0.5">
                                                        {generateQR(viewingInvoice.id || "SYS", (viewingInvoice.total - viewingInvoice.discount))}
                                                    </div>
                                                </div>

                                                <div className="text-center text-[9px] font-black tracking-tight mt-2">
                                                    {printLanguage === 'EN' ? t.EN.footer_message : t.AR.footer_message}
                                                    <p className="text-[8px] mt-0.5 font-bold">⭐⭐⭐⭐⭐</p>
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
                            className="bg-white dark:bg-[#131b2e] w-full max-w-md rounded-3xl shadow-2xl relative overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
                                <h3 className="font-bold text-slate-800 dark:text-white">تسجيل دفعة جزئية للفاتورة</h3>
                                <button onClick={() => setIsRecordingPayment(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-5 space-y-4">
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
                                            max={(invoices.find(i => i.id === recordingInvoiceId)?.total! - invoices.find(i => i.id === recordingInvoiceId)?.discount! - invoices.find(i => i.id === recordingInvoiceId)?.paid!)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500">الصندوق المستلم</label>
                                    <select 
                                        required
                                        className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-755 rounded-xl font-bold text-xs cursor-pointer dark:text-white"
                                        value={recordingBoxId}
                                        onChange={(e) => setRecordingBoxId(e.target.value)}
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
                                        هل أنت متأكد من حذف الفاتورة رقم <span className="font-bold text-rose-600">#{invoiceToDelete.id?.slice(0, 8).toUpperCase()}</span>؟ هذه العملية لا تراجع فيها.
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
        </div>
    );
}
