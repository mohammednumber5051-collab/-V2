import re

with open('src/components/Transactions.tsx', 'r') as f:
    content = f.read()

if 'ChevronDown' not in content:
    content = content.replace('} from "lucide-react";', ', ChevronDown, ChevronUp } from "lucide-react";')

state_pattern = r"(const \[filterUser, setFilterUser\] = useState\('all'\);)"
new_state = r"\1\n  const [isFiltersOpen, setIsFiltersOpen] = useState(false);"
content = re.sub(state_pattern, new_state, content)

filter_section_old = """                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 mb-4">
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
                    </div>"""

filter_section_new = """                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 mb-4">
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
                    </AnimatePresence>"""

content = content.replace(filter_section_old, filter_section_new)

with open('src/components/Transactions.tsx', 'w') as f:
    f.write(content)
