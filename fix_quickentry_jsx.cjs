const fs = require('fs');

let code = fs.readFileSync('src/components/QuickEntry.tsx', 'utf-8');

const targetJsx = `                                    <div className="relative">
                                        <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            ref={partnerRef}
                                            type="text"
                                            value={partnerName}
                                            onChange={(e) => setPartnerName(e.target.value)}
                                            className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-9 pl-4 text-sm font-bold focus:ring-1 focus:ring-blue-500/20 transition-all"
                                            placeholder={partnerType === 'customer' ? "اسم العميل" : "اسم المورد"}
                                        />
                                    </div>`;

const newJsx = `                                    <div className="relative z-50">
                                        <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            ref={partnerRef}
                                            type="text"
                                            value={searchPartnerTerm}
                                            onChange={(e) => handleSearchPartnerChange(e.target.value)}
                                            onFocus={() => setShowPartnerSuggestions(true)}
                                            className="w-full h-[44px] bg-slate-50 dark:bg-slate-800 border-none rounded-xl pr-9 pl-4 text-sm font-bold focus:ring-1 focus:ring-blue-500/20 transition-all"
                                            placeholder={partnerType === 'customer' ? "ابحث أو أضف عميل..." : "ابحث أو أضف مورد..."}
                                        />
                                        
                                        {showPartnerSuggestions && (
                                            <div className="absolute right-0 top-full mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#162035] border border-slate-100 dark:border-slate-755 shadow-xl rounded-xl z-50 divide-y divide-slate-50 dark:divide-slate-800 custom-scrollbar">
                                                {filteredPartners.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => selectPartnerSuggestion(p)}
                                                        className="w-full px-4 py-3 text-right hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-black flex justify-between items-center transition-colors dark:text-white cursor-pointer"
                                                    >
                                                         <span>{p.name}</span>
                                                         <span className="text-[10px] text-slate-400 font-bold">{p.phone}</span>
                                                    </button>
                                                ))}
                                                {filteredPartners.length === 0 && searchPartnerTerm.trim() !== '' && (
                                                    <div className="p-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={activateQuickNewPartner}
                                                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                                        >
                                                            + إضافة سريعة: "{searchPartnerTerm}"
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>`;

if (code.includes(targetJsx)) {
    code = code.replace(targetJsx, newJsx);
    fs.writeFileSync('src/components/QuickEntry.tsx', code, 'utf-8');
    console.log("Successfully replaced JSX");
} else {
    console.log("Could not find JSX target");
}
