import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { generatePerformanceAnalysis } from "../lib/financialUtils";
import { motion } from "motion/react";

interface PerformanceAnalysisProps {
  currentInvoices: any[];
  currentExpenses: any[];
  previousInvoices: any[];
  previousExpenses: any[];
}

export default function PerformanceAnalysis({
  currentInvoices,
  currentExpenses,
  previousInvoices,
  previousExpenses,
}: PerformanceAnalysisProps) {
  const analysis = useMemo(
    () =>
      generatePerformanceAnalysis(
        currentInvoices,
        currentExpenses,
        previousInvoices,
        previousExpenses
      ),
    [currentInvoices, currentExpenses, previousInvoices, previousExpenses]
  );

  const formatCurrency = (value: number) =>
    value.toLocaleString("ar-EG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const PerformanceCard = ({
    label,
    currentValue,
    previousValue,
    change,
    changePercent,
    type = "positive",
  }: any) => {
    const isPositive = change >= 0;
    const color =
      type === "expense"
        ? isPositive
          ? "text-red-600"
          : "text-green-600"
        : isPositive
        ? "text-green-600"
        : "text-red-600";

    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800"
      >
        <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-3">
          {label}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-500 mb-1">
              الفترة الحالية
            </div>
            <div className="font-black text-slate-900 dark:text-white font-mono">
              {formatCurrency(currentValue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-500 mb-1">
              الفترة السابقة
            </div>
            <div className="font-black text-slate-600 dark:text-slate-400 font-mono">
              {formatCurrency(previousValue)}
            </div>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            isPositive
              ? "bg-green-50 dark:bg-green-950/30"
              : "bg-red-50 dark:bg-red-950/30"
          }`}
        >
          {isPositive ? (
            <ArrowUpRight
              size={18}
              className={`${
                type === "expense"
                  ? "text-red-600"
                  : "text-green-600 dark:text-green-400"
              }`}
            />
          ) : (
            <ArrowDownRight
              size={18}
              className={`${
                type === "expense"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600"
              }`}
            />
          )}
          <div>
            <div className={`text-sm font-black ${color}`}>
              {isPositive ? "+" : "-"}
              {formatCurrency(Math.abs(change))}
            </div>
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              ({changePercent.toFixed(1)}%)
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <TrendingUp size={24} className="text-purple-400" />
          <h2 className="text-2xl font-black">تحليل الأداء المقارن</h2>
        </div>
        <p className="text-sm text-slate-400">
          مقارنة الأداء المالي بين الفترات الزمنية
        </p>
      </div>

      {/* Performance Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PerformanceCard
          label="الإيرادات"
          currentValue={analysis.current.totalRevenue}
          previousValue={analysis.previous.totalRevenue}
          change={analysis.comparison.revenueChange}
          changePercent={analysis.comparison.revenueChangePercent}
          type="revenue"
        />

        <PerformanceCard
          label="المصروفات"
          currentValue={analysis.current.operatingExpenses}
          previousValue={analysis.previous.operatingExpenses}
          change={analysis.comparison.expenseChange}
          changePercent={analysis.comparison.expenseChangePercent}
          type="expense"
        />

        <PerformanceCard
          label="صافي الدخل"
          currentValue={analysis.current.netIncome}
          previousValue={analysis.previous.netIncome}
          change={analysis.comparison.profitChange}
          changePercent={analysis.comparison.profitChangePercent}
          type="profit"
        />
      </div>

      {/* Detailed Comparison Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                  المؤشر
                </th>
                <th className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                  الحالي
                </th>
                <th className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                  السابق
                </th>
                <th className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                  التغيير
                </th>
                <th className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                  النسبة %
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                  إجمالي الإيرادات
                </td>
                <td className="px-6 py-4 font-mono text-slate-900 dark:text-white">
                  {formatCurrency(analysis.current.totalRevenue)}
                </td>
                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">
                  {formatCurrency(analysis.previous.totalRevenue)}
                </td>
                <td
                  className={`px-6 py-4 font-black font-mono ${
                    analysis.comparison.revenueChange >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.comparison.revenueChange >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(analysis.comparison.revenueChange))}
                </td>
                <td
                  className={`px-6 py-4 font-black ${
                    analysis.comparison.revenueChangePercent >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.comparison.revenueChangePercent.toFixed(1)}%
                </td>
              </tr>

              <tr className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                  تكلفة البضاعة
                </td>
                <td className="px-6 py-4 font-mono text-slate-900 dark:text-white">
                  {formatCurrency(analysis.current.costOfGoods)}
                </td>
                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">
                  {formatCurrency(analysis.previous.costOfGoods)}
                </td>
                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">
                  {formatCurrency(
                    analysis.current.costOfGoods - analysis.previous.costOfGoods
                  )}
                </td>
                <td className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">
                  {analysis.previous.costOfGoods === 0
                    ? "0.0"
                    : (
                        ((analysis.current.costOfGoods -
                          analysis.previous.costOfGoods) /
                          analysis.previous.costOfGoods) *
                        100
                      ).toFixed(1)}
                  %
                </td>
              </tr>

              <tr className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-green-50 dark:bg-green-950/20">
                <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                  الربح الإجمالي
                </td>
                <td className="px-6 py-4 font-black font-mono text-green-600 dark:text-green-400">
                  {formatCurrency(analysis.current.grossProfit)}
                </td>
                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">
                  {formatCurrency(analysis.previous.grossProfit)}
                </td>
                <td
                  className={`px-6 py-4 font-black font-mono ${
                    analysis.current.grossProfit - analysis.previous.grossProfit >=
                    0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.current.grossProfit -
                    analysis.previous.grossProfit >=
                  0
                    ? "+"
                    : "-"}
                  {formatCurrency(
                    Math.abs(
                      analysis.current.grossProfit -
                        analysis.previous.grossProfit
                    )
                  )}
                </td>
                <td
                  className={`px-6 py-4 font-black ${
                    analysis.current.grossMarginPercent >=
                    analysis.previous.grossMarginPercent
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {(analysis.current.grossMarginPercent -
                    analysis.previous.grossMarginPercent).toFixed(1)}
                  %
                </td>
              </tr>

              <tr className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                  المصروفات التشغيلية
                </td>
                <td className="px-6 py-4 font-mono text-slate-900 dark:text-white">
                  {formatCurrency(analysis.current.operatingExpenses)}
                </td>
                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">
                  {formatCurrency(analysis.previous.operatingExpenses)}
                </td>
                <td
                  className={`px-6 py-4 font-black font-mono ${
                    analysis.comparison.expenseChange <= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.comparison.expenseChange <= 0 ? "-" : "+"}
                  {formatCurrency(
                    Math.abs(analysis.comparison.expenseChange)
                  )}
                </td>
                <td
                  className={`px-6 py-4 font-black ${
                    analysis.comparison.expenseChangePercent <= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.comparison.expenseChangePercent.toFixed(1)}%
                </td>
              </tr>

              <tr className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/50">
                <td className="px-6 py-4 font-black text-slate-900 dark:text-white">
                  صافي الدخل
                </td>
                <td
                  className={`px-6 py-4 font-black font-mono ${
                    analysis.current.netIncome >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.current.netIncome >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(analysis.current.netIncome))}
                </td>
                <td
                  className={`px-6 py-4 font-black font-mono ${
                    analysis.previous.netIncome >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.previous.netIncome >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(analysis.previous.netIncome))}
                </td>
                <td
                  className={`px-6 py-4 font-black font-mono ${
                    analysis.comparison.profitChange >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.comparison.profitChange >= 0 ? "+" : "-"}
                  {formatCurrency(
                    Math.abs(analysis.comparison.profitChange)
                  )}
                </td>
                <td
                  className={`px-6 py-4 font-black ${
                    analysis.comparison.profitChangePercent >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {analysis.comparison.profitChangePercent.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
