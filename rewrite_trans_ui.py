import re

with open('src/components/Transactions.tsx', 'r') as f:
    content = f.read()

replacement = '''
            <div className="pb-10">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                                                            if(m.source === 'quickEntry') onNavigate('dashboard'); 
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
'''

pattern = r'<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-24">.*?(?=\{/\* Content Area \*/\})'

# I will just match from <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-24">
# to the </motion.div> that closes it.
# Let's extract the part inside the activeTab === 'transactions' motion div.

pattern = r'<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-24">.*?\{hasMore && \(\s*<div className="flex justify-center mt-4 pb-24">.*?</div>\s*\)\}'

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/components/Transactions.tsx', 'w') as f:
    f.write(content)
