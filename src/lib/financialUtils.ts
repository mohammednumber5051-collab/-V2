import { CashBox, Invoice, QuickFinancialEntry, Transaction, Voucher } from "../types";

export function calculateUnifiedCashBalances(
    cashBoxes: CashBox[],
    transactions: Transaction[],
    invoices: Invoice[],
    vouchers: Voucher[],
    quickEntries: QuickFinancialEntry[]
): { boxBalances: Record<string, number>, totalBalance: number } {
    const boxBalances: Record<string, number> = {};

    // 1. Initialize with starting balances
    cashBoxes.forEach(b => {
        boxBalances[b.id!] = Number(b.initialBalance || 0);
    });

    // 2. Process Vouchers (They don't have associated transactions in this app)
    vouchers.forEach(vch => {
        if (vch.recordStatus === 'deleted') return;
        const amount = Number(vch.amount || 0);
        if (vch.boxId && amount > 0) {
            boxBalances[vch.boxId] = (boxBalances[vch.boxId] || 0) + (vch.type === 'receipt' ? amount : -amount);
        }
    });

    // 3. Process Transactions (The primary source of truth for cash movements)
    // We categorize transactions to handle them specifically
    const invoiceCashFromTransactions: Record<string, number> = {};
    const qeCashFromTransactions: Record<string, number> = {};

    transactions.forEach(tx => {
        if (tx.recordStatus === 'deleted') return;
        
        // Skip accrual-only records (non-cash)
        if (tx.sourceType === 'sales_invoice' || tx.sourceType === 'purchase_invoice' || tx.sourceType === 'quick_financial_entry' || tx.sourceType === 'manual_receipt' || tx.sourceType === 'manual_payment') {
            // These are bookkeeping records, not cash movements. 
            // Note: Quick entries create TWO transactions, one 'quick_financial_entry' (accrual) 
            // and one 'manual_receipt/payment' (cash). We skip the accrual one here.
            return;
        }
        
        const amount = Number(tx.amount || 0);
        
        // Track how much cash we've already counted from transactions for each invoice
        if (tx.sourceId) {
            if (tx.sourceType === 'invoice_payment') {
                // If it's linked to an invoice
                if (invoices.some(inv => inv.id === tx.sourceId)) {
                    invoiceCashFromTransactions[tx.sourceId] = (invoiceCashFromTransactions[tx.sourceId] || 0) + amount;
                }
            }
        }

        // Apply cash movement to boxes
        if (tx.type === 'تحويل') {
            if (tx.fromBoxId) boxBalances[tx.fromBoxId] = (boxBalances[tx.fromBoxId] || 0) - amount;
            if (tx.toBoxId) boxBalances[tx.toBoxId] = (boxBalances[tx.toBoxId] || 0) + amount;
        } else if (tx.boxId) {
            const changeAmount = (tx.type === 'قبض' || tx.type === 'customer_receipt') ? amount : -amount;
            boxBalances[tx.boxId] = (boxBalances[tx.boxId] || 0) + changeAmount;
        }
    });

    // 4. Process Invoices (Accounting for initial payments or payments NOT in transactions)
    invoices.forEach(inv => {
        if (inv.recordStatus === 'deleted' || !inv.boxId) return;
        
        const totalPaid = Number(inv.paid || 0);
        const alreadyInTransactions = invoiceCashFromTransactions[inv.id!] || 0;
        
        // The difference is the cash that was recorded on the invoice but has no matching transaction document
        // (This happens for invoices created with the legacy createInvoice method)
        const unrecordedPaid = Math.max(0, totalPaid - alreadyInTransactions);
        
        if (unrecordedPaid > 0) {
            const type = inv.type || 'sale';
            const isReturn = type.includes('return');
            const baseType = type.replace('_return', '');
            
            let boxChange = baseType === 'sale' ? unrecordedPaid : -unrecordedPaid;
            if (isReturn) boxChange = -boxChange;
            
            boxBalances[inv.boxId] = (boxBalances[inv.boxId] || 0) + boxChange;
        }
    });

    // 5. Process Quick Entries (Same logic as invoices)
    quickEntries.forEach(qe => {
        if (qe.recordStatus === 'deleted' || !qe.cashBoxId) return;
        
        const totalPaid = Number(qe.paidAmount || 0);
        const alreadyInTransactions = qeCashFromTransactions[qe.id!] || 0;
        const unrecordedPaid = Math.max(0, totalPaid - alreadyInTransactions);
        
        if (unrecordedPaid > 0) {
            const type = qe.entryType;
            const isIncoming = ['sale', 'manual_sale', 'customer_receipt', 'receipt'].includes(type);
            boxBalances[qe.cashBoxId] = (boxBalances[qe.cashBoxId] || 0) + (isIncoming ? unrecordedPaid : -unrecordedPaid);
        }
    });

    let totalBalance = 0;
    cashBoxes.forEach(b => {
        if (b.recordStatus !== 'deleted' && b.isActive !== false) {
            totalBalance += boxBalances[b.id!] || 0;
        }
    });

    return { boxBalances, totalBalance };
}


export function calculateUnifiedPartnerBalances(
    partners: { id?: string, name: string }[],
    transactions: Transaction[],
    invoices: Invoice[],
    vouchers: Voucher[],
    quickEntries: QuickFinancialEntry[],
    type: 'customer' | 'supplier'
): Record<string, { total: number, paid: number, remaining: number }> {
    const partnerBalances: Record<string, { total: number, paid: number, remaining: number }> = {};
    const isCustomer = type === 'customer';

    // Helper functions for deduplication to handle duplicate Firestore/Local Storage records
    const deduplicateById = <T extends { id?: string }>(arr: T[]): T[] => {
        const seen = new Set<string>();
        return arr.filter(item => {
            if (!item.id) return true;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    };

    const deduplicateTransactionShadows = (txs: Transaction[]): Transaction[] => {
        const seenShadows = new Set<string>();
        return txs.filter(tx => {
            if (tx.recordStatus === 'deleted') return true;
            if (tx.sourceId && tx.sourceType) {
                const isShadow = [
                    'sales_invoice',
                    'purchase_invoice',
                    'quick_financial_entry',
                    'manual_receipt',
                    'manual_payment'
                ].includes(tx.sourceType);
                
                if (isShadow) {
                    const key = `${tx.sourceId}-${tx.sourceType}`;
                    if (seenShadows.has(key)) {
                        console.warn(`Duplicate shadow transaction ignored in calculations: ${tx.id} for key ${key}`);
                        return false;
                    }
                    seenShadows.add(key);
                }
            }
            return true;
        });
    };

    const uniquePartners = deduplicateById(partners);
    const uniqueTransactions = deduplicateTransactionShadows(deduplicateById(transactions));
    const uniqueInvoices = deduplicateById(invoices);
    const uniqueVouchers = deduplicateById(vouchers);
    const uniqueQuickEntries = deduplicateById(quickEntries);

    uniquePartners.forEach(p => {
        if (p.id) {
            partnerBalances[p.id] = { total: 0, paid: 0, remaining: 0 };
        }
    });

    // Identify invoices that have associated transactions to avoid double-counting
    const invoiceIdsWithTransactions = new Set<string>();
    uniqueTransactions.forEach(t => {
        if (t.recordStatus !== 'deleted' && t.sourceId && (t.sourceType === 'sales_invoice' || t.sourceType === 'purchase_invoice')) {
            invoiceIdsWithTransactions.add(t.sourceId);
        }
    });

    // 1. Process Invoices
    // ✅ UNIFIED: Consistent calculation for invoice impact on partner balances
    // Formula: total = netAmount (after discount), paid = cash received/paid, remaining = total - paid
    uniqueInvoices.forEach(inv => {
        if (inv.recordStatus === 'deleted' || !inv.partnerId) return;
        if (!partnerBalances[inv.partnerId]) return;

        const type = inv.type || 'sale';
        const isReturn = type.includes('return');
        const baseType = type.replace('_return', '');
        
        // ✅ CRITICAL: Calculate net amount AFTER discount
        // Example: Invoice 1000 with 100 discount = 900 net
        // Remaining = 900 (net) - 500 (paid) = 400
        const netAmount = (inv.total || 0) - (inv.discount || 0);
        
        // ✅ RETURNS: If it's a return, it reduces the total balance (customer/supplier owes less)
        const sign = isReturn ? -1 : 1;
        partnerBalances[inv.partnerId].total += (netAmount * sign);

        // ✅ PAYMENTS: If no transactions exist for this invoice, use the 'paid' field
        // This applies to legacy invoices created without explicit transaction records
        if (!invoiceIdsWithTransactions.has(inv.id!)) {
            partnerBalances[inv.partnerId].paid += ((inv.paid || 0) * sign);
        }
    });

    // 2. Process Vouchers
    uniqueVouchers.forEach(vch => {
        if (vch.recordStatus === 'deleted' || !vch.partnerId) return;
        if (!partnerBalances[vch.partnerId]) return;

        partnerBalances[vch.partnerId].paid += (vch.amount || 0);
        
        // If it's a receipt/payment that also acts as an accrual (e.g. for service), 
        // we might need to add it to 'total' if it's not already covered.
        // But usually Vouchers are pure cash.
    });

    // 3. Process Transactions
    uniqueTransactions.forEach(tx => {
        if (tx.recordStatus === 'deleted' || !tx.partnerId) return;
        if (!partnerBalances[tx.partnerId]) return;

        // Skip shadow accrual records
        if (tx.sourceType === 'sales_invoice' || tx.sourceType === 'purchase_invoice' || tx.sourceType === 'quick_financial_entry') return;

        const amount = Number(tx.amount || 0);
        const isReceipt = tx.type === 'قبض';
        
        if (isCustomer) {
            if (isReceipt) {
                partnerBalances[tx.partnerId].paid += amount;
            } else {
                partnerBalances[tx.partnerId].paid -= amount;
            }
        } else {
            if (!isReceipt) {
                partnerBalances[tx.partnerId].paid += amount;
            } else {
                partnerBalances[tx.partnerId].paid -= amount;
            }
        }
    });

    // 4. Process Quick Entries (Accrual part)
    // QE's also have shadow transactions for cash, so we only handle the 'paid' field if no transactions exist.
    const qeIdsWithTransactions = new Set<string>();
    uniqueTransactions.forEach(t => {
        if (t.recordStatus !== 'deleted' && t.sourceId && (t.sourceType === 'quick_financial_entry' || t.sourceType === 'manual_receipt' || t.sourceType === 'manual_payment')) {
            qeIdsWithTransactions.add(t.sourceId);
        }
    });

    uniqueQuickEntries.forEach(qe => {
        if (qe.recordStatus === 'deleted' || !qe.partnerId) return;
        if (!partnerBalances[qe.partnerId]) return;

        const type = qe.entryType;
        const isAccrual = type === 'manual_sale' || type === 'manual_purchase';

        // Accrual (Sale/Purchase)
        if (isAccrual) {
            const netAmount = (qe.amount || 0) - (qe.discount || 0);
            partnerBalances[qe.partnerId].total += netAmount;
        }

        // Cash part
        if (!qeIdsWithTransactions.has(qe.id!)) {
            partnerBalances[qe.partnerId].paid += (qe.paidAmount || 0);
        }
    });

    // ✅ FINAL CALCULATION: Remaining balance
    // Remaining = Total Invoice Amount (after discount) - Total Paid Amount
    // Example: 900 (total after 100 discount) - 500 (paid) = 400 (remaining due)
    Object.keys(partnerBalances).forEach(id => {
        partnerBalances[id].remaining = partnerBalances[id].total - partnerBalances[id].paid;
    });

    return partnerBalances;
}

// ✅ NEW: Get Partner Account Statement
// Returns chronologically ordered transactions with running balances
// partnerType: 'customer' (sales invoices) or 'supplier' (purchase invoices)
export function getPartnerStatement(
    partnerId: string,
    invoices: any[],
    transactions: any[],
    partnerData: any,
    dateStart: string = '1970-01-01',
    dateEnd: string = '2099-12-31'
): any {
    const entries: any[] = [];
    let runningBalance = 0;

    // Filter relevant transactions
    const relevantTransactions = transactions
        .filter(t => 
            t.partnerId === partnerId &&
            t.recordStatus !== 'deleted' &&
            t.createdAt >= dateStart &&
            t.createdAt <= dateEnd
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Calculate opening balance (before date range)
    const beforeTransactions = transactions
        .filter(t =>
            t.partnerId === partnerId &&
            t.recordStatus !== 'deleted' &&
            t.createdAt < dateStart
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Opening balance calculation
    let openingBalance = 0;
    beforeTransactions.forEach(t => {
        openingBalance += (t.debit || 0) - (t.credit || 0);
    });
    runningBalance = openingBalance;

    // Process transactions in chronological order
    relevantTransactions.forEach(t => {
        const amount = (t.debit || 0) - (t.credit || 0);
        runningBalance += amount;

        entries.push({
            date: t.createdAt,
            description: t.description || 'عملية',
            type: amount >= 0 ? 'debit' : 'credit',
            amount: Math.abs(amount),
            balance: runningBalance,
            referenceId: t.sourceId,
            referenceType: t.sourceType
        });
    });

    return {
        partnerId: partnerId,
        partnerName: partnerData?.name || 'Unknown',
        partnerType: partnerData?.type || 'customer',
        currency: 'YER',
        openingBalance: openingBalance,
        closingBalance: runningBalance,
        totalDebits: entries.filter(e => e.type === 'debit').reduce((sum, e) => sum + e.amount, 0),
        totalCredits: entries.filter(e => e.type === 'credit').reduce((sum, e) => sum + e.amount, 0),
        entries: entries,
        periodStart: dateStart,
        periodEnd: dateEnd,
        generatedAt: new Date().toISOString()
    };
}

// ✅ NEW: Get Cash Box Account Statement
// Returns chronologically ordered cash box transactions with running balances
export function getCashBoxStatement(
    boxId: string,
    transactions: any[],
    boxData: any,
    dateStart: string = '1970-01-01',
    dateEnd: string = '2099-12-31'
): any {
    const entries: any[] = [];
    let runningBalance = 0;

    // Filter relevant transactions
    const relevantTransactions = transactions
        .filter(t =>
            (t.boxId === boxId || t.fromBoxId === boxId || t.toBoxId === boxId) &&
            t.recordStatus !== 'deleted' &&
            t.createdAt >= dateStart &&
            t.createdAt <= dateEnd
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Calculate opening balance
    const beforeTransactions = transactions
        .filter(t =>
            (t.boxId === boxId || t.fromBoxId === boxId || t.toBoxId === boxId) &&
            t.recordStatus !== 'deleted' &&
            t.createdAt < dateStart
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let openingBalance = boxData?.initialBalance || 0;
    beforeTransactions.forEach(t => {
        if (t.boxId === boxId) {
            openingBalance += (t.credit || 0) - (t.debit || 0); // Cash in - Cash out
        } else if (t.fromBoxId === boxId) {
            openingBalance -= (t.amount || 0); // Transfer out
        } else if (t.toBoxId === boxId) {
            openingBalance += (t.amount || 0); // Transfer in
        }
    });
    runningBalance = openingBalance;

    // Process transactions
    relevantTransactions.forEach(t => {
        let amount = 0;
        let type = 'debit';

        if (t.boxId === boxId) {
            // Direct transaction to this box
            amount = (t.credit || 0) - (t.debit || 0); // Positive = in, Negative = out
            type = amount >= 0 ? 'credit' : 'debit';
        } else if (t.fromBoxId === boxId) {
            // Transfer out
            amount = -(t.amount || 0);
            type = 'debit';
        } else if (t.toBoxId === boxId) {
            // Transfer in
            amount = (t.amount || 0);
            type = 'credit';
        }

        runningBalance += amount;

        entries.push({
            date: t.createdAt,
            description: t.description || 'عملية',
            type: type,
            amount: Math.abs(amount),
            balance: runningBalance,
            referenceId: t.sourceId || t.id,
            referenceType: t.sourceType
        });
    });

    return {
        boxId: boxId,
        boxName: boxData?.name || 'Unknown',
        currency: boxData?.currency || 'YER',
        openingBalance: openingBalance,
        closingBalance: runningBalance,
        totalIn: entries.filter(e => e.type === 'credit').reduce((sum, e) => sum + e.amount, 0),
        totalOut: entries.filter(e => e.type === 'debit').reduce((sum, e) => sum + e.amount, 0),
        entries: entries,
        periodStart: dateStart,
        periodEnd: dateEnd,
        generatedAt: new Date().toISOString()
    };
}
