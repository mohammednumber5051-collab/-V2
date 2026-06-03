import React, { useState, useEffect } from "react";
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Download,
  Plus,
  X,
  Wallet,
  ArrowRightLeft,
  Users,
  Shield,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  List,
  Edit2,
  Trash2,
  Printer,
} from "lucide-react";
import { dbService } from "../services/db";
import {
  Transaction,
  Customer,
  Supplier,
  AppUser,
  CashBox,
  Currency,
} from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

type Tab = "transactions" | "boxes" | "transfers";

export default function Transactions({ currentUser: propCurrentUser }: { currentUser?: any }) {
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [viewingBox, setViewingBox] = useState<CashBox | null>(null);
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal' | 'pdf'>('a4');
  const [partners, setPartners] = useState<{
    customers: Customer[];
    suppliers: Supplier[];
  }>({ customers: [], suppliers: [] });
  const [currentUser, setCurrentUser] = useState<AppUser | null>(propCurrentUser || null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<
    "transaction" | "box" | "transfer"
  >("transaction");

  // Forms
  const [transForm, setTransForm] = useState<Partial<Transaction>>({
    type: "قبض",
    amount: 0,
    currency: "YER",
    description: "",
    partnerId: "",
    partnerName: "",
  });

  const [boxForm, setBoxForm] = useState<Partial<CashBox>>({
    name: "",
    currency: "YER",
    userId: "",
    userName: "",
    balance: 0,
    isActive: true,
  });

  const [transferForm, setTransferForm] = useState({
    fromBoxId: "",
    toBoxId: "",
    amount: 0,
    currency: "YER",
    description: "تحويل بين الصناديق",
  });

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";

  useEffect(() => {
    if (propCurrentUser) {
      setCurrentUser(propCurrentUser);
    } else {
      const savedUser = localStorage.getItem("app_user");
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
    }
    loadStaticData();
    loadTransactions(true);
  }, [propCurrentUser]);

  const loadStaticData = async () => {
      const [boxes, userData, customers, suppliers] = await Promise.all([
        dbService.getAll("cashBoxes"),
        dbService.getAll("users"),
        dbService.getAll("customers"),
        dbService.getAll("suppliers"),
      ]);
      setCashBoxes(boxes as CashBox[]);
      setUsers(userData as AppUser[]);
      setPartners({
        customers: customers as Customer[],
        suppliers: suppliers as Supplier[],
      });
  };

  const loadTransactions = async (reset: boolean = false) => {
    if (reset) {
        setTransactions([]);
        setLastDoc(null);
    } else {
        setIsLoadingMore(true);
    }
    
    try {
        const res = await dbService.getPaginated("transactions", 50, reset ? null : lastDoc, []);
        setTransactions(prev => reset ? res.data as Transaction[] : [...prev, ...res.data as Transaction[]]);
        setLastDoc(res.lastDoc);
        setHasMore(res.hasMore);
    } catch(err) {
        console.error("Failed to load transactions", err);
    } finally {
        setIsLoadingMore(false);
    }
  };

  const loadData = async () => {
      loadStaticData();
      loadTransactions(true);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [transToDelete, setTransToDelete] = useState<Transaction | null>(null);

  const confirmDeleteTransDef = async () => {
    if (!transToDelete) return;
    setIsSaving(true);
    try {
      await dbService.deleteTransactionData(transToDelete);
      setTransToDelete(null);
      loadData();
    } catch (error) {
      console.error("Soft delete failed, trying hard delete", error);
      try {
        if (transToDelete.id) {
          await dbService.softDelete("transactions", transToDelete.id);
          setTransToDelete(null);
          loadData();
        }
      } catch (e) {
        alert("خطأ في حذف السند");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const openEditTrans = (t: Transaction) => {
    setEditingTransaction(t);
    setTransForm({ ...t });
    setModalType("transaction");
    setIsModalOpen(true);
  };

  const openEditBox = (box: CashBox) => {
    const boxTransactions = transactions.filter((t) => t.boxId === box.id || t.fromBoxId === box.id || t.toBoxId === box.id);
    const totalIn = boxTransactions.filter(t => (t.boxId === box.id && t.type === 'قبض') || (t.type === 'تحويل' && t.toBoxId === box.id)).reduce((acc, curr) => acc + curr.amount, 0);
    const totalOut = boxTransactions.filter(t => (t.boxId === box.id && t.type === 'صرف') || (t.type === 'تحويل' && t.fromBoxId === box.id)).reduce((acc, curr) => acc + curr.amount, 0);
    const initialBalance = (box.balance || 0) - totalIn + totalOut;

    setBoxForm({ ...box, balance: initialBalance }); // We use balance to hold the "initial" balance
    setModalType("box");
    setIsModalOpen(true);
  };

  const handlePrintStatement = () => {
        if (!viewingBox) return;

        const boxTransactions = transactions
            .filter((t) => t.boxId === viewingBox.id || t.fromBoxId === viewingBox.id || t.toBoxId === viewingBox.id)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // sort ascending for print report
          
        const totalIn = boxTransactions.filter(t => (t.boxId === viewingBox.id && t.type === 'قبض') || (t.type === 'تحويل' && t.toBoxId === viewingBox.id)).reduce((acc, curr) => acc + curr.amount, 0);
        const totalOut = boxTransactions.filter(t => (t.boxId === viewingBox.id && t.type === 'صرف') || (t.type === 'تحويل' && t.fromBoxId === viewingBox.id)).reduce((acc, curr) => acc + curr.amount, 0);
        const openingBalance = (viewingBox.balance || 0) - totalIn + totalOut;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert("يرجى السماح بالنوافذ المنبثقة لطباعة كشف الحساب");
            return;
        }

        if (printFormat === 'pdf') {
            printWindow.document.title = `كشف_حساب_الصندوق_${viewingBox.name.replace(/\s+/g, '_')}`;
        } else {
            printWindow.document.title = `تقرير كشف حساب صندوق - ${viewingBox.name}`;
        }

        const dateStr = new Date().toLocaleDateString('ar-YE', { 
            year: 'numeric', month: '2-digit', day: '2-digit'
        });

        let printHTML = "";

        if (printFormat === 'thermal') {
            printHTML = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8">
                    <title>كشف حساب حراري - ${viewingBox.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
                        @page { size: 80mm auto; margin: 0; }
                        body { font-family: 'Cairo', sans-serif; color: #000; padding: 4mm; width: 72mm; direction: rtl; font-size: 11px; margin: 0;}
                        .thermal-table { width: 100%; border-collapse: collapse; font-size: 9px; margin-top:10px; }
                        .thermal-table th { border-bottom: 1px dashed #000; padding: 3px 1px; text-align: right; }
                        .thermal-table td { padding: 4px 1px; border-bottom: 1px dashed #e2e8f0; }
                        .fin-box { border: 1px solid #000; padding: 5px; margin: 5px 0; border-radius:4px; font-size: 10px;}
                        .row { display: flex; justify-content: space-between; margin-bottom: 2px;}
                    </style>
                </head>
                <body>
                    <div style="text-align:center; border-bottom: 2px dashed #000; padding-bottom: 5px; margin-bottom: 5px;">
                        <div style="font-size: 14px; font-weight: 900;">مركز البصريات الحديث المتطور</div>
                        <div style="font-size: 10px; font-weight: bold;">كشف حساب صندوق</div>
                    </div>
                    <div class="row"><span>الصندوق:</span> <strong>${viewingBox.name}</strong></div>
                    <div class="row"><span>الرصيد الافتتاحي:</span> <strong>${(openingBalance || 0).toLocaleString()} ${viewingBox.currency}</strong></div>
                    <div class="row" style="border-top:1px dashed #000; padding-top:2px; margin-top: 2px;">
                        <span>الرصيد الحالي:</span> <strong>${(viewingBox.balance || 0).toLocaleString()} ${viewingBox.currency}</strong>
                    </div>
                    <table class="thermal-table">
                        <thead><tr><th>التاريخ</th><th>الحركة</th><th style="text-align: left;">المبلغ</th></tr></thead>
                        <tbody>
                            ${boxTransactions.map(item => {
                                const isIncome = (item.type === 'قبض' && item.boxId === viewingBox.id) || (item.type === 'تحويل' && item.toBoxId === viewingBox.id);
                                return `<tr>
                                    <td>${new Date(item.createdAt).toLocaleDateString('ar-YE', {month: 'numeric', day: 'numeric'})}</td>
                                    <td>${item.type}</td>
                                    <td style="text-align: left; font-weight: bold; font-family: monospace;">${isIncome ? '+' : '-'}${(item.amount || 0).toLocaleString()}</td>
                                </tr>`}).join('')}
                        </tbody>
                    </table>
                    <script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},500);};</script>
                </body>
                </html>
            `;
        } else {
            let currentBalanceIter = openingBalance;
            const timelineRows = boxTransactions.map(item => {
                const isIncome = (item.type === 'قبض' && item.boxId === viewingBox.id) || (item.type === 'تحويل' && item.toBoxId === viewingBox.id);
                if (isIncome) currentBalanceIter += item.amount;
                else currentBalanceIter -= item.amount;
                return `<tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 12px;">${new Date(item.createdAt).toLocaleDateString('ar-YE')}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: ${isIncome ? '#059669' : '#e11d48'};">${item.type}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left;">${isIncome ? '+' : '-'}${(item.amount || 0).toLocaleString()}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 11px;">${item.description || '-'} ${item.partnerName ? '<br><span style="font-weight:bold; color:#1e293b;">الطرف: ' + item.partnerName + '</span>' : ''}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left; color: #0f172a;">${currentBalanceIter.toLocaleString()} ${item.currency}</td>
                </tr>`}).join('');

            printHTML = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8"><title>تقرير كشف حساب - ${viewingBox.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
                        body { font-family: 'Cairo', sans-serif; color: #1e293b; padding: 35px; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 25px; }
                        .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 25px; font-size: 12px; }
                        .info-item { background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
                        .fin-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; text-align: center; }
                        .fin-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
                        .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                        .table th { background-color: #f1f5f9; color: #475569; font-weight: 800; text-align: right; padding: 10px; border-bottom: 2px solid #cbd5e1; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div><div style="font-size:20px; font-weight:900; color:#1e3a8a;">مركز البصريات الحديث المتطور</div>
                        <div style="font-size:18px; font-weight:800;">تقرير كشف حساب صندوق مالي</div></div>
                        <div style="font-size:11px; font-weight:bold; color:#64748b;">تاريخ الإصدار: ${dateStr}</div>
                    </div>
                    <div class="info-grid">
                        <div class="info-item"><strong>اسم الصندوق:</strong> <span style="font-size:13px; font-weight:800; color:#0f172a;">${viewingBox.name}</span></div>
                        <div class="info-item"><strong>أمين الصندوق:</strong> <span style="font-weight:bold; color:#1e3a8a;">${viewingBox.userName || 'غير محدد'}</span></div>
                        <div class="info-item"><strong>العملة:</strong> <span style="font-family:monospace; font-size:12px; font-weight:bold;">${viewingBox.currency}</span></div>
                    </div>
                    <div class="fin-grid">
                        <div class="fin-card"><div style="font-size:10px; font-weight:bold;">الرصيد الافتتاحي</div><div style="font-size:15px; font-weight:900; color:#ea580c; font-family:monospace;">${(openingBalance || 0).toLocaleString()}</div></div>
                        <div class="fin-card"><div style="font-size:10px; font-weight:bold;">وارد (المقبوضات)</div><div style="font-size:15px; font-weight:900; color:#059669; font-family:monospace;">${(totalIn || 0).toLocaleString()}</div></div>
                        <div class="fin-card"><div style="font-size:10px; font-weight:bold;">صادر (المصروفات)</div><div style="font-size:15px; font-weight:900; color:#e11d48; font-family:monospace;">${(totalOut || 0).toLocaleString()}</div></div>
                        <div class="fin-card" style="background:#f8fafc;"><div style="font-size:10px; font-weight:bold;">الرصيد المتاح</div><div style="font-size:15px; font-weight:900; color:#1e3a8a; font-family:monospace;">${(viewingBox.balance || 0).toLocaleString()}</div></div>
                    </div>
                    <table class="table">
                        <thead><tr><th>التاريخ</th><th>الحركة</th><th style="text-align: left;">المبلغ</th><th>البيان والتفاصيل</th><th style="text-align: left;">الرصيد</th></tr></thead>
                        <tbody>
                            ${openingBalance !== 0 ? `<tr style="background:#fef3c7;"><td colspan="4" style="padding:10px; font-weight:bold; font-size:12px; color:#92400e;">الرصيد الافتتاحي أول المدة</td><td style="padding:10px; font-family:monospace; font-weight:900; font-size:13px; text-align:left; color:#92400e;">${openingBalance.toLocaleString()} ${viewingBox.currency}</td></tr>` : ''}
                            ${timelineRows || '<tr><td colspan="5" style="text-align:center; padding:20px;">لا يوجد حركات مسجلة.</td></tr>'}
                        </tbody>
                    </table>
                    <script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},500);};</script>
                </body>
                </html>
            `;
        }
        printWindow.document.open();
        printWindow.document.write(printHTML);
        printWindow.document.close();
  };

  const handleDeleteTrans = (t: Transaction) => {
    setTransToDelete(t);
  };

  const handleDeleteAllTrans = async () => {
    if (
      !confirm(
        "تحذير: هل أنت متأكد من حذف جميع السندات المالية (سيتم استرجاع تأثيراتها على الأرصدة)؟",
      )
    )
      return;
    setIsSaving(true);
    try {
      await dbService.deleteAllTransactions();
      loadData();
    } catch (error) {
      console.error(error);
      alert("خطأ في حذف جميع السندات");
    }
    setIsSaving(false);
  };

  const handleTransSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transForm.amount! <= 0) return alert("مبلغ غير صحيح");
    setIsSaving(true);
    try {
      const partner = partners[
        transForm.type === "قبض" ? "customers" : "suppliers"
      ].find((p) => p.id === transForm.partnerId);
      const dataToSave = {
        ...transForm,
        partnerName: partner?.name || "عام",
      };

      if (editingTransaction) {
        await dbService.updateTransactionData(editingTransaction, dataToSave);
      } else {
        await dbService.addTransaction(dataToSave);
      }
      setIsModalOpen(false);
      setEditingTransaction(null);
      loadData();
    } catch (error) {
      console.error(error);
      alert("خطأ في الحفظ");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBoxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const selectedUser = users.find((u) => u.id === boxForm.userId);
      const dataToSave = {
        ...boxForm,
        userName: selectedUser?.name || "غير محدد",
      };

      if (boxForm.id) {
          const boxTransactions = transactions.filter((t) => t.boxId === boxForm.id || t.fromBoxId === boxForm.id || t.toBoxId === boxForm.id);
          const totalIn = boxTransactions.filter(t => (t.boxId === boxForm.id && t.type === 'قبض') || (t.type === 'تحويل' && t.toBoxId === boxForm.id)).reduce((acc, curr) => acc + curr.amount, 0);
          const totalOut = boxTransactions.filter(t => (t.boxId === boxForm.id && t.type === 'صرف') || (t.type === 'تحويل' && t.fromBoxId === boxForm.id)).reduce((acc, curr) => acc + curr.amount, 0);
          
          dataToSave.balance = (dataToSave.balance || 0) + totalIn - totalOut;
          await dbService.update("cashBoxes", boxForm.id, dataToSave);
      } else {
          await dbService.add("cashBoxes", dataToSave);
      }
      
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      alert("خطأ في حفظ الصندوق");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferForm.fromBoxId === transferForm.toBoxId)
      return alert("لا يمكن التحويل لنفس الصندوق");
    if (transferForm.amount <= 0) return alert("مبلغ غير صحيح");

    setIsSaving(true);
    try {
      await dbService.createTransfer(
        transferForm.fromBoxId,
        transferForm.toBoxId,
        transferForm.amount,
        transferForm.currency as Currency,
        transferForm.description,
      );
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      alert("خطأ في التحويل");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab("transactions")}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-black transition-all",
              activeTab === "transactions"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            سجل العمليات
          </button>
          <button
            onClick={() => setActiveTab("boxes")}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-black transition-all",
              activeTab === "boxes"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            الصناديق
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("transfers")}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === "transfers"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                  : "text-slate-400 hover:text-slate-600",
              )}
            >
              التحويلات البينية
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {activeTab === "transactions" && (
            <>
              <button
                onClick={() => {
                  setEditingTransaction(null);
                  setTransForm({
                    type: "قبض",
                    amount: 0,
                    currency: "YER",
                    description: "",
                    partnerId: "",
                    partnerName: "",
                  });
                  setModalType("transaction");
                  setIsModalOpen(true);
                }}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-2xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2"
              >
                <Plus size={20} />
                سند مالي
              </button>
            </>
          )}
          {isAdmin && activeTab === "boxes" && (
            <button
              onClick={() => {
                setModalType("box");
                setIsModalOpen(true);
              }}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              <LayoutGrid size={20} />
              صندوق جديد
            </button>
          )}
          {isAdmin && activeTab === "transfers" && (
            <button
              onClick={() => {
                setModalType("transfer");
                setIsModalOpen(true);
              }}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <ArrowRightLeft size={20} />
              تحويل جديد
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === "transactions" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            key="transactions"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-24">
                  {transactions.map((t) => (
                    <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3 relative overflow-hidden group">
                      
                      <div className="flex justify-between items-start mb-1">
                          <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 font-black mb-1">#{t.id?.slice(0, 6)}</span>
                              <span className="font-bold text-slate-800 text-sm">{t.partnerName || "عام"}</span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                              <span
                                className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded",
                                  t.type === "قبض"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : t.type === "صرف"
                                      ? "bg-rose-50 text-rose-600"
                                      : "bg-blue-50 text-blue-600",
                                )}
                              >
                                {t.type}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {t.createdAt ? new Date(t.createdAt).toLocaleDateString("ar-EG") : "غير محدد"}
                              </span>
                          </div>
                      </div>

                      <div className="py-2 border-t border-b border-slate-50 flex flex-col gap-1">
                          <p className="text-[10px] text-slate-400 font-bold">البيان</p>
                          <p className="text-xs text-slate-600 font-medium">{t.description}</p>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                          <div className="flex items-baseline gap-1">
                              <span className="font-black text-base font-mono text-slate-900">{(t.amount || 0).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{t.currency}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-2 w-full pt-3 border-t border-slate-50">
                              <button
                                onClick={() => openEditTrans(t)}
                                className="flex flex-1 items-center justify-center gap-1.5 p-2 bg-slate-50 text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-100 rounded-lg transition-colors text-xs font-bold"
                              >
                                <Edit2 size={14} /> تعديل
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteTrans(t)}
                                  className="flex flex-1 items-center justify-center gap-1.5 p-2 bg-slate-50 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-100 rounded-lg transition-colors text-xs font-bold"
                                >
                                  <Trash2 size={14} /> حذف
                                </button>
                              )}
                          </div>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                      <div className="col-span-1 md:col-span-2 lg:col-span-3 py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs border border-dashed border-slate-200 rounded-2xl">
                          لا توجد سندات
                      </div>
                  )}
            </div>
            
            {hasMore && (
                <div className="flex justify-center mt-4 pb-24">
                    <button
                        onClick={() => loadTransactions(false)}
                        disabled={isLoadingMore}
                        className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                        {isLoadingMore ? "جاري التحميل..." : "تحميل المزيد"}
                    </button>
                </div>
            )}
          </motion.div>
        )}

        {activeTab === "boxes" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            key="boxes"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {cashBoxes.map((box) => (
              <div
                key={box.id}
                onClick={() => setViewingBox(box)}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 relative overflow-hidden group cursor-pointer"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-110 transition-transform" />
                <div className="relative">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-10 h-10 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center text-blue-600 z-10 relative">
                      <Wallet size={24} />
                    </div>
                    <div className="flex items-center gap-2 z-10 relative">
                        {isAdmin && (
                            <button onClick={(e) => { e.stopPropagation(); openEditBox(box); }} className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-1.5 rounded-lg border border-slate-100 transition-colors">
                                <Edit2 size={14} />
                            </button>
                        )}
                        <div
                          className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-full",
                            box.isActive
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              : "bg-slate-100 text-slate-400",
                          )}
                        >
                          {box.isActive ? "نشط" : "معطل"}
                        </div>
                    </div>
                  </div>
                  <h4 className="font-black text-slate-800 text-base mb-1">
                    {box.name}
                  </h4>
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-6">
                    <Users size={12} />
                    {box.userName}
                  </div>
                  <div className="flex flex-col border-t border-slate-50 pt-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      الرصيد الحالي
                    </span>
                    <span className="text-2xl font-black text-slate-900 font-mono tracking-tighter">
                      {(box.balance || 0).toLocaleString()}
                      <span className="text-sm font-normal mr-2 opacity-30">
                        {box.currency}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {activeTab === "transfers" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            key="transfers"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-right min-w-[700px]">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <th className="px-6 py-2.5">من الصندوق</th>
                    <th className="px-6 py-2.5 text-center"></th>
                    <th className="px-6 py-2.5">إلى الصندوق</th>
                    <th className="px-6 py-2.5">المبلغ</th>
                    <th className="px-6 py-2.5">البيان</th>
                    <th className="px-6 py-2.5 text-center">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transactions
                    .filter((t) => t.type === "تحويل")
                    .map((t) => {
                      const fromBox = cashBoxes.find(
                        (b) => b.id === t.fromBoxId,
                      );
                      const toBox = cashBoxes.find((b) => b.id === t.toBoxId);
                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-slate-50/30 transition-colors group"
                        >
                          <td className="px-6 py-2.5">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 text-xs">
                                {fromBox?.name || "صندوق محذوف"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {fromBox?.userName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-2.5 text-center">
                            <ArrowRightLeft
                              size={14}
                              className="text-blue-500 opacity-30"
                            />
                          </td>
                          <td className="px-6 py-2.5">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 text-xs">
                                {toBox?.name || "صندوق محذوف"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {toBox?.userName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-2.5 font-black font-mono">
                            {(t.amount || 0).toLocaleString()}{" "}
                            <span className="opacity-30">{t.currency}</span>
                          </td>
                          <td className="px-6 py-2.5 text-xs text-slate-500">
                            {t.description}
                          </td>
                          <td className="px-6 py-2.5 text-[10px] text-slate-400 text-center font-bold">
                            <div className="flex items-center justify-between">
                              <span>
                                {t.createdAt ? new Date(t.createdAt).toLocaleDateString(
                                  "ar-EG",
                                ) : "غير محدد"}
                              </span>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteTrans(t)}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors md:opacity-0 md:group-hover:opacity-100"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#131b2e] w-full max-w-lg h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2.5rem] shadow-2xl relative flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <h3 className="text-base font-bold">
                  {modalType === "transaction" &&
                    (editingTransaction
                      ? "تعديل السند المالي"
                      : "سند مالي جديد")}
                  {modalType === "box" && (boxForm.id ? "تعديل بيانات الصندوق" : "إعداد صندوق جديد")}
                  {modalType === "transfer" && "تحويل مالي بين الصناديق"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="overflow-y-auto p-4 md:p-8 flex-1 custom-scrollbar bg-white dark:bg-[#131b2e]">
                {modalType === "transaction" && (
                  <form onSubmit={handleTransSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setTransForm({ ...transForm, type: "قبض" })
                        }
                        className={cn(
                          "py-2.5 rounded-2xl border-2 font-black transition-all",
                          transForm.type === "قبض"
                            ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-lg shadow-emerald-100"
                            : "bg-white border-slate-100 text-slate-400",
                        )}
                      >
                        قبض (إيراد)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTransForm({ ...transForm, type: "صرف" })
                        }
                        className={cn(
                          "py-2.5 rounded-2xl border-2 font-black transition-all",
                          transForm.type === "صرف"
                            ? "bg-rose-50 border-rose-500 text-rose-700 shadow-lg shadow-rose-100"
                            : "bg-white border-slate-100 text-slate-400",
                        )}
                      >
                        صرف (مصروف)
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">
                          المبلغ
                        </label>
                        <input
                          required
                          type="number"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black text-blue-600 text-center"
                          value={transForm.amount}
                          onChange={(e) =>
                            setTransForm({
                              ...transForm,
                              amount: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">
                          العملة
                        </label>
                        <select
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                          value={transForm.currency}
                          onChange={(e) =>
                            setTransForm({
                              ...transForm,
                              currency: e.target.value as any,
                            })
                          }
                        >
                          <option value="YER">YER</option>
                          <option value="SAR">SAR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        الصندوق المالي
                      </label>
                      <select
                        required
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                        value={transForm.boxId}
                        onChange={(e) =>
                          setTransForm({ ...transForm, boxId: e.target.value })
                        }
                      >
                        <option value="">-- اختر الصندوق المالي --</option>
                        {cashBoxes
                          .filter((b) => b.isActive)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.userName})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        الطرف (اختياري)
                      </label>
                      <select
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                        value={transForm.partnerId}
                        onChange={(e) =>
                          setTransForm({
                            ...transForm,
                            partnerId: e.target.value,
                          })
                        }
                      >
                        <option value="">-- كاش (عام) --</option>
                        {(transForm.type === "قبض"
                          ? partners.customers
                          : partners.suppliers
                        ).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        البيان / الوصف
                      </label>
                      <input
                        required
                        type="text"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700"
                        value={transForm.description}
                        onChange={(e) =>
                          setTransForm({
                            ...transForm,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="sticky bottom-0 bg-white dark:bg-[#131b2e] pt-4 pb-2 z-10 border-t border-slate-100 dark:border-slate-800 mt-6 -mx-4 px-4 md:-mx-8 md:px-8">
                      <button
                        disabled={isSaving}
                        className="w-full py-2.5 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 disabled:opacity-50 transition-all"
                      >
                        {isSaving
                          ? "جاري الحفظ..."
                          : editingTransaction
                            ? "حفظ التعديلات"
                            : "تسجيل وإضافة السند"}
                      </button>
                    </div>
                  </form>
                )}

                {modalType === "box" && (
                  <form onSubmit={handleBoxSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        اسم الصندوق
                      </label>
                      <input
                        required
                        type="text"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                        value={boxForm.name}
                        onChange={(e) =>
                          setBoxForm({ ...boxForm, name: e.target.value })
                        }
                        placeholder="مثلاً: صندوق المبيعات الرئيسي"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          العملة
                        </label>
                        <select
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                          value={boxForm.currency}
                          onChange={(e) =>
                            setBoxForm({
                              ...boxForm,
                              currency: e.target.value as any,
                            })
                          }
                        >
                          <option value="YER">YER</option>
                          <option value="SAR">SAR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          الرصيد الافتتاحي (بداية المدة)
                        </label>
                        <input
                          type="number"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                          value={boxForm.balance}
                          onChange={(e) =>
                            setBoxForm({
                              ...boxForm,
                              balance: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        المستخدم المسؤول
                      </label>
                      <select
                        required
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                        value={boxForm.userId}
                        onChange={(e) =>
                          setBoxForm({ ...boxForm, userId: e.target.value })
                        }
                      >
                        <option value="">-- اختر المستخدم --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sticky bottom-0 bg-white dark:bg-[#131b2e] pt-4 pb-2 z-10 border-t border-slate-100 dark:border-slate-800 mt-6 -mx-4 px-4 md:-mx-8 md:px-8">
                      <button
                        disabled={isSaving}
                        className="w-full py-2.5 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all cursor-pointer"
                      >
                        {isSaving ? "جاري الحفظ..." : boxForm.id ? "تأكيد التعديل" : "تأكيد إضافة الصندوق"}
                      </button>
                    </div>
                  </form>
                )}

                {modalType === "transfer" && (
                  <form onSubmit={handleTransferSubmit} className="space-y-6">
                    <div className="space-y-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                          من صندوق
                        </label>
                        <select
                          required
                          className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-2xl font-bold"
                          value={transferForm.fromBoxId}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              fromBoxId: e.target.value,
                            })
                          }
                        >
                          <option value="">-- اختر الصندوق المصدر --</option>
                          {cashBoxes
                            .filter((b) => b.isActive)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({(b.balance || 0).toLocaleString()}{" "}
                                {b.currency})
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="flex justify-center">
                        <ArrowDownLeft className="text-blue-200" size={32} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                          إلى صندوق
                        </label>
                        <select
                          required
                          className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-2xl font-bold"
                          value={transferForm.toBoxId}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              toBoxId: e.target.value,
                            })
                          }
                        >
                          <option value="">-- اختر الصندوق الوجهة --</option>
                          {cashBoxes
                            .filter((b) => b.isActive)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({(b.balance || 0).toLocaleString()}{" "}
                                {b.currency})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          المبلغ المحول
                        </label>
                        <input
                          required
                          type="number"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-base font-black text-indigo-600 text-center"
                          value={transferForm.amount}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              amount: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          العملة
                        </label>
                        <select
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                          value={transferForm.currency}
                          onChange={(e) =>
                            setTransferForm({
                              ...transferForm,
                              currency: e.target.value as any,
                            })
                          }
                        >
                          <option value="YER">YER</option>
                          <option value="SAR">SAR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        ملاحظات التحويل
                      </label>
                      <input
                        required
                        type="text"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold"
                        value={transferForm.description}
                        onChange={(e) =>
                          setTransferForm({
                            ...transferForm,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="sticky bottom-0 bg-white dark:bg-[#131b2e] pt-4 pb-2 z-10 border-t border-slate-100 dark:border-slate-800 mt-6 -mx-4 px-4 md:-mx-8 md:px-8">
                      <button
                        disabled={isSaving}
                        className="w-full py-2.5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all"
                      >
                        {isSaving
                          ? "جاري تنفيذ التحويل..."
                          : "تنفيذ التحويل المالي"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Confirm Delete Modal */}
        {transToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTransToDelete(null)}
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
                <h3 className="text-base font-black text-slate-800">تأكيد حذف السند</h3>
                <p className="text-sm text-slate-500 leading-relaxed px-4 text-center">
                  هل أنت متأكد من حذف هذا السند المالي بمبلغ <span className="font-bold text-slate-800">{(transToDelete.amount || 0).toLocaleString()} {transToDelete.currency}</span>؟ 
                  <br />
                  <span className="text-rose-600 font-bold mt-2 block">تنبيه: سيتم استرجاع تأثيراته على الصناديق وأرصدة الأطراف بالكامل!</span>
                </p>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setTransToDelete(null)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={confirmDeleteTransDef}
                    className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 cursor-pointer"
                  >
                    حذف نهائي
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Box Detail Modal */}
        {viewingBox && (() => {
          const boxTransactions = transactions
            .filter((t) => t.boxId === viewingBox.id || t.fromBoxId === viewingBox.id || t.toBoxId === viewingBox.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          const totalIn = boxTransactions.filter(t => (t.boxId === viewingBox.id && t.type === 'قبض') || (t.type === 'تحويل' && t.toBoxId === viewingBox.id)).reduce((acc, curr) => acc + curr.amount, 0);
          const totalOut = boxTransactions.filter(t => (t.boxId === viewingBox.id && t.type === 'صرف') || (t.type === 'تحويل' && t.fromBoxId === viewingBox.id)).reduce((acc, curr) => acc + curr.amount, 0);
          const openingBalance = (viewingBox.balance || 0) - totalIn + totalOut;

          return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingBox(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-5xl max-h-[96vh] rounded-xl shadow-2xl relative overflow-hidden z-10 flex flex-col"
            >
              {/* Header */}
              <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">
                      كشف حساب الصندوق: {viewingBox.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold">
                      أمين الصندوق: {viewingBox.userName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center bg-slate-200/50 p-1 rounded-xl">
                      <button
                          onClick={() => setPrintFormat('a4')}
                          className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                              printFormat === 'a4' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                          title="طباعة رسمية كاملة - A4"
                      >
                          رسمي A4
                      </button>
                      <button
                          onClick={() => setPrintFormat('thermal')}
                          className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                              printFormat === 'thermal' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                          title="طباعة كاشير حرارية 80mm"
                      >
                          حراري (80mm)
                      </button>
                      <button
                          onClick={() => setPrintFormat('pdf')}
                          className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                              printFormat === 'pdf' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                          title="تصدير كملف PDF"
                      >
                          تنزيل PDF
                      </button>
                  </div>
                  <button
                      onClick={handlePrintStatement}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-sm text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                  >
                      <Printer size={16} />
                      <span className="hidden sm:inline">طباعة الكشف</span>
                  </button>
                  <button
                    onClick={() => setViewingBox(null)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Box summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3 bg-white border-b border-slate-100 shrink-0">
                <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 flex flex-col justify-center">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-0.5 opacity-80">الرصيد الافتتاحي</p>
                  <p className="text-base font-black text-amber-900 font-mono tracking-tighter">
                    {openingBalance.toLocaleString()} <span className="text-[9px] font-normal opacity-50">{viewingBox.currency}</span>
                  </p>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-100/50 text-emerald-700 flex flex-col justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-0.5 opacity-80">إجمالي وارد</p>
                  <p className="text-base font-black font-mono tracking-tighter">
                    {totalIn.toLocaleString()} <span className="text-[9px] font-normal opacity-50">{viewingBox.currency}</span>
                  </p>
                </div>
                <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-100/50 text-rose-700 flex flex-col justify-center">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-0.5 opacity-80">إجمالي صادر</p>
                  <p className="text-base font-black font-mono tracking-tighter">
                    {totalOut.toLocaleString()} <span className="text-[9px] font-normal opacity-50">{viewingBox.currency}</span>
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col justify-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">الرصيد الحالي</p>
                  <p className="text-base font-black text-slate-800 font-mono tracking-tighter">
                    {(viewingBox.balance || 0).toLocaleString()} <span className="text-[9px] font-normal opacity-50">{viewingBox.currency}</span>
                  </p>
                </div>
              </div>

              {/* Transactions list */}
              <div className="flex-1 overflow-auto bg-slate-50/50 p-3">
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                    <table className="w-full text-right min-w-[600px] table-fixed">
                        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                        <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            <th className="px-3 py-2 w-[15%]">التاريخ</th>
                            <th className="px-3 py-2 w-[15%]">الحركة</th>
                            <th className="px-3 py-2 w-[40%] text-right">البيان</th>
                            <th className="px-3 py-2 w-[15%] text-left text-emerald-600">وارد</th>
                            <th className="px-3 py-2 w-[15%] text-left text-rose-600">صادر</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {boxTransactions
                            .map((t) => {
                                const isIncome = (t.type === 'قبض' && t.boxId === viewingBox.id) || (t.type === 'تحويل' && t.toBoxId === viewingBox.id);
                                const isOutcome = (t.type === 'صرف' && t.boxId === viewingBox.id) || (t.type === 'تحويل' && t.fromBoxId === viewingBox.id);
                                
                                return (
                                <tr 
                                    key={t.id} 
                                    onClick={() => {
                                        if (t.type !== 'تحويل') {
                                            openEditTrans(t);
                                            setViewingBox(null);
                                        }
                                    }}
                                    className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                                >
                                    <td className="px-3 py-2 align-top">
                                        <div className="font-bold text-[11px] text-slate-800 font-mono">
                                            {new Date(t.createdAt).toLocaleDateString("ar-EG")}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-mono">
                                            {new Date(t.createdAt).toLocaleTimeString("ar-EG")}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <span
                                            className={cn(
                                                "text-[10px] font-black px-2 py-0.5 rounded-md inline-block",
                                                t.type === "قبض"
                                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                                    : t.type === "صرف"
                                                    ? "bg-rose-50 text-rose-600 border border-rose-100"
                                                    : "bg-blue-50 text-blue-600 border border-blue-100"
                                            )}
                                        >
                                            {t.type}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right align-top">
                                        <p className="text-[11px] font-bold text-slate-800 leading-snug break-words">
                                            {t.description}
                                        </p>
                                        {t.partnerName && (
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">الطرف: {t.partnerName}</p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-left font-mono font-black text-emerald-600 text-xs align-top">
                                        {isIncome ? `+${(t.amount || 0).toLocaleString()}` : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-left font-mono font-black text-rose-600 text-xs align-top">
                                        {isOutcome ? `-${(t.amount || 0).toLocaleString()}` : "-"}
                                    </td>
                                </tr>
                                );
                            })}
                        {openingBalance !== 0 && (
                            <tr className="bg-amber-50/20">
                                <td colSpan={3} className="px-3 py-2.5 text-left font-black text-amber-800 text-[11px]">
                                    الرصيد الافتتاحي (أول المدة):
                                </td>
                                <td className="px-3 py-2.5 text-left font-mono font-black text-emerald-600 text-xs">
                                    {openingBalance > 0 ? `+${openingBalance.toLocaleString()}` : "-"}
                                </td>
                                <td className="px-3 py-2.5 text-left font-mono font-black text-rose-600 text-xs">
                                    {openingBalance < 0 ? `${Math.abs(openingBalance).toLocaleString()}` : "-"}
                                </td>
                            </tr>
                        )}
                        {boxTransactions.length === 0 && openingBalance === 0 && (
                            <tr>
                                <td colSpan={5} className="py-6 text-center text-slate-400 font-bold text-xs">
                                    لا توجد حركات مالية مسجلة لهذا الصندوق
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
