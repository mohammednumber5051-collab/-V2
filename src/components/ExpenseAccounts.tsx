import React, { useState, useEffect, useMemo } from 'react';
import { 
    FolderTree, 
    Plus, 
    Search, 
    Edit2, 
    CheckCircle2, 
    XCircle, 
    ChevronDown, 
    ChevronRight, 
    Layers, 
    Tag, 
    FileText, 
    RefreshCw, 
    Info, 
    FolderPlus, 
    PieChart, 
    DollarSign,
    Lock,
    Sparkles,
    AlertCircle,
    ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ExpenseAccount, Voucher, QuickFinancialEntry, Transaction } from '../types';
import { expenseAccountsService } from '../services/expenseAccountsService';
import { dbService } from '../services/db';

interface ExpenseAccountsProps {
    onNavigateToVoucherWithAccount?: (account: ExpenseAccount) => void;
}

export default function ExpenseAccounts({ onNavigateToVoucherWithAccount }: ExpenseAccountsProps) {
    const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
    
    // Modal states
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingAccount, setEditingAccount] = useState<ExpenseAccount | null>(null);
    const [formData, setFormData] = useState<{
        code: string;
        name: string;
        parentId: string;
        type: 'parent' | 'sub';
        description: string;
        isActive: boolean;
    }>({
        code: '',
        name: '',
        parentId: '',
        type: 'sub',
        description: '',
        isActive: true
    });

    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [quickEntries, setQuickEntries] = useState<QuickFinancialEntry[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [saving, setSaving] = useState<boolean>(false);
    const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Load expense accounts & financial movements for totals
    const loadData = async () => {
        setLoading(true);
        try {
            const [accs, vList, qList, tList] = await Promise.all([
                expenseAccountsService.getAllAccounts(),
                dbService.getAll("vouchers"),
                dbService.getAll("quick_financial_entries"),
                dbService.getAll("transactions")
            ]);
            
            setAccounts(accs);
            setVouchers(vList.filter((v: any) => v.recordStatus !== 'deleted'));
            setQuickEntries(qList.filter((q: any) => q.recordStatus !== 'deleted'));
            setTransactions(tList.filter((t: any) => t.recordStatus !== 'deleted'));

            // Expand all parents by default
            const parentExpandMap: Record<string, boolean> = {};
            accs.filter(a => a.type === 'parent').forEach(p => {
                if (p.id) parentExpandMap[p.id] = true;
            });
            setExpandedParents(parentExpandMap);

        } catch (e) {
            console.error("Failed to load expense accounts data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Calculate spent amount per account
    const accountTotalsMap = useMemo(() => {
        const map: Record<string, number> = {};
        
        // 1. Sum vouchers with expenseAccountId or matching category
        vouchers.forEach(v => {
            if (v.type === 'payment' && v.amount > 0) {
                if (v.expenseAccountId) {
                    map[v.expenseAccountId] = (map[v.expenseAccountId] || 0) + v.amount;
                }
            }
        });

        // 2. Sum quick entries
        quickEntries.forEach(q => {
            if (q.entryType === 'payment' && q.netAmount > 0) {
                if (q.expenseAccountId) {
                    map[q.expenseAccountId] = (map[q.expenseAccountId] || 0) + q.netAmount;
                }
            }
        });

        // 3. Sum transactions
        transactions.forEach(t => {
            if (t.type === 'صرف' && (t.debit || t.amount) > 0) {
                if (t.expenseAccountId) {
                    const amt = t.debit || t.amount;
                    map[t.expenseAccountId] = (map[t.expenseAccountId] || 0) + amt;
                }
            }
        });

        return map;
    }, [vouchers, quickEntries, transactions]);

    // Expand / Collapse All helpers
    const handleExpandAll = () => {
        const map: Record<string, boolean> = {};
        parentAccounts.forEach(p => {
            if (p.id) map[p.id] = true;
        });
        setExpandedParents(map);
    };

    const handleCollapseAll = () => {
        const map: Record<string, boolean> = {};
        parentAccounts.forEach(p => {
            if (p.id) map[p.id] = false;
        });
        setExpandedParents(map);
    };

    // Calculate parent total spent (sum of sub-accounts under it)
    const getParentTotalSpent = (parentId: string, parentCode?: string): number => {
        const subAccs = getSubAccounts(parentId, parentCode);
        return subAccs.reduce((sum, sub) => sum + (sub.id ? (accountTotalsMap[sub.id] || 0) : 0), 0);
    };

    // Guarantee unique Parent Accounts (no duplicates by code)
    const parentAccounts = useMemo(() => {
        const uniqueMap = new Map<string, ExpenseAccount>();
        accounts.filter(a => a.type === 'parent').forEach(p => {
            if (!uniqueMap.has(p.code)) {
                uniqueMap.set(p.code, p);
            }
        });
        return Array.from(uniqueMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    }, [accounts]);

    // Guarantee unique Sub Accounts per Parent (no duplicates by code)
    const getSubAccounts = (parentId: string, parentCode?: string) => {
        const uniqueMap = new Map<string, ExpenseAccount>();
        accounts
            .filter(a => a.type === 'sub' && (a.parentId === parentId || (parentCode && a.code.startsWith(parentCode.substring(0, 2)))))
            .forEach(s => {
                if (!uniqueMap.has(s.code)) {
                    uniqueMap.set(s.code, s);
                }
            });
        return Array.from(uniqueMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    };

    const toggleExpandParent = (parentId: string) => {
        setExpandedParents(prev => {
            const current = prev[parentId] ?? true;
            return {
                ...prev,
                [parentId]: !current
            };
        });
    };

    const openAddModal = (defaultParentId?: string) => {
        setEditingAccount(null);
        let defaultCode = '';
        
        if (defaultParentId) {
            const parent = accounts.find(a => a.id === defaultParentId);
            const existingSubs = getSubAccounts(defaultParentId);
            if (parent) {
                const nextNum = existingSubs.length + 1;
                const parentBase = parent.code.substring(0, 2); // e.g. "51"
                defaultCode = `${parentBase}${nextNum < 10 ? '0' + nextNum : nextNum}`;
            }
        } else {
            // New Parent Code suggestion e.g. 5400
            const maxParentCode = Math.max(...parentAccounts.map(p => parseInt(p.code) || 5000), 5000);
            defaultCode = String(maxParentCode + 100);
        }

        setFormData({
            code: defaultCode,
            name: '',
            parentId: defaultParentId || (parentAccounts[0]?.id || ''),
            type: defaultParentId ? 'sub' : (parentAccounts.length === 0 ? 'parent' : 'sub'),
            description: '',
            isActive: true
        });
        setIsModalOpen(true);
    };

    const openEditModal = (acc: ExpenseAccount) => {
        setEditingAccount(acc);
        setFormData({
            code: acc.code,
            name: acc.name,
            parentId: acc.parentId || '',
            type: acc.type,
            description: acc.description || '',
            isActive: acc.isActive !== false
        });
        setIsModalOpen(true);
    };

    const handleSaveAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.code.trim()) {
            setFeedbackMessage({ type: 'error', text: 'يرجى إدخال اسم الحساب وكود الحساب المحاسبي' });
            return;
        }

        setSaving(true);
        setFeedbackMessage(null);

        try {
            const parentObj = accounts.find(a => a.id === formData.parentId);

            if (editingAccount && editingAccount.id) {
                // Update existing
                await dbService.update("expense_accounts", editingAccount.id, {
                    code: formData.code.trim(),
                    name: formData.name.trim(),
                    parentId: formData.type === 'sub' ? formData.parentId : null,
                    parentName: formData.type === 'sub' ? (parentObj?.name || '') : null,
                    type: formData.type,
                    description: formData.description.trim(),
                    isActive: formData.isActive,
                    updatedAt: new Date().toISOString()
                });
                setFeedbackMessage({ type: 'success', text: 'تم تحديث بيانات الحساب المحاسبي بنجاح' });
            } else {
                // Add new
                await dbService.add("expense_accounts", {
                    code: formData.code.trim(),
                    name: formData.name.trim(),
                    parentId: formData.type === 'sub' ? formData.parentId : null,
                    parentName: formData.type === 'sub' ? (parentObj?.name || '') : null,
                    type: formData.type,
                    description: formData.description.trim(),
                    isActive: formData.isActive,
                    recordStatus: 'active',
                    createdAt: new Date().toISOString()
                });
                setFeedbackMessage({ type: 'success', text: 'تم إضافة الحساب المحاسبي الجديد بنجاح' });
            }

            setIsModalOpen(false);
            await loadData();
        } catch (error) {
            console.error("Failed to save expense account:", error);
            setFeedbackMessage({ type: 'error', text: 'حدث خطأ أثناء حفظ الحساب المحاسبي' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (acc: ExpenseAccount) => {
        if (!acc.id) return;
        try {
            const newActive = !(acc.isActive !== false);
            await dbService.update("expense_accounts", acc.id, {
                isActive: newActive,
                updatedAt: new Date().toISOString()
            });
            setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, isActive: newActive } : a));
        } catch (e) {
            console.error("Failed to toggle active status:", e);
        }
    };

    // Filter accounts by search query
    const filteredAccounts = useMemo(() => {
        if (!searchQuery.trim()) return null;
        const q = searchQuery.trim().toLowerCase();
        return accounts.filter(a => 
            a.name.toLowerCase().includes(q) || 
            a.code.toLowerCase().includes(q) || 
            (a.description && a.description.toLowerCase().includes(q))
        );
    }, [accounts, searchQuery]);

    const grandTotalExpenses = useMemo(() => {
        return Object.values(accountTotalsMap).reduce((acc, val) => acc + val, 0);
    }, [accountTotalsMap]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 px-2 sm:px-4">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-emerald-800/30 relative overflow-hidden">
                <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-500/20 backdrop-blur-md rounded-xl text-emerald-400 border border-emerald-500/30">
                                <FolderTree className="w-7 h-7" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                                    دليل حسابات المصروفات
                                    <span className="text-xs bg-emerald-500/20 text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                                        شجرة الحسابات
                                    </span>
                                </h1>
                                <p className="text-sm text-slate-300">
                                    تنظيم وهيكلة الحسابات الرئيسية والفرعية لمصروفات المركز وفق الأصول المحاسبية
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openAddModal()}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02] active:scale-95"
                        >
                            <FolderPlus className="w-4 h-4" />
                            <span>إضافة حساب جديد</span>
                        </button>
                        <button
                            onClick={loadData}
                            className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700"
                            title="تحديث البيانات"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Stat Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-slate-800/80">
                    <div className="bg-slate-800/50 backdrop-blur-sm p-3 rounded-xl border border-slate-700/50">
                        <span className="text-xs text-slate-400 block font-medium">إجمالي الحسابات الرئيسية</span>
                        <span className="text-xl font-bold text-white">{parentAccounts.length}</span>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur-sm p-3 rounded-xl border border-slate-700/50">
                        <span className="text-xs text-slate-400 block font-medium">إجمالي البنود الفرعية</span>
                        <span className="text-xl font-bold text-emerald-400">
                            {accounts.filter(a => a.type === 'sub').length}
                        </span>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur-sm p-3 rounded-xl border border-slate-700/50">
                        <span className="text-xs text-slate-400 block font-medium">إجمالي المصروفات المسجلة</span>
                        <span className="text-xl font-bold text-amber-400">
                            {grandTotalExpenses.toLocaleString()} YER
                        </span>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur-sm p-3 rounded-xl border border-slate-700/50">
                        <span className="text-xs text-slate-400 block font-medium">الحالة الأمنية لقاعدة البيانات</span>
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 mt-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            محمية ومطابقة
                        </span>
                    </div>
                </div>
            </div>

            {/* Notification message if any */}
            {feedbackMessage && (
                <div className={`p-4 rounded-xl text-sm flex items-center gap-2 ${
                    feedbackMessage.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                }`}>
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{feedbackMessage.text}</span>
                </div>
            )}

            {/* Search and Action Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-96">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="بحث برقم الكود، اسم الحساب، أو الوصف..."
                        className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            إلغاء
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={handleExpandAll}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors shadow-none hover:shadow-sm"
                            title="توسيع كافة الحسابات الرئيسية"
                        >
                            <ChevronDown className="w-3.5 h-3.5 text-emerald-500" />
                            <span>توسيع الكل</span>
                        </button>
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <button
                            onClick={handleCollapseAll}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors shadow-none hover:shadow-sm"
                            title="طي كافة الحسابات الرئيسية"
                        >
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>طي الكل</span>
                        </button>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 hidden lg:flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        مرتبط تلقائياً بالسندات
                    </div>
                </div>
            </div>

            {/* Main Tree / List Content */}
            {loading ? (
                <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm">جاري تحميل دليل حسابات المصروفات...</p>
                </div>
            ) : filteredAccounts ? (
                /* Search Results View */
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                        <Search className="w-4 h-4 text-emerald-500" />
                        نتائج البحث ({filteredAccounts.length})
                    </h3>
                    {filteredAccounts.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-6">لا توجد حسابات مطابقة لبحثك</p>
                    ) : (
                        <div className="space-y-2">
                            {filteredAccounts.map(acc => (
                                <div key={acc.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md">
                                            {acc.code}
                                        </span>
                                        <div>
                                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                                {acc.name}
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-normal ${
                                                    acc.type === 'parent' 
                                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' 
                                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                }`}>
                                                    {acc.type === 'parent' ? 'حساب رئيسي' : 'بند فرعي'}
                                                </span>
                                            </div>
                                            {acc.description && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{acc.description}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => openEditModal(acc)}
                                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                                            title="تعديل الحساب"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* Tree Hierarchy View */
                <div className="space-y-4">
                    {parentAccounts.map(parent => {
                        const isExpanded = parent.id ? (expandedParents[parent.id] ?? true) : true;
                        const subAccs = parent.id ? getSubAccounts(parent.id, parent.code) : [];
                        const parentSpent = parent.id ? getParentTotalSpent(parent.id, parent.code) : 0;

                        return (
                            <div 
                                key={parent.id || parent.code} 
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all"
                            >
                                {/* Parent Account Row Header */}
                                <div 
                                    onClick={() => parent.id && toggleExpandParent(parent.id)}
                                    className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/90 transition-colors select-none"
                                >
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (parent.id) toggleExpandParent(parent.id);
                                            }}
                                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg transition-colors border border-slate-700"
                                        >
                                            {isExpanded ? (
                                                <ChevronDown className="w-5 h-5" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-slate-400" />
                                            )}
                                        </button>

                                        <span className="font-mono text-sm font-black px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30 shadow-sm">
                                            {parent.code}
                                        </span>

                                        <div>
                                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                                <span>{parent.name}</span>
                                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
                                                    حساب رئيسي
                                                </span>
                                                <span className="text-xs font-normal text-slate-400">
                                                    ({subAccs.length} بند فرعي)
                                                </span>
                                            </h3>
                                            {parent.description && (
                                                <p className="text-xs text-slate-400 mt-0.5">{parent.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                                        <div className="text-left hidden sm:block">
                                            <span className="text-[10px] text-slate-400 block font-medium">إجمالي المُنصرف</span>
                                            <span className="text-sm font-bold text-amber-400">
                                                {parentSpent.toLocaleString()} YER
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => openAddModal(parent.id)}
                                            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors shadow-sm"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>إضافة بند فرعي</span>
                                        </button>

                                        <button
                                            onClick={() => openEditModal(parent)}
                                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                                            title="تعديل الحساب الرئيسي"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Sub Accounts List Body */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/40 dark:bg-slate-900/40"
                                        >
                                            {subAccs.length === 0 ? (
                                                <div className="p-6 text-center text-slate-400 text-xs italic">
                                                    لا توجد بنود فرعية تحت هذا الحساب. اضغط على "إضافة بند فرعي" لإدراج حساب تفصيلي.
                                                </div>
                                            ) : (
                                                subAccs.map(sub => {
                                                    const subSpent = sub.id ? (accountTotalsMap[sub.id] || 0) : 0;
                                                    const isActive = sub.isActive !== false;

                                                    return (
                                                        <div 
                                                            key={sub.id || sub.code} 
                                                            className={`p-3.5 pr-6 sm:pr-10 border-r-4 border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-emerald-50/30 dark:hover:bg-slate-800/40 transition-colors ${
                                                                !isActive ? 'opacity-60 bg-slate-50/80 dark:bg-slate-950/40' : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-start sm:items-center gap-3">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 sm:mt-0 shrink-0" />
                                                                <span className="font-mono text-xs font-extrabold text-slate-700 dark:text-slate-300 px-2.5 py-1 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
                                                                    {sub.code}
                                                                </span>

                                                                <div>
                                                                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                                                        <span>{sub.name}</span>
                                                                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded">
                                                                            بند فرعي
                                                                        </span>
                                                                        {!isActive && (
                                                                            <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 rounded font-normal">
                                                                                معطل
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {sub.description && (
                                                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                                            {sub.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-800">
                                                                <div className="text-left">
                                                                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                                                                        {subSpent.toLocaleString()} YER
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => handleToggleActive(sub)}
                                                                        className={`p-1.5 rounded-lg transition-colors ${
                                                                            isActive 
                                                                                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50' 
                                                                                : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                                        }`}
                                                                        title={isActive ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                                                                    >
                                                                        {isActive ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                                    </button>

                                                                    <button
                                                                        onClick={() => openEditModal(sub)}
                                                                        className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                                                        title="تعديل الحساب"
                                                                    >
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal for Adding/Editing Expense Account */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full overflow-hidden"
                        >
                            <div className="p-5 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <FolderTree className="w-5 h-5 text-emerald-400" />
                                    <h3 className="font-bold text-base">
                                        {editingAccount ? 'تعديل بيانات الحساب المحاسبي' : 'إضافة حساب مصروفات جديد'}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-slate-400 hover:text-white p-1 rounded-lg"
                                >
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handleSaveAccount} className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                            نوع الحساب
                                        </label>
                                        <select
                                            value={formData.type}
                                            onChange={(e) => setFormData(f => ({ ...f, type: e.target.value as any }))}
                                            className="w-full text-sm p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                                        >
                                            <option value="sub">بند فرعي (تفصيلي)</option>
                                            <option value="parent">حساب رئيسي (تجميعي)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                            كود الحساب المحاسبي <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.code}
                                            onChange={(e) => setFormData(f => ({ ...f, code: e.target.value }))}
                                            placeholder="مثال: 5101"
                                            className="w-full text-sm p-2.5 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                {formData.type === 'sub' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                            الحساب الرئيسي التابع له
                                        </label>
                                        <select
                                            value={formData.parentId}
                                            onChange={(e) => setFormData(f => ({ ...f, parentId: e.target.value }))}
                                            className="w-full text-sm p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
                                        >
                                            {parentAccounts.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.code} - {p.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                        اسم الحساب / البند <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                                        placeholder="مثال: صيانة أجهزة الفحص، إيجار المعرض..."
                                        className="w-full text-sm p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                        الوصف والملاحظات المحاسبية
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={formData.description}
                                        onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                                        placeholder="توضيح لطبيعة المصروفات التي تدخل تحت هذا البند..."
                                        className="w-full text-sm p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                                    />
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        type="checkbox"
                                        id="isActiveCheck"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData(f => ({ ...f, isActive: e.target.checked }))}
                                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                    />
                                    <label htmlFor="isActiveCheck" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                        الحساب نشط ويقبل إدراج السندات والمصروفات
                                    </label>
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-md transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                                        <span>حفظ التغييرات</span>
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
