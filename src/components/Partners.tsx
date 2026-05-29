import React, { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Phone, MapPin, Calculator } from "lucide-react";
import { dbService } from "../services/db";
import { Customer, Supplier } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { X } from "lucide-react";

interface PartnersProps {
    type: 'customer' | 'supplier';
}

import CustomerProfile from "./CustomerProfile";

export default function Partners({ type }: PartnersProps) {
    const [partners, setPartners] = useState<(Customer | Supplier)[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Customer | Supplier | null>(null);
    const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);

    const [formData, setFormData] = useState<Partial<Customer>>({
        name: "",
        phone: "",
        address: "",
        balance: 0
    });

    const collectionName = type === 'customer' ? "customers" : "suppliers";

    useEffect(() => {
        loadPartners();
    }, [type]);

    const loadPartners = async () => {
        const data = await dbService.getAll(collectionName);
        setPartners(data as (Customer | Supplier)[]);
    };

    const [isSaving, setIsSaving] = useState(false);
    const [partnerToDelete, setPartnerToDelete] = useState<Customer | Supplier | null>(null);

    const confirmDeletePartner = async () => {
        if (!partnerToDelete || !partnerToDelete.id) return;
        setIsSaving(true);
        try {
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
        if (!formData.phone || formData.phone.trim().length < 9) {
            alert("يرجى إدخال رقم هاتف صحيح");
            return;
        }

        setIsSaving(true);
        try {
            if (editingPartner?.id) {
                await dbService.update(collectionName, editingPartner.id, formData);
                alert("تم تحديث البيانات بنجاح");
            } else {
                await dbService.add(collectionName, formData);
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
        setPartnerToDelete(p);
    };

    const filteredPartners = partners.filter(p => 
        (p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
        (p.phone || '').includes(searchTerm)
    );

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
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                                    className="p-3 text-slate-400 hover:text-rose-500 transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
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
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">رقم الجوال</label>
                                        <input
                                            required
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
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">الرصيد الافتتاحي</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-black dark:text-white focus:ring-4 focus:ring-indigo-500/10"
                                            value={formData.balance}
                                            onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                                            disabled={!!editingPartner}
                                            dir="ltr"
                                        />
                                    </div>
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
