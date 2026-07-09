import re

with open('src/components/AuditLogs.tsx', 'r') as f:
    content = f.read()

if 'ChevronDown' not in content:
    content = content.replace('Activity } from "lucide-react";', 'Activity, Filter, ChevronUp, ChevronDown } from "lucide-react";')

state_pattern = r"(const \[selectedLog, setSelectedLog\] = useState<AuditLog \| null>\(null\);)"
new_state = r"\1\n    const [isFiltersOpen, setIsFiltersOpen] = useState(false);"
content = re.sub(state_pattern, new_state, content)

filter_old = """                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl text-rose-600 dark:text-rose-400">
                        <ShieldAlert className="animate-pulse" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white">سجل حركات النظام (Audit)</h2>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">تتبع كافة العمليات والتعديلات</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl">
                        <button 
                            onClick={() => setFilterType('day')}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'day' ? 'bg-white dark:bg-[#131b2e] shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}
                        >اليوم</button>
                        <button 
                            onClick={() => setFilterType('period')}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'period' ? 'bg-white dark:bg-[#131b2e] shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}
                        >فترة مخصصة</button>
                        <button 
                            onClick={() => setFilterType('all')}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'all' ? 'bg-white dark:bg-[#131b2e] shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}
                        >الكل</button>
                    </div>
                    
                    {filterType === 'period' && (
                        <div className="flex items-center gap-2">
                            <input 
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-rose-500/20"
                            />
                            {filterType === 'period' && (
                                <>
                                    <span className="text-slate-400 text-[10px] font-black">إلى</span>
                                    <input 
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-rose-500/20"
                                    />
                                </>
                            )}
                        </div>
                    )}
                    
                    <div className="h-8 w-px bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block"></div>
                    <button 
                        onClick={setToday}
                        className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black transition-colors"
                    >
                        اليوم
                    </button>
                    <button 
                        onClick={manualLoad}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black transition-colors"
                    >
                        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                        تحديث
                    </button>
                </div>"""

filter_new = """                <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 rounded-2xl text-rose-600 dark:text-rose-400">
                            <ShieldAlert className="animate-pulse" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 dark:text-white">سجل حركات النظام (Audit)</h2>
                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">تتبع كافة العمليات والتعديلات</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                        className="flex md:hidden items-center justify-between w-full text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-rose-600 transition-colors p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl"
                    >
                        <div className="flex items-center gap-2">
                            <Filter size={18} />
                            <span>خيارات الفلترة</span>
                        </div>
                        {isFiltersOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
                
                <AnimatePresence>
                    {(isFiltersOpen || window.innerWidth >= 768) && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="w-full overflow-hidden md:!h-auto md:!opacity-100"
                        >
                            <div className="flex flex-wrap items-center gap-3 pt-4 md:pt-0 border-t md:border-none border-slate-100 dark:border-slate-800">
                                <div className="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setFilterType('day')}
                                        className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'day' ? 'bg-white dark:bg-[#131b2e] shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}
                                    >اليوم</button>
                                    <button 
                                        onClick={() => setFilterType('period')}
                                        className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'period' ? 'bg-white dark:bg-[#131b2e] shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}
                                    >فترة مخصصة</button>
                                    <button 
                                        onClick={() => setFilterType('all')}
                                        className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterType === 'all' ? 'bg-white dark:bg-[#131b2e] shadow-sm text-rose-600 dark:text-rose-400' : 'text-slate-500 hover:text-slate-700'}`}
                                    >الكل</button>
                                </div>
                                
                                {filterType === 'period' && (
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-rose-500/20"
                                        />
                                        <span className="text-slate-400 text-[10px] font-black">إلى</span>
                                        <input 
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-rose-500/20"
                                        />
                                    </div>
                                )}
                                
                                <div className="h-8 w-px bg-slate-100 dark:bg-slate-800 mx-1 hidden sm:block"></div>
                                <button 
                                    onClick={setToday}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black transition-colors"
                                >
                                    اليوم
                                </button>
                                <button 
                                    onClick={manualLoad}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black transition-colors"
                                >
                                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                                    تحديث
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>"""

content = content.replace(filter_old, filter_new)

with open('src/components/AuditLogs.tsx', 'w') as f:
    f.write(content)

