import re

with open('src/components/Vouchers.tsx', 'r') as f:
    content = f.read()

# Make sure hasPermission is imported
if 'import { cn, hasPermission }' not in content and 'import { hasPermission' not in content:
    content = content.replace('import { cn }', 'import { cn, hasPermission }')

if 'import { cn, hasPermission }' not in content:
    content = content.replace('import { cn', 'import { cn, hasPermission }')


add_btn_old = """<button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
                    <Plus size={16} /> سند جديد
                </button>"""
add_btn_new = """{hasPermission(currentUser, 'add_vouchers') && (
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg">
                    <Plus size={16} /> سند جديد
                </button>
                )}"""
content = content.replace(add_btn_old, add_btn_new)


actions_old = """                                <td className="p-3 flex justify-center gap-2">
                                    <button onClick={() => { setEditingVoucher(v); setForm(v); setIsModalOpen(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="تعديل"><Edit2 size={16} /></button>
                                    <button onClick={async () => { if(confirm('تأكيد الحذف؟')) { await dbService.deleteVoucher(v); loadData(); } }} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors" title="حذف"><Trash2 size={16} /></button>
                                </td>"""
actions_new = """                                <td className="p-3 flex justify-center gap-2">
                                    {hasPermission(currentUser, 'edit_vouchers') && (
                                    <button onClick={() => { setEditingVoucher(v); setForm(v); setIsModalOpen(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="تعديل"><Edit2 size={16} /></button>
                                    )}
                                    {hasPermission(currentUser, 'delete_vouchers') && (
                                    <button onClick={async () => { if(confirm('تأكيد الحذف؟')) { await dbService.deleteVoucher(v); loadData(); } }} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors" title="حذف"><Trash2 size={16} /></button>
                                    )}
                                </td>"""
content = content.replace(actions_old, actions_new)

with open('src/components/Vouchers.tsx', 'w') as f:
    f.write(content)
