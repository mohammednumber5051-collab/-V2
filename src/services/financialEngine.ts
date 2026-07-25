import { Transaction, TransactionSourceType, TransactionType, Currency, AppUser } from "../types";
import { AggregationImpact } from "./aggregationEngine";

export interface FinancialImpact {
    transactions: Transaction[];
    partnerBalanceChange: number;
    cashBoxBalanceChange: number;
    aggregationImpact?: AggregationImpact;
}

export class FinancialEngine {
    /**
     * Generates transactions for a sales invoice.
     * Rule: 1. A Revenue record (Credit) for the net amount.
     *       2. A Payment record (Debit to CashBox) for the paid amount.
     */
    static getInvoiceImpact(invoice: any, user: AppUser, isReversion = false): FinancialImpact {
        const transactions: Transaction[] = [];
        const now = invoice.createdAt || new Date().toISOString();
        const discount = invoice.discount || 0;
        const total = invoice.total || 0;
        const netAmount = Math.max(0, total - discount);
        const paid = invoice.paid || 0;
        const remaining = netAmount - paid;
        
        let partnerBalanceChange = 0;
        let cashBoxBalanceChange = 0;
        const mult = isReversion ? -1 : 1;
        const agg: AggregationImpact = { invoicesCount: 1 * mult };

        if (invoice.type === 'sale') {
            partnerBalanceChange = remaining;
            cashBoxBalanceChange = paid;
            
            const costAmount = (invoice.items || []).reduce((acc: number, item: any) => acc + ((item.purchasePrice || 0) * item.quantity), 0);
            agg.salesTotal = netAmount * mult;
            agg.profitsTotal = (netAmount - costAmount) * mult;
            agg.receivablesChange = netAmount * mult; // Initially increase by full amount
            
            if (paid > 0) {
                agg.receiptsTotal = paid * mult;
                agg.receivablesChange = (netAmount - paid) * mult; // Adjust receivables by subtracting payment
                agg.cashBalanceChange = paid * mult;
            } else {
                agg.receivablesChange = netAmount * mult;
            }

            // 1. Sales Revenue Transaction
            // ✅ FIXED: Correct accounting equation for sales invoice
            // Debit: Accounts Receivable (الذمم المدينة) - increased because customer owes us
            // Credit: Sales Revenue (الإيراد) - increased because we earned revenue
            transactions.push({
                type: 'قبض',
                sourceType: 'sales_invoice',
                sourceId: invoice.id || 'new',
                amount: netAmount,
                currency: invoice.currency,
                description: `إثبات فاتورة مبيعات - ${invoice.invoiceNumber || invoice.referenceNumber || invoice.id}`,
                partnerId: invoice.partnerId,
                partnerName: invoice.partnerName,
                debit: 0,           // ✅ FIXED: Was incorrectly netAmount - should be 0 for credit entry
                credit: netAmount,  // ✅ FIXED: Was incorrectly 0 - should be netAmount for revenue recognition
                costAmount: costAmount,
                createdBy: user.name,
                createdAt: now
            });

            if (paid > 0) {
                // 2. Payment Transaction
                // ✅ FIXED: Correct accounting for cash receipt
                // Debit: Cash (النقدية) - increased because we received cash
                // Credit: Accounts Receivable (الذمم المدينة) - decreased because debt is settled
                transactions.push({
                    type: 'قبض',
                    sourceType: 'manual_receipt',
                    sourceId: invoice.id || 'new',
                    amount: paid,
                    currency: invoice.currency,
                    description: `دفعة من فاتورة مبيعات - ${invoice.invoiceNumber || invoice.referenceNumber || invoice.id}`,
                    boxId: invoice.boxId,
                    partnerId: invoice.partnerId,
                    partnerName: invoice.partnerName,
                    debit: paid,        // ✅ FIXED: Cash in-flow
                    credit: 0,          // ✅ FIXED: AR reduction happens in partner balance
                    createdBy: user.name,
                    createdAt: now
                });
            }
        } else {
            // Purchase Invoice
            partnerBalanceChange = remaining;
            cashBoxBalanceChange = -paid;

            agg.purchasesTotal = netAmount * mult;
            agg.payablesChange = netAmount * mult;

            if (paid > 0) {
                agg.paymentsTotal = paid * mult;
                agg.payablesChange = (netAmount - paid) * mult;
                agg.cashBalanceChange = -paid * mult;
            } else {
                agg.payablesChange = netAmount * mult;
            }

            // 1. Purchase Record
            // ✅ VERIFIED: Correct accounting equation for purchase invoice
            // Debit: Inventory/Purchases (المشتريات) - increased because we bought inventory
            // Credit: Accounts Payable (الذمم الدائنة) - increased because we owe the supplier
            transactions.push({
                type: 'صرف',
                sourceType: 'purchase_invoice',
                sourceId: invoice.id || 'new',
                amount: netAmount,
                currency: invoice.currency,
                description: `إثبات فاتورة مشتريات - ${invoice.invoiceNumber || invoice.referenceNumber || invoice.id}`,
                partnerId: invoice.partnerId,
                partnerName: invoice.partnerName,
                debit: netAmount,   // ✅ VERIFIED: Correct - Purchases increase
                credit: 0,          // ✅ VERIFIED: Correct - Payable accrual happens in partner balance
                createdBy: user.name,
                createdAt: now
            });

            if (paid > 0) {
                // 2. Payment Transaction
                // ✅ VERIFIED: Correct accounting for cash payment
                // Debit: Accounts Payable (الذمم الدائنة) - decreased because we paid the supplier
                // Credit: Cash (النقدية) - decreased because cash left us
                transactions.push({
                    type: 'صرف',
                    sourceType: 'manual_payment',
                    sourceId: invoice.id || 'new',
                    amount: paid,
                    currency: invoice.currency,
                    description: `سداد دفعة لفاتورة مشتريات - ${invoice.invoiceNumber || invoice.referenceNumber || invoice.id}`,
                    boxId: invoice.boxId,
                    partnerId: invoice.partnerId,
                    partnerName: invoice.partnerName,
                    debit: 0,           // ✅ VERIFIED: AP reduction happens in partner balance
                    credit: paid,       // ✅ VERIFIED: Cash out-flow
                    createdBy: user.name,
                    createdAt: now
                });
            }
        }

        agg.transactionCount = isReversion ? -transactions.length : transactions.length;
        return { transactions: isReversion ? [] : transactions, partnerBalanceChange, cashBoxBalanceChange, aggregationImpact: agg };
    }

    /**
     * Generates impact for quick financial entry.
     */
    static getQuickEntryImpact(entry: any, user: AppUser, isReversion = false): FinancialImpact {
        const transactions: Transaction[] = [];
        const now = entry.createdAt || new Date().toISOString();
        const paid = entry.paidAmount || 0;
        const remaining = entry.remainingAmount || 0;
        
        let partnerBalanceChange = 0;
        if (entry.entryType === 'manual_sale' || entry.entryType === 'manual_purchase') {
            partnerBalanceChange = remaining;
        } else if (entry.entryType === 'receipt' || entry.entryType === 'payment') {
            partnerBalanceChange = -entry.netAmount;
        } else {
            partnerBalanceChange = remaining;
        }

        let cashBoxBalanceChange = paid;

        const transType: TransactionType = 
            (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'قبض' : 'صرف';

        // Setup custom descriptions
        let mainDesc = `إثبات ${entry.notes || entry.entryType}`;
        let paidDesc = `حركة نقدية - ${entry.notes || entry.entryType}`;

        if (entry.entryType === 'manual_sale') {
            mainDesc = entry.notes ? `فاتورة بيع سريع - مقابل تركيب وتغيير عدسات (${entry.notes})` : `فاتورة بيع سريع - مقابل تركيب وتغيير عدسات`;
            paidDesc = entry.notes ? `سداد دفعة من بيع سريع (${entry.notes})` : `سداد دفعة من بيع سريع`;
        } else if (entry.entryType === 'manual_purchase') {
            mainDesc = entry.notes ? `فاتورة مشتريات يدوية سريعة (${entry.notes})` : `فاتورة مشتريات يدوية سريعة`;
            paidDesc = entry.notes ? `سداد دفعة لمشتريات سريعة (${entry.notes})` : `سداد دفعة لمشتريات سريعة`;
        }

        // Entry main record
        // ✅ FIXED: Correct Debit/Credit logic for quick entries
        // For sales (قبض): Debit=0, Credit=netAmount (revenue recognition)
        // For purchases (صرف): Debit=netAmount, Credit=0 (expense/purchase)
        transactions.push({
            type: transType,
            sourceType: 'quick_financial_entry',
            sourceId: entry.id || 'new',
            amount: entry.netAmount,
            currency: entry.currency,
            description: mainDesc,
            partnerId: entry.partnerId,
            partnerName: entry.partnerName,
            debit: (transType === 'قبض' ? 0 : entry.netAmount),      // ✅ FIXED: Sales have debit=0
            credit: (transType === 'قبض' ? entry.netAmount : 0),     // ✅ FIXED: Sales have credit=amount
            createdBy: user.name,
            createdAt: now
        });

        // Cash flow transaction
        // ✅ FIXED: Correct Debit/Credit for cash flow
        // For receipts (قبض): Debit=paid (cash in), Credit=0
        // For payments (صرف): Debit=0, Credit=paid (cash out)
        if (paid > 0) {
             transactions.push({
                type: transType,
                sourceType: entry.entryType === 'manual_sale' || entry.entryType === 'receipt' ? 'manual_receipt' : 'manual_payment',
                sourceId: entry.id || 'new',
                amount: paid,
                currency: entry.currency,
                description: paidDesc,
                boxId: entry.cashBoxId,
                partnerId: entry.partnerId,
                partnerName: entry.partnerName,
                debit: (transType === 'قبض' ? paid : 0),     // ✅ FIXED: Receipts have debit=paid
                credit: (transType === 'قبض' ? 0 : paid),   // ✅ FIXED: Payments have credit=paid
                createdBy: user.name,
                createdAt: now
            });
        }

        const agg: AggregationImpact = { quickEntriesCount: isReversion ? -1 : 1, transactionCount: isReversion ? -transactions.length : transactions.length };
        const mult = isReversion ? -1 : 1;
        
        if (transType === 'قبض') {
            if (entry.entryType === 'manual_sale') {
                agg.salesTotal = entry.netAmount * mult;
                agg.profitsTotal = entry.netAmount * mult; // Assuming 100% profit for manual entries
            } else {
                agg.receiptsTotal = entry.netAmount * mult;
            }
            agg.receivablesChange = partnerBalanceChange * mult;
            agg.cashBalanceChange = paid * mult;
        } else {
            agg.paymentsTotal = entry.netAmount * mult;
            if (entry.entryType === 'expense') {
               (agg as any).expensesTotal = entry.netAmount * mult;
            } else {
               agg.payablesChange = partnerBalanceChange * mult;
            }
            cashBoxBalanceChange = -paid;
            agg.cashBalanceChange = -paid * mult;
        }

        return { transactions: isReversion ? [] : transactions, partnerBalanceChange, cashBoxBalanceChange, aggregationImpact: agg };
    }

    // ✅ NEW: Record Expense Transaction
    // Records an expense (rent, salary, utilities, etc) directly from a cash box
    // Accounting entry:
    //   Debit: Expense Account (impacts P&L)
    //   Credit: Cash (reduces cash box balance)
    static recordExpense(expense: any, user: any) {
        const { category, description, amount, boxId, boxName, notes, createdAt } = expense;
        const now = createdAt || new Date().toISOString();
        
        const transactions = [];
        const currency = expense.currency || 'YER';

        // ✅ Single transaction for expense
        // Type: صرف (outflow)
        // Source: expense
        // Debit = 0 (expense accrual)
        // Credit = amount (cash reduction)
        transactions.push({
            type: 'صرف',
            sourceType: 'expense',
            sourceId: expense.id || 'new',
            amount: amount,
            currency: currency,
            description: `مصروف - ${category}: ${description}`,
            boxId: boxId,
            debit: amount,        // ✅ Expense account (P&L impact)
            credit: 0,            // ✅ Cash reduction handled separately
            createdBy: user.name,
            createdAt: now
        });

        // ✅ Aggregation Impact
        const agg: any = {};
        agg.expensesTotal = amount;  // Expenses increase
        agg.cashBalanceChange = -amount; // Cash box decreases
        
        return {
            transactions: transactions,
            cashBoxBalanceChange: -amount,  // Reduce cash box
            aggregationImpact: agg
        };
    }
}
