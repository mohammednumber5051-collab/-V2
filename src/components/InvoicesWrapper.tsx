import { useState } from "react";
import Invoices from "./Invoices";

export default function InvoicesWrapper({ currentUser }: { currentUser?: any }) {
  const [activeTab, setActiveTab] = useState<'sale' | 'purchase'>('sale');

  return (
    <div className="space-y-2">
      <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-0.5 rounded-md w-full max-w-[160px] mx-auto shrink-0 my-0.5">
        <button
          onClick={() => setActiveTab('sale')}
          className={`flex-1 py-1 text-[11px] font-black rounded-md transition-all ${
            activeTab === 'sale'
              ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          المبيعات
        </button>
        <button
          onClick={() => setActiveTab('purchase')}
          className={`flex-1 py-1 text-[11px] font-black rounded-md transition-all ${
            activeTab === 'purchase'
              ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          المشتريات
        </button>
      </div>
      <div className="">
        <Invoices type={activeTab} currentUser={currentUser} />
      </div>
    </div>
  );
}
