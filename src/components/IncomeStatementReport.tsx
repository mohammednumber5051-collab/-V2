import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { generateIncomeStatement } from "../lib/financialUtils";
import { motion } from "motion/react";

interface IncomeStatementReportProps {
  invoices: any[];
  expenses: any[];
  dateRange?: { start: string; end: string };
}

export default function IncomeStatementReport({
  invoices,
  expenses,
  dateRange,
}: IncomeStatementReportProps) {
  const statement = useMemo(
    () => generateIncomeStatement(invoices, expenses, dateRange),
    [invoices, expenses, dateRange]
  );

  const formatCurrency = (value: number) =>
    value.toLocaleString("ar-EG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 size={24} className="text-blue-400" />
          <h2 className="text-2xl font-black">قائمة الدخل</h2>
        </div>
        <p className="text-sm text-slate-400">
          تقرير شامل للإيرادات والتكاليف والأرباح
        </p>
      </div>

      {/* Income Statement */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {/* Revenue Section */}
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-blue-50 dark:bg-blue-950/30">
                <td className="px-6 py-4 font-black text-slate-900 dark:text-white">
                  إيرادات المبيعات
                </td>
                <td className="px-6 py-4 text-right font-black text-blue-600 dark:text-blue-400 font-mono">
                  {formatCurrency(statement.totalRevenue)} YER
                </td>
              </tr>

              {/* COGS Section */}
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <td className="px-6 py-4 pl-12 font-semibold text-slate-600 dark:text-slate-400">
                  - تكلفة البضاعة المباعة
                </td>
                <td className="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-400">
                  ({formatCurrency(statement.costOfGoods)}) YER
                </td>
              </tr>

              {/* Gross Profit */}
              <tr className="border-b-2 border-slate-300 dark:border-slate-700 bg-green-50 dark:bg-green-950/20">
                <td className="px-6 py-4 font-black text-slate-900 dark:text-white">
                  الربح الإجمالي
                </td>
                <td className="px-6 py-4 text-right font-black text-green-600 dark:text-green-400 font-mono">
                  {formatCurrency(statement.grossProfit)} YER
                </td>
              </tr>

              {/* Gross Margin */}
              <tr className="border-b border-slate-200 dark:border-slate-800 text-sm">
                <td className="px-6 py-3 pl-12 text-slate-600 dark:text-slate-500">
                  هامش الربح الإجمالي
                </td>
                <td className="px-6 py-3 text-right text-green-600 dark:text-green-400 font-semibold">
                  {statement.grossMarginPercent.toFixed(1)}%
                </td>
              </tr>

              {/* Operating Expenses Header */}
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-red-50 dark:bg-red-950/30">
                <td colSpan={2} className="px-6 py-3 font-bold text-red-700 dark:text-red-400">
                  المصروفات التشغيلية:
                </td>
              </tr>

              {/* Expense Categories */}
              {Object.entries(statement.expensesByCategory).map(
                ([category, amount]: [string, any]) => (
                  <tr
                    key={category}
                    className="border-b border-slate-200 dark:border-slate-800"
                  >
                    <td className="px-6 py-3 pl-12 text-slate-600 dark:text-slate-400">
                      {category}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-600 dark:text-slate-400 font-mono">
                      ({formatCurrency(amount)}) YER
                    </td>
                  </tr>
                )
              )}

              {/* Total Operating Expenses */}
              <tr className="border-b-2 border-slate-300 dark:border-slate-700">
                <td className="px-6 py-4 font-black text-slate-900 dark:text-white">
                  إجمالي المصروفات التشغيلية
                </td>
                <td className="px-6 py-4 text-right font-black text-red-600 dark:text-red-400 font-mono">
                  ({formatCurrency(statement.operatingExpenses)}) YER
                </td>
              </tr>

              {/* Net Income */}
              <tr className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <td className="px-6 py-4 font-black text-lg">صافي الدخل</td>
                <td
                  className={`px-6 py-4 text-right font-black text-lg font-mono ${
                    statement.netIncome >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {statement.netIncome >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(statement.netIncome))} YER
                </td>
              </tr>

              {/* Profit Margin */}
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                  هامش صافي الربح
                </td>
                <td
                  className={`px-6 py-4 text-right font-bold font-mono ${
                    statement.profitMarginPercent >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {statement.profitMarginPercent.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 border border-blue-200 dark:border-blue-800"
        >
          <div className="text-xs font-black text-slate-600 dark:text-slate-400 mb-2">
            الإيرادات الإجمالية
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono break-all">
            {formatCurrency(statement.totalRevenue)}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-4 border border-orange-200 dark:border-orange-800"
        >
          <div className="text-xs font-black text-slate-600 dark:text-slate-400 mb-2">
            التكاليف
          </div>
          <div className="text-xl font-black text-orange-600 dark:text-orange-400 font-mono break-all">
            {formatCurrency(statement.costOfGoods)}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-purple-50 dark:bg-purple-950/30 rounded-xl p-4 border border-purple-200 dark:border-purple-800"
        >
          <div className="text-xs font-black text-slate-600 dark:text-slate-400 mb-2">
            المصروفات
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono break-all">
            {formatCurrency(statement.operatingExpenses)}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className={`${
            statement.netIncome >= 0
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
          } rounded-xl p-4 border`}
        >
          <div className="text-xs font-black text-slate-600 dark:text-slate-400 mb-2">
            صافي الدخل
          </div>
          <div
            className={`text-xl font-black font-mono break-all ${
              statement.netIncome >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {statement.netIncome >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(statement.netIncome))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
