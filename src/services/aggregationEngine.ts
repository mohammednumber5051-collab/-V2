import { doc, increment } from "firebase/firestore";
import { db } from "../firebase";

export interface AggregationImpact {
    salesTotal?: number;
    purchasesTotal?: number;
    receiptsTotal?: number;
    paymentsTotal?: number;
    expensesTotal?: number;
    profitsTotal?: number;
    receivablesChange?: number;
    payablesChange?: number;
    transactionCount?: number;
    cashBalanceChange?: number;
    invoicesCount?: number;
    quickEntriesCount?: number;
}

export class AggregationEngine {
    static getDailySummaryRef(dateStr: string) {
        return doc(db, "daily_financial_summaries", dateStr);
    }
    static getMonthlySummaryRef(monthStr: string) {
        return doc(db, "monthly_financial_summaries", monthStr);
    }
    static getDashboardCacheRef() {
        return doc(db, "dashboard_cache", "global");
    }

    static applyFinancialImpact(batch: any, date: Date, impact: AggregationImpact) {
        // Date strings in local timezone YYYY-MM-DD
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - userTimezoneOffset);
        const dateStr = localDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const monthStr = dateStr.substring(0, 7); // YYYY-MM

        const dailyRef = this.getDailySummaryRef(dateStr);
        const monthlyRef = this.getMonthlySummaryRef(monthStr);
        const dashboardRef = this.getDashboardCacheRef();

        const dailyUpdates: any = { date: dateStr, updatedAt: new Date().toISOString() };
        const monthlyUpdates: any = { month: monthStr, updatedAt: new Date().toISOString() };
        const dashboardUpdates: any = { updatedAt: new Date().toISOString() };

        let updateDaily = false;
        let updateMonthly = false;
        let updateDashboard = false;

        const addField = (val: number | undefined, key: string, daily = true, monthly = true, dashboard = false) => {
            if (val && val !== 0) {
                const inc = increment(val);
                if (daily) { dailyUpdates[key] = inc; updateDaily = true; }
                if (monthly) { monthlyUpdates[key] = inc; updateMonthly = true; }
                if (dashboard) { dashboardUpdates[key] = inc; updateDashboard = true; }
            }
        };

        addField(impact.salesTotal, 'salesTotal');
        addField(impact.purchasesTotal, 'purchasesTotal');
        addField(impact.receiptsTotal, 'receiptsTotal', true, false); // Receipts/Payments usually daily focused
        addField(impact.paymentsTotal, 'paymentsTotal', true, false);
        addField(impact.expensesTotal, 'expensesTotal', true, true);
        addField(impact.profitsTotal, 'profitsTotal', true, true);
        
        // Receivables/Payables affect daily snapshot and global dashboard
        addField(impact.receivablesChange, 'receivablesTotal', true, false, true);
        addField(impact.payablesChange, 'payablesTotal', true, false, true);

        addField(impact.transactionCount, 'transactionCount', true, false);
        
        // Cash Balance affects global dashboard and monthly net flow
        if (impact.cashBalanceChange && impact.cashBalanceChange !== 0) {
            dashboardUpdates.totalCashBalance = increment(impact.cashBalanceChange);
            monthlyUpdates.netCashFlow = increment(impact.cashBalanceChange);
            updateDashboard = true;
            updateMonthly = true;
        }

        addField(impact.invoicesCount, 'totalInvoices', false, false, true);
        addField(impact.quickEntriesCount, 'totalQuickEntries', false, false, true);

        // Daily todaySales / Month monthSales for dashboard
        if (impact.salesTotal && impact.salesTotal !== 0) {
            const today = new Date().toISOString().split('T')[0];
            if (dateStr === today) {
                dashboardUpdates.todaySales = increment(impact.salesTotal);
                updateDashboard = true;
            }
            const currentMonth = today.substring(0, 7);
            if (monthStr === currentMonth) {
                dashboardUpdates.monthSales = increment(impact.salesTotal);
                updateDashboard = true;
            }
        }

        if (updateDaily) batch.set(dailyRef, dailyUpdates, { merge: true });
        if (updateMonthly) batch.set(monthlyRef, monthlyUpdates, { merge: true });
        if (updateDashboard) batch.set(dashboardRef, dashboardUpdates, { merge: true });
    }

    static applyEntityCount(batch: any, entity: 'customers' | 'suppliers' | 'products' | 'cashBoxes', change: number) {
        if (change === 0) return;
        const dashboardRef = this.getDashboardCacheRef();
        const map: any = {
            customers: 'totalCustomers',
            suppliers: 'totalSuppliers',
            products: 'totalProducts',
            cashBoxes: 'totalCashBoxes'
        };
        if (map[entity]) {
            batch.set(dashboardRef, { [map[entity]]: increment(change), updatedAt: new Date().toISOString() }, { merge: true });
        }
    }

    static applyEntityStatusCount(batch: any, statusType: 'lowStock' | 'repair' | 'specialOrder' | 'warranty', change: number) {
        if (change === 0) return;
        const dashboardRef = this.getDashboardCacheRef();
        const map: any = {
            lowStock: 'lowStockCount',
            repair: 'repairQueueCount',
            specialOrder: 'specialOrdersReadyCount',
            warranty: 'activeWarrantiesCount'
        };
        if (map[statusType]) {
            batch.set(dashboardRef, { [map[statusType]]: increment(change), updatedAt: new Date().toISOString() }, { merge: true });
        }
    }
}
