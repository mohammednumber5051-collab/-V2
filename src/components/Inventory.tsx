import { syncEngine } from "../services/syncEngine";
import React, { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, AlertCircle, X, ChevronDown, ChevronUp, Clock, Eye } from "lucide-react";
import { dbService } from "../services/db";
import { Product, Category, OpticalAttributes } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn, hasPermission } from "../lib/utils";
import ProductLedgerModal from "./ProductLedgerModal";

const categories: Category[] = [
    'إطارات نظارات', 
    'عدسات طبية', 
    'نظارات شمسية', 
    'عدسات لاصقة', 
    'إكسسوارات', 
    'مستلزمات طبية', 
    'قطع غيار', 
    'مواد تنظيف العدسات',
    'أخرى'
];

export default function Inventory({ currentUser: propCurrentUser }: { currentUser?: any }) {
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

    const [products, setProducts] = useState<Product[]>([]);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("الكل");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [expandedProductDetail, setExpandedProductDetail] = useState<string | null>(null);
    const [viewingLedgerProduct, setViewingLedgerProduct] = useState<Product | null>(null);

    const [formData, setFormData] = useState<Partial<Product>>({
        name: "",
        sku: "",
        category: "إطارات نظارات",
        purchasePrice: 0,
        salePrice: 0,
        stock: 0,
        minStock: 5,
        opticalAttributes: {}
    });

    useEffect(() => {
        loadProducts(true);
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadProducts(true);
        });
        return unsubscribe;
    }, []);

    const loadProducts = async (reset: boolean = false) => {
        if (reset) {
            setIsLoadingInitial(true);
            setProducts([]);
            setLastDoc(null);
        } else {
            setIsLoadingMore(true);
        }

        try {
            // Note: Since Firestore requires advanced indexes for complex dynamic queries (like search + order),
            // a basic implementation uses pagination and we handle simple filters locally if not too big,
            // or we use simple field constraints. For safety on mobile, we load chunks.
            const res = await dbService.getPaginated("products", 1000, reset ? null : lastDoc, []);
            
            setProducts(prev => {
                const newData = res.data as Product[];
                if (reset) return newData;
                const existingIds = new Set(prev.map(p => p.id).filter(Boolean));
                const filteredNew = newData.filter(p => !existingIds.has(p.id));
                return [...prev, ...filteredNew];
            });
            setLastDoc(res.lastDoc);
            setHasMore(res.hasMore);
        } catch (error) {
            console.error("Failed to load products", error);
        } finally {
            setIsLoadingInitial(false);
            setIsLoadingMore(false);
        }
    };

    const [isSaving, setIsSaving] = useState(false);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

    const hasUnsavedChanges = () => {
        const defaultData = { name: "", sku: "", category: "إطارات نظارات" as Category, purchasePrice: 0, salePrice: 0, stock: 0, minStock: 5, opticalAttributes: {} };
        const base = editingProduct || defaultData;
        return (
            formData.name !== base.name ||
            formData.sku !== base.sku ||
            formData.category !== base.category ||
            Number(formData.purchasePrice) !== Number(base.purchasePrice) ||
            Number(formData.salePrice) !== Number(base.salePrice) ||
            Number(formData.stock) !== Number(base.stock) ||
            Number(formData.minStock) !== Number(base.minStock) ||
            JSON.stringify(formData.opticalAttributes || {}) !== JSON.stringify(base.opticalAttributes || {})
        );
    };

    const confirmDeleteProduct = async () => {
        if (!productToDelete || !productToDelete.id) return;
        if (!hasPermission(currentUser, 'delete_inventory')) {
            alert("عذراً، لا تملك صلاحية حذف الأصناف.");
            setProductToDelete(null);
            return;
        }
        setIsSaving(true);
        try {
            await dbService.softDelete("products", productToDelete.id);
            setProductToDelete(null);
            loadProducts();
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء حذف المنتج");
        } finally {
            setIsSaving(false);
        }
    };

    const executeSave = async () => {
        if (editingProduct?.id && !hasPermission(currentUser, 'edit_inventory')) {
            alert("عذراً، لا تملك صلاحية تعديل الأصناف.");
            return;
        }
        setIsSaving(true);
        try {
            const dataToSave = {
                ...formData,
                updatedAt: new Date().toISOString()
            };

            let customDesc = "";
            if (editingProduct?.id) {
                const priceChanged = Number(formData.salePrice) !== Number(editingProduct.salePrice);
                const stockChanged = Number(formData.stock) !== Number(editingProduct.stock);
                
                if (priceChanged && stockChanged) {
                    customDesc = `تعديل سعر وكمية الصنف: ${formData.name} (السعر: ${formData.salePrice}، الكمية: ${formData.stock})`;
                } else if (priceChanged) {
                    customDesc = `تعديل سعر الصنف: ${formData.name} من ${editingProduct.salePrice} إلى ${formData.salePrice}`;
                } else if (stockChanged) {
                    customDesc = `تعديل كمية الصنف: ${formData.name} يدوياً إلى ${formData.stock}`;
                }
                
                await dbService.update("products", editingProduct.id, dataToSave);
                await dbService.logAudit('UPDATE', 'Product', editingProduct.id, customDesc, null, null, null);
                alert("تم تحديث المنتج بنجاح");
            } else {
                await dbService.add("products", dataToSave);
                alert("تم إضافة المنتج بنجاح");
            }
            setIsModalOpen(false);
            setEditingProduct(null);
            setFormData({ name: "", sku: "", category: "إطارات نظارات", purchasePrice: 0, salePrice: 0, stock: 0, minStock: 5, opticalAttributes: {} });
            setSaveConfirmOpen(false);
            loadProducts();
        } catch (error) {
            console.error("Error saving product:", error);
            alert("فشل حفظ المنتج");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setFormData({ name: "", sku: "", category: "إطارات نظارات", purchasePrice: 0, salePrice: 0, stock: 0, minStock: 5, opticalAttributes: {} });
        setSaveConfirmOpen(false);
    };

    const handleCloseAttempt = () => {
        if (hasUnsavedChanges()) {
            setSaveConfirmOpen(true);
        } else {
            setIsModalOpen(false);
            setEditingProduct(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || formData.name.trim().length < 3) {
            alert("اسم المنتج يجب أن يكون 3 أحرف على الأقل");
            return;
        }
        if (Number(formData.purchasePrice) < 0 || Number(formData.salePrice) < 0 || Number(formData.stock) < 0 || Number(formData.minStock) < 0) {
            alert("الأسعار والكميات لا يمكن أن تكون قيمة سالبة");
            return;
        }

        executeSave();
    };

    const handleDelete = (p: Product) => {
        setProductToDelete(p);
    };

    const handleAttributeChange = (key: keyof OpticalAttributes, value: any) => {
        const attributes = { ...(formData.opticalAttributes || {}) };
        if (value === "" || value === undefined) {
            delete attributes[key];
        } else {
            // @ts-ignore
            attributes[key] = value;
        }
        setFormData({ ...formData, opticalAttributes: attributes });
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = 
            (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
            (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesCategory = selectedCategoryFilter === "الكل" || p.category === selectedCategoryFilter;
        return matchesSearch && matchesCategory;
    });

    const isExpiringSoon = (expiryDateStr?: string) => {
        if (!expiryDateStr) return false;
        const expiryDate = new Date(expiryDateStr);
        const diffTime = expiryDate.getTime() - Date.now();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 30;
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 bg-white dark:bg-[#131b2e] p-3 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <div className="relative flex-1">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="بحث في المخزون..."
                            className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold dark:text-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {hasPermission(currentUser, 'add_inventory') && (
                        <button
                            onClick={() => {
                                setEditingProduct(null);
                                setFormData({ name: "", sku: "", category: "إطارات نظارات", purchasePrice: 0, salePrice: 0, stock: 0, minStock: 5, opticalAttributes: {} });
                                setIsModalOpen(true);
                            }}
                            className="bg-blue-600 text-white p-3 rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-90 shrink-0"
                        >
                            <Plus size={24} />
                        </button>
                    )}
                </div>
                
                <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-none snap-x">
                    {["الكل", ...categories].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategoryFilter(cat)}
                            className={cn(
                                "px-4 py-2 rounded-2xl text-xs font-black whitespace-nowrap snap-start transition-all border",
                                selectedCategoryFilter === cat 
                                    ? "bg-slate-900 border-slate-900 text-white shadow-lg" 
                                    : "bg-white dark:bg-[#131b2e] border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 pb-24">
                <AnimatePresence mode="popLayout">
                    {filteredProducts.map((p) => (
                        <motion.div
                            key={p.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-[#131b2e] p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors flex items-center justify-between gap-3"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">{p.category}</span>
                                    {(p.stock || 0) <= (p.minStock || 5) && (
                                        <div className="flex items-center gap-1 text-[10px] font-black text-rose-500">
                                            <AlertCircle size={10} />
                                            مخزون منخفض
                                        </div>
                                    )}
                                </div>
                                <h3 
                                    onClick={() => setViewingLedgerProduct(p)}
                                    className="text-sm font-black text-slate-800 dark:text-white truncate leading-tight mb-1 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1.5 transition-colors"
                                    title="عرض كشف حركة الصنف التفصيلي"
                                >
                                    <span>{p.name}</span>
                                    <Clock size={12} className="text-slate-400 opacity-60 shrink-0" />
                                </h3>
                                <div className="flex items-center gap-3 font-mono text-[11px] font-bold">
                                    <span className="text-emerald-600 dark:text-emerald-400">{(p.salePrice || 0).toLocaleString()} <span className="opacity-50 text-[9px]">YER</span></span>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-lg border",
                                        (typeof p.stock === 'object' ? 0 : p.stock || 0) > 0 ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/50" : "bg-rose-50 dark:bg-rose-500/10 text-rose-500 border-rose-100 dark:border-rose-500/20"
                                    )}>
                                        موجود: {typeof p.stock === 'object' ? 0 : (p.stock || 0)}
                                    </span>
                                    <span className="text-slate-400 font-medium text-[9px] mr-2">
                                        بواسطة: {(p as any).createdByName || 'النظام'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 px-1">
                                {hasPermission(currentUser, 'edit_inventory') && (
                                    <button 
                                        onClick={() => {
                                            setEditingProduct(p);
                                            setFormData(p);
                                            setIsModalOpen(true);
                                        }}
                                        className="p-3 text-slate-400 hover:text-blue-500 transition-colors"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                )}
                                {hasPermission(currentUser, 'delete_inventory') && (
                                    <button 
                                        onClick={() => setProductToDelete(p)}
                                        className="p-3 text-slate-400 hover:text-rose-500 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                
                {hasMore && (
                    <div className="flex justify-center mt-4">
                        <button
                            onClick={() => loadProducts(false)}
                            disabled={isLoadingMore}
                            className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                        >
                            {isLoadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                        </button>
                    </div>
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleCloseAttempt}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-2xl h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col"
                        >
                            <div className="bg-slate-50 px-6 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <h3 className="text-base font-bold">{editingProduct ? "تعديل منتج" : "إضافة منتج جديد"}</h3>
                                <button onClick={handleCloseAttempt} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-white dark:bg-[#131b2e]">
                                <form id="productForm" onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">اسم المنتج</label>
                                        <input
                                            required
                                            type="text"
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">SKU / رمز المنتج</label>
                                        <input
                                            required
                                            type="text"
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all font-mono"
                                            value={formData.sku}
                                            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">التصنيف البصري</label>
                                        <select
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white transition-all"
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value as Category, opticalAttributes: {} })}
                                        >
                                            {categories.map(c => <option key={c} value={c} className="bg-white dark:bg-[#131b2e]">{c}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">سعر الشراء والتكلفة</label>
                                        <input
                                            required
                                            type="number"
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white transition-all font-mono"
                                            value={formData.purchasePrice}
                                            onChange={(e) => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">سعر البيع والتجزئة</label>
                                        <input
                                            required
                                            type="number"
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white transition-all font-mono"
                                            value={formData.salePrice}
                                            onChange={(e) => setFormData({ ...formData, salePrice: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">الكمية الحالية المتوفرة</label>
                                        <input
                                            required
                                            type="number"
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white transition-all font-mono"
                                            value={formData.stock}
                                            onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400">الحد الأدنى للنقص</label>
                                        <input
                                            required
                                            type="number"
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm font-bold text-slate-800 dark:text-white transition-all font-mono"
                                            value={formData.minStock}
                                            onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>

                                {/* Custom Attribute builder based on selection */}
                                <div className="border-t border-slate-100 pt-5 space-y-4">
                                    <h4 className="text-xs font-black text-blue-600 flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg w-fit">
                                        <Eye size={14} /> بناء مواصفات وخصائص المنتج البصري
                                    </h4>

                                    {/* 1. Frames or Sunglasses parameters */}
                                    {(formData.category === 'إطارات نظارات' || formData.category === 'نظارات شمسية' || formData.category === 'إطارات') && (
                                        <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                                            <div className="space-y-1">
                                                <label className="text-slate-500 dark:text-slate-400 block">الماركة التجارية:</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all"
                                                    value={formData.opticalAttributes?.brand || ""}
                                                    onChange={(e) => handleAttributeChange("brand", e.target.value)}
                                                    placeholder="Ray-Ban, Gucci, etc."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 dark:text-slate-400 block">نوع الإطار:</label>
                                                <select 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all font-bold"
                                                    value={formData.opticalAttributes?.frameType || ""}
                                                    onChange={(e) => handleAttributeChange("frameType", e.target.value)}
                                                >
                                                    <option value="" className="bg-white dark:bg-[#131b2e]">-- غير محدد --</option>
                                                    <option value="بإطار كامل Standard" className="bg-white dark:bg-[#131b2e]">كامل (Full Rim)</option>
                                                    <option value="نصف إطار Semi-Rim" className="bg-white dark:bg-[#131b2e]">نصف إطار (Semi-Rim)</option>
                                                    <option value="بدون إطار Rimless" className="bg-white dark:bg-[#131b2e]">بدون إطار (Rimless)</option>
                                                    <option value="نايلور Nylor" className="bg-white dark:bg-[#131b2e]">نايلور Nylor</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 dark:text-slate-400 block">المادة المصنعة:</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all"
                                                    value={formData.opticalAttributes?.material || ""}
                                                    onChange={(e) => handleAttributeChange("material", e.target.value)}
                                                    placeholder="معدن، تيتانيوم ، أسيتات..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 dark:text-slate-400 block">اللون والصبغة:</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all"
                                                    value={formData.opticalAttributes?.color || ""}
                                                    onChange={(e) => handleAttributeChange("color", e.target.value)}
                                                    placeholder="أسود مطفي، ذهبي، شفاف..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 dark:text-slate-400 block">الجنس المستهدف:</label>
                                                <select 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all font-bold"
                                                    value={formData.opticalAttributes?.gender || ""}
                                                    onChange={(e) => handleAttributeChange("gender", e.target.value)}
                                                >
                                                    <option value="" className="bg-white dark:bg-[#131b2e]">-- غير محدد --</option>
                                                    <option value="رجالي" className="bg-white dark:bg-[#131b2e]">رجالي</option>
                                                    <option value="نسائي" className="bg-white dark:bg-[#131b2e]">نسائي</option>
                                                    <option value="ولادي/بناتي" className="bg-white dark:bg-[#131b2e]">ولادي / أطفال</option>
                                                    <option value="للجنسين" className="bg-white dark:bg-[#131b2e]">للجنسين</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 dark:text-slate-400 block">مقاس النظارة:</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all"
                                                    value={formData.opticalAttributes?.size || ""}
                                                    onChange={(e) => handleAttributeChange("size", e.target.value)}
                                                    placeholder="e.g. 54-18-140"
                                                />
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <label className="text-slate-500 dark:text-slate-400 block">فترة الضمان المتاحة:</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-slate-800 dark:text-white transition-all"
                                                    value={formData.opticalAttributes?.warrantyPeriod || ""}
                                                    onChange={(e) => handleAttributeChange("warrantyPeriod", e.target.value)}
                                                    placeholder="e.g. 6 أشهر، سنة واحدة"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* 2. Prescription Lenses parameters */}
                                    {(formData.category === 'عدسات طبية' || formData.category === 'عدسات') && (
                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div className="space-y-1">
                                                <label className="text-slate-500 font-bold block">نوع العدسة:</label>
                                                <select 
                                                    className="w-full px-3 py-2 border rounded-xl"
                                                    value={formData.opticalAttributes?.lensType || ""}
                                                    onChange={(e) => handleAttributeChange("lensType", e.target.value)}
                                                >
                                                    <option value="">-- غير محدد --</option>
                                                    <option value="Single Vision">أحادية البؤرة (Single Vision)</option>
                                                    <option value="Bifocal">ثنائية البؤرة (Bifocal)</option>
                                                    <option value="Progressive">متعددة البؤر (Progressive)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 font-bold block">معامل الانكسار INDEX:</label>
                                                <select 
                                                    className="w-full px-3 py-2 border rounded-xl"
                                                    value={formData.opticalAttributes?.lensIndex || ""}
                                                    onChange={(e) => handleAttributeChange("lensIndex", e.target.value)}
                                                >
                                                    <option value="">-- غير محدد --</option>
                                                    <option value="1.56">1.56 Standard</option>
                                                    <option value="1.61">1.61 Thin</option>
                                                    <option value="1.67">1.67 Super Thin</option>
                                                    <option value="1.74">1.74 Ultra Thin</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <label className="text-slate-500 font-bold block">نوع الحماية والطلاء للعدسة:</label>
                                                <input 
                                                    type="text" 
                                                    className="w-full px-3 py-2 border rounded-xl"
                                                    value={formData.opticalAttributes?.coatingType || ""}
                                                    onChange={(e) => handleAttributeChange("coatingType", e.target.value)}
                                                    placeholder="ضد الخدش، عاكس للضوء، Blue Cut، Anti-Glare..."
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. Contact Lenses parameters */}
                                    {(formData.category === 'عدسات لاصقة' || formData.category === 'مستلزمات طبية') && (
                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div className="space-y-1">
                                                <label className="text-slate-500 font-bold block">تاريخ الانتهاء والصلاحية:</label>
                                                <input 
                                                    type="date" 
                                                    className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                                                    value={formData.opticalAttributes?.expiryDate || ""}
                                                    onChange={(e) => handleAttributeChange("expiryDate", e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-500 font-bold block">فترة استخدام العدسات اللاصقة:</label>
                                                <select 
                                                    className="w-full px-3 py-2 border rounded-xl"
                                                    value={formData.opticalAttributes?.contactUsageType || ""}
                                                    onChange={(e) => handleAttributeChange("contactUsageType", e.target.value)}
                                                >
                                                    <option value="">-- غير محدد --</option>
                                                    <option value="يومي">يومي</option>
                                                    <option value="شهري">شهري</option>
                                                    <option value="سنوي">سنوي</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Default attributes layout for others */}
                                    {(!formData.category || (formData.category !== 'إطارات نظارات' && formData.category !== 'عدسات طبية' && formData.category !== 'عدسات لاصقة' && formData.category !== 'مستلزمات طبية' && formData.category !== 'نظارات شمسية')) && (
                                        <div className="text-[11px] text-slate-400 italic">لا توجد خصائص تكميلية افتراضية لهذا التصنيف البصري. بإمكانك إضافة الملاحظات في الاسم العام للمنتج.</div>
                                    )}
                                </div>

                            </form>
                            </div>
                            <div className="p-4 md:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#1c2436] shrink-0">
                                <button
                                    form="productForm"
                                    type="submit"
                                    disabled={isSaving}
                                    className={cn(
                                        "w-full bg-blue-600 text-white py-2.5 rounded-xl font-black shadow-xl hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 cursor-pointer uppercase tracking-widest text-sm",
                                        isSaving && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {isSaving ? "جاري حفظ في المستودع..." : "حفظ بيانات ومواصفات المنتج"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Confirm Delete Modal */}
                {productToDelete && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setProductToDelete(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden z-20"
                        >
                            <div className="p-4 text-center space-y-4">
                                <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-base font-black text-slate-800">تأكيد حذف المنتج</h3>
                                <p className="text-sm text-slate-500 leading-relaxed px-4">
                                    هل أنت متأكد من حذف المنتج <span className="font-bold text-slate-800">{productToDelete.name}</span>؟ 
                                    <br />
                                    <span className="text-rose-600 font-bold mt-2 block animate-pulse">تنبيه: لا يمكن التراجع عن هذا الإجراء وحذفه من مخازن المحل البصري.</span>
                                </p>
                                <div className="flex gap-3 pt-4 text-sm font-black">
                                    <button
                                        onClick={() => setProductToDelete(null)}
                                        className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl"
                                    >
                                        إلغاء التراجع
                                    </button>
                                    <button
                                        onClick={confirmDeleteProduct}
                                        className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-100"
                                    >
                                        تأكيد الحذف
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Product Movement Ledger Modal */}
                {viewingLedgerProduct && (
                    <ProductLedgerModal 
                        product={viewingLedgerProduct}
                        onClose={() => setViewingLedgerProduct(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
