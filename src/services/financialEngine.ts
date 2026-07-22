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
            transactions.push({
                type: 'قبض',
                sourceType: 'sales_invoice',
                sourceId: invoice.id || 'new',
                amount: netAmount,
                currency: invoice.currency,
                description: `إثبات فاتورة مبيعات - ${invoice.invoiceNumber || invoice.referenceNumber || invoice.id}`,
                partnerId: invoice.partnerId,
                partnerName: invoice.partnerName,
                debit: netAmount,
                credit: 0,
                costAmount: costAmount,
                createdBy: user.name,
                createdAt: now
            });

            if (paid > 0) {
                // 2. Payment Transaction
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
                    debit: 0, 
                    credit: paid,
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
            transactions.push({
                type: 'صرف',
                sourceType: 'purchase_invoice',
                sourceId: invoice.id || 'new',
                amount: netAmount,
                currency: invoice.currency,
                description: `إثبات فاتورة مشتريات - ${invoice.invoiceNumber || invoice.referenceNumber || invoice.id}`,
                partnerId: invoice.partnerId,
                partnerName: invoice.partnerName,
                debit: 0,
                credit: netAmount,
                createdBy: user.name,
                createdAt: now
            });

            if (paid > 0) {
                // 2. Payment Transaction
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
                    debit: paid,
                    credit: 0, 
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
        transactions.push({
            type: transType,
            sourceType: 'quick_financial_entry',
            sourceId: entry.id || 'new',
            amount: entry.netAmount,
            currency: entry.currency,
            description: mainDesc,
            partnerId: entry.partnerId,
            partnerName: entry.partnerName,
            debit: (transType === 'قبض' ? entry.netAmount : 0),
            credit: (transType === 'صرف' ? entry.netAmount : 0),
            createdBy: user.name,
            createdAt: now
        });

        // Cash flow transaction
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
                debit: (transType === 'قبض' ? 0 : paid),
                credit: (transType === 'قبض' ? paid : 0),
                createdBy: user.name,
                createdAt: now
            });
        }

        const agg: AggregationImpact = { quickEntriesCount: isReversion ? -1 : 1, transactionCount: isReversion ? -transactions.length : transactions.length };
        const mult = isReversion ? -1 : 1;
        
        if (transType === 'قبض') {
            if (entry.entryType === 'manual_sale') {
                agg.salesTotal = entry.netAmount * mult;
                // NOTE: manual quick-sale entries have no recorded cost/purchase price, so we
                // cannot know the real profit. We intentionally do NOT add this to profitsTotal
                // (previously it assumed 100% profit, which inflated the profit report).
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
}
