import { db, doc, collection, increment, runTransaction, getDocs, query, writeBatch, where } from "../firebase";
import { AggregationEngine, AggregationImpact } from "./aggregationEngine";
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
    type: 'ADD_TRANSACTION' | 'RECORD_INVOICE_PAYMENT' | 'CREATE_TRANSFER' | 'APPLY_INVOICE_IMPACT' | 'CREATE_QUICK_ENTRY';
    payload: any;
    user: any;
    timestamp?: string;
}

export class FinancialExecutionEngine {
    static async execute(operation: FinancialOperation) {
        if (!operation.operationId) throw new Error("operationId is required");
        if (!operation.user) throw new Error("user is required");

        return runTransaction(db, async (transaction) => {
            const opRef = doc(db, "operations", operation.operationId);
            const opSnap = await transaction.get(opRef);
            if (opSnap.exists() && opSnap.data().status === 'completed') {
                throw new Error(`Duplicate operation rejected: ${operation.operationId}`);
            }

            const result = await this.routeOperation(operation, transaction);
            transaction.set(opRef, cleanData({ ...operation, status: 'completed', completedAt: new Date().toISOString() }), { merge: true });
            return result;
        });
    }

    private static async routeOperation(operation: FinancialOperation, transaction: any) {
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

        return true;
    }

    static async rebuildFinancialState() {
        console.log("Starting Financial State Rebuild from Transactions Only...");
        
        // 1. Fetch all active transactions
        const transSnap = await getDocs(query(collection(db, "transactions"), where("recordStatus", "==", "active")));
        
        const customersToUpdate: Record<string, number> = {};
        const suppliersToUpdate: Record<string, number> = {};
        const cashBoxesToUpdate: Record<string, number> = {};
        const invoicesPaidToUpdate: Record<string, number> = {};

        for (const docSnap of transSnap.docs) {
            const trans = docSnap.data();
            
            if (trans.boxId) {
                cashBoxesToUpdate[trans.boxId] = cashBoxesToUpdate[trans.boxId] || 0;
                const amt = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? trans.amount : -trans.amount;
                cashBoxesToUpdate[trans.boxId] += amt;
            }

            if (trans.toBoxId && trans.sourceType === 'transfer') {
                cashBoxesToUpdate[trans.toBoxId] = cashBoxesToUpdate[trans.toBoxId] || 0;
                cashBoxesToUpdate[trans.toBoxId] += trans.amount;
            }

            if (trans.partnerId) {
                const isCustomer = trans.type === 'قبض' || trans.type === 'customer_receipt' || trans.sourceType === 'sales_invoice' || trans.sourceType === 'manual_sale';
                
                if (isCustomer) {
                    customersToUpdate[trans.partnerId] = customersToUpdate[trans.partnerId] || 0;
                    if (trans.sourceType === 'sales_invoice' || trans.sourceType === 'manual_sale') {
                         customersToUpdate[trans.partnerId] += trans.amount;
                    } else if (trans.type === 'قبض' || trans.type === 'customer_receipt') {
                         customersToUpdate[trans.partnerId] -= trans.amount;
                    }
                } else {
                    suppliersToUpdate[trans.partnerId] = suppliersToUpdate[trans.partnerId] || 0;
                    if (trans.sourceType === 'purchase_invoice' || trans.sourceType === 'manual_purchase') {
                         suppliersToUpdate[trans.partnerId] += trans.amount;
                    } else if (trans.type === 'صرف' || trans.type === 'manual_payment') {
                         suppliersToUpdate[trans.partnerId] -= trans.amount;
                    }
                }
            }

            if (trans.relatedId && trans.sourceType === 'invoice_payment') {
                invoicesPaidToUpdate[trans.relatedId] = invoicesPaidToUpdate[trans.relatedId] || 0;
                invoicesPaidToUpdate[trans.relatedId] += trans.amount;
            }
        }

        let batch = writeBatch(db);
        let batchCount = 0;
        const commitBatch = async () => {
            if (batchCount > 0) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
            }
        }

        // We MUST reset ALL existing cashBoxes, customers, suppliers balances to 0 first, but since we are doing absolute calculation, we can just fetch all and overwrite!
        const allBoxes = await getDocs(collection(db, "cashBoxes"));
        for (const b of allBoxes.docs) {
            batch.set(doc(db, "cashBoxes", b.id), { balance: cashBoxesToUpdate[b.id] || 0 }, { merge: true });
            batchCount++; if (batchCount >= 400) await commitBatch();
        }

        const allCust = await getDocs(collection(db, "customers"));
        for (const c of allCust.docs) {
            batch.set(doc(db, "customers", c.id), { balance: customersToUpdate[c.id] || 0 }, { merge: true });
            batchCount++; if (batchCount >= 400) await commitBatch();
        }

        const allSup = await getDocs(collection(db, "suppliers"));
        for (const s of allSup.docs) {
            batch.set(doc(db, "suppliers", s.id), { balance: suppliersToUpdate[s.id] || 0 }, { merge: true });
            batchCount++; if (batchCount >= 400) await commitBatch();
        }

        const allInv = await getDocs(collection(db, "invoices"));
        for (const i of allInv.docs) {
            batch.set(doc(db, "invoices", i.id), { paid: invoicesPaidToUpdate[i.id] || 0 }, { merge: true });
            batchCount++; if (batchCount >= 400) await commitBatch();
        }

        await commitBatch();
        return true;
    }
}
