import { QuickFinancialEntry, AppUser } from "../types";
import { db, doc, collection, increment, runTransaction, getDocs, query, writeBatch, where } from "../firebase";
import { syncEngine } from "./syncEngine";
import { FinancialExecutionEngine } from "./financialExecutionEngine";
import { FinancialEngine } from "./financialEngine";
import { AggregationEngine } from "./aggregationEngine";

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

function getPartnerColl(entry: any): string {
    return (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
}

export class FinancialEngineService {
    static async createQuickEntry(entry: Omit<QuickFinancialEntry, 'id'>, user: AppUser) {
        const entryId = await FinancialExecutionEngine.execute({
            operationId: `quick_entry_${Date.now()}_${Math.random()}`,
            type: 'CREATE_QUICK_ENTRY',
            payload: { entry },
            user
        });

        syncEngine.emit('ENTRY_CREATED');
        syncEngine.emit('CASHBOX_UPDATED');
        syncEngine.emit('CUSTOMER_UPDATED');
        syncEngine.emit('DATA_CHANGED');

        return entryId as string;
    }

    /**
     * Update a quick entry:
     * 1. Reverse the old entry's financial impacts (cashbox, partner, aggregation)
     * 2. Apply the new entry's financial impacts
     * 3. Void old auto-generated transactions, create new ones
     * 4. Update the document
     */
    static async updateQuickEntry(oldEntry: QuickFinancialEntry, newEntry: QuickFinancialEntry, user: AppUser) {
        if (!oldEntry.id) throw new Error("oldEntry must have an id");

        const reversalImpact = FinancialEngine.getQuickEntryImpact(oldEntry, user, true);
        const newImpact = FinancialEngine.getQuickEntryImpact({ ...newEntry, id: oldEntry.id }, user, false);

        const now = new Date().toISOString();

        // Pre-fetch old transactions (can't query inside runTransaction)
        const oldTxSnap = await getDocs(
            query(collection(db, "transactions"), where("sourceId", "==", oldEntry.id))
        );

        const batch = writeBatch(db);

        // 1. Update the entry document (full replace, preserve id/createdAt/createdBy)
        batch.set(doc(db, "quick_financial_entries", oldEntry.id), cleanData({
            ...newEntry,
            id: oldEntry.id,
            createdAt: oldEntry.createdAt,
            createdBy: oldEntry.createdBy,
            updatedAt: now,
        }));

        // 2. Void old auto-generated transactions
        oldTxSnap.forEach(txDoc => {
            batch.update(txDoc.ref, { recordStatus: 'deleted', updatedAt: now });
        });

        // 3. Create new transactions
        for (const transData of newImpact.transactions) {
            const transRef = doc(collection(db, "transactions"));
            batch.set(transRef, cleanData({
                ...transData,
                id: transRef.id,
                sourceId: oldEntry.id,
                recordStatus: 'active',
                updatedAt: now,
            }));
        }

        // 4. Net cashbox changes (handle same-box case by accumulating)
        const boxChanges: Record<string, number> = {};
        if (oldEntry.cashBoxId && reversalImpact.cashBoxBalanceChange !== 0) {
            boxChanges[oldEntry.cashBoxId] = (boxChanges[oldEntry.cashBoxId] || 0) + reversalImpact.cashBoxBalanceChange;
        }
        if (newEntry.cashBoxId && newImpact.cashBoxBalanceChange !== 0) {
            boxChanges[newEntry.cashBoxId] = (boxChanges[newEntry.cashBoxId] || 0) + newImpact.cashBoxBalanceChange;
        }
        for (const [boxId, change] of Object.entries(boxChanges)) {
            if (change !== 0) {
                batch.update(doc(db, "cashBoxes", boxId), { balance: increment(change), updatedAt: now });
            }
        }

        // 5. Net partner balance changes (handle same-partner case)
        const partnerChanges: Record<string, { coll: string; delta: number }> = {};
        if (oldEntry.partnerId && oldEntry.partnerType !== 'none' && reversalImpact.partnerBalanceChange !== 0) {
            const key = oldEntry.partnerId;
            if (!partnerChanges[key]) partnerChanges[key] = { coll: getPartnerColl(oldEntry), delta: 0 };
            partnerChanges[key].delta += reversalImpact.partnerBalanceChange;
        }
        if (newEntry.partnerId && newEntry.partnerType !== 'none' && newImpact.partnerBalanceChange !== 0) {
            const key = newEntry.partnerId;
            if (!partnerChanges[key]) partnerChanges[key] = { coll: getPartnerColl(newEntry), delta: 0 };
            partnerChanges[key].delta += newImpact.partnerBalanceChange;
        }
        for (const [pid, { coll, delta }] of Object.entries(partnerChanges)) {
            if (delta !== 0) {
                batch.update(doc(db, coll, pid), { balance: increment(delta), updatedAt: now });
            }
        }

        await batch.commit();

        // 6. Update aggregation (reversal then new) — each needs its own runTransaction
        if (reversalImpact.aggregationImpact) {
            await runTransaction(db, async (tx) => {
                AggregationEngine.applyFinancialImpact(tx as any, new Date(oldEntry.createdAt || now), reversalImpact.aggregationImpact!);
            });
        }
        if (newImpact.aggregationImpact) {
            await runTransaction(db, async (tx) => {
                AggregationEngine.applyFinancialImpact(tx as any, new Date(newEntry.createdAt || now), newImpact.aggregationImpact!);
            });
        }

        syncEngine.emit('ENTRY_UPDATED');
        syncEngine.emit('CASHBOX_UPDATED');
        syncEngine.emit('CUSTOMER_UPDATED');
        syncEngine.emit('DATA_CHANGED');
    }

    /**
     * Delete a quick entry:
     * 1. Reverse all financial impacts (cashbox, partner, aggregation)
     * 2. Void auto-generated transactions
     * 3. Mark the entry as deleted
     */
    static async deleteQuickEntry(entry: QuickFinancialEntry, user: AppUser) {
        if (!entry.id) throw new Error("entry must have an id");

        const reversalImpact = FinancialEngine.getQuickEntryImpact(entry, user, true);

        const now = new Date().toISOString();

        // Pre-fetch associated transactions
        const txSnap = await getDocs(
            query(collection(db, "transactions"), where("sourceId", "==", entry.id))
        );

        const batch = writeBatch(db);

        // 1. Mark entry as deleted (soft-delete)
        batch.update(doc(db, "quick_financial_entries", entry.id), {
            recordStatus: 'deleted',
            updatedAt: now,
        });

        // 2. Void associated transactions
        txSnap.forEach(txDoc => {
            batch.update(txDoc.ref, { recordStatus: 'deleted', updatedAt: now });
        });

        // 3. Reverse cashbox balance
        if (entry.cashBoxId && reversalImpact.cashBoxBalanceChange !== 0) {
            batch.update(doc(db, "cashBoxes", entry.cashBoxId), {
                balance: increment(reversalImpact.cashBoxBalanceChange),
                updatedAt: now,
            });
        }

        // 4. Reverse partner balance
        if (entry.partnerId && entry.partnerType !== 'none' && reversalImpact.partnerBalanceChange !== 0) {
            const partnerColl = getPartnerColl(entry);
            batch.update(doc(db, partnerColl, entry.partnerId), {
                balance: increment(reversalImpact.partnerBalanceChange),
                updatedAt: now,
            });
        }

        await batch.commit();

        // 5. Update aggregation
        if (reversalImpact.aggregationImpact) {
            await runTransaction(db, async (tx) => {
                AggregationEngine.applyFinancialImpact(tx as any, new Date(entry.createdAt || now), reversalImpact.aggregationImpact!);
            });
        }

        syncEngine.emit('ENTRY_DELETED');
        syncEngine.emit('CASHBOX_UPDATED');
        syncEngine.emit('CUSTOMER_UPDATED');
        syncEngine.emit('DATA_CHANGED');
    }
}
