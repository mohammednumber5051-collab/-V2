/**
 * db.ts — Data Access Layer
 *
 * All financial write operations are delegated to FinancialExecutionEngine.
 * This file retains CRUD helpers for non-financial collections and provides
 * the public API surface that components depend on.
 *
 * Financial operations follow ONE pipeline only:
 *   component → dbService.X() → FinancialExecutionEngine.execute() → Firestore
 */

import {
    db, collection, addDoc, updateDoc, deleteDoc, doc, setDoc,
    getDocs, getDoc, query, where, orderBy, Timestamp, increment,
    runTransaction, writeBatch, limit, startAfter, QueryConstraint
} from "../firebase";
import { authService } from "./authService";
import { syncEngine } from "./syncEngine";
import { localDbService } from "./localDb";
import { FinancialExecutionEngine } from "./financialExecutionEngine";
import { StoreSettings } from "../types";

// Re-export cleanData so components that import it continue to work
export const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (obj instanceof Date) return obj;
    if (typeof (obj as any).toDate === "function" || typeof (obj as any).toMillis === "function") return obj;
    if (Array.isArray(obj)) return obj.map(cleanData).filter((v) => v !== undefined);
    const cleaned: any = {};
    Object.keys(obj).forEach((key) => {
        if (obj[key] !== undefined && typeof obj[key] !== "function") {
            cleaned[key] = cleanData(obj[key]);
        }
    });
    return cleaned;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentUser() {
    return authService.getCurrentUser();
}

function userForEngine() {
    const u = currentUser();
    return u ? { id: u.id, name: u.name } : { id: "SYS", name: "System" };
}

// ─── Public dbService ─────────────────────────────────────────────────────────

export const dbService = {

    // ── Audit ────────────────────────────────────────────────────────────────

    async logAudit(action: any, entityType: any, entityId: any, description: any, oldValue: any, newValue: any, extraDetails: any) {
        try {
            const u = currentUser();
            await addDoc(collection(db, "audit_logs"), cleanData({
                action, entityType, entityId, description, oldValue, newValue, extraDetails,
                userId: u?.id || "SYS", userName: u?.name || "System",
                timestamp: new Date().toISOString(),
            }));
        } catch (e) { /* non-critical */ }
    },

    // ── Generic CRUD ─────────────────────────────────────────────────────────

    async getAll(collectionName: string) {
        try {
            const snap = await getDocs(collection(db, collectionName));
            const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
            return data;
        } catch (e) {
            console.warn(`[dbService] getAll ${collectionName} falling back to localDb:`, e);
            return localDbService.getAll(collectionName);
        }
    },

    async getPaginated(collectionName: string, pageSize: number, lastVisible: any, filters: any[] = []) {
        const constraints: QueryConstraint[] = [];
        filters.forEach((f) => constraints.push(where(f.field, f.op, f.value)));
        // Only apply orderBy + cursor when there are no equality filters, to avoid requiring
        // composite Firestore indexes. Filtered collections (e.g. invoices by type) should
        // use getAll() + client-side filter instead of getPaginated.
        if (filters.length === 0) {
            constraints.push(orderBy('createdAt', 'desc'));
            if (lastVisible) constraints.push(startAfter(lastVisible));
        }
        constraints.push(limit(pageSize + 1));
        const q = query(collection(db, collectionName), ...constraints);
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        const hasMore = data.length > pageSize;
        const resultData = hasMore ? data.slice(0, pageSize) : data;
        const lastVisibleDoc = snap.docs[resultData.length - 1];
        return { data: resultData, lastDoc: lastVisibleDoc, lastVisibleDoc, hasMore };
    },

    async getArchived(collectionName: string) {
        const snap = await getDocs(query(collection(db, collectionName), where("isArchived", "==", true)));
        return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },

    async add(collectionName: string, data: any) {
        const docRef = await addDoc(collection(db, collectionName), cleanData({
            ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }));
        return docRef.id;
    },

    async update(collectionName: string, id: string, data: any) {
        await setDoc(doc(db, collectionName, id), cleanData({ ...data, updatedAt: new Date().toISOString() }), { merge: true });
    },

    async softDelete(collectionName: string, id: string) {
        await deleteDoc(doc(db, collectionName, id));
    },

    async delete(collectionName: string, id: string) {
        await deleteDoc(doc(db, collectionName, id));
    },

    // ── INVOICE OPERATIONS ───────────────────────────────────────────────────
    // All delegate to FinancialExecutionEngine for single-pipeline guarantee.

    async createInvoice(invoice: any): Promise<string> {
        const user = userForEngine();
        return FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("CREATE_INVOICE"),
            type: "CREATE_INVOICE",
            payload: { invoice },
            user,
        });
    },

    async updateInvoiceData(oldInvoice: any, newInvoice: any): Promise<void> {
        const user = userForEngine();
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("UPDATE_INVOICE"),
            type: "UPDATE_INVOICE",
            payload: { oldInvoice, newInvoice },
            user,
        });
    },

    async deleteInvoiceData(invoice: any): Promise<void> {
        const user = userForEngine();
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("DELETE_INVOICE"),
            type: "DELETE_INVOICE",
            payload: { invoice },
            user,
        });
    },

    async recordInvoicePayment(invoice: any, paymentAmount: number, boxId: string, newPaid: number, newStatus: string): Promise<string> {
        const user = userForEngine();
        return FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("RECORD_INVOICE_PAYMENT"),
            type: "RECORD_INVOICE_PAYMENT",
            payload: { invoice, paymentAmount, boxId, newPaid, newStatus },
            user,
        });
    },

    // ── TRANSACTION OPERATIONS ───────────────────────────────────────────────

    async addTransaction(trans: any): Promise<string> {
        const user = userForEngine();
        return FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("ADD_TRANSACTION"),
            type: "ADD_TRANSACTION",
            payload: { trans },
            user,
        });
    },

    async updateTransactionData(oldTrans: any, newTrans: any): Promise<void> {
        const user = userForEngine();
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("UPDATE_TRANSACTION"),
            type: "UPDATE_TRANSACTION",
            payload: { oldTrans, newTrans },
            user,
        });
    },

    async deleteTransactionData(trans: any): Promise<void> {
        const user = userForEngine();
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("DELETE_TRANSACTION"),
            type: "DELETE_TRANSACTION",
            payload: { trans },
            user,
        });
    },

    async createTransfer(fromBoxId: string, toBoxId: string, amount: number, currency: string, description: string): Promise<string> {
        const user = userForEngine();
        return FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("CREATE_TRANSFER"),
            type: "CREATE_TRANSFER",
            payload: { fromBoxId, toBoxId, amount, currency, description },
            user,
        });
    },

    // ── VOUCHER OPERATIONS ───────────────────────────────────────────────────

    async addVoucher(voucher: any): Promise<string> {
        const user = userForEngine();
        return FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("ADD_VOUCHER"),
            type: "ADD_VOUCHER",
            payload: { voucher },
            user,
        });
    },

    async updateVoucher(oldVoucher: any, newVoucher: any): Promise<void> {
        const user = userForEngine();
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("UPDATE_VOUCHER"),
            type: "UPDATE_VOUCHER",
            payload: { oldVoucher, newVoucher },
            user,
        });
    },

    async deleteVoucher(voucher: any): Promise<void> {
        const user = userForEngine();
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("DELETE_VOUCHER"),
            type: "DELETE_VOUCHER",
            payload: { voucher },
            user,
        });
    },

    // ── CASH BOX ─────────────────────────────────────────────────────────────

    /** Direct balance override — only used for initial setup / admin correction */
    async updateBoxBalance(boxId: string, amount: number): Promise<void> {
        await setDoc(doc(db, "cashBoxes", boxId), { balance: amount }, { merge: true });
    },

    // ── SETTINGS ─────────────────────────────────────────────────────────────

    async getStoreSettings(): Promise<StoreSettings | null> {
        const snap = await getDocs(collection(db, "settings"));
        return snap.docs[0] ? (snap.docs[0].data() as StoreSettings) : null;
    },

    async updateStoreSettings(data: any): Promise<void> {
        const snap = await getDocs(collection(db, "settings"));
        if (snap.docs[0]) {
            await setDoc(doc(db, "settings", snap.docs[0].id), cleanData(data), { merge: true });
        } else {
            await addDoc(collection(db, "settings"), cleanData(data));
        }
    },

    // ── FINANCIAL REBUILD ─────────────────────────────────────────────────────

    async recalculateFinancials() {
        const result = await FinancialExecutionEngine.rebuildFinancialState();
        await localDbService.clearLocalData();
        return result;
    },

    async resetAllFinancialData() {
        localStorage.clear();
        window.location.reload();
    },

    // ── LEGACY NO-OPS (kept for API compatibility) ────────────────────────────

    async deleteAllTransactions() { /* no-op */ },
    async createFullDatabaseBackup() { return null; },
    async restoreFullDatabaseBackup(_backupJson: any, _callback: (msg: string) => void) { return null; },
    async dumpData() { return null; },
};

// ─── Event emission wrapper ──────────────────────────────────────────────────
// Emit DATA_CHANGED after every mutating dbService call so the UI refreshes.
// Only wrap methods that don't start with 'get', 'reset', or 'dump' and are functions.

const NON_MUTATING = new Set([
    "getAll", "getPaginated", "getArchived", "getStoreSettings",
    // NOTE: recalculateFinancials IS mutating — it rewrites cashBox/partner balances.
    // It must NOT be here so DATA_CHANGED fires after a full rebuild.
    "resetAllFinancialData", "dumpData",
    "createFullDatabaseBackup", "restoreFullDatabaseBackup", "logAudit",
]);

Object.keys(dbService).forEach((method) => {
    if (NON_MUTATING.has(method)) return;
    const original = (dbService as any)[method];
    if (typeof original !== "function") return;
    (dbService as any)[method] = async function (...args: any[]) {
        const result = await original.apply(this, args);
        try { syncEngine.emit("DATA_CHANGED"); } catch (_) { /* non-critical */ }
        return result;
    };
});
