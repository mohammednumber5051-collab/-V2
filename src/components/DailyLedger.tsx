import { syncEngine } from "../services/syncEngine";
import React, { useState, useEffect } from "react";
import { Plus, Save, Trash2, Edit2, Check, ArrowRight } from "lucide-react";
import { dbService } from "../services/db";
import { Invoice, EntityType, Currency, PaymentType, InvoiceStatus, Customer, Supplier, CashBox } from "../types";
import { cn } from "../lib/utils";

interface LedgerRow {
    id: string;
    partnerName: string;
    type: EntityType;
    amount: string;
    currency: Currency;
    isPaid: boolean;
    notes: string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function DailyLedger({ currentUser }: { currentUser?: any }) {
    const [rows, setRows] = useState<LedgerRow[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [selectedBoxId, setSelectedBoxId] = useState<string>("");

    useEffect(() => {
        checkCashBoxes();
        // Add one empty row by default
        if (rows.length === 0) {
            addNewRow();
        }
    }, []);

    const checkCashBoxes = async () => {
        const boxes = await dbService.getAll("cashBoxes") as CashBox[];
        setCashBoxes(boxes);
        const assignedBox = currentUser?.assignedBoxId ? boxes.find(b => b.id === currentUser.assignedBoxId) : null;
        if (assignedBox) {
            setSelectedBoxId(assignedBox.id || "");
        } else {
            const activeBox = boxes.find(b => b.isActive) || boxes[0];
            if (activeBox) {
                setSelectedBoxId(activeBox.id || "");
            }
        }
    };

    const addNewRow = () => {
        setRows([...rows, {
            id: generateId(),
            partnerName: "",
            type: 'sale',
            amount: "",
            currency: 'YER',
            isPaid: true,
            notes: ""
        }]);
    };

    const updateRow = (id: string, field: keyof LedgerRow, value: any) => {
        setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const removeRow = (id: string) => {
        setRows(rows.filter(r => r.id !== id));
        if (rows.length === 1) addNewRow(); // keep at least one
    };

    const handleSaveAll = async () => {
        const validRows = rows.filter(r => (r.partnerName || '').trim() !== "" && r.amount !== "" && parseFloat(r.amount) > 0);
        
        if (validRows.length === 0) {
            alert("لا توجد قيود صحيحة للحفظ");
            return;
        }

        const needsCashBox = validRows.some(r => r.isPaid);
        if (needsCashBox && !selectedBoxId) {
            alert("يوجد قيود نقدية مدفوعة، يرجى تحديد صندوق مالي");
            return;
        }

        setIsSaving(true);
        try {
            // Processing sequentially
            for (const row of validRows) {
                const collectionName = row.type === 'sale' ? 'customers' : 'suppliers';
                let partners = await dbService.getAll(collectionName) as (Customer | Supplier)[];
                let partner = partners.find(p => (p.name || '').trim() === (row.partnerName || '').trim());
                
                let partnerId = partner?.id || '';

                if (!partner) {
                    const newPartner = {
                        name: (row.partnerName || '').trim(),
                        phone: "",
                        address: "",
                        balance: 0,
                        updatedAt: new Date().toISOString()
                    };
                    partnerId = await dbService.add(collectionName, newPartner);
                }

                const numAmount = parseFloat(row.amount);
                const paymentType: PaymentType = row.isPaid ? 'نقدآ' : 'آجل';
                const status: InvoiceStatus = row.isPaid ? 'مدفوع' : 'آجل';
                const paid = row.isPaid ? numAmount : 0;

                const invoiceContent: Invoice = {
                    type: row.type,
                    partnerId,
                    boxId: row.isPaid ? selectedBoxId : undefined,
                    partnerName: row.partnerName.trim(),
                    items: [{
                        productId: "ledger_entry_item",
                        productName: "قيد يومية",
                        quantity: 1,
                        price: numAmount,
                        purchasePrice: 0, // Ledger entries are usually high margin/service based
                        total: numAmount
                    }],
                    total: numAmount,
                    paid,
                    discount: 0,
                    status,
                    paymentType,
                    referenceNumber: "",
                    notes: row.notes,
                    currency: row.currency,
                    createdAt: new Date().toISOString()
                };

                await dbService.createInvoice(invoiceContent);
            }

            alert("تم الحفظ بنجاح!");
            setRows([]);
            addNewRow();
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">دفتر اليومية</h2>
                    <p className="text-slate-500 text-sm">تسجيل سريع لعدة قيود محاسبية</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm min-w-[200px] disabled:opacity-50"
                        value={selectedBoxId}
                        onChange={e => setSelectedBoxId(e.target.value)}
                        disabled={!!currentUser?.assignedBoxId && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN'}
                    >
                        <option value="">-- اختر الصندوق للقيود النقدية --</option>
                        {cashBoxes.filter(b => b.isActive).map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleSaveAll}
                        disabled={isSaving}
                        className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        <Save size={18} />
                        حفظ الكل
                    </button>
                </div>
            </div>

            <div className="space-y-3 pb-6 -mx-4 px-4 md:mx-0 md:px-0">
                {rows.map((row, index) => (
                    <div key={row.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 relative overflow-hidden group">
                        
                        <div className="flex items-center justify-between">
                            <span className="bg-slate-100 text-slate-400 font-bold px-2 py-0.5 rounded text-xs">#{index + 1}</span>
                            <button onClick={() => removeRow(row.id)} className="text-rose-400 hover:text-rose-600 p-1 bg-rose-50 rounded-lg">
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <input
                                    type="text"
                                    value={row.partnerName}
                                    onChange={e => updateRow(row.id, 'partnerName', e.target.value)}
                                    placeholder="اسم الحساب (العميل/المورد)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-bold"
                                />
                            </div>
                            
                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                                <button
                                    onClick={() => updateRow(row.id, 'type', 'sale')}
                                    className={cn("flex-1 py-1.5 text-xs font-bold rounded-lg", row.type === 'sale' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
                                >
                                    لها (المبيعات)
                                </button>
                                <button
                                    onClick={() => updateRow(row.id, 'type', 'purchase')}
                                    className={cn("flex-1 py-1.5 text-xs font-bold rounded-lg", row.type === 'purchase' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500")}
                                >
                                    منها (المشتريات)
                                </button>
                            </div>

                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                                <button
                                    onClick={() => updateRow(row.id, 'isPaid', true)}
                                    className={cn("flex-1 py-1.5 text-xs font-bold rounded-lg", row.isPaid ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500")}
                                >
                                    نقدي
                                </button>
                                <button
                                    onClick={() => updateRow(row.id, 'isPaid', false)}
                                    className={cn("flex-1 py-1.5 text-xs font-bold rounded-lg", !row.isPaid ? "bg-white text-amber-600 shadow-sm" : "text-slate-500")}
                                >
                                    آجل
                                </button>
                            </div>

                            <div className="flex gap-2 col-span-2">
                                <input
                                    type="number"
                                    value={row.amount}
                                    onChange={e => updateRow(row.id, 'amount', e.target.value)}
                                    placeholder="المبلغ"
                                    className="flex-[2] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-center focus:ring-2 focus:ring-blue-500"
                                />
                                <select
                                    value={row.currency}
                                    onChange={e => updateRow(row.id, 'currency', e.target.value)}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-bold"
                                >
                                    <option value="YER">يمني</option>
                                    <option value="SAR">سعودي</option>
                                    <option value="USD">دولار</option>
                                </select>
                            </div>
                            
                            <div className="col-span-2">
                                <input
                                    type="text"
                                    value={row.notes}
                                    onChange={e => updateRow(row.id, 'notes', e.target.value)}
                                    placeholder="ملاحظات البيان (اختياري)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-slate-600"
                                />
                            </div>
                        </div>

                    </div>
                ))}

                <button
                    onClick={addNewRow}
                    className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={20} />
                    إضافة قيد جديد
                </button>
            </div>
        </div>
    );
}
