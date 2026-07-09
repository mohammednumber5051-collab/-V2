import re

with open('src/components/Users.tsx', 'r') as f:
    content = f.read()

pages_pattern = r"const ALL_PAGES = \[.*?\];"
new_pages = """const ALL_PAGES = [
    { id: 'dashboard', label: 'لوحة التحكم' },
    { id: 'invoices', label: 'عرض الفواتير' },
    { id: 'add_invoices', label: 'إضافة فواتير' },
    { id: 'edit_invoices', label: 'تعديل فواتير' },
    { id: 'delete_invoices', label: 'حذف فواتير' },
    { id: 'inventory', label: 'عرض المخزون والأصناف' },
    { id: 'add_inventory', label: 'إضافة أصناف' },
    { id: 'edit_inventory', label: 'تعديل أصناف' },
    { id: 'delete_inventory', label: 'حذف أصناف' },
    { id: 'transactions', label: 'عرض العمليات المالية' },
    { id: 'cash_boxes', label: 'إدارة الصناديق' },
    { id: 'add_transaction', label: 'إضافة عملية مالية' },
    { id: 'edit_transaction', label: 'تعديل عملية مالية' },
    { id: 'delete_transaction', label: 'حذف عملية مالية' },
    { id: 'vouchers', label: 'عرض سندات صرف وقبض' },
    { id: 'add_vouchers', label: 'إضافة سندات صرف وقبض' },
    { id: 'edit_vouchers', label: 'تعديل سندات صرف وقبض' },
    { id: 'delete_vouchers', label: 'حذف سندات صرف وقبض' },
    { id: 'reports', label: 'عرض التقارير المالية والأرباح' },
    { id: 'partners', label: 'إدارة العملاء والموردين' },
    { id: 'optical_hub', label: 'مركز صيانة النظارات والورشة' },
    { id: 'quick_entry', label: 'الإدخال والمسح السريع للفواتير الورقية' },
    { id: 'daily_ledger', label: 'دفتر اليومية وقيد الأمانات' },
    { id: 'settings', label: 'أمان النظام وإعدادات النسخ الاحتياطي' },
    { id: 'audit_logs', label: 'عرض سجل حركات النظام (Audit)' },
    { id: 'users', label: 'إدارة المستخدمين وصلاحياتهم' },
    { id: 'global_edit', label: 'صلاحية التعديل (تعديل السجلات والفواتير والأصناف)' },
    { id: 'global_delete', label: 'صلاحية الحذف (حذف السجلات والسندات والأصناف)' },
];"""

content = re.sub(pages_pattern, new_pages, content, flags=re.DOTALL)

with open('src/components/Users.tsx', 'w') as f:
    f.write(content)

with open('src/lib/utils.ts', 'r') as f:
    content = f.read()

# Update hasPermission in utils.ts
old_auth = """    if (pid === 'transactions' && (user.permissions.includes('add_transaction') || user.permissions.includes('edit_transaction') || user.permissions.includes('delete_transaction'))) return true;
    if (pid === 'vouchers' && (user.permissions.includes('add_transaction') || user.permissions.includes('edit_transaction') || user.permissions.includes('delete_transaction') || user.permissions.includes('transactions'))) return true;"""

new_auth = """    if (pid === 'transactions' && (user.permissions.includes('add_transaction') || user.permissions.includes('edit_transaction') || user.permissions.includes('delete_transaction'))) return true;
    if (pid === 'vouchers' && (user.permissions.includes('add_vouchers') || user.permissions.includes('edit_vouchers') || user.permissions.includes('delete_vouchers') || user.permissions.includes('add_transaction') || user.permissions.includes('edit_transaction') || user.permissions.includes('delete_transaction') || user.permissions.includes('transactions'))) return true;"""

content = content.replace(old_auth, new_auth)

with open('src/lib/utils.ts', 'w') as f:
    f.write(content)

