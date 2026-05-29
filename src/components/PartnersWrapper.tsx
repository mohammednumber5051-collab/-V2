import { useState } from "react";
import Partners from "./Partners";

export default function PartnersWrapper() {
  const [activeTab, setActiveTab] = useState<'customer' | 'supplier'>('customer');

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl w-full max-w-sm mx-auto shrink-0">
        <button
          onClick={() => setActiveTab('customer')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'customer'
              ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          العملاء
        </button>
        <button
          onClick={() => setActiveTab('supplier')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'supplier'
              ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          الموردين
        </button>
      </div>
      <div className="">
        <Partners type={activeTab} />
      </div>
    </div>
  );
}
