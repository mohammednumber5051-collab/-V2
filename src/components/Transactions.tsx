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
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { dbService } from "../services/db";
import { FinancialMovement, Invoice, Voucher, QuickFinancialEntry } from "../types";
import { syncEngine } from "../services/syncEngine";
import {
  Transaction,
  Customer,
  Supplier,
  AppUser,
  CashBox,
  Currency,
} from "../types";
import { motion, AnimatePresence, useDragControls } from "motion/react";
import { cn, hasPermission } from "../lib/utils";
import PrintPreviewModal from "./PrintPreviewModal";

type Tab = "transactions" | "boxes" | "transfers";

export default function Transactions({ currentUser: propCurrentUser, onNavigate }: { currentUser?: any, onNavigate?: (page: string) => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [movements, setMovements] = useState<FinancialMovement[]>([]);
  
  // Filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterRecordType, setFilterRecordType] = useState('all');
  const [filterPaymentType, setFilterPaymentType] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
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
  const [viewingBoxMovements, setViewingBoxMovements] = useState<FinancialMovement[]>([]);
  const [isLoadingBoxTransactions, setIsLoadingBoxTransactions] = useState<boolean>(false);
  const [refreshBoxTrigger, setRefreshBoxTrigger] = useState<number>(0);

  // Print Preview State
  const [printPreview, setPrintPreview] = useState<{
    isOpen: boolean;
    html: string;
    title: string;
    size: 'a4' | 'thermal';
  }>({ isOpen: false, html: '', title: '', size: 'a4' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalDragControls = useDragControls();
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

    const savedTab = localStorage.getItem("transactions_active_tab");
    if (savedTab === "boxes" || savedTab === "transfers" || savedTab === "transactions") {
      setActiveTab(savedTab as Tab);
      localStorage.removeItem("transactions_active_tab");
    }

    const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
      loadStaticData();
      loadTransactions(true);
      setRefreshBoxTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, [propCurrentUser]);

  useEffect(() => {
    if (!viewingBox) {
      setViewingBoxMovements([]);
      return;
    }
    setIsLoadingBoxTransactions(true);
    try {
      const filtered = movements.filter(m => m.boxChanges && m.boxChanges[viewingBox.id] !== undefined);
      filtered.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
      setViewingBoxMovements(filtered);
    } catch (err) {
      console.error("Failed to load box movements", err);
    } finally {
      setIsLoadingBoxTransactions(false);
    }
  }, [viewingBox, refreshBoxTrigger, movements]);

  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === 'boxes' && !hasPermission(currentUser, 'cash_boxes')) {
      setActiveTab('transactions');
    }
  }, [activeTab, currentUser]);

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
    setIsLoadingMore(true);
    try {
        const [invs, vchs, qes, txs, boxes] = await Promise.all([
            dbService.getAll("invoices"),
            dbService.getAll("vouchers"),
            dbService.getAll("quickEntries"),
            dbService.getAll("transactions"),
            dbService.getAll("cashBoxes")
        ]);

        const boxMap = new Map((boxes as any[]).map(b => [b.id, b.name]));

        const allMovements: FinancialMovement[] = [];

        (invs as Invoice[]).forEach(inv => {
            if (inv.recordStatus === 'deleted') return;
            const changes: Record<string, number> = {};
            if (inv.boxId && inv.paid && inv.paid > 0) {
                const type = inv.type || 'sale';
                const baseType = type.replace('_return', '');
                let boxChange = baseType === 'sale' ? inv.paid : -inv.paid;
                if (type.includes('return')) boxChange = -boxChange;
                changes[inv.boxId] = boxChange;
            }
            allMovements.push({
                id: `inv-${inv.id}`,
                originalId: inv.id!,
                source: 'invoice',
                recordType: inv.type === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء',
                paymentType: inv.paymentType === 'نقدآ' ? 'نقدا' : inv.paymentType === 'آجل' ? 'اجل' : 'جزئي',
                partnerName: inv.partnerName || 'عام',
                totalAmount: inv.total || 0,
                discount: inv.discount || 0,
                paidAmount: inv.paid || 0,
                remainingAmount: (inv.total || 0) - (inv.discount || 0) - (inv.paid || 0),
                boxName: inv.boxId ? (boxMap.get(inv.boxId) || '') : '',
                boxChanges: changes,
                createdBy: (inv as any).createdBy || 'النظام',
                createdAt: inv.createdAt,
                dateObj: new Date(inv.createdAt),
                originalRecord: inv
            });
        });

        (vchs as Voucher[]).forEach(vch => {
            if (vch.recordStatus === 'deleted') return;
            const changes: Record<string, number> = {};
            if (vch.boxId && vch.amount) {
                changes[vch.boxId] = vch.type === 'receipt' ? vch.amount : -vch.amount;
            }
            allMovements.push({
                id: `vch-${vch.id}`,
                originalId: vch.id!,
                source: 'voucher',
                recordType: vch.type === 'receipt' ? 'سند قبض' : 'سند صرف',
                paymentType: 'نقدا',
                partnerName: vch.partnerName || 'عام',
                totalAmount: vch.amount || 0,
                discount: 0,
                paidAmount: vch.amount || 0,
                remainingAmount: 0,
                boxName: vch.boxName || '',
                boxChanges: changes,
                createdBy: vch.createdBy || 'النظام',
                createdAt: vch.createdAt,
                dateObj: new Date(vch.createdAt),
                originalRecord: vch
            });
        });

        (qes as QuickFinancialEntry[]).forEach(qe => {
            if (qe.recordStatus === 'deleted') return;
            const changes: Record<string, number> = {};
            if (qe.cashBoxId && qe.paidAmount && qe.paidAmount > 0) {
                let boxChange = (qe.entryType === 'manual_sale' || qe.entryType === 'receipt') ? qe.paidAmount : -qe.paidAmount;
                changes[qe.cashBoxId] = boxChange;
            }
            allMovements.push({
                id: `qe-${qe.id}`,
                originalId: qe.id!,
                source: 'quickEntry',
                recordType: qe.entryType === 'manual_sale' ? 'فاتورة بيع (سريع)' : qe.entryType === 'manual_purchase' ? 'فاتورة شراء (سريع)' : qe.entryType === 'receipt' ? 'سند قبض (سريع)' : qe.entryType === 'payment' ? 'سند صرف (سريع)' : 'تسوية',
                paymentType: qe.paymentStatus === 'مدفوع' ? 'نقدا' : qe.paymentStatus === 'آجل' ? 'اجل' : 'جزئي',
                partnerName: qe.partnerName || 'عام',
                totalAmount: qe.amount || 0,
                discount: qe.discount || 0,
                paidAmount: qe.paidAmount || 0,
                remainingAmount: qe.remainingAmount || 0,
                boxName: qe.cashBoxName || '',
                boxChanges: changes,
                createdBy: qe.createdBy || 'النظام',
                createdAt: qe.createdAt,
                dateObj: new Date(qe.createdAt),
                originalRecord: qe
            });
        });

        (txs as Transaction[]).forEach(tx => {
            if (tx.recordStatus === 'deleted') return;
            if (tx.sourceId) return; // Skip if it's from another document
            
            const changes: Record<string, number> = {};
            if (tx.type === 'تحويل') {
                if (tx.fromBoxId) changes[tx.fromBoxId] = -(tx.amount || 0);
                if (tx.toBoxId) changes[tx.toBoxId] = (tx.amount || 0);
            } else if (tx.boxId) {
                changes[tx.boxId] = tx.type === 'قبض' ? (tx.amount || 0) : -(tx.amount || 0);
            }
            
            allMovements.push({
                id: `tx-${tx.id}`,
                originalId: tx.id!,
                source: 'transaction',
                recordType: tx.type === 'تحويل' ? 'تحويل' : tx.type === 'قبض' ? 'سند قبض (قديم)' : 'سند صرف (قديم)',
                paymentType: 'نقدا',
                partnerName: tx.partnerName || 'عام',
                totalAmount: tx.amount || 0,
                discount: 0,
                paidAmount: tx.amount || 0,
                remainingAmount: 0,
                boxName: tx.boxId ? (boxMap.get(tx.boxId) || '') : '',
                boxChanges: changes,
                createdBy: tx.createdBy || 'النظام',
                createdAt: tx.createdAt,
                dateObj: new Date(tx.createdAt),
                originalRecord: tx
            });
        });

        allMovements.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
        setMovements(allMovements);
        setTransactions(txs as Transaction[]);

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
    if (!hasPermission(currentUser, 'global_delete')) {
      alert("عذراً، لا تملك صلاحية حذف السندات المالية.");
      setTransToDelete(null);
      return;
    }
    setIsSaving(true);
    
    try {
        if (transToDelete.type === 'قبض' && transToDelete.boxId) {
            const box = cashBoxes.find(b => b.id === transToDelete.boxId);
            if (box && ((box.balance || 0) - transToDelete.amount!) < 0) {
                alert("لا يمكن حذف سند القبض لأنه سيؤدي إلى رصيد سالب في الصندوق.");
                setIsSaving(false);
                setTransToDelete(null);
                return;
            }
        } else if (transToDelete.type === 'تحويل' && transToDelete.toBoxId) {
            const box = cashBoxes.find(b => b.id === transToDelete.toBoxId);
            if (box && ((box.balance || 0) - transToDelete.amount!) < 0) {
                alert("لا يمكن حذف التحويل لأنه سيؤدي إلى رصيد سالب في الصندوق المستلم.");
                setIsSaving(false);
                setTransToDelete(null);
                return;
            }
        }

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
    const initialBalance = box.initialBalance !== undefined ? box.initialBalance : box.balance || 0;
    setBoxForm({ ...box, balance: initialBalance }); // We use balance to hold the "initial" balance in the form temporarily
    setModalType("box");
    setIsModalOpen(true);
  };

  const handlePrintStatement = () => {
        if (!viewingBox) return;
        const boxTransactions = [...viewingBoxMovements]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // sort ascending for print report
        
        const totalIn = boxTransactions.reduce((acc, curr) => acc + ((curr.boxChanges && curr.boxChanges[viewingBox.id] > 0) ? curr.boxChanges[viewingBox.id] : 0), 0);
        const totalOut = boxTransactions.reduce((acc, curr) => acc + ((curr.boxChanges && curr.boxChanges[viewingBox.id] < 0) ? Math.abs(curr.boxChanges[viewingBox.id]) : 0), 0);
        const openingBalance = viewingBox.initialBalance !== undefined ? viewingBox.initialBalance : (viewingBox.balance || 0) - totalIn + totalOut;
        
        const dateStr = new Date().toLocaleDateString('ar-YE', { 
            year: 'numeric', month: '2-digit', day: '2-digit'
        });

        let printHTML = "";
        
        if (printFormat === 'thermal') {
            printHTML = `
                <style>
                    .thermal-table { width: 100%; border-collapse: collapse; font-size: 9px; margin-top:10px; }
                    .thermal-table th { border-bottom: 1px dashed #000; padding: 3px 1px; text-align: right; }
                    .thermal-table td { padding: 4px 1px; border-bottom: 1px dashed #e2e8f0; }
                    .fin-box { border: 1px solid #000; padding: 5px; margin: 5px 0; border-radius:4px; font-size: 10px;}
                    .row { display: flex; justify-content: space-between; margin-bottom: 2px;}
                </style>
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
                            const change = item.boxChanges ? (item.boxChanges[viewingBox.id] || 0) : 0;
                            if (change === 0) return '';
                            const isIncome = change > 0;
                            return `<tr>
                                <td>${new Date(item.createdAt).toLocaleDateString('ar-YE', {month: 'numeric', day: 'numeric'})}</td>
                                <td>${item.recordType}</td>
                                <td style="text-align: left; font-weight: bold; font-family: monospace;">${isIncome ? '+' : '-'}${Math.abs(change).toLocaleString()}</td>
                            </tr>`}).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 15px; text-align: center; font-size: 8px; color: #475569; font-weight: bold;">
                    <div>Generated by ASSAR Optical Accounting</div>
                    <div>Designed & Developed By Mohammed Assubaihi | 779391682</div>
                </div>
            `;
        } else {
            let currentBalanceIter = openingBalance;
            
            const timelineRows = boxTransactions.map(item => {
                const change = item.boxChanges ? (item.boxChanges[viewingBox.id] || 0) : 0;
                if (change === 0) return '';
                const isIncome = change > 0;
                if (isIncome) currentBalanceIter += change;
                else currentBalanceIter -= Math.abs(change);
                
                return `<tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; font-size: 12px;">${new Date(item.createdAt).toLocaleDateString('ar-YE')}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: ${isIncome ? '#059669' : '#e11d48'};">${item.recordType}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left;">${isIncome ? '+' : '-'}${Math.abs(change).toLocaleString()}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 11px;">${item.originalRecord?.description || '-'} ${item.partnerName ? '<br><span style="font-weight:bold; color:#1e293b;">الطرف: ' + item.partnerName + '</span>' : ''}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 800; font-size: 13px; text-align: left; color: #0f172a;">${currentBalanceIter.toLocaleString()} ${item.originalRecord?.currency || viewingBox.currency}</td>
                </tr>`}).join('');

            printHTML = `
                <style>
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 25px; }
                    .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 15px; margin-bottom: 25px; font-size: 12px; }
                    .info-item { background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
                    .fin-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; text-align: center; }
                    .fin-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
                    .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                    .table th { background-color: #f1f5f9; color: #475569; font-weight: 800; text-align: right; padding: 10px; border-bottom: 2px solid #cbd5e1; }
                </style>
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
                <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #64748b; font-weight: bold;">
                    <div>Generated by ASSAR Optical Accounting</div>
                    <div>Designed & Developed By Mohammed Assubaihi | Mobile: 779391682</div>
                </div>
            `;
        }

        setPrintPreview({
            isOpen: true,
            html: printHTML,
            title: `كشف حساب صندوق - ${viewingBox.name}`,
            size: printFormat === 'thermal' ? 'thermal' : 'a4'
        });
  };

  const handleDeleteTrans = (t: Transaction) => {
    if (!hasPermission(currentUser, 'global_delete')) {
      alert("عذراً، لا تملك صلاحية حذف السندات المالية.");
      return;
    }
    setTransToDelete(t);
  };

  const handleDeleteAllTrans = async () => {
    if (!hasPermission(currentUser, 'global_delete')) {
      alert("عذراً، لا تملك صلاحية حذف السندات المالية.");
      return;
    }
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
    if (editingTransaction && !hasPermission(currentUser, 'edit_transaction')) {
      alert("عذراً، لا تملك صلاحية تعديل السندات المالية.");
      return;
    }
    
    // Check if the transaction will result in negative cashbox balance
    if (transForm.type === 'صرف' && transForm.boxId) {
        const box = cashBoxes.find(b => b.id === transForm.boxId);
        if (box) {
            let futureBalance = (box.balance || 0) - transForm.amount!;
            if (editingTransaction && editingTransaction.boxId === transForm.boxId) {
                // Add back the old amount since we are updating it
                futureBalance += editingTransaction.amount || 0;
            }
            if (futureBalance < 0) {
                alert("رصيد الصندوق غير كاف لإتمام هذه العملية (لا يمكن أن يكون بالسالب)");
                return;
            }
        }
    }
    
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

      if (!dataToSave.name || !dataToSave.name.trim()) {
          alert("يرجى إدخال اسم الصندوق المالي");
          setIsSaving(false);
          return;
      }

      // Check for duplicate name
      const duplicate = cashBoxes.find(b => 
          b.name.trim().toLowerCase() === dataToSave.name.trim().toLowerCase() && 
          b.id !== boxForm.id
      );
      if (duplicate) {
          alert("عذراً، يوجد صندوق مالي آخر مسجل بنفس هذا الاسم بالفعل.");
          setIsSaving(false);
          return;
      }

      if (boxForm.id) {
          const oldBox = cashBoxes.find((b) => b.id === boxForm.id);
          const oldInitial = oldBox?.initialBalance !== undefined ? oldBox.initialBalance : (oldBox?.balance || 0);
          const newInitial = Number(dataToSave.balance || 0);
          const diff = newInitial - oldInitial;
          
          dataToSave.initialBalance = newInitial;
          dataToSave.balance = (oldBox?.balance || 0) + diff;
          await dbService.update("cashBoxes", boxForm.id, dataToSave);
      } else {
          dataToSave.initialBalance = Number(dataToSave.balance || 0);
          dataToSave.balance = Number(dataToSave.balance || 0);
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

    const fromBox = cashBoxes.find(b => b.id === transferForm.fromBoxId);
    if (fromBox && ((fromBox.balance || 0) - transferForm.amount) < 0) {
        return alert("رصيد الصندوق المحول منه غير كافٍ لإتمام التحويل.");
    }

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
      <PrintPreviewModal 
          isOpen={printPreview.isOpen}
          onClose={() => setPrintPreview(prev => ({ ...prev, isOpen: false }))}
          htmlContent={printPreview.html}
          title={printPreview.title}
          paperSize={printPreview.size}
      />
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
          {hasPermission(currentUser, 'cash_boxes') && (
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
          )}
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
              توريد الصناديق
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {hasPermission(currentUser, 'cash_boxes') && activeTab === "boxes" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBoxForm({
                    name: "",
                    currency: "YER",
                    userId: "",
                    userName: "",
                    balance: 0,
                    isActive: true,
                  });
                  setModalType("box");
                  setIsModalOpen(true);
                }}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <LayoutGrid size={20} />
                صندوق جديد
              </button>
            </div>
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
            
            <div className="pb-10">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 mb-4">
                    <button 
                      onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                      className="flex items-center justify-between w-full text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                         <Filter size={18} />
                         <span>خيارات الفلترة والبحث</span>
                      </div>
                      {isFiltersOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    
                    <AnimatePresence>
                      {isFiltersOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
                                    <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
                                    <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">نوع الحركة</label>
                                    <select value={filterRecordType} onChange={e => setFilterRecordType(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50">
                                        <option value="all">الكل</option>
                                        <option value="سند قبض">سند قبض</option>
                                        <option value="سند صرف">سند صرف</option>
                                        <option value="فاتورة بيع">فاتورة بيع</option>
                                        <option value="فاتورة شراء">فاتورة شراء</option>
                                        <option value="فاتورة بيع (سريع)">فاتورة بيع (سريع)</option>
                                        <option value="فاتورة شراء (سريع)">فاتورة شراء (سريع)</option>
                                        <option value="سند قبض (سريع)">سند قبض (سريع)</option>
                                        <option value="سند صرف (سريع)">سند صرف (سريع)</option>
                                        <option value="تسوية">تسوية</option>
                                        <option value="تحويل">تحويل</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">نوع الدفع</label>
                                    <select value={filterPaymentType} onChange={e => setFilterPaymentType(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50">
                                        <option value="all">الكل</option>
                                        <option value="نقدا">نقدا</option>
                                        <option value="اجل">اجل</option>
                                        <option value="جزئي">جزئي</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">المستخدم</label>
                                    <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="w-full p-2 border border-slate-200 rounded-xl text-sm bg-slate-50">
                                        <option value="all">الكل</option>
                                        {Array.from(new Set(movements.map(m => m.createdBy).filter(Boolean))).map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {(() => {
                        const filteredMovements = movements.filter(m => {
                            let matchDate = true;
                            const dateStr = m.createdAt.split('T')[0];
                            if (filterStartDate && filterEndDate) {
                                matchDate = dateStr >= filterStartDate && dateStr <= filterEndDate;
                            } else if (filterStartDate) {
                                matchDate = dateStr === filterStartDate;
                            }

                            const matchRecordType = filterRecordType === 'all' ? true : m.recordType === filterRecordType;
                            const matchPaymentType = filterPaymentType === 'all' ? true : m.paymentType === filterPaymentType;
                            const matchUser = filterUser === 'all' ? true : m.createdBy === filterUser;

                            return matchDate && matchRecordType && matchPaymentType && matchUser;
                        });

                        const totalAmount = filteredMovements.reduce((sum, m) => sum + m.totalAmount, 0);
                        const totalPaidCash = filteredMovements.reduce((sum, m) => sum + m.paidAmount, 0);
                        const totalRemaining = filteredMovements.reduce((sum, m) => sum + m.remainingAmount, 0);

                        return (
                            <>
                                <div className="flex gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex-1 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm text-center">
                                        <p className="text-xs text-indigo-600 font-bold mb-1">إجمالي الحركة المالية</p>
                                        <p className="text-lg font-black text-indigo-700">{totalAmount.toLocaleString()}</p>
                                    </div>
                                    <div className="flex-1 bg-white p-3 rounded-lg border border-emerald-100 shadow-sm text-center">
                                        <p className="text-xs text-emerald-600 font-bold mb-1">المدفوع نقداً</p>
                                        <p className="text-lg font-black text-emerald-700">{totalPaidCash.toLocaleString()}</p>
                                    </div>
                                    <div className="flex-1 bg-white p-3 rounded-lg border border-rose-100 shadow-sm text-center">
                                        <p className="text-xs text-rose-600 font-bold mb-1">المتبقي الآجل</p>
                                        <p className="text-lg font-black text-rose-700">{totalRemaining.toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto shadow-sm">
                                    <table className="w-full text-right text-xs whitespace-nowrap">
                                        <thead className="bg-[#1e1b4b] text-white font-black">
                                            <tr>
                                                <th className="p-3 border-x border-slate-700">تاريخ ووقت الإدخال</th>
                                                <th className="p-3 border-x border-slate-700">اسم الحركة</th>
                                                <th className="p-3 border-x border-slate-700">نوع الدفع</th>
                                                <th className="p-3 border-x border-slate-700">اسم الحساب</th>
                                                <th className="p-3 border-x border-slate-700">الإجمالي</th>
                                                <th className="p-3 border-x border-slate-700">الخصم</th>
                                                <th className="p-3 border-x border-slate-700">المدفوع نقداً</th>
                                                <th className="p-3 border-x border-slate-700">المتبقي</th>
                                                <th className="p-3 border-x border-slate-700">الصندوق</th>
                                                <th className="p-3 border-x border-slate-700">المستخدم</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredMovements.map((m, idx) => (
                                                <tr key={m.id} 
                                                    onClick={() => {
                                                        if(onNavigate) {
                                                            if(m.source === 'invoice') onNavigate('invoices');
                                                            if(m.source === 'voucher') onNavigate('vouchers');
                                                            if(m.source === 'quickEntry') onNavigate('quick_entries_history'); 
                                                        }
                                                    }}
                                                    className={cn("cursor-pointer hover:bg-blue-50 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-50")}>
                                                    <td className="p-3 font-mono text-slate-500">{new Date(m.createdAt).toLocaleString('ar-EG')}</td>
                                                    <td className="p-3 font-bold text-indigo-700">{m.recordType}</td>
                                                    <td className="p-3">{m.paymentType}</td>
                                                    <td className="p-3 font-bold">{m.partnerName}</td>
                                                    <td className="p-3 font-black text-slate-800">{m.totalAmount.toLocaleString()}</td>
                                                    <td className="p-3 text-rose-600">{m.discount.toLocaleString()}</td>
                                                    <td className="p-3 text-emerald-600 font-bold">{m.paidAmount.toLocaleString()}</td>
                                                    <td className="p-3 text-rose-600 font-bold">{m.remainingAmount.toLocaleString()}</td>
                                                    <td className="p-3 text-slate-500">{m.boxName}</td>
                                                    <td className="p-3 text-slate-500">{m.createdBy}</td>
                                                </tr>
                                            ))}
                                            {filteredMovements.length === 0 && (
                                                <tr>
                                                    <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">لا توجد حركات مالية مطابقة</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>

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
            {(() => {
              const hasViewBalancePermission = hasPermission(currentUser, 'view_cash_balance');
              const userAssignedBoxId = currentUser?.assignedBoxId;
              
              const filteredBoxes = cashBoxes.filter(b => {
                if (b.recordStatus === 'deleted' || b.isActive === false) return false;
                
                if (!hasViewBalancePermission) {
                  return false;
                }
                
                if (userAssignedBoxId) {
                  return b.id === userAssignedBoxId;
                }
                
                return true;
              });

              if (filteredBoxes.length === 0) {
                return (
                  <div className="col-span-full py-12 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-100 shadow-sm">
                    لا توجد صناديق مالية لعرضها أو لا تملك الصلاحية الكافية.
                  </div>
                );
              }

              return filteredBoxes.map((box, index) => (
                <div
                  key={`${box.id}-${index}`}
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
              ));
            })()}
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
                              {isAdmin && !t.sourceId && (
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
              drag
              dragListener={false}
              dragControls={modalDragControls}
              dragMomentum={false}
              className="bg-white dark:bg-[#131b2e] w-full max-w-lg h-[100dvh] md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2.5rem] shadow-2xl relative flex flex-col overflow-hidden"
            >
              <div 
                className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0 cursor-move"
                onPointerDown={(e) => modalDragControls.start(e)}
              >
                <h3 className="text-base font-bold">
                  {modalType === "transaction" &&
                    (editingTransaction
                      ? (transForm.type === 'قبض' ? 'تعديل سند القبض' : 'تعديل سند الصرف')
                      : (transForm.type === 'قبض' ? 'سند قبض جديد' : 'سند صرف جديد'))}
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
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold disabled:opacity-50"
                        value={transForm.boxId}
                        onChange={(e) =>
                          setTransForm({ ...transForm, boxId: e.target.value })
                        }
                        disabled={!isAdmin}
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
        {/* Delete Confirmation Modal */}
        {transToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTransToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl relative overflow-hidden z-10 w-full max-w-sm"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-black text-slate-800 text-center mb-2">تأكيد الحذف</h3>
                <p className="text-xs text-slate-500 font-bold text-center leading-relaxed">
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
          const boxTransactions = viewingBoxMovements;
          
          const totalIn = boxTransactions.reduce((acc, curr) => acc + ((curr.boxChanges && curr.boxChanges[viewingBox.id] > 0) ? curr.boxChanges[viewingBox.id] : 0), 0);
          const totalOut = boxTransactions.reduce((acc, curr) => acc + ((curr.boxChanges && curr.boxChanges[viewingBox.id] < 0) ? Math.abs(curr.boxChanges[viewingBox.id]) : 0), 0);
          const openingBalance = viewingBox.initialBalance !== undefined ? viewingBox.initialBalance : (viewingBox.balance || 0) - totalIn + totalOut;
          
          const runningBalances = new Map();
          let currentBalance = openingBalance;
          // Sort chronological to compute running balances
          [...boxTransactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).forEach(t => {
              const change = t.boxChanges ? (t.boxChanges[viewingBox.id] || 0) : 0;
              currentBalance += change;
              runningBalances.set(t.id, currentBalance);
          });

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
                            <th className="px-3 py-2 w-[15%] text-left">الرصيد</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {isLoadingBoxTransactions ? (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-500 font-bold text-xs">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                                        جاري تحميل الحركات المالية...
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            boxTransactions.map((t) => {
                                const change = t.boxChanges ? (t.boxChanges[viewingBox.id] || 0) : 0;
                                const isIncome = change > 0;
                                const isOutcome = change < 0;
                                
                                return (
                                <tr 
                                    key={t.id} 
                                    className="hover:bg-slate-50/70 transition-colors group"
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
                                                isIncome
                                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                                    : isOutcome
                                                    ? "bg-rose-50 text-rose-600 border border-rose-100"
                                                    : "bg-blue-50 text-blue-600 border border-blue-100"
                                            )}
                                        >
                                            {t.recordType}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right align-top">
                                        <p className="text-[11px] font-bold text-slate-800 leading-snug break-words">
                                            {t.originalRecord?.description || t.recordType}
                                        </p>
                                        {t.partnerName && (
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">الطرف: {t.partnerName}</p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-left font-mono font-black text-emerald-600 text-xs align-top">
                                        {isIncome ? `+${(change || 0).toLocaleString()}` : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-left font-mono font-black text-rose-600 text-xs align-top">
                                        {isOutcome ? `-${(Math.abs(change) || 0).toLocaleString()}` : "-"}
                                    </td>
                                    <td className="px-3 py-2 text-left font-mono font-black text-slate-900 text-xs align-top">
                                        {(runningBalances.get(t.id) || 0).toLocaleString()}
                                    </td>
                                </tr>
                                );
                            }).reverse()
                        )}
                        {openingBalance !== 0 && !isLoadingBoxTransactions && (
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
                        {!isLoadingBoxTransactions && boxTransactions.length === 0 && openingBalance === 0 && (
                            <tr>
                                <td colSpan={6} className="py-6 text-center text-slate-400 font-bold text-xs">
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
