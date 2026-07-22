import { db, doc, collection, increment, runTransaction, getDocs, query, writeBatch, where } from "../firebase";
import { AggregationEngine, AggregationImpact } from "./aggregationEngine";
import { calculateUnifiedCashBalances, calculateUnifiedPartnerBalances } from "../lib/financialUtils";
import { FinancialEngine as OldFinancialEngine } from "./financialEngine";

// local cleanData function since db.ts doesn't export it
function cleanData(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (typeof obj.toDate === 'function' || typeof obj.toMillis === 'function') return obj;
    if (Array.isArray(obj)) return obj.map(cleanData).filter(v => v !== undefined);
    
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && typeof obj[key] !== 'function') {
            cleaned[key] = cleanData(obj[key]);
        }
    });
    return cleaned;
}

export interface FinancialOperation {
    operationId: string;
    type: 'ADD_TRANSACTION' | 'RECORD_INVOICE_PAYMENT' | 'CREATE_TRANSFER' | 'APPLY_INVOICE_IMPACT' | 'CREATE_QUICK_ENTRY' | 'UPDATE_QUICK_ENTRY' | 'DELETE_QUICK_ENTRY';
    payload: any;
    user: any;
    timestamp?: string;
}

export class FinancialExecutionEngine {
    static async execute(operation: FinancialOperation) {
        if (!operation.operationId) throw new Error("operationId is required");
        if (!operation.user) throw new Error("user is required");

        let relatedTransactionIds: string[] = [];
        if (operation.type === 'DELETE_QUICK_ENTRY' || operation.type === 'UPDATE_QUICK_ENTRY') {
            const entryId = operation.payload.entry?.id || operation.payload.newEntry?.id;
            if (entryId) {
                try {
                    const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", entryId)));
                    relatedTransactionIds = transSnap.docs.map(d => d.id);
                } catch (e) {
                    console.error("Error pre-fetching related transaction IDs:", e);
                }
            }
        }

        return runTransaction(db, async (transaction) => {
            const opRef = doc(db, "operations", operation.operationId);
            const opSnap = await transaction.get(opRef);
            if (opSnap.exists() && opSnap.data().status === 'completed') {
                throw new Error(`Duplicate operation rejected: ${operation.operationId}`);
            }

            const result = await this.routeOperation(operation, transaction, relatedTransactionIds);
            transaction.set(opRef, cleanData({ ...operation, status: 'completed', completedAt: new Date().toISOString() }), { merge: true });
            return result;
        });
    }

    private static async routeOperation(operation: FinancialOperation, transaction: any, relatedTransactionIds: string[] = []) {
        const now = operation.timestamp || new Date().toISOString();
        const { type, payload, user } = operation;

        if (type === 'ADD_TRANSACTION') {
            const trans = payload.trans;
            const transRef = doc(collection(db, "transactions"));
            const transId = transRef.id;

            const boxAmount = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? trans.amount : -trans.amount;

            if (trans.boxId && boxAmount < 0) {
                const boxRef = doc(db, "cashBoxes", trans.boxId);
                const boxSnap = await transaction.get(boxRef);
                const currentBalance = boxSnap.exists() ? (boxSnap.data().balance || 0) : 0;
                if (currentBalance + boxAmount < 0) {
                    throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${currentBalance}`);
                }
            }

            transaction.set(transRef, cleanData({ ...trans, id: transId, recordStatus: 'active', createdAt: now, updatedAt: now }));

            const impact: AggregationImpact = { transactionCount: 1 };

            if (trans.partnerId) {
                const collectionName = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, collectionName, trans.partnerId);
                transaction.set(partnerRef, cleanData({ balance: increment(-trans.amount), updatedAt: now }), { merge: true });

                if (trans.type === 'قبض' || trans.type === 'customer_receipt') {
                    impact.receiptsTotal = trans.amount; impact.receivablesChange = -trans.amount;
                } else {
                    impact.paymentsTotal = trans.amount; impact.payablesChange = -trans.amount;
                }
            }

            if (trans.boxId) {
                const boxRef = doc(db, "cashBoxes", trans.boxId);
                transaction.set(boxRef, cleanData({ balance: increment(boxAmount), updatedAt: now }), { merge: true });
                impact.cashBalanceChange = boxAmount;
            }

            AggregationEngine.applyFinancialImpact(transaction as any, new Date(trans.createdAt || now), impact);
            return transId;
        }

        if (type === 'RECORD_INVOICE_PAYMENT') {
            const { invoice, paymentAmount, boxId, newPaid, newStatus } = payload;
            const transType = invoice.type === 'sale' ? 'قبض' : 'صرف';
            const boxAmount = (transType === 'قبض' || (transType as string) === 'customer_receipt') ? paymentAmount : -paymentAmount;

            if (boxId && boxAmount < 0) {
                const boxRef = doc(db, "cashBoxes", boxId);
                const boxSnap = await transaction.get(boxRef);
                const currentBalance = boxSnap.exists() ? (boxSnap.data().balance || 0) : 0;
                if (currentBalance + boxAmount < 0) {
                    throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${currentBalance}`);
                }
            }

            if (boxId) {
                const boxRef = doc(db, "cashBoxes", boxId);
                transaction.set(boxRef, cleanData({ balance: increment(boxAmount), updatedAt: now }), { merge: true });
            }

            const invoiceRef = doc(db, "invoices", invoice.id);
            transaction.set(invoiceRef, cleanData({ paid: newPaid, status: newStatus, updatedAt: now, updatedBy: user.id || "SYS", updatedByName: user.name || "System" }), { merge: true });

            const transRef = doc(collection(db, "transactions"));
            const trans = {
                id: transRef.id, type: transType, amount: paymentAmount, currency: invoice.currency || 'YER',
                description: `دفعة من الحساب للفاتورة: #${invoice.invoiceNumber || invoice.id?.slice(0, 8).toUpperCase()}`,
                partnerId: invoice.partnerId, partnerName: invoice.partnerName, boxId: boxId,
                relatedId: invoice.id, sourceType: 'invoice_payment', sourceId: invoice.id,
                recordStatus: 'active', createdAt: now, updatedAt: now, createdBy: user.name,
            };
            transaction.set(transRef, cleanData(trans));

            const impact: AggregationImpact = { transactionCount: 1 };
            if (trans.partnerId) {
                const partnerCollName = (transType === 'قبض' || (transType as string) === 'customer_receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, partnerCollName, trans.partnerId);
                transaction.set(partnerRef, cleanData({ balance: increment(-trans.amount), updatedAt: now }), { merge: true });

                if (transType === 'قبض' || (transType as string) === 'customer_receipt') {
                    impact.receiptsTotal = trans.amount; impact.receivablesChange = -trans.amount;
                } else {
                    impact.paymentsTotal = trans.amount; impact.payablesChange = -trans.amount;
                }
            }

            if (boxId) impact.cashBalanceChange = boxAmount;
            AggregationEngine.applyFinancialImpact(transaction as any, new Date(now), impact);
            return trans.id;
        }

        if (type === 'CREATE_TRANSFER') {
            const { fromBoxId, toBoxId, amount, currency, description } = payload;
            
            const fromBoxRef = doc(db, "cashBoxes", fromBoxId);
            const fromBoxSnap = await transaction.get(fromBoxRef);
            const currentBalance = fromBoxSnap.exists() ? (fromBoxSnap.data().balance || 0) : 0;
            if (currentBalance - amount < 0) {
                throw new Error(`رصيد الصندوق المحول منه لا يكفي. الرصيد الحالي: ${currentBalance}`);
            }

            const transRef = doc(collection(db, "transactions"));
            const transId = transRef.id;

            transaction.set(fromBoxRef, cleanData({ balance: increment(-amount), updatedAt: now }), { merge: true });
            const toBoxRef = doc(db, "cashBoxes", toBoxId);
            transaction.set(toBoxRef, cleanData({ balance: increment(amount), updatedAt: now }), { merge: true });

            transaction.set(transRef, cleanData({
                id: transId, type: 'صرف', sourceType: 'transfer', amount: amount, currency: currency, description: description,
                boxId: fromBoxId, toBoxId: toBoxId, recordStatus: 'active', createdAt: now, updatedAt: now, createdBy: user.name
            }));

            AggregationEngine.applyFinancialImpact(transaction as any, new Date(now), { transactionCount: 1 });
            return transId;
        }

        if (type === 'APPLY_INVOICE_IMPACT') {
            const { invoice } = payload;
            const impact = OldFinancialEngine.getInvoiceImpact(invoice, user);

            if (invoice.partnerId && impact.partnerBalanceChange !== 0) {
                const partnerColl = invoice.type === 'sale' ? "customers" : "suppliers";
                const partnerRef = doc(db, partnerColl, invoice.partnerId);
                transaction.set(partnerRef, cleanData({ balance: increment(impact.partnerBalanceChange), updatedAt: now }), { merge: true });
            }

            if (invoice.boxId && impact.cashBoxBalanceChange !== 0) {
                const boxRef = doc(db, "cashBoxes", invoice.boxId);
                const boxSnap = await transaction.get(boxRef);
                const currentBalance = boxSnap.exists() ? (boxSnap.data().balance || 0) : 0;
                if (currentBalance + impact.cashBoxBalanceChange < 0) {
                    throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${currentBalance}`);
                }

                transaction.set(boxRef, cleanData({ balance: increment(impact.cashBoxBalanceChange), updatedAt: now }), { merge: true });
            }

            for (const transData of impact.transactions) {
                const transRef = doc(collection(db, "transactions"));
                transaction.set(transRef, cleanData({ ...transData, id: transRef.id, recordStatus: 'active', updatedAt: now }));
            }

            if (impact.aggregationImpact) {
                AggregationEngine.applyFinancialImpact(transaction as any, new Date(invoice.createdAt || now), impact.aggregationImpact);
            }
            return true;
        }
        
        if (type === 'CREATE_QUICK_ENTRY') {
            const { entry } = payload;
            const entryRef = doc(collection(db, "quick_financial_entries"));
            const entryId = entryRef.id;

            let finalPartnerId = entry.partnerId;
            let partnerRefToSet = null;
            let newPartnerData = null;

            if (entry.autoCreatePartner && !finalPartnerId && entry.partnerName) {
                const partnerColl = (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
                const newPartnerRef = doc(collection(db, partnerColl));
                finalPartnerId = newPartnerRef.id;
                entry.partnerId = finalPartnerId;
                
                partnerRefToSet = newPartnerRef;
                newPartnerData = {
                    id: finalPartnerId,
                    name: entry.partnerName,
                    phone: entry.partnerPhone || "",
                    balance: 0,
                    recordStatus: 'active',
                    createdAt: now,
                    updatedAt: now
                };
            }

            // Calculate impact (in-memory)
            const impact = OldFinancialEngine.getQuickEntryImpact({ ...entry, id: entryId }, user);

            // Read the cashBox balance FIRST (before any writes)
            let currentBalance = 0;
            let shouldUpdateBox = false;
            let boxRef = null;
            if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
                boxRef = doc(db, "cashBoxes", entry.cashBoxId);
                const boxSnap = await transaction.get(boxRef);
                currentBalance = boxSnap.exists() ? (boxSnap.data().balance || 0) : 0;
                if (currentBalance + impact.cashBoxBalanceChange < 0) {
                    throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${currentBalance}`);
                }
                shouldUpdateBox = true;
            }

            // NOW we perform ALL writes
            if (partnerRefToSet && newPartnerData) {
                transaction.set(partnerRefToSet, cleanData(newPartnerData));
            }

            transaction.set(entryRef, cleanData({ ...entry, id: entryId, recordStatus: 'active', updatedAt: now, createdAt: entry.createdAt || now }));

            if (finalPartnerId && impact.partnerBalanceChange !== 0) {
                const partnerColl = (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, partnerColl, finalPartnerId);
                transaction.set(partnerRef, cleanData({ balance: increment(impact.partnerBalanceChange), updatedAt: now }), { merge: true });
            }

            if (shouldUpdateBox && boxRef) {
                transaction.set(boxRef, cleanData({ balance: increment(impact.cashBoxBalanceChange), updatedAt: now }), { merge: true });
            }

            for (const transData of impact.transactions) {
                const transRef = doc(collection(db, "transactions"));
                transaction.set(transRef, cleanData({ ...transData, id: transRef.id, recordStatus: 'active', updatedAt: now }));
            }

            if (impact.aggregationImpact) {
                AggregationEngine.applyFinancialImpact(transaction as any, new Date(entry.createdAt || now), impact.aggregationImpact);
            }

            return entryId;
        }

        if (type === 'DELETE_QUICK_ENTRY') {
            const { entry } = payload;
            const entryId = entry.id;

            // Calculate old impact to reverse it
            const impact = OldFinancialEngine.getQuickEntryImpact(entry, user);

            // Mark quick entry as deleted
            const entryRef = doc(db, "quick_financial_entries", entryId);
            transaction.set(entryRef, { recordStatus: 'deleted', updatedAt: now }, { merge: true });

            // Reverse partner balance
            if (entry.partnerId && impact.partnerBalanceChange !== 0) {
                const partnerColl = (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, partnerColl, entry.partnerId);
                transaction.set(partnerRef, { balance: increment(-impact.partnerBalanceChange), updatedAt: now }, { merge: true });
            }

            // Reverse cashBox balance
            if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
                const boxRef = doc(db, "cashBoxes", entry.cashBoxId);
                transaction.set(boxRef, { balance: increment(-impact.cashBoxBalanceChange), updatedAt: now }, { merge: true });
            }

            // Mark old transactions as deleted
            for (const transId of relatedTransactionIds) {
                transaction.set(doc(db, "transactions", transId), { recordStatus: 'deleted', updatedAt: now }, { merge: true });
            }

            // Apply negative of the original aggregation impact to adjust stats
            if (impact.aggregationImpact) {
                const negImpact: AggregationImpact = {};
                if (impact.aggregationImpact.transactionCount) negImpact.transactionCount = -impact.aggregationImpact.transactionCount;
                if (impact.aggregationImpact.receiptsTotal) negImpact.receiptsTotal = -impact.aggregationImpact.receiptsTotal;
                if (impact.aggregationImpact.paymentsTotal) negImpact.paymentsTotal = -impact.aggregationImpact.paymentsTotal;
                if (impact.aggregationImpact.receivablesChange) negImpact.receivablesChange = -impact.aggregationImpact.receivablesChange;
                if (impact.aggregationImpact.payablesChange) negImpact.payablesChange = -impact.aggregationImpact.payablesChange;
                if (impact.aggregationImpact.cashBalanceChange) negImpact.cashBalanceChange = -impact.aggregationImpact.cashBalanceChange;
                
                AggregationEngine.applyFinancialImpact(transaction as any, new Date(entry.createdAt || now), negImpact);
            }

            return entryId;
        }

        if (type === 'UPDATE_QUICK_ENTRY') {
            const { oldEntry, newEntry } = payload;
            const entryId = newEntry.id;

            const oldImpact = OldFinancialEngine.getQuickEntryImpact(oldEntry, user);
            const newImpact = OldFinancialEngine.getQuickEntryImpact(newEntry, user);

            // Update quick entry document
            const entryRef = doc(db, "quick_financial_entries", entryId);
            transaction.set(entryRef, cleanData({ ...newEntry, recordStatus: 'active', updatedAt: now }));

            // Adjust partner balance
            // If partner changed, we must reverse old partner's balance and apply new impact to new partner!
            if (oldEntry.partnerId === newEntry.partnerId) {
                const netPartnerChange = newImpact.partnerBalanceChange - oldImpact.partnerBalanceChange;
                if (newEntry.partnerId && netPartnerChange !== 0) {
                    const partnerColl = (newEntry.entryType === 'manual_sale' || newEntry.entryType === 'receipt') ? 'customers' : 'suppliers';
                    const partnerRef = doc(db, partnerColl, newEntry.partnerId);
                    transaction.set(partnerRef, { balance: increment(netPartnerChange), updatedAt: now }, { merge: true });
                }
            } else {
                // Reverse old partner
                if (oldEntry.partnerId && oldImpact.partnerBalanceChange !== 0) {
                    const oldPartnerColl = (oldEntry.entryType === 'manual_sale' || oldEntry.entryType === 'receipt') ? 'customers' : 'suppliers';
                    const oldPartnerRef = doc(db, oldPartnerColl, oldEntry.partnerId);
                    transaction.set(oldPartnerRef, { balance: increment(-oldImpact.partnerBalanceChange), updatedAt: now }, { merge: true });
                }
                // Apply to new partner
                if (newEntry.partnerId && newImpact.partnerBalanceChange !== 0) {
                    const newPartnerColl = (newEntry.entryType === 'manual_sale' || newEntry.entryType === 'receipt') ? 'customers' : 'suppliers';
                    const newPartnerRef = doc(db, newPartnerColl, newEntry.partnerId);
                    transaction.set(newPartnerRef, { balance: increment(newImpact.partnerBalanceChange), updatedAt: now }, { merge: true });
                }
            }

            // Adjust cashBox balance
            if (oldEntry.cashBoxId === newEntry.cashBoxId) {
                const netBoxChange = newImpact.cashBoxBalanceChange - oldImpact.cashBoxBalanceChange;
                if (newEntry.cashBoxId && netBoxChange !== 0) {
                    const boxRef = doc(db, "cashBoxes", newEntry.cashBoxId);
                    transaction.set(boxRef, { balance: increment(netBoxChange), updatedAt: now }, { merge: true });
                }
            } else {
                // Reverse old box
                if (oldEntry.cashBoxId && oldImpact.cashBoxBalanceChange !== 0) {
                    const oldBoxRef = doc(db, "cashBoxes", oldEntry.cashBoxId);
                    transaction.set(oldBoxRef, { balance: increment(-oldImpact.cashBoxBalanceChange), updatedAt: now }, { merge: true });
                }
                // Apply to new box
                if (newEntry.cashBoxId && newImpact.cashBoxBalanceChange !== 0) {
                    const newBoxRef = doc(db, "cashBoxes", newEntry.cashBoxId);
                    transaction.set(newBoxRef, { balance: increment(newImpact.cashBoxBalanceChange), updatedAt: now }, { merge: true });
                }
            }

            // Mark old transactions as deleted
            for (const transId of relatedTransactionIds) {
                transaction.set(doc(db, "transactions", transId), { recordStatus: 'deleted', updatedAt: now }, { merge: true });
            }

            // Write new transactions
            for (const transData of newImpact.transactions) {
                const transRef = doc(collection(db, "transactions"));
                transaction.set(transRef, cleanData({ ...transData, id: transRef.id, recordStatus: 'active', updatedAt: now }));
            }

            // Adjust aggregation stats
            if (oldImpact.aggregationImpact || newImpact.aggregationImpact) {
                const netAggImpact: AggregationImpact = {};
                const oldAgg = oldImpact.aggregationImpact || {};
                const newAgg = newImpact.aggregationImpact || {};

                const getVal = (o: any, n: any) => (n || 0) - (o || 0);

                netAggImpact.transactionCount = getVal(oldAgg.transactionCount, newAgg.transactionCount);
                netAggImpact.receiptsTotal = getVal(oldAgg.receiptsTotal, newAgg.receiptsTotal);
                netAggImpact.paymentsTotal = getVal(oldAgg.paymentsTotal, newAgg.paymentsTotal);
                netAggImpact.receivablesChange = getVal(oldAgg.receivablesChange, newAgg.receivablesChange);
                netAggImpact.payablesChange = getVal(oldAgg.payablesChange, newAgg.payablesChange);
                netAggImpact.cashBalanceChange = getVal(oldAgg.cashBalanceChange, newAgg.cashBalanceChange);

                AggregationEngine.applyFinancialImpact(transaction as any, new Date(newEntry.createdAt || now), netAggImpact);
            }

            return entryId;
        }

        return true;
    }

    static async rebuildFinancialState() {
        console.log("Starting Precise Financial State Rebuild...");
        
        // 1. Fetch all relevant data in parallel
        const [transSnap, allBoxes, allCust, allSup, allInv, allVch, allQE] = await Promise.all([
            getDocs(query(collection(db, "transactions"), where("recordStatus", "==", "active"))),
            getDocs(collection(db, "cashBoxes")),
            getDocs(collection(db, "customers")),
            getDocs(collection(db, "suppliers")),
            getDocs(collection(db, "invoices")),
            getDocs(collection(db, "vouchers")),
            getDocs(collection(db, "quick_financial_entries"))
        ]);

        const transactions = transSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const boxes = allBoxes.docs.map(d => ({ ...d.data(), id: d.id }));
        const customers = allCust.docs.map(d => ({ ...d.data(), id: d.id }));
        const suppliers = allSup.docs.map(d => ({ ...d.data(), id: d.id }));
        const invoices = allInv.docs.map(d => ({ ...d.data(), id: d.id }));
        const vouchers = allVch.docs.map(d => ({ ...d.data(), id: d.id }));
        const quickEntries = allQE.docs.map(d => ({ ...d.data(), id: d.id }));

        // 2. Use the unified calculation utilities
        const { boxBalances } = calculateUnifiedCashBalances(
            boxes as any[],
            transactions as any[],
            invoices as any[],
            vouchers as any[],
            quickEntries as any[]
        );

        // Sale/purchase invoices+entries are split per partner type so customers are never
        // matched against supplier-only invoices and vice versa (and to avoid re-summing
        // the same invoice list twice under two different partner sets).
        const saleInvoices = (invoices as any[]).filter(inv => (inv.type || 'sale').startsWith('sale'));
        const purchaseInvoices = (invoices as any[]).filter(inv => (inv.type || 'sale').startsWith('purchase'));
        const saleQuickEntries = (quickEntries as any[]).filter(qe => qe.entryType !== 'manual_purchase');
        const purchaseQuickEntries = (quickEntries as any[]).filter(qe => qe.entryType === 'manual_purchase');

        const customerBalances = calculateUnifiedPartnerBalances(
            customers as any[],
            transactions as any[],
            saleInvoices,
            vouchers as any[],
            saleQuickEntries,
            'customer'
        );

        const supplierBalances = calculateUnifiedPartnerBalances(
            suppliers as any[],
            transactions as any[],
            purchaseInvoices,
            vouchers as any[],
            purchaseQuickEntries,
            'supplier'
        );

        // 3. Batch Update Balances (cash boxes + customers + suppliers)
        let batch = writeBatch(db);
        let count = 0;

        const updateBatch = async (ref: any, data: any) => {
            batch.update(ref, data);
            count++;
            if (count >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        };

        const nowIso = new Date().toISOString();

        for (const bId of Object.keys(boxBalances)) {
            await updateBatch(doc(db, "cashBoxes", bId), { balance: boxBalances[bId], updatedAt: nowIso });
        }

        for (const cId of Object.keys(customerBalances)) {
            await updateBatch(doc(db, "customers", cId), { balance: customerBalances[cId].remaining, updatedAt: nowIso });
        }

        for (const sId of Object.keys(supplierBalances)) {
            await updateBatch(doc(db, "suppliers", sId), { balance: supplierBalances[sId].remaining, updatedAt: nowIso });
        }

        if (count > 0) await batch.commit();

        console.log("Financial State Rebuild Completed Successfully (cash boxes + customers + suppliers).");
        return true;
    }

}
