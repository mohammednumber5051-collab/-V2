import React, { useState, useEffect } from "react";
import { Plus, Search, Trash2, Shield, UserPlus, X, CheckCircle2, Key, Mail, Lock, User as UserIcon, UserMinus, UserCheck } from "lucide-react";
import { dbService } from "../services/db";
import { authService } from "../services/authService";
import { AppUser, RoleLevel } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

const ALL_PAGES = [
    { id: 'dashboard', label: 'لوحة التحكم' },
    { id: 'invoices', label: 'عرض الفواتير' },
    { id: 'add_invoices', label: 'إضافة وتعديل وحذف الفواتير' },
    { id: 'inventory', label: 'عرض المخزون والأصناف' },
    { id: 'edit_inventory', label: 'إضافة وتعديل وحذف المخزون' },
    { id: 'transactions', label: 'الخزينة والعمليات المالية (قبض وصرف)' },
    { id: 'reports', label: 'عرض التقارير المالية والأرباح' },
    { id: 'partners', label: 'إدارة العملاء والموردين' },
    { id: 'optical_hub', label: 'مركز صيانة النظارات والورشة' },
    { id: 'quick_entry', label: 'الإدخال والمسح السريع للفواتير الورقية' },
    { id: 'daily_ledger', label: 'دفتر اليومية وقيد الأمانات' },
    { id: 'settings', label: 'أمان النظام وإعدادات النسخ الاحتياطي' },
    { id: 'audit_logs', label: 'عرض سجل حركات النظام (Audit)' },
    { id: 'users', label: 'إدارة المستخدمين وصلاحياتهم' },
];

export default function Users() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Form State
    const [formData, setFormData] = useState<Partial<AppUser> & { password?: string }>({
        username: "",
        name: "",
        email: "",
        password: "",
        role: "CASHIER",
        isActive: true,
        permissions: ['dashboard', 'inventory', 'sales', 'customers']
    });

    const [editingUser, setEditingUser] = useState<AppUser | null>(null);
    const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
    const [userToResetPassword, setUserToResetPassword] = useState<AppUser | null>(null);
    const [newPassword, setNewPassword] = useState("");

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        const data = await dbService.getAll("users");
        setUsers(data as AppUser[]);
    };

    const handleOpenModal = (user?: AppUser) => {
        if (user) {
            setEditingUser(user);
            setFormData({ ...user, password: "" });
        } else {
            setEditingUser(null);
            setFormData({
                username: "",
                name: "",
                email: "",
                password: "",
                role: "CASHIER",
                isActive: true,
                permissions: ['dashboard', 'inventory', 'sales', 'customers']
            });
        }
        setIsModalOpen(true);
    };

    const togglePermission = (pageId: string) => {
        const current = formData.permissions || [];
        if (current.includes(pageId)) {
            setFormData({ ...formData, permissions: current.filter(id => id !== pageId) });
        } else {
            setFormData({ ...formData, permissions: [...current, pageId] });
        }
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.username || formData.username.length < 3) {
            alert("اسم الدخول يجب أن يكون 3 أحرف على الأقل");
            return;
        }
        if (!formData.name || formData.name.length < 3) {
            alert("الاسم الكامل يجب أن يكون 3 أحرف على الأقل");
            return;
        }

        const { id, password, ...restData } = formData;
        
        let dataToSave: Partial<AppUser> = { ...restData, username: restData.username?.toLowerCase() };
        
        // Auto-set full permissions for SUPER_ADMIN
        if (dataToSave.role === 'SUPER_ADMIN') {
            dataToSave.permissions = ['*'];
        }
        
        setIsSaving(true);
        try {
            if (password && password.length >= 4) {
               dataToSave.passwordHash = await authService.hashPassword(password);
            } else if (!editingUser) {
                alert("يرجى إدخال كلمة مرور مكونة من 4 أحرف على الأقل عند الدخول كجديد.");
                setIsSaving(false);
                return;
            }

            if (editingUser?.id) {
                await dbService.update("users", editingUser.id, dataToSave);
                alert("تم تحديث بيانات المستخدم بنجاح");
            } else {
                
                // check if username exists
                const existingUsers = await dbService.getAll("users") as AppUser[];
                const exists = existingUsers.find(u => u.username?.toLowerCase() === formData.username?.toLowerCase());
                if (exists) {
                    alert("اسم المستخدم (الدخول) موجود مسبقاً! يرجى اختيار اسم آخر.");
                    setIsSaving(false);
                    return;
                }
                
                await dbService.add("users", {
                    ...dataToSave,
                    isActive: true,
                    createdAt: new Date().toISOString()
                });
                alert("تم إضافة المستخدم بنجاح");
            }
            setIsModalOpen(false);
            loadUsers();
        } catch (error) {
            console.error("Error saving user:", error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetPassword = (user: AppUser) => {
        setUserToResetPassword(user);
        setNewPassword("");
    };

    const handleConfirmResetPassword = async () => {
        if (!userToResetPassword || !newPassword || newPassword.length < 4) {
            alert("يرجى كتابة كلمة مرور قوية (4 أحرف أو أرقام على الأقل).");
            return;
        }

        setIsSaving(true);
        try {
            const passwordHash = await authService.hashPassword(newPassword);
            await dbService.update("users", userToResetPassword.id!, { 
                passwordHash, 
                sessionVersion: Date.now() 
            });
            setUserToResetPassword(null);
            loadUsers();
            alert("تم تغيير كلمة المرور بنجاح");
        } catch (error) {
            alert("فشل تغيير كلمة المرور");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (user: AppUser) => {
        setUserToDelete(user);
    };

    const confirmDelete = async () => {
        if (!userToDelete || !userToDelete.id) return;
        try {
            await dbService.softDelete("users", userToDelete.id);
            setUserToDelete(null);
            loadUsers();
        } catch (error) {
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const toggleUserStatus = async (user: AppUser) => {
        if (!user.id) return;
        const newStatus = !user.isActive;
        const confirmMsg = newStatus 
            ? `هل أنت متأكد من تفعيل حساب ${user.name}؟` 
            : `هل أنت متأكد من تعطيل حساب ${user.name}؟ لن يتمكن من دخول التطبيق.`;
        
        if (confirm(confirmMsg)) {
            try {
                await dbService.update("users", user.id, { 
                    isActive: newStatus,
                    sessionVersion: Date.now() // Force logout by updating session version
                });
                loadUsers();
                alert(newStatus ? "تم تفعيل الحساب" : "تم تعطيل الحساب");
            } catch (error) {
                alert("حدث خطأ أثناء تغيير الحالة");
            }
        }
    };

    const filteredUsers = users.filter(u => 
        (u.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
        (u.role || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    );

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="بحث عن مستخدم..."
                        className="w-full pr-10 pl-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2 rounded-xl hover:bg-black transition-colors shadow-lg cursor-pointer"
                >
                    <UserPlus size={18} />
                    إضافة مستخدم جديد
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredUsers.map((user) => (
                    <motion.div
                        key={user.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                            "p-4 rounded-xl border transition-all flex flex-col group",
                            user.isActive 
                                ? "bg-white border-slate-200 shadow-sm hover:shadow-md" 
                                : "bg-slate-50 border-slate-100 opacity-80"
                        )}
                    >
                        <div className="flex flex-col justify-between items-start mb-3 gap-3">
                            <div className="flex items-center gap-3 w-full">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-black text-base shrink-0">
                                    {(user.name || '؟').charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="font-bold text-slate-800 truncate">{user.name}</h3>
                                        <span className={cn(
                                            "text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap",
                                            user.isActive ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600 line-through opacity-60"
                                        )}>
                                            {user.role}
                                            {!user.isActive && " (معطل)"}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 truncate w-full mt-1">
                                        <Mail size={10} className="shrink-0" />
                                        <span className="truncate">{user.email || 'لا يوجد بريد'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex w-full md:w-auto items-center gap-2 mt-2 md:mt-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button 
                                    title="تغيير كلمة المرور"
                                    onClick={() => handleResetPassword(user)}
                                    className="flex flex-1 items-center justify-center gap-1.5 p-2.5 bg-blue-50/50 dark:bg-blue-500/5 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 rounded-xl transition-all text-xs font-bold ring-1 ring-blue-500/10"
                                >
                                    <Key size={14} /> كلمة المرور
                                </button>
                                <button 
                                    title={user.isActive ? "تعطيل المستخدم" : "تفعيل المستخدم"}
                                    onClick={() => toggleUserStatus(user)}
                                    className={cn(
                                        "flex flex-1 items-center justify-center gap-1.5 p-2 rounded-lg transition-all text-xs font-bold",
                                        user.isActive 
                                            ? "bg-slate-50 text-slate-600 hover:text-amber-600 hover:bg-amber-50" 
                                            : "bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white"
                                    )}
                                >
                                    {user.isActive ? <UserMinus size={14} /> : <UserCheck size={14} />}
                                    {user.isActive ? "تعطيل" : "تفعيل"}
                                </button>
                                <button 
                                    title="تعديل المستخدم"
                                    onClick={() => handleOpenModal(user)}
                                    className="flex flex-1 items-center justify-center gap-1.5 p-2 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all text-xs font-bold"
                                >
                                    <Shield size={14} /> تعديل
                                </button>
                                <button 
                                    title="حذف المستخدم"
                                    onClick={() => handleDelete(user)}
                                    className="flex flex-1 items-center justify-center gap-1.5 p-2 bg-slate-50 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all text-xs font-bold"
                                >
                                    <Trash2 size={14} /> حذف
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3 mt-2">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1">
                                <Shield size={12} />
                                الصلاحيات النشطة
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {user.role === 'SUPER_ADMIN' ? (
                                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black border border-indigo-100">
                                        كامل صلاحيات الوصول
                                    </span>
                                ) : (
                                    user.permissions.map(pid => (
                                        <span key={pid} className="px-2 py-1 bg-slate-50 text-slate-600 rounded text-[9px] font-bold border border-slate-100">
                                            {ALL_PAGES.find(p => p.id === pid)?.label || pid}
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {userToDelete && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setUserToDelete(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden"
                        >
                            <div className="p-6 text-center space-y-4">
                                <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-base font-black text-slate-800">تأكيد حذف المستخدم</h3>
                                <p className="text-sm text-slate-500 leading-relaxed px-4">
                                    هل أنت متأكد من حذف المستخدم <span className="font-bold text-slate-800">{userToDelete.name}</span>؟ 
                                    <br />
                                    <span className="text-rose-600 font-bold mt-2 block">تنبيه: لا يمكن التراجع عن هذا الإجراء أبداً.</span>
                                </p>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setUserToDelete(null)}
                                        className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        تراجع
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
                                    >
                                        حذف نهائي
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Password Reset Modal */}
            <AnimatePresence>
                {userToResetPassword && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setUserToResetPassword(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden"
                        >
                            <div className="p-6">
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-4 rotate-3">
                                        <Key size={32} />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-800 dark:text-white">تغيير كلمة المرور</h3>
                                    <p className="text-sm text-slate-500 font-bold mt-1">تحديد كلمة مرور جديدة للمستخدم: <span className="text-blue-600">{userToResetPassword.name}</span></p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">كلمة المرور الجديدة</label>
                                        <div className="relative group">
                                            <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                                            <input 
                                                autoFocus
                                                type="password"
                                                dir="ltr"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full pr-12 pl-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-2 border-slate-200 dark:border-slate-800 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 transition-all font-black text-left tracking-widest outline-none"
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold px-1 italic">* 4 أحرف أو أرقام على الأقل</p>
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <button
                                            onClick={() => setUserToResetPassword(null)}
                                            className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                                        >
                                            إلغاء
                                        </button>
                                        <button
                                            onClick={handleConfirmResetPassword}
                                            disabled={isSaving || newPassword.length < 4}
                                            className="flex-[2] py-3.5 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'حفظ الكلمة الجديدة'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-[#131b2e] w-full max-w-2xl h-full md:h-auto max-h-full md:max-h-[90dvh] md:rounded-[2rem] shadow-2xl relative flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0 rounded-t-2xl">
                                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                                    {editingUser ? <Shield size={20} className="text-indigo-600" /> : <UserPlus size={20} className="text-blue-600" />}
                                    {editingUser ? "تعديل صلاحيات المستخدم" : "تعريف مستخدم جديد بالنظام"}
                                </h3>
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-white dark:bg-[#131b2e]">
                                <form id="userForm" onSubmit={handleSubmit} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">اسم تسجيل الدخول (Username) <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <UserIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                            <input
                                                required
                                                type="text"
                                                dir="ltr"
                                                className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold text-left"
                                                value={formData.username}
                                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                                placeholder="e.g. ahmed_saleh"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">الاسم الكامل <span className="text-red-500">*</span></label>
                                        <input
                                            required
                                            type="text"
                                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="أحمد صالح"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">الدور الوظيفي</label>
                                        <select
                                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold"
                                            value={formData.role}
                                            onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                                        >
                                            <option value="SUPER_ADMIN">مدير عام (Super Admin)</option>
                                            <option value="ADMIN">مدير فرع / النظام</option>
                                            <option value="ACCOUNTANT">محاسب عام</option>
                                            <option value="CASHIER">كاشير / بائع</option>
                                            <option value="EMPLOYEE">موظف ورشة / صيانة</option>
                                            <option value="VIEWER">مراقب (للقراءة فقط)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">البريد الإلكتروني (اختياري)</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                            <input
                                                type="email"
                                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="user@example.com"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">كلمة المرور</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                                            <input
                                                type="password"
                                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 font-bold"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                placeholder="كلمة مرور قوية..."
                                                required={!editingUser}
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {formData.role === 'SUPER_ADMIN' ? (
                                    <div className="p-6 bg-indigo-50 dark:bg-indigo-500/10 border-2 border-indigo-200 dark:border-indigo-500/20 rounded-2xl flex flex-col items-center text-center gap-3">
                                        <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center text-indigo-600 shadow-sm">
                                            <Shield size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-indigo-900 dark:text-indigo-400">صلاحيات كاملة تلقائية</h4>
                                            <p className="text-sm text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                                                المستخدم بصلاحية "مدير عام" يحصل على وصول كامل وحصري لكافة أجزاء النظام والتقارير والإعدادات دون الحاجة لتحديد صلاحيات يدوية.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">تحديد صلاحيات الوصول (بناءً على صفحات التطبيق)</label>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {ALL_PAGES.map((page) => (
                                                <button
                                                    key={page.id}
                                                    type="button"
                                                    onClick={() => togglePermission(page.id)}
                                                    className={cn(
                                                        "p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-2 transition-all",
                                                        formData.permissions?.includes(page.id)
                                                            ? "bg-blue-600 border-blue-600 text-white shadow-md"
                                                            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                                                    )}
                                                >
                                                    {formData.permissions?.includes(page.id) ? <CheckCircle2 size={16} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-100" />}
                                                    {page.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                            </form>
                            </div>
                            <div className="p-4 md:p-6 bg-slate-50 dark:bg-[#1c2436] border-t border-slate-100 dark:border-slate-800 shrink-0">
                                <button
                                    form="userForm"
                                    type="submit"
                                    disabled={isSaving}
                                    className={cn(
                                        "w-full py-4 bg-indigo-600 text-white rounded-[2rem] font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2",
                                        isSaving && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {isSaving ? "جاري المعالجة..." : "حفــــظ وإعتماد البيانات"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
