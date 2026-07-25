'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Invoice {
  type: 'sale' | 'purchase';
  total: number;
  discount?: number;
  createdAt?: string;
  recordStatus?: string;
}

interface Voucher {
  amount: number;
  category?: string;
  createdAt?: string;
  recordStatus?: string;
}

interface PerformanceAnalysisProps {
  invoices: Invoice[];
  expenses: Voucher[];
}

export default function PerformanceAnalysisReport({ invoices = [], expenses = [] }: PerformanceAnalysisProps) {
  const analysis = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const filterByMonth = (items: any[], monthStart: Date, monthEnd: Date) => {
      return items.filter(item => {
        const date = new Date(item.createdAt || '');
        return date >= monthStart && date <= monthEnd && item.recordStatus !== 'deleted';
      });
    };

    // Current month data
    const currentInvoices = filterByMonth(invoices, currentMonthStart, now);
    const currentExpenses = filterByMonth(expenses, currentMonthStart, now);

    const currentRevenue = currentInvoices
      .filter(inv => inv.type === 'sale')
      .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.discount || 0)), 0);

    const currentCogs = currentInvoices
      .filter(inv => inv.type === 'purchase')
      .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.discount || 0)), 0);

    const currentGrossProfit = currentRevenue - currentCogs;
    const currentOpEx = currentExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const currentNetIncome = currentGrossProfit - currentOpEx;

    // Previous month data
    const previousInvoices = filterByMonth(invoices, previousMonthStart, previousMonthEnd);
    const previousExpenses = filterByMonth(expenses, previousMonthStart, previousMonthEnd);

    const previousRevenue = previousInvoices
      .filter(inv => inv.type === 'sale')
      .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.discount || 0)), 0);

    const previousCogs = previousInvoices
      .filter(inv => inv.type === 'purchase')
      .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.discount || 0)), 0);

    const previousGrossProfit = previousRevenue - previousCogs;
    const previousOpEx = previousExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const previousNetIncome = previousGrossProfit - previousOpEx;

    // Calculate changes
    const revenueChange = currentRevenue - previousRevenue;
    const revenueChangePercent = previousRevenue > 0 ? (revenueChange / previousRevenue) * 100 : 0;

    const profitChange = currentNetIncome - previousNetIncome;
    const profitChangePercent = previousNetIncome !== 0 ? (profitChange / Math.abs(previousNetIncome)) * 100 : 0;

    const expenseChange = currentOpEx - previousOpEx;
    const expenseChangePercent = previousOpEx > 0 ? (expenseChange / previousOpEx) * 100 : 0;

    return {
      current: {
        revenue: currentRevenue,
        cogs: currentCogs,
        grossProfit: currentGrossProfit,
        opEx: currentOpEx,
        netIncome: currentNetIncome,
        margin: currentRevenue > 0 ? (currentNetIncome / currentRevenue) * 100 : 0
      },
      previous: {
        revenue: previousRevenue,
        cogs: previousCogs,
        grossProfit: previousGrossProfit,
        opEx: previousOpEx,
        netIncome: previousNetIncome,
        margin: previousRevenue > 0 ? (previousNetIncome / previousRevenue) * 100 : 0
      },
      changes: {
        revenueChange,
        revenueChangePercent,
        profitChange,
        profitChangePercent,
        expenseChange,
        expenseChangePercent
      }
    };
  }, [invoices, expenses]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(num));
  };

  const MetricCard = ({ title, current, previous, change, changePercent, isRevenue = false }: any) => {
    const isPositive = change >= 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

    return (
      <div className="bg-white dark:bg-[#131b2e] rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">{title}</div>
        
        <div className="space-y-3">
          {/* Current Month */}
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">هذا الشهر</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{formatNumber(current)}</div>
          </div>

          {/* Previous Month */}
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">الشهر الماضي</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">{formatNumber(previous)}</div>
          </div>

          {/* Change */}
          <div className={`flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 ${
            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}>
            <Icon size={16} />
            <div>
              <span className="font-bold">{formatNumber(Math.abs(change))}</span>
              <span className="text-xs ml-1">({changePercent.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 text-white">
        <h3 className="text-2xl font-bold flex items-center gap-2 mb-2">
          <TrendingUp size={24} className="text-blue-400" />
          تحليل الأداء المقارن
        </h3>
        <p className="text-sm text-slate-400">مقارنة الأداء بين الشهر الحالي والشهر السابق</p>
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="الإيرادات"
          current={analysis.current.revenue}
          previous={analysis.previous.revenue}
          change={analysis.changes.revenueChange}
          changePercent={analysis.changes.revenueChangePercent}
        />

        <MetricCard
          title="تكلفة البضاعة"
          current={analysis.current.cogs}
          previous={analysis.previous.cogs}
          change={analysis.changes.revenueChange - (analysis.current.revenue - analysis.previous.revenue)}
          changePercent={0}
        />

        <MetricCard
          title="المصروفات"
          current={analysis.current.opEx}
          previous={analysis.previous.opEx}
          change={analysis.changes.expenseChange}
          changePercent={analysis.changes.expenseChangePercent}
        />
      </div>

      {/* Detailed Comparison Table */}
      <div className="bg-white dark:bg-[#131b2e] rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800">
        <div className="bg-slate-900 px-6 py-4">
          <h4 className="text-lg font-bold text-white">مقارنة تفصيلية</h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">البند</th>
                <th className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">الشهر الحالي</th>
                <th className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">الشهر الماضي</th>
                <th className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">التغير</th>
                <th className="px-6 py-3 text-right font-bold text-slate-900 dark:text-slate-100">النسبة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {/* Revenue Row */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                <td className="px-6 py-3 font-semibold text-slate-900 dark:text-slate-100">الإيرادات</td>
                <td className="px-6 py-3 font-mono text-blue-600 dark:text-blue-400 font-bold">
                  {formatNumber(analysis.current.revenue)}
                </td>
                <td className="px-6 py-3 font-mono text-slate-600 dark:text-slate-400">
                  {formatNumber(analysis.previous.revenue)}
                </td>
                <td className={`px-6 py-3 font-bold flex items-center gap-1 ${
                  analysis.changes.revenueChange >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {analysis.changes.revenueChange >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  {formatNumber(Math.abs(analysis.changes.revenueChange))}
                </td>
                <td className={`px-6 py-3 font-bold ${
                  analysis.changes.revenueChangePercent >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {analysis.changes.revenueChangePercent.toFixed(1)}%
                </td>
              </tr>

              {/* COGS Row */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                <td className="px-6 py-3 font-semibold text-slate-900 dark:text-slate-100">تكلفة البضاعة</td>
                <td className="px-6 py-3 font-mono text-orange-600 dark:text-orange-400 font-bold">
                  {formatNumber(analysis.current.cogs)}
                </td>
                <td className="px-6 py-3 font-mono text-slate-600 dark:text-slate-400">
                  {formatNumber(analysis.previous.cogs)}
                </td>
                <td className="px-6 py-3 text-slate-600 dark:text-slate-400">
                  {formatNumber(analysis.current.cogs - analysis.previous.cogs)}
                </td>
                <td className="px-6 py-3 text-slate-600 dark:text-slate-400">
                  {analysis.previous.cogs > 0 ? ((analysis.current.cogs - analysis.previous.cogs) / analysis.previous.cogs * 100).toFixed(1) : '0'}%
                </td>
              </tr>

              {/* Gross Profit Row */}
              <tr className="bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition">
                <td className="px-6 py-3 font-bold text-slate-900 dark:text-slate-100">الربح الإجمالي</td>
                <td className="px-6 py-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatNumber(analysis.current.grossProfit)}
                </td>
                <td className="px-6 py-3 font-mono text-slate-600 dark:text-slate-400">
                  {formatNumber(analysis.previous.grossProfit)}
                </td>
                <td className="px-6 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                  {formatNumber(analysis.current.grossProfit - analysis.previous.grossProfit)}
                </td>
                <td className="px-6 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                  {analysis.previous.grossProfit > 0 ? ((analysis.current.grossProfit - analysis.previous.grossProfit) / analysis.previous.grossProfit * 100).toFixed(1) : '0'}%
                </td>
              </tr>

              {/* Operating Expenses Row */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                <td className="px-6 py-3 font-semibold text-slate-900 dark:text-slate-100">المصروفات التشغيلية</td>
                <td className="px-6 py-3 font-mono text-red-600 dark:text-red-400 font-bold">
                  {formatNumber(analysis.current.opEx)}
                </td>
                <td className="px-6 py-3 font-mono text-slate-600 dark:text-slate-400">
                  {formatNumber(analysis.previous.opEx)}
                </td>
                <td className={`px-6 py-3 font-bold flex items-center gap-1 ${
                  analysis.changes.expenseChange <= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {analysis.changes.expenseChange <= 0 ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                  {formatNumber(Math.abs(analysis.changes.expenseChange))}
                </td>
                <td className={`px-6 py-3 font-bold ${
                  analysis.changes.expenseChangePercent <= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {analysis.changes.expenseChangePercent.toFixed(1)}%
                </td>
              </tr>

              {/* Net Income Row */}
              <tr className="bg-gradient-to-r from-slate-900 to-slate-800 text-white font-bold">
                <td className="px-6 py-4">صافي الدخل</td>
                <td className="px-6 py-4 font-mono text-emerald-300">
                  {formatNumber(analysis.current.netIncome)}
                </td>
                <td className="px-6 py-4 font-mono text-slate-300">
                  {formatNumber(analysis.previous.netIncome)}
                </td>
                <td className={`px-6 py-4 font-mono flex items-center gap-1 ${
                  analysis.changes.profitChange >= 0
                    ? 'text-emerald-300'
                    : 'text-red-300'
                }`}>
                  {analysis.changes.profitChange >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  {formatNumber(Math.abs(analysis.changes.profitChange))}
                </td>
                <td className={`px-6 py-4 font-mono ${
                  analysis.changes.profitChangePercent >= 0
                    ? 'text-emerald-300'
                    : 'text-red-300'
                }`}>
                  {analysis.changes.profitChangePercent.toFixed(1)}%
                </td>
              </tr>

              {/* Profit Margin Row */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                <td className="px-6 py-3 font-semibold text-slate-900 dark:text-slate-100">هامش الربح</td>
                <td className="px-6 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {analysis.current.margin.toFixed(1)}%
                </td>
                <td className="px-6 py-3 font-mono text-slate-600 dark:text-slate-400">
                  {analysis.previous.margin.toFixed(1)}%
                </td>
                <td className="px-6 py-3 font-bold text-slate-900 dark:text-slate-100">
                  {(analysis.current.margin - analysis.previous.margin).toFixed(1)}%
                </td>
                <td className={`px-6 py-3 font-bold ${
                  analysis.current.margin - analysis.previous.margin >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {analysis.previous.margin > 0 ? (((analysis.current.margin - analysis.previous.margin) / analysis.previous.margin) * 100).toFixed(1) : '0'}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-2xl p-4 ${
          analysis.changes.revenueChangePercent >= 0
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <h4 className={`font-bold mb-2 ${
            analysis.changes.revenueChangePercent >= 0
              ? 'text-emerald-900 dark:text-emerald-100'
              : 'text-red-900 dark:text-red-100'
          }`}>
            أداء الإيرادات
          </h4>
          <p className={`text-sm ${
            analysis.changes.revenueChangePercent >= 0
              ? 'text-emerald-800 dark:text-emerald-200'
              : 'text-red-800 dark:text-red-200'
          }`}>
            {analysis.changes.revenueChangePercent >= 0
              ? `الإيرادات ارتفعت بنسبة ${analysis.changes.revenueChangePercent.toFixed(1)}%`
              : `الإيرادات انخفضت بنسبة ${Math.abs(analysis.changes.revenueChangePercent).toFixed(1)}%`}
          </p>
        </div>

        <div className={`rounded-2xl p-4 ${
          analysis.changes.profitChange >= 0
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <h4 className={`font-bold mb-2 ${
            analysis.changes.profitChange >= 0
              ? 'text-emerald-900 dark:text-emerald-100'
              : 'text-red-900 dark:text-red-100'
          }`}>
            أداء الأرباح
          </h4>
          <p className={`text-sm ${
            analysis.changes.profitChange >= 0
              ? 'text-emerald-800 dark:text-emerald-200'
              : 'text-red-800 dark:text-red-200'
          }`}>
            {analysis.changes.profitChange >= 0
              ? `الأرباح ارتفعت بمقدار ${formatNumber(analysis.changes.profitChange)}`
              : `الأرباح انخفضت بمقدار ${formatNumber(Math.abs(analysis.changes.profitChange))}`}
          </p>
        </div>
      </div>
    </div>
  );
}
