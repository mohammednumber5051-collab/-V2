import React, { useState, useEffect } from "react";
import { Plus, X, Edit2, Trash2, Printer, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { dbService } from "../services/db";
import { Voucher, CashBox, Customer, Supplier, AppUser } from "../types";
import { cn, hasPermission } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { syncEngine } from "../services/syncEngine";

export default function Vouchers({ currentUser }: { currentUser: AppUser }) {
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [partners, setPartners] = useState<(Customer | Supplier)[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
    const [form, setForm] = useState<Partial<Voucher>>({ type: 'receipt', currency: 'YER' });
    const [isLoading, setIsLoading] = useState(false);

    // Filters
    const [searchDate, setSearchDate] = useState("");
    const [searchPartner, setSearchPartner] = useState("");
    const [searchType, setSearchType] = useState<"all" | "receipt" | "payment">("all");
    const [isFilterExpanded, setIsFilterExpanded] = useState(false);

    useEffect(() => {
        loadData();
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadData();
        });
        return unsubscribe;
    }, []);

    const loadData = async () => {
        const [v, boxes, customers, suppliers] = await Promise.all([
            dbService.getAll("vouchers"),
            dbService.getAll("cashBoxes"),
            dbService.getAll("customers"),
            dbService.getAll("suppliers")
        ]);
        setVouchers(v as Voucher[]);
        setCashBoxes(boxes as CashBox[]);
        setPartners([...(customers as Customer[]).map(c => ({...c, partnerType: 'customer'})), ...(suppliers as Supplier[]).map(s => ({...s, partnerType: 'supplier'}))] as any[]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const box = cashBoxes.find(b => b.id === form.boxId);
            if (editingVoucher) {
                await dbService.updateVoucher(editingVoucher, { 
                    ...form, 
                    boxName: box?.name,
                    updatedBy: currentUser.name
                } as Voucher);
            } else {
                const maxVoucherNumber = vouchers.reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0);
                await dbService.addVoucher({ 
                    ...form, 
                    voucherNumber: maxVoucherNumber + 1,
                    boxName: box?.name,
                    createdBy: currentUser.name 
                } as Voucher);
            }
            setIsModalOpen(false);
            setEditingVoucher(null);
            setForm({ type: 'receipt', currency: 'YER' });
            loadData();
        } catch (err) {
            console.error(err);
            alert("خطأ في الحفظ");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVouchers = vouchers.filter(v => {
        if (v.recordStatus === 'deleted') return false;
        const dateStr = new Date(v.createdAt).toISOString().split('T')[0];
        const matchDate = searchDate ? dateStr === searchDate : true;
        const matchPartner = searchPartner ? v.partnerName?.includes(searchPartner) : true;
        const matchType = searchType !== 'all' ? v.type === searchType : true;
        return matchDate && matchPartner && matchType;
    });

    const totalReceipts = filteredVouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + v.amount, 0);
    const totalPayments = filteredVouchers.filter(v => v.type === 'payment').reduce((sum, v) => sum + v.amount, 0);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-black text-slate-800">سندات الصرف والقبض</h2>
                {hasPermission(currentUser, 'add_vouchers') && (
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
                    <Plus size={16} /> سند جديد
                </button>
                )}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                {/* Header of Filter Container */}
                <div 
                    onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                    className="flex justify-between items-center cursor-pointer select-none pb-2 border-b border-slate-100 last:border-0"
                >
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                        <Filter size={16} className="text-slate-400" />
                        <span>أدوات التصفية والبحث</span>
                        {(searchDate || searchPartner || searchType !== 'all') && (
                            <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                                مفعّل
                            </span>
                        )}
                    </div>
                    <button className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 text-xs font-bold">
                        <span>{isFilterExpanded ? "إخفاء الفلاتر" : "عرض الفلاتر"}</span>
                        {isFilterExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>

                {/* Collapsible Content */}
                <AnimatePresence initial={false}>
                    {isFilterExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 pb-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">تاريخ السند</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50"
                                        value={searchDate}
                                        onChange={(e) => setSearchDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">اسم الحساب</label>
                                    <input 
                                        type="text" 
                                        placeholder="بحث باسم الحساب..."
                                        className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50"
                                        value={searchPartner}
                                        onChange={(e) => setSearchPartner(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">نوع السند</label>
                                    <select 
                                        className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50"
                                        value={searchType}
                                        onChange={(e) => setSearchType(e.target.value as any)}
                                    >
                                        <option value="all">الكل</option>
                                        <option value="receipt">سندات القبض</option>
                                        <option value="payment">سندات الصرف</option>
                                    </select>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                
                <div className="flex gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex-1 bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                        <p className="text-xs text-emerald-600 font-bold mb-1">إجمالي المقبوضات</p>
                        <p className="text-lg font-black text-emerald-700">{totalReceipts.toLocaleString()}</p>
                    </div>
                    <div className="flex-1 bg-white p-3 rounded-lg border border-rose-100 shadow-sm">
                        <p className="text-xs text-rose-600 font-bold mb-1">إجمالي المصروفات</p>
                        <p className="text-lg font-black text-rose-700">{totalPayments.toLocaleString()}</p>
                    </div>
                    <div className="flex-1 bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                        <p className="text-xs text-blue-600 font-bold mb-1">الصافي (قبض - صرف)</p>
                        <p className="text-lg font-black text-blue-700">{(totalReceipts - totalPayments).toLocaleString()}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-right text-xs whitespace-nowrap">
                    <thead className="bg-[#1e1b4b] border-b border-slate-200 text-white font-black">
                        <tr>
                            <th className="p-3 border-x border-slate-600">رقم السند</th>
                            <th className="p-3 border-x border-slate-600">التاريخ</th>
                            <th className="p-3 border-x border-slate-600">اسم الحساب</th>
                            <th className="p-3 border-x border-slate-600">العملة</th>
                            <th className="p-3 border-x border-slate-600">الصندوق</th>
                            <th className="p-3 border-x border-slate-600">المبلغ</th>
                            <th className="p-3 border-x border-slate-600">النوع</th>
                            <th className="p-3 border-x border-slate-600">البيان</th>
                            <th className="p-3 border-x border-slate-600 w-24 text-center">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredVouchers.map(v => (
                            <tr key={v.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono font-bold">#{v.voucherNumber}</td>
                                <td className="p-3">{new Date(v.createdAt).toLocaleDateString('ar-EG')}</td>
                                <td className="p-3">{v.partnerName}</td>
                                <td className="p-3">{v.currency}</td>
                                <td className="p-3">{v.boxName}</td>
                                <td className="p-3 font-black text-slate-800">{v.amount.toLocaleString()}</td>
                                <td className="p-3">{v.type === 'receipt' ? <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold">قبض</span> : <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-lg text-xs font-bold">صرف</span>}</td>
                                <td className="p-3 max-w-[200px] truncate" title={v.notes}>{v.notes || '-'}</td>
                                <td className="p-3 flex justify-center gap-2">
                                    {hasPermission(currentUser, 'edit_vouchers') && (
                                    <button onClick={() => { setEditingVoucher(v); setForm(v); setIsModalOpen(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="تعديل"><Edit2 size={16} /></button>
                                    )}
                                    {hasPermission(currentUser, 'delete_vouchers') && (
                                    <button onClick={async () => { if(confirm('تأكيد الحذف؟')) { await dbService.deleteVoucher(v); loadData(); } }} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors" title="حذف"><Trash2 size={16} /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                        <motion.form 
                            initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            onSubmit={handleSubmit}
                            className="bg-white p-6 rounded-2xl w-full max-w-md space-y-4"
                        >
                            <h3 className="font-bold text-lg">{editingVoucher ? 'تعديل سند' : 'سند جديد'}</h3>
                            <select className="w-full p-2 border rounded-xl text-sm" value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value as any }))}>
                                <option value="receipt">قبض</option>
                                <option value="payment">صرف</option>
                            </select>
                            <input type="number" placeholder="المبلغ" required className="w-full p-2 border rounded-xl text-sm" value={form.amount || ''} onChange={e => setForm(prev => ({ ...prev, amount: Number(e.target.value) }))} />
                            <select required className="w-full p-2 border rounded-xl text-sm" value={form.partnerId || ''} onChange={e => { const p = partners.find(p => p.id === e.target.value) as any; setForm(prev => ({ ...prev, partnerId: e.target.value, partnerName: p?.name || '', partnerType: p?.partnerType || 'none' })) }}>
                                <option value="">-- اختر الحساب --</option>
                                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <select required className="w-full p-2 border rounded-xl text-sm" value={form.boxId || ''} onChange={e => setForm(prev => ({ ...prev, boxId: e.target.value }))}>
                                <option value="">-- اختر الصندوق --</option>
                                {cashBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <input type="text" placeholder="رقم المرجع (اختياري)" className="w-full p-2 border rounded-xl text-sm" value={form.referenceNumber || ''} onChange={e => setForm(prev => ({ ...prev, referenceNumber: e.target.value }))} />
                            <textarea placeholder="البيان/الوصف" className="w-full p-2 border rounded-xl text-sm" value={form.notes || ''} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 p-2 bg-slate-100 rounded-xl font-bold text-sm">إلغاء</button>
                                <button type="submit" disabled={isLoading} className="flex-1 p-2 bg-blue-600 text-white rounded-xl font-bold text-sm">{isLoading ? 'جاري الحفظ...' : 'حفظ'}</button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
