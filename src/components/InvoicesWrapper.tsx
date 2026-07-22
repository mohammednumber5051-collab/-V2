import { useState, useEffect } from "react";
import Invoices from "./Invoices";

interface InvoicesWrapperProps {
  currentUser?: any;
  targetInvoice?: { id: string; type: 'sale' | 'purchase' | 'sale_return' | 'purchase_return' } | null;
}

export default function InvoicesWrapper({ currentUser, targetInvoice }: InvoicesWrapperProps) {
  const [activeTab, setActiveTab] = useState<'sale' | 'purchase' | 'sale_return' | 'purchase_return'>('sale');

  useEffect(() => {
    if (targetInvoice?.type) {
      setActiveTab(targetInvoice.type);
    }
  }, [targetInvoice]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 bg-slate-200/50 dark:bg-slate-800/50 p-0.5 rounded-md w-full max-w-sm mx-auto shrink-0 my-0.5">
        <button
          onClick={() => setActiveTab('sale')}
          className={`flex-1 py-1 px-2 text-[11px] font-black rounded-md transition-all whitespace-nowrap ${
            activeTab === 'sale'
              ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          المبيعات
        </button>
        <button
          onClick={() => setActiveTab('purchase')}
          className={`flex-1 py-1 px-2 text-[11px] font-black rounded-md transition-all whitespace-nowrap ${
            activeTab === 'purchase'
              ? "bg-white dark:bg-[#131b2e] text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          المشتريات
        </button>
        <button
          onClick={() => setActiveTab('sale_return')}
          className={`flex-1 py-1 px-2 text-[11px] font-black rounded-md transition-all whitespace-nowrap ${
            activeTab === 'sale_return'
              ? "bg-white dark:bg-[#131b2e] text-rose-600 dark:text-rose-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          مرتجع مبيعات
        </button>
        <button
          onClick={() => setActiveTab('purchase_return')}
          className={`flex-1 py-1 px-2 text-[11px] font-black rounded-md transition-all whitespace-nowrap ${
            activeTab === 'purchase_return'
              ? "bg-white dark:bg-[#131b2e] text-rose-600 dark:text-rose-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          مرتجع مشتريات
        </button>
      </div>
      <div className="">
        <Invoices type={activeTab} currentUser={currentUser} targetInvoiceId={targetInvoice?.id} />
      </div>
    </div>
  );
}
