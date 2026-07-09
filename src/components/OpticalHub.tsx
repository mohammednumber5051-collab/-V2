import React, { useState, useEffect } from "react";
import { 
    Wrench, 
    ShieldCheck, 
    ShoppingBag, 
    Bell, 
    Plus, 
    Search, 
    Calendar, 
    Check, 
    Clock, 
    User, 
    Phone, 
    AlertTriangle, 
    Send, 
    Sparkles, 
    Trash2, 
    CheckCircle,
    Info,
    RefreshCw
} from "lucide-react";
import { dbService } from "../services/db";
import { Customer, Warranty, RepairJob, SpecialOrder, Invoice } from "../types";
import { cn } from "../lib/utils";

type SubTab = 'repairs' | 'special_orders' | 'warranties' | 'reminders';

export default function OpticalHub() {
    const [activeTab, setActiveTab] = useState<SubTab>('repairs');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    
    // Core states
    const [repairs, setRepairs] = useState<RepairJob[]>([]);
    const [specialOrders, setSpecialOrders] = useState<SpecialOrder[]>([]);
    const [warranties, setWarranties] = useState<Warranty[]>([]);
    
    // Search/Filters
    const [searchTerm, setSearchTerm] = useState("");
    
    // Loading & saving animation
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Modals
    const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isWarrantyModalOpen, setIsWarrantyModalOpen] = useState(false);
    
    // New entity forms
    const [repairForm, setRepairForm] = useState<Partial<RepairJob>>({
        customerId: "",
        customerName: "",
        phone: "",
        repairCase: "تعديل الإطار",
        cost: 0,
        status: "تم الاستلام",
        notes: ""
    });
    
    const [orderForm, setOrderForm] = useState<Partial<SpecialOrder>>({
        customerId: "",
        customerName: "",
        phone: "",
        orderDetails: "",
        orderType: "عدسات مفصلة",
        status: "تم الطلب",
        expectedDeliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    
    const [warrantyForm, setWarrantyForm] = useState<Partial<Warranty>>({
        invoiceId: "",
        customerId: "",
        customerName: "",
        productId: "",
        productName: "",
        status: "نشط",
        caseType: "عيب مصنعي",
        notes: "",
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });

    // Load Data
    const loadAll = async () => {
        setLoading(true);
        try {
            const [custs, invs, reps, ords, warts] = await Promise.all([
                dbService.getAll("customers") as Promise<Customer[]>,
                dbService.getAll("invoices") as Promise<Invoice[]>,
                dbService.getAll("repairs") as Promise<RepairJob[]>,
                dbService.getAll("special_orders") as Promise<SpecialOrder[]>,
                dbService.getAll("warranties") as Promise<Warranty[]>
            ]);
            setCustomers(custs);
            setInvoices(invs);
            setRepairs(reps || []);
            setSpecialOrders(ords || []);
            setWarranties(warts || []);
        } catch (e) {
            console.error("Failed to load optical hub data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    // Form handlers
    const addRepair = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repairForm.customerName) {
            alert("يرجى إدخال اسم العميل");
            return;
        }
        setSaving(true);
        try {
            await dbService.add("repairs", {
                ...repairForm,
                cost: Number(repairForm.cost || 0)
            });
            setIsRepairModalOpen(false);
            setRepairForm({
                customerId: "",
                customerName: "",
                phone: "",
                repairCase: "تعديل الإطار",
                cost: 0,
                status: "تم الاستلام",
                notes: ""
            });
            loadAll();
            alert("تم تسجيل طلب الصيانة بنجاح");
        } catch (err) {
            alert("حدث خطأ أثناء حفظ طلب الصيانة");
        } finally {
            setSaving(false);
        }
    };

    const addSpecialOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderForm.customerName || !orderForm.orderDetails) {
            alert("يرجى إدخال اسم العميل وتفاصيل الطلبية");
            return;
        }
        setSaving(true);
        try {
            await dbService.add("special_orders", orderForm);
            setIsOrderModalOpen(false);
            setOrderForm({
                customerId: "",
                customerName: "",
                phone: "",
                orderDetails: "",
                orderType: "عدسات مفصلة",
                status: "تم الطلب",
                expectedDeliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            loadAll();
            alert("تم تسجيل الطلبية الخاصة بنجاح");
        } catch (err) {
            alert("حدث خطأ أثناء حفظ الطلبية");
        } finally {
            setSaving(false);
        }
    };

    const addWarranty = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!warrantyForm.customerName || !warrantyForm.productName) {
            alert("يرجى ملء بيانات العميل والمنتج لإصدار شهادة الضمان");
            return;
        }
        setSaving(true);
        try {
            await dbService.add("warranties", {
                ...warrantyForm,
                history: [{ date: new Date().toISOString(), action: "إصدار الضمان لأول مرة", notes: warrantyForm.notes }]
            });
            setIsWarrantyModalOpen(false);
            setWarrantyForm({
                invoiceId: "",
                customerId: "",
                customerName: "",
                productId: "",
                productName: "",
                status: "نشط",
                caseType: "عيب مصنعي",
                notes: "",
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            });
            loadAll();
            alert("تم إصدار وتسجيل الضمان بنجاح");
        } catch (err) {
            alert("حدث خطأ أثناء تسجيل شهادة الضمان");
        } finally {
            setSaving(false);
        }
    };

    // Update statuses
    const updateRepairStatus = async (repair: RepairJob, newStatus: RepairJob['status']) => {
        if (!repair.id) return;
        try {
            await dbService.update("repairs", repair.id, { status: newStatus });
            loadAll();
        } catch (e) {
            alert("فشل تحديث حالة الصيانة");
        }
    };

    const updateOrderStatus = async (order: SpecialOrder, newStatus: SpecialOrder['status']) => {
        if (!order.id) return;
        try {
            await dbService.update("special_orders", order.id, { status: newStatus });
            loadAll();
        } catch (e) {
            alert("فشل تحديث حالة الطلب");
        }
    };

    const updateWarrantyStatus = async (warranty: Warranty, newStatus: Warranty['status'], caseType?: Warranty['caseType']) => {
        if (!warranty.id) return;
        try {
            const hist = warranty.history || [];
            await dbService.update("warranties", warranty.id, { 
                status: newStatus,
                caseType: caseType || warranty.caseType,
                history: [...hist, { 
                    date: new Date().toISOString(), 
                    action: `تعديل الحالة إلى: ${newStatus}`, 
                    notes: caseType ? `نوع الحالة: ${caseType}` : "" 
                }]
            });
            loadAll();
        } catch (e) {
            alert("فشل تحديث حالة الضمان");
        }
    };

    // Quick Whatsapp reminder sending helper
    const sendWhatsappReminder = (message: string, phone: string) => {
        const cleanedPhone = phone.replace(/[^0-9]/g, "");
        const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    // Auto calculate reminders
    const remindersList: { type: string; title: string; client: string; phone: string; desc: string; msg: string; tag: string }[] = [];
    
    // 1. Delayed Pickups (Orders ready for customer)
    specialOrders.forEach(o => {
        if (o.status === 'جاهز للعميل') {
            remindersList.push({
                type: 'pickup',
                title: 'جاهز للتسليم',
                client: o.customerName,
                phone: o.phone,
                desc: `الطلبية الخاصة: ${o.orderDetails} جاهزة في المحل حالياً`,
                msg: `عزيزنا العميل ${o.customerName}، يسعدنا إبلاغك بأن طلبيتك الخاصة (${o.orderDetails}) جاهزة للاستلام في مركزنا للبصريات. أهلاً بك في أي وقت.`,
                tag: 'طلبية نظارات'
            });
        }
    });

    // 2. Repairs Ready
    repairs.forEach(r => {
        if (r.status === 'جاهز') {
            remindersList.push({
                type: 'repair_pickup',
                title: 'صيانة جاهزة',
                client: r.customerName,
                phone: r.phone,
                desc: `طلب الصيانة (${r.repairCase}) جاهز كلياً وبانتظار التسليم`,
                msg: `عزيزنا العميل ${r.customerName}، نظارتك المرسلة للصيانة (${r.repairCase}) جاهزة للاستلام الآن بقيمة ${r.cost} ريال. نراكم قريباً.`,
                tag: 'قسم الصيانة'
            });
        }
    });

    // 3. Delayed Invoices (Depts due)
    invoices.forEach(i => {
        if (i.status === 'آجل' || i.status === 'جزئي') {
            const daysDiff = i.dueDate ? Math.floor((new Date(i.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : -1;
            const remainingMoney = i.total - i.paid - i.discount;
            if (daysDiff <= 5 && remainingMoney > 0) {
                remindersList.push({
                    type: 'due_debt',
                    title: daysDiff < 0 ? 'رصيد مستحق متأخر' : 'استحقاق دفع قريب',
                    client: i.partnerName,
                    phone: customers.find(c => c.id === i.partnerId)?.phone || "967",
                    desc: `فاتورة مبيعات بمبلغ متبقي ${(remainingMoney || 0).toLocaleString()} YER`,
                    msg: `عزيزنا العميل ${i.partnerName}، نود تذكيركم بلطف بقرب/تأخر سداد المتبقي من حسابكم البالغ قيمته ${(remainingMoney || 0).toLocaleString()} ريال يمني. شاكرين تعاونكم الدائم معنا.`,
                    tag: 'الاستحقاقات المالية'
                });
            }
        }
    });

    // 4. Contact Lens Expiary / renewal (Soon)
    warranties.forEach(w => {
        const daysToExpiry = Math.floor((new Date(w.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysToExpiry >= 0 && daysToExpiry <= 15) {
            remindersList.push({
                type: 'warranty_ending',
                title: 'قرب انتهاء فترة الضمان',
                client: w.customerName,
                phone: customers.find(c => c.id === w.customerId)?.phone || "967",
                desc: `الضمان للمنتج (${w.productName}) ينتهي خلال ${daysToExpiry} يوم`,
                msg: `عزيزنا العميل ${w.customerName}، نود إحاطتكم بأن فترة الضمان المقررة لنظارتكم/طبياتكم (${w.productName}) ستنتهي بتاريخ ${w.endDate ? new Date(w.endDate).toLocaleDateString('ar-EG') : 'غير محدد'}. نسعد بخدمتك دوماً.`,
                tag: 'ضمان المنتجات'
            });
        }
    });

    return (
        <div className="flex flex-col space-y-4 pb-20">
            {/* Top Stats Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900 text-white rounded-3xl p-5 shadow-xl relative overflow-hidden">
                <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] font-black uppercase">قيد الصيانة</span>
                    <span className="font-sans font-black text-2xl text-blue-400">
                        {repairs.filter(r => r.status !== 'تم التسليم').length}
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] font-black uppercase">الطلبيات النشطة</span>
                    <span className="font-sans font-black text-2xl text-amber-400">
                        {specialOrders.filter(o => o.status !== 'تم التسليم للعميل').length}
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] font-black uppercase">الضمانات الفعّالة</span>
                    <span className="font-sans font-black text-2xl text-emerald-400">
                        {warranties.filter(w => w.status === 'نشط').length}
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-slate-400 text-[10px] font-black uppercase">التذكيرات المعلقة</span>
                    <span className="font-sans font-black text-2xl text-rose-400">
                        {remindersList.length}
                    </span>
                </div>
            </div>

            {/* Sub-Tabs Section */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto shrink-0 scrollbar-none">
                <button 
                    onClick={() => { setActiveTab('repairs'); setSearchTerm(""); }}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap",
                        activeTab === 'repairs' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    )}
                >
                    <Wrench size={16} /> صيانة وإصلاح ({repairs.filter(r => r.status !== 'تم التسليم').length})
                </button>
                <button 
                    onClick={() => { setActiveTab('special_orders'); setSearchTerm(""); }}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap",
                        activeTab === 'special_orders' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    )}
                >
                    <ShoppingBag size={16} /> طلبيات خاصة ({specialOrders.filter(o => o.status !== 'تم التسليم للعميل').length})
                </button>
                <button 
                    onClick={() => { setActiveTab('warranties'); setSearchTerm(""); }}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap",
                        activeTab === 'warranties' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    )}
                >
                    <ShieldCheck size={16} /> كروت الضمان ({warranties.filter(w=>w.status==='نشط').length})
                </button>
                <button 
                    onClick={() => { setActiveTab('reminders'); setSearchTerm(""); }}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer whitespace-nowrap",
                        activeTab === 'reminders' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    )}
                >
                    <Bell size={16} /> تذكيرات وإشعارات ({remindersList.length})
                </button>
            </div>

            {/* Quick Action bar & Search */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="البحث بالاسم أو السند أو الهاتف..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm"
                    />
                </div>
                {activeTab === 'repairs' && (
                    <button 
                        onClick={() => setIsRepairModalOpen(true)}
                        className="bg-blue-600 text-white rounded-xl p-2.5 shadow-md shadow-blue-100 flex items-center justify-center shrink-0"
                    >
                        <Plus size={20} />
                    </button>
                )}
                {activeTab === 'special_orders' && (
                    <button 
                        onClick={() => setIsOrderModalOpen(true)}
                        className="bg-amber-600 text-white rounded-xl p-2.5 shadow-md shadow-amber-100 flex items-center justify-center shrink-0"
                    >
                        <Plus size={20} />
                    </button>
                )}
                {activeTab === 'warranties' && (
                    <button 
                        onClick={() => setIsWarrantyModalOpen(true)}
                        className="bg-emerald-600 text-white rounded-xl p-2.5 shadow-md shadow-emerald-100 flex items-center justify-center shrink-0"
                    >
                        <Plus size={20} />
                    </button>
                )}
                <button 
                    onClick={loadAll}
                    disabled={loading}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 text-slate-400 rounded-xl shrink-0 transition-colors disabled:opacity-50"
                    title="تحديث البيانات"
                >
                    <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                </button>
            </div>

            {/* Main Section Content Lists */}
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-20 text-slate-400 font-bold text-sm">جاري جلب السجلات من نظام البصريات...</div>
                ) : (
                    <>
                        {/* REPAIRS LIST */}
                        {activeTab === 'repairs' && (
                            <div className="space-y-3">
                                {repairs
                                    .filter(r => r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || r.phone.includes(searchTerm))
                                    .map(r => (
                                    <div key={r.id} className="bg-white border rounded-2xl p-4 shadow-sm space-y-3 relative group">
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-2.5 items-center">
                                                <div className="w-10 h-10 bg-slate-50 text-slate-600 border border-slate-100 rounded-xl flex items-center justify-center shrink-0">
                                                    <Wrench size={18} />
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-slate-800 text-sm leading-tight">{r.customerName}</p>
                                                    <span className="text-[10px] text-slate-400 font-mono tracking-wider">{r.phone}</span>
                                                </div>
                                            </div>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-center border",
                                                r.status === 'تم الاستلام' ? "bg-slate-50 text-slate-500 border-slate-200" :
                                                r.status === 'قيد العمل' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                                                r.status === 'جاهز' ? "bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse" :
                                                "bg-slate-100 text-slate-400 border-slate-200"
                                            )}>
                                                {r.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-50 text-xs">
                                            <div>
                                                <span className="text-slate-400 font-bold block">ونوع الصيانة:</span>
                                                <span className="font-black text-slate-800">{r.repairCase}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block">التكلفة والرسوم:</span>
                                                <span className="font-mono font-black text-slate-800 text-sm">{(r.cost || 0).toLocaleString()} YER</span>
                                            </div>
                                            {r.notes && (
                                                <div className="col-span-2 mt-1">
                                                    <span className="text-slate-400 font-bold block">ملاحظات الفني:</span>
                                                    <span className="text-slate-600 block bg-slate-50 rounded-lg p-2 text-[11px] font-medium leading-relaxed">{r.notes}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-end gap-2 pt-1">
                                            {r.status === 'تم الاستلام' && (
                                                <button onClick={() => updateRepairStatus(r, 'قيد العمل')} className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-indigo-700 transition">بدء الصيانة</button>
                                            )}
                                            {r.status === 'قيد العمل' && (
                                                <button onClick={() => updateRepairStatus(r, 'جاهز')} className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-emerald-700 transition">جاهزة للتسليم</button>
                                            )}
                                            {r.status === 'جاهز' && (
                                                <button onClick={() => updateRepairStatus(r, 'تم التسليم')} className="bg-slate-800 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-slate-900 transition flex items-center gap-1">
                                                    <CheckCircle size={12} /> تم التسليم للزبون
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => {
                                                    const message = `زبوننا الكريم ${r.customerName}، يسعدنا تنبيهكم بأن طلب الصيانة لـ (${r.repairCase}) في مركز البصريات قد أصبح متاحاً وجاهزاً الآن. التكلفة: ${r.cost} YER.`;
                                                    sendWhatsappReminder(message, r.phone);
                                                }}
                                                className="border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg p-1.5 flex items-center justify-center"
                                                title="أرسل إشعار واتساب"
                                            >
                                                <Send size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {repairs.length === 0 && (
                                    <div className="text-center py-20 text-slate-400 font-bold text-xs">لا يوجد أي طلبات صيانة مسجلة حالياً.</div>
                                )}
                            </div>
                        )}

                        {/* SPECIAL ORDERS LIST */}
                        {activeTab === 'special_orders' && (
                            <div className="space-y-3">
                                {specialOrders
                                    .filter(o => o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || o.phone.includes(searchTerm))
                                    .map(o => (
                                    <div key={o.id} className="bg-white border rounded-2xl p-4 shadow-sm space-y-3 relative">
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-2.5 items-center">
                                                <div className="w-10 h-10 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                                    <ShoppingBag size={18} />
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-slate-800 text-sm leading-tight">{o.customerName}</p>
                                                    <span className="text-[10px] text-slate-400 font-mono tracking-wider">{o.phone}</span>
                                                </div>
                                            </div>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-center border",
                                                o.status === 'تم الطلب' ? "bg-slate-50 text-slate-500 border-slate-200" :
                                                o.status === 'بانتظار المورد' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                o.status === 'تم الاستلام في المحل' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                                                o.status === 'جاهز للعميل' ? "bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse" :
                                                "bg-slate-100 text-slate-400 border-slate-200"
                                            )}>
                                                {o.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-50 text-xs">
                                            <div className="col-span-2 bg-slate-50 rounded-xl p-3 mb-1">
                                                <span className="text-slate-400 font-bold block mb-1">تفاصيل ومقاسات العدسات المطلوبة:</span>
                                                <span className="text-slate-800 font-black block leading-relaxed">{o.orderDetails}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block">التصنيف:</span>
                                                <span className="font-black text-slate-800">{o.orderType}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block">تاريخ التسليم المتوقع:</span>
                                                <span className="font-black font-mono text-amber-600 flex items-center gap-1">
                                                    <Calendar size={12} /> {o.expectedDeliveryDate}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-2 pt-1">
                                            {o.status === 'تم الطلب' && (
                                                <button onClick={() => updateOrderStatus(o, 'بانتظار المورد')} className="bg-rose-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-rose-700 transition">تحويل للمورد</button>
                                            )}
                                            {o.status === 'بانتظار المورد' && (
                                                <button onClick={() => updateOrderStatus(o, 'تم الاستلام في المحل')} className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-indigo-700 transition">استلام بالمحل</button>
                                            )}
                                            {o.status === 'تم الاستلام في المحل' && (
                                                <button onClick={() => updateOrderStatus(o, 'جاهز للعميل')} className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-emerald-700 transition">جاهز للاستلام</button>
                                            )}
                                            {o.status === 'جاهز للعميل' && (
                                                <button onClick={() => updateOrderStatus(o, 'تم التسليم للعميل')} className="bg-slate-800 text-white rounded-lg px-3 py-1.5 text-[10px] font-black hover:bg-slate-900 transition flex items-center gap-1">
                                                    <CheckCircle size={12} /> تم التسليم للزبون
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => {
                                                    const message = `زبوننا الغالي ${o.customerName}، يسعدنا إعلامك بأن طلبيتك الخاصة لـ (${o.orderDetails}) أصبحت جاهزة تماماً وتنتظرك في المحل حالياً. يسعدنا تشريفك لخدمتك.`;
                                                    sendWhatsappReminder(message, o.phone);
                                                }}
                                                className="border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg p-1.5 flex items-center justify-center"
                                                title="أرسل إشعار واتساب"
                                            >
                                                <Send size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {specialOrders.length === 0 && (
                                    <div className="text-center py-20 text-slate-400 font-bold text-xs">لا توجد طلبيات خاصة حالياً.</div>
                                )}
                            </div>
                        )}

                        {/* WARRANTIES LIST */}
                        {activeTab === 'warranties' && (
                            <div className="space-y-3">
                                {warranties
                                    .filter(w => w.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || w.productName.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(w => (
                                    <div key={w.id} className="bg-white border rounded-2xl p-4 shadow-sm space-y-3 relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-bl-xl text-[9px] font-extrabold flex items-center gap-1 border-b border-l border-emerald-100">
                                            <ShieldCheck size={12} /> ضمان معتمد
                                        </div>

                                        <div className="flex gap-2.5 items-center pt-2">
                                            <div className="w-10 h-10 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                                                <ShieldCheck size={18} />
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-slate-800 text-sm leading-tight">{w.customerName}</p>
                                                <p className="text-[10px] text-slate-400 font-black">منتج: <span className="text-slate-600">{w.productName}</span></p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-50 text-xs">
                                            <div>
                                                <span className="text-slate-400 font-bold block">بداية التفعيل:</span>
                                                <span className="font-black text-slate-700 font-mono">{w.startDate}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block">تاريخ الانتهاء:</span>
                                                <span className="font-black text-slate-700 font-mono">{w.endDate}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-bold block">حالة الضمان:</span>
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-center border inline-block mt-0.5",
                                                    w.status === 'نشط' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                    w.status === 'منتهي' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                    w.status === 'مستبدل' ? "bg-blue-50 text-blue-700 border-blue-100" :
                                                    "bg-slate-100 text-slate-400 border-slate-200"
                                                )}>{w.status}</span>
                                            </div>
                                            {w.caseType && (
                                                <div>
                                                    <span className="text-slate-400 font-bold block">الحالة الأخيرة:</span>
                                                    <span className="font-black text-blue-600">{w.caseType}</span>
                                                </div>
                                            )}
                                            {w.notes && (
                                                <div className="col-span-2 mt-1 bg-slate-50 p-2 rounded-lg text-[10px] text-slate-600">
                                                    <span className="font-bold text-slate-500 block mb-0.5">تفاصيل وقيود الضمان:</span>
                                                    {w.notes}
                                                </div>
                                            )}
                                        </div>

                                        {w.status === 'نشط' && (
                                            <div className="flex items-center justify-end gap-1.5 pt-1">
                                                <span className="text-[10px] text-slate-400 font-bold">تسجيل مطالبة كسر/عيب:</span>
                                                <button onClick={() => updateWarrantyStatus(w, 'مستبدل', 'كسر إطار')} className="bg-rose-50 text-rose-600 border border-rose-100 rounded-lg px-2.5 py-1.5 text-[10px] font-black hover:bg-rose-100 transition">كسر إطار</button>
                                                <button onClick={() => updateWarrantyStatus(w, 'مستبدل', 'عيب مصنعي')} className="bg-blue-50 text-blue-600 border border-blue-100 rounded-lg px-2.5 py-1.5 text-[10px] font-black hover:bg-blue-100 transition">عيب مصنعي</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {warranties.length === 0 && (
                                    <div className="text-center py-20 text-slate-400 font-bold text-xs">لا يوجد ضمانات مدرجة.</div>
                                )}
                            </div>
                        )}

                        {/* REMINDERS LIST */}
                        {activeTab === 'reminders' && (
                            <div className="space-y-3">
                                <div className="p-3 bg-amber-50 border border-amber-200/50 rounded-2xl flex items-start gap-2.5 text-xs text-amber-700 leading-relaxed">
                                    <Info size={16} className="shrink-0 mt-0.5" />
                                    <p>
                                        يقوم نظام الذكاء الاصطناعي للبصريات برصد التذكيرات الذكية بشكل تلقائي استناداً إلى انتهاء صلاحيات النظارات والطلبات الجاهزة والأرصدة المستحقة والضمانات.
                                    </p>
                                </div>
                                {remindersList.map((rem, idx) => (
                                    <div key={idx} className="bg-white border rounded-2xl p-4 shadow-sm space-y-3 relative overflow-hidden">
                                        <div className="flex justify-between items-start">
                                            <div className="flex gap-2 items-center">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase border",
                                                    rem.type === 'pickup' || rem.type === 'repair_pickup' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                    rem.type === 'due_debt' ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse" :
                                                    "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                )}>
                                                    {rem.title}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-bold">{rem.tag}</span>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="font-extrabold text-slate-800 text-sm leading-tight">{rem.client}</p>
                                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{rem.desc}</p>
                                        </div>

                                        <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-[11px] text-slate-600 font-medium leading-relaxed">
                                            <span className="font-bold text-slate-400 block mb-1">صيغة رسالة التذكير:</span>
                                            "{rem.msg}"
                                        </div>

                                        <div className="flex items-center justify-end gap-2 pt-1">
                                            <button 
                                                onClick={() => sendWhatsappReminder(rem.msg, rem.phone)}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 shadow-md shadow-emerald-50 cursor-pointer"
                                            >
                                                <Send size={14} /> إرسال تذكير عبر واتساب
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {remindersList.length === 0 && (
                                    <div className="text-center py-20 text-slate-400 font-bold text-xs">رائع! لا توجد تذكيرات معلقة حالياً.</div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* MODALS */}
            {/* 1. Repair Modal */}
            {isRepairModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-0 md:p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsRepairModalOpen(false)} />
                    <div className="bg-white dark:bg-[#131b2e] w-full max-w-sm h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden">
                        <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <h3 className="text-base font-black text-slate-800 dark:text-white">سند صيانة وإصلاح جديد</h3>
                        </div>
                        <form onSubmit={addRepair} className="flex flex-col flex-1 overflow-hidden min-h-0">
                            <div className="space-y-4 text-xs overflow-y-auto p-5 custom-scrollbar flex-1 bg-white dark:bg-[#131b2e]">
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">اسم العميل ورقم المريض:</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="اسم العميل الرباعي" 
                                        className="w-full px-3 py-2 border rounded-lg focus:outline-blue-500 text-sm"
                                        value={repairForm.customerName}
                                        onChange={(e) => setRepairForm({...repairForm, customerName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">رقم الجوال (اختياري):</label>
                                    <input 
                                        type="text" 
                                        placeholder="967xxxxxxxxx" 
                                        className="w-full px-3 py-2 border rounded-lg focus:outline-blue-500 text-sm"
                                        value={repairForm.phone}
                                        onChange={(e) => setRepairForm({...repairForm, phone: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">نوع الصيانة المطلوبة:</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg focus:outline-blue-500 text-sm"
                                        value={repairForm.repairCase}
                                        onChange={(e) => setRepairForm({...repairForm, repairCase: e.target.value as any})}
                                    >
                                        <option value="تعديل الإطار">تعديل الإطار</option>
                                        <option value="استبدال عدسات">استبدال عدسات</option>
                                        <option value="إصلاح كسر الإطار">إصلاح كسر الإطار</option>
                                        <option value="استبدال برغي">استبدال برغي</option>
                                        <option value="استبدال وسادات الأنف">استبدال وسادات الأنف</option>
                                        <option value="أخرى">أخرى</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">التكلفة والرسوم:</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-3 py-2 border rounded-lg focus:outline-blue-500 text-sm font-mono"
                                        value={repairForm.cost}
                                        onChange={(e) => setRepairForm({...repairForm, cost: Number(e.target.value)})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">ملاحظات الفني والقطع المطلوبة:</label>
                                    <textarea 
                                        placeholder="أكتب أي تفاصيل أخرى للورشة الفنية" 
                                        className="w-full px-3 py-2 border rounded-lg focus:outline-blue-500 text-xs h-14"
                                        value={repairForm.notes}
                                        onChange={(e) => setRepairForm({...repairForm, notes: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 p-5 bg-slate-50 shrink-0 border-t border-slate-100">
                                <button type="button" onClick={() => setIsRepairModalOpen(false)} className="flex-1 py-2.5 bg-white font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">إلغاء</button>
                                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 font-bold text-white rounded-xl shadow-lg shadow-blue-200">حفظ وصيانة</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. Special Order Modal */}
            {isOrderModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-0 md:p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsOrderModalOpen(false)} />
                    <div className="bg-white dark:bg-[#131b2e] w-full max-w-sm h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden">
                        <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <h3 className="text-base font-black text-slate-800 dark:text-white">طلب تفصيل عدسة / إطار خاص</h3>
                        </div>
                        <form onSubmit={addSpecialOrder} className="flex flex-col flex-1 overflow-hidden min-h-0">
                            <div className="space-y-4 text-xs overflow-y-auto p-5 custom-scrollbar flex-1 bg-white dark:bg-[#131b2e]">
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">اسم العميل:</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="اسم العميل بالكامل" 
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                        value={orderForm.customerName}
                                        onChange={(e) => setOrderForm({...orderForm, customerName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">رقم الجوال (اختياري):</label>
                                    <input 
                                        type="text" 
                                        placeholder="967..." 
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                        value={orderForm.phone}
                                        onChange={(e) => setOrderForm({...orderForm, phone: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">نوع ومعايير الطلب:</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                        value={orderForm.orderType}
                                        onChange={(e) => setOrderForm({...orderForm, orderType: e.target.value as any})}
                                    >
                                        <option value="عدسات مفصلة">عدسات مفصلة (طبي خاص)</option>
                                        <option value="طلب إطار خاص">طلب إطار خاص غير متوفر</option>
                                        <option value="نظارة مستوردة">نظارة ماركة مستوردة</option>
                                        <option value="أخرى">تصنيف آخر</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">تفاصيل الطلبية والمواصفات والمقاسات دقيقة:</label>
                                    <textarea 
                                        required
                                        placeholder="sph, cyl, axis, poly, index..." 
                                        className="w-full px-3 py-2 border rounded-lg text-xs h-20"
                                        value={orderForm.orderDetails}
                                        onChange={(e) => setOrderForm({...orderForm, orderDetails: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">تاريخ التسليم التقريبي المتوقع:</label>
                                    <input 
                                        type="date" 
                                        required
                                        className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                                        value={orderForm.expectedDeliveryDate}
                                        onChange={(e) => setOrderForm({...orderForm, expectedDeliveryDate: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 p-5 bg-slate-50 shrink-0 border-t border-slate-100">
                                <button type="button" onClick={() => setIsOrderModalOpen(false)} className="flex-1 py-2.5 bg-white font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">إلغاء</button>
                                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-amber-600 font-bold text-white rounded-xl shadow-lg shadow-amber-200">حفظ وإرسال الطلب</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. Warranty Modal */}
            {isWarrantyModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-0 md:p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsWarrantyModalOpen(false)} />
                    <div className="bg-white dark:bg-[#131b2e] w-full max-w-sm h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden">
                        <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <h3 className="text-base font-black text-slate-800 dark:text-white">إصدار كرت ضمان نظارة جديد</h3>
                        </div>
                        <form onSubmit={addWarranty} className="flex flex-col flex-1 overflow-hidden min-h-0">
                            <div className="space-y-4 text-xs overflow-y-auto p-5 custom-scrollbar flex-1 bg-white dark:bg-[#131b2e]">
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">اسم العميل:</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="اسم العميل المعتمد بالضمان" 
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                        value={warrantyForm.customerName}
                                        onChange={(e) => setWarrantyForm({...warrantyForm, customerName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">اسم المنتج والنظارة المشمولة:</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="الموديل والماركة بالتفصيل" 
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                        value={warrantyForm.productName}
                                        onChange={(e) => setWarrantyForm({...warrantyForm, productName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">فاتورة المرجع الاختيارية:</label>
                                    <input 
                                        type="text" 
                                        placeholder="رقم الفاتورة" 
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                        value={warrantyForm.invoiceId}
                                        onChange={(e) => setWarrantyForm({...warrantyForm, invoiceId: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-slate-500 font-bold block">تاريخ البداية:</label>
                                        <input 
                                            type="date" 
                                            required
                                            className="w-full px-3 py-2 border rounded-lg text-xs font-mono"
                                            value={warrantyForm.startDate}
                                            onChange={(e) => setWarrantyForm({...warrantyForm, startDate: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-slate-500 font-bold block">تاريخ انتهاء الضمان:</label>
                                        <input 
                                            type="date" 
                                            required
                                            className="w-full px-3 py-2 border rounded-lg text-xs font-mono"
                                            value={warrantyForm.endDate}
                                            onChange={(e) => setWarrantyForm({...warrantyForm, endDate: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-slate-500 font-bold block">ملاحظات وقيود الضمان:</label>
                                    <textarea 
                                        placeholder="أي معايير مثل استثناء سوء الاستخدام" 
                                        className="w-full px-3 py-2 border rounded-lg text-xs h-14"
                                        value={warrantyForm.notes}
                                        onChange={(e) => setWarrantyForm({...warrantyForm, notes: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 p-5 bg-slate-50 shrink-0 border-t border-slate-100">
                                <button type="button" onClick={() => setIsWarrantyModalOpen(false)} className="flex-1 py-2.5 bg-white font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">إلغاء</button>
                                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-emerald-600 font-bold text-white rounded-xl shadow-lg shadow-emerald-200">حفظ وتفعيل الضمان</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
