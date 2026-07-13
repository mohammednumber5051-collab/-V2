/**
 * FinancialExecutionEngine — The ONE and ONLY accounting engine.
 *
 * Every financial write in the application is routed through this class.
 * No balance, aggregation, or transaction document may be written anywhere else.
 *
 * Pipeline (enforced for every operation):
 *   Validation → Transaction Start → Document Write → Partner Balance →
 *   Cash Box → Aggregation → Audit Log → Transaction Commit
 *
 * Key guarantees:
 *  - Atomicity: every operation is a single Firestore runTransaction.
 *  - Idempotency: each operation carries a unique operationId; duplicates are rejected.
 *  - Correct discount: netAmount = total − discount; remaining = netAmount − paid.
 *  - Full Transaction documents for every cash movement.
 *  - Aggregation (daily/monthly/dashboard) updated on every write.
 *  - Pre-fetch phase outside runTransaction eliminates getDocs-inside-transaction race condition.
 */

import {
    db, doc, collection, increment, runTransaction,
    getDocs, query, where, writeBatch, addDoc
} from "../firebase";
import { AggregationEngine, AggregationImpact } from "./aggregationEngine";
import { calculateUnifiedCashBalances, calculateUnifiedPartnerBalances } from "../lib/financialUtils";
import { FinancialEngine } from "./financialEngine";

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanData(obj: any): any {
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
}

/** Browser-compatible UUID v4 generator — never uses Math.random() */
function generateId(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback: crypto.getRandomValues
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type OperationType =
    | "CREATE_INVOICE"
    | "UPDATE_INVOICE"
    | "DELETE_INVOICE"
    | "RECORD_INVOICE_PAYMENT"
    | "ADD_TRANSACTION"
    | "UPDATE_TRANSACTION"
    | "DELETE_TRANSACTION"
    | "CREATE_TRANSFER"
    | "ADD_VOUCHER"
    | "UPDATE_VOUCHER"
    | "DELETE_VOUCHER"
    | "CREATE_QUICK_ENTRY"
    | "UPDATE_QUICK_ENTRY"
    | "DELETE_QUICK_ENTRY";

export interface FinancialOperation {
    operationId: string;
    type: OperationType;
    payload: any;
    user: { id?: string; name: string };
    timestamp?: string;
}

// Pre-fetched data that cannot safely be read inside runTransaction
interface PrefetchedContext {
    linkedTransIds?: string[];
}

// ─── Invoice accounting helpers ──────────────────────────────────────────────

interface InvoiceAccounting {
    netAmount: number;
    remaining: number;
    partnerBalanceChange: number;  // positive = partner owes more (or we owe more for purchase)
    cashBoxChange: number;          // positive = cashBox increases
    partnerCollection: "customers" | "suppliers";
    aggregationImpact: AggregationImpact;
    transactionDocs: any[];
}

function computeInvoiceAccounting(invoice: any, user: { name: string }, isReversal = false): InvoiceAccounting {
    const discount = Number(invoice.discount || 0);
    const total = Number(invoice.total || 0);
    const paid = Number(invoice.paid || 0);
    const netAmount = Math.max(0, total - discount);
    const remaining = Math.max(0, netAmount - paid);
    const now = invoice.createdAt || new Date().toISOString();

    const isSale = invoice.type === "sale" || invoice.type === "sale_return";
    const isReturn = invoice.type === "sale_return" || invoice.type === "purchase_return";
    const sign = isReturn ? -1 : 1;               // returns flip the direction
    const mult = isReversal ? -1 : 1;             // reversals negate everything

    const partnerCollection: "customers" | "suppliers" = isSale ? "customers" : "suppliers";

    // Partner balance: customer/supplier owes the remaining amount
    const partnerBalanceChange = remaining * sign * mult;

    // Cash box: sale receives cash (+), purchase pays cash (-)
    const cashDir = isSale ? 1 : -1;
    const cashBoxChange = paid * cashDir * sign * mult;

    // Cost of goods (for profit calculation on sales)
    const costAmount = (invoice.items || []).reduce(
        (acc: number, item: any) => acc + (Number(item.purchasePrice || 0) * Number(item.quantity || 0)),
        0
    );

    // Aggregation impact
    const agg: AggregationImpact = {
        invoicesCount: 1 * mult,
        transactionCount: 0,
    };

    if (isSale && !isReturn) {
        agg.salesTotal = netAmount * mult;
        agg.profitsTotal = (netAmount - costAmount) * mult;
        agg.receivablesChange = remaining * mult;
        if (paid > 0) {
            agg.receiptsTotal = paid * mult;
            agg.cashBalanceChange = paid * mult;
        }
    } else if (!isSale && !isReturn) {
        agg.purchasesTotal = netAmount * mult;
        agg.payablesChange = remaining * mult;
        if (paid > 0) {
            agg.paymentsTotal = paid * mult;
            agg.cashBalanceChange = -paid * mult;
        }
    } else if (isSale && isReturn) {
        // sale_return
        agg.salesTotal = -netAmount * mult;
        agg.profitsTotal = -(netAmount - costAmount) * mult;
        agg.receivablesChange = -remaining * mult;
        if (paid > 0) {
            agg.receiptsTotal = -paid * mult;
            agg.cashBalanceChange = -paid * mult;
        }
    } else {
        // purchase_return
        agg.purchasesTotal = -netAmount * mult;
        agg.payablesChange = -remaining * mult;
        if (paid > 0) {
            agg.paymentsTotal = -paid * mult;
            agg.cashBalanceChange = paid * mult;
        }
    }

    // Transaction documents (only for non-reversal; reversal just marks old ones deleted)
    const transactionDocs: any[] = [];
    if (!isReversal) {
        const transType = isSale ? "قبض" : "صرف";
        const sourceTypeMain = isSale
            ? (isReturn ? "sales_return_invoice" : "sales_invoice")
            : (isReturn ? "purchase_return_invoice" : "purchase_invoice");

        // 1. Accrual / revenue recognition record
        transactionDocs.push({
            type: transType,
            sourceType: sourceTypeMain,
            sourceId: invoice.id,
            amount: netAmount,
            currency: invoice.currency || "YER",
            description: `إثبات ${isSale ? (isReturn ? "مرتجع مبيعات" : "فاتورة مبيعات") : (isReturn ? "مرتجع مشتريات" : "فاتورة مشتريات")} - ${invoice.invoiceNumber || invoice.id?.slice(0, 8).toUpperCase() || ""}`,
            partnerId: invoice.partnerId,
            partnerName: invoice.partnerName,
            debit: transType === "قبض" ? netAmount : 0,
            credit: transType === "صرف" ? netAmount : 0,
            costAmount,
            createdBy: user.name,
            createdAt: now,
        });

        // 2. Cash movement record (only if paid > 0)
        if (paid > 0) {
            transactionDocs.push({
                type: transType,
                sourceType: isSale ? "manual_receipt" : "manual_payment",
                sourceId: invoice.id,
                amount: paid,
                currency: invoice.currency || "YER",
                description: `دفعة من ${isSale ? (isReturn ? "مرتجع مبيعات" : "فاتورة مبيعات") : (isReturn ? "مرتجع مشتريات" : "فاتورة مشتريات")} - ${invoice.invoiceNumber || invoice.id?.slice(0, 8).toUpperCase() || ""}`,
                boxId: invoice.boxId,
                partnerId: invoice.partnerId,
                partnerName: invoice.partnerName,
                debit: transType === "قبض" ? 0 : paid,
                credit: transType === "قبض" ? paid : 0,
                createdBy: user.name,
                createdAt: now,
            });
        }

        agg.transactionCount = transactionDocs.length;
    }

    return { netAmount, remaining, partnerBalanceChange, cashBoxChange, partnerCollection, aggregationImpact: agg, transactionDocs };
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export class FinancialExecutionEngine {

    /**
     * Entry point for all financial operations.
     * Phase 1: Pre-fetch data needed outside runTransaction (fixes getDocs-inside-transaction race).
     * Phase 2: Execute atomically inside runTransaction.
     */
    static async execute(operation: FinancialOperation): Promise<any> {
        if (!operation.operationId) throw new Error("operationId is required");
        if (!operation.user) throw new Error("user is required");

        // Phase 1 — Pre-fetch (safe reads outside transaction)
        const context = await this.prefetch(operation);

        // Phase 2 — Atomic execution
        return runTransaction(db, async (txn) => {
            const now = operation.timestamp || new Date().toISOString();

            // Idempotency guard
            const opRef = doc(db, "financial_operations", operation.operationId);
            const opSnap = await txn.get(opRef);
            if (opSnap.exists() && opSnap.data()?.status === "completed") {
                return opSnap.data()?.result ?? null;
            }

            const result = await this.route(operation, txn, context, now);

            // Mark operation as completed
            txn.set(opRef, cleanData({
                ...operation,
                status: "completed",
                result,
                completedAt: now,
            }), { merge: true });

            return result;
        });
    }

    // ── Pre-fetch phase ────────────────────────────────────────────────────────

    private static async prefetch(operation: FinancialOperation): Promise<PrefetchedContext> {
        const { type, payload } = operation;

        // Operations that query linked transactions (getDocs must be OUTSIDE runTransaction)
        if (type === "DELETE_QUICK_ENTRY" || type === "UPDATE_QUICK_ENTRY") {
            const entryId = type === "DELETE_QUICK_ENTRY" ? payload.entry.id : payload.newEntry.id;
            const snap = await getDocs(
                query(collection(db, "transactions"),
                    where("sourceId", "==", entryId),
                    where("recordStatus", "==", "active"))
            );
            return { linkedTransIds: snap.docs.map((d) => d.id) };
        }

        if (type === "DELETE_INVOICE" || type === "UPDATE_INVOICE") {
            const invoiceId = type === "DELETE_INVOICE" ? payload.invoice.id : payload.oldInvoice.id;
            const snap = await getDocs(
                query(collection(db, "transactions"),
                    where("sourceId", "==", invoiceId),
                    where("recordStatus", "==", "active"))
            );
            return { linkedTransIds: snap.docs.map((d) => d.id) };
        }

        return {};
    }

    // ── Router ─────────────────────────────────────────────────────────────────

    private static async route(
        operation: FinancialOperation,
        txn: any,
        ctx: PrefetchedContext,
        now: string
    ): Promise<any> {
        const { type, payload, user } = operation;

        switch (type) {
            case "CREATE_INVOICE":          return this.handleCreateInvoice(payload, txn, user, now);
            case "UPDATE_INVOICE":          return this.handleUpdateInvoice(payload, txn, user, now, ctx);
            case "DELETE_INVOICE":          return this.handleDeleteInvoice(payload, txn, user, now, ctx);
            case "RECORD_INVOICE_PAYMENT":  return this.handleRecordInvoicePayment(payload, txn, user, now);
            case "ADD_TRANSACTION":         return this.handleAddTransaction(payload, txn, user, now);
            case "UPDATE_TRANSACTION":      return this.handleUpdateTransaction(payload, txn, user, now);
            case "DELETE_TRANSACTION":      return this.handleDeleteTransaction(payload, txn, user, now);
            case "CREATE_TRANSFER":         return this.handleCreateTransfer(payload, txn, user, now);
            case "ADD_VOUCHER":             return this.handleAddVoucher(payload, txn, user, now);
            case "UPDATE_VOUCHER":          return this.handleUpdateVoucher(payload, txn, user, now);
            case "DELETE_VOUCHER":          return this.handleDeleteVoucher(payload, txn, user, now);
            case "CREATE_QUICK_ENTRY":      return this.handleCreateQuickEntry(payload, txn, user, now);
            case "UPDATE_QUICK_ENTRY":      return this.handleUpdateQuickEntry(payload, txn, user, now, ctx);
            case "DELETE_QUICK_ENTRY":      return this.handleDeleteQuickEntry(payload, txn, user, now, ctx);
            default:
                throw new Error(`Unknown operation type: ${type}`);
        }
    }

    // ── Audit log helper ───────────────────────────────────────────────────────

    private static writeAuditLog(
        txn: any,
        action: string,
        entityType: string,
        entityId: string,
        description: string,
        user: { id?: string; name: string },
        oldValue?: any,
        newValue?: any
    ) {
        const logRef = doc(collection(db, "audit_logs"));
        txn.set(logRef, cleanData({
            action, entityType, entityId, description,
            oldValue: oldValue ?? null,
            newValue: newValue ?? null,
            userId: user.id || "SYS",
            userName: user.name || "System",
            timestamp: new Date().toISOString(),
        }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVOICE OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * CREATE_INVOICE
     * Pipeline: [reads first] validate cashBox → create doc → optional auto-create partner →
     *           update partner balance → update cashBox → update stock → write transaction docs → aggregation → audit
     *
     * All Firestore reads are performed BEFORE any writes (Firestore transaction rule).
     * Partner and invoice IDs are generated locally so they are available for the pre-read
     * accounting computation without requiring any write.
     */
    private static async handleCreateInvoice(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { invoice } = payload;
        const type = invoice.type || "sale";

        // ── Determine all IDs locally (no Firestore writes yet) ─────────────
        const invRef = invoice.id
            ? doc(db, "invoices", invoice.id)
            : doc(collection(db, "invoices"));
        const invoiceId = invRef.id;

        let partnerId = invoice.partnerId;
        let newPartnerRef: any = null;
        if (invoice.autoCreatePartner && !partnerId && invoice.partnerName) {
            const partnerColl = type.includes("sale") ? "customers" : "suppliers";
            newPartnerRef = doc(collection(db, partnerColl));
            partnerId = newPartnerRef.id;   // ID only — write happens below
        }

        // Compute accounting with finalized IDs (pure calculation, no Firestore)
        const acct = computeInvoiceAccounting({ ...invoice, id: invoiceId, partnerId }, user);

        // ── ALL READS FIRST (Firestore transaction rule) ─────────────────────
        if (invoice.boxId && acct.cashBoxChange < 0) {
            const boxSnap = await txn.get(doc(db, "cashBoxes", invoice.boxId));
            const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
            if (bal + acct.cashBoxChange < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        // ── ALL WRITES ───────────────────────────────────────────────────────

        // Auto-create partner (write deferred until after reads)
        if (newPartnerRef) {
            txn.set(newPartnerRef, cleanData({
                id: partnerId,
                name: invoice.partnerName,
                phone: invoice.partnerPhone || "",
                address: "",
                balance: 0,
                recordStatus: "active",
                createdAt: now,
                updatedAt: now,
            }));
        }

        // Save invoice document
        const invoiceData = cleanData({
            ...invoice,
            id: invoiceId,
            partnerId,
            recordStatus: "active",
            createdAt: invoice.createdAt || now,
            updatedAt: now,
            createdBy: user.name,
        });
        txn.set(invRef, invoiceData);

        // Partner balance
        if (partnerId && acct.partnerBalanceChange !== 0) {
            txn.set(
                doc(db, acct.partnerCollection, partnerId),
                cleanData({ balance: increment(acct.partnerBalanceChange), updatedAt: now }),
                { merge: true }
            );
        }

        // Cash box balance
        if (invoice.boxId && acct.cashBoxChange !== 0) {
            txn.set(
                doc(db, "cashBoxes", invoice.boxId),
                cleanData({ balance: increment(acct.cashBoxChange), updatedAt: now }),
                { merge: true }
            );
        }

        // Stock changes
        this.applyStockChanges(txn, invoice.items || [], invoice.type, now);

        // Transaction documents
        for (const transData of acct.transactionDocs) {
            const transRef = doc(collection(db, "transactions"));
            txn.set(transRef, cleanData({ ...transData, id: transRef.id, recordStatus: "active", updatedAt: now }));
        }

        // Aggregation
        AggregationEngine.applyFinancialImpact(txn, new Date(invoice.createdAt || now), acct.aggregationImpact);

        // Audit
        this.writeAuditLog(txn, "CREATE", "Invoice", invoiceId,
            `إنشاء فاتورة ${type} بمبلغ ${invoice.total}`, user, null, invoiceData);

        return invoiceId;
    }

    /**
     * UPDATE_INVOICE
     * Pipeline: reverse old effects → apply new effects → update doc → update transactions → aggregation → audit
     */
    private static async handleUpdateInvoice(
        payload: any, txn: any, user: any, now: string, ctx: PrefetchedContext
    ): Promise<string> {
        const { oldInvoice, newInvoice } = payload;
        const invoiceId = newInvoice.id || oldInvoice.id;
        newInvoice.id = invoiceId;

        // Compute old and new accounting
        const oldAcct = computeInvoiceAccounting(oldInvoice, user);
        const newAcct = computeInvoiceAccounting({ ...newInvoice, id: invoiceId }, user);

        // Validate cashBox for new state
        if (newInvoice.boxId && newAcct.cashBoxChange < 0) {
            const boxSnap = await txn.get(doc(db, "cashBoxes", newInvoice.boxId));
            const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
            // Adjust for what we're giving back
            const netBoxChange = newAcct.cashBoxChange - (oldInvoice.boxId === newInvoice.boxId ? oldAcct.cashBoxChange : 0);
            if (bal + netBoxChange < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        // Update invoice document
        txn.set(doc(db, "invoices", invoiceId), cleanData({
            ...newInvoice,
            updatedAt: now,
            updatedBy: user.name,
        }), { merge: true });

        // Reverse old partner balance
        if (oldInvoice.partnerId && oldAcct.partnerBalanceChange !== 0) {
            txn.set(
                doc(db, oldAcct.partnerCollection, oldInvoice.partnerId),
                cleanData({ balance: increment(-oldAcct.partnerBalanceChange), updatedAt: now }),
                { merge: true }
            );
        }

        // Apply new partner balance
        if (newInvoice.partnerId && newAcct.partnerBalanceChange !== 0) {
            txn.set(
                doc(db, newAcct.partnerCollection, newInvoice.partnerId),
                cleanData({ balance: increment(newAcct.partnerBalanceChange), updatedAt: now }),
                { merge: true }
            );
        }

        // Reverse old cashBox, apply new cashBox
        const boxChanges: Record<string, number> = {};
        if (oldInvoice.boxId && oldAcct.cashBoxChange !== 0) {
            boxChanges[oldInvoice.boxId] = (boxChanges[oldInvoice.boxId] || 0) - oldAcct.cashBoxChange;
        }
        if (newInvoice.boxId && newAcct.cashBoxChange !== 0) {
            boxChanges[newInvoice.boxId] = (boxChanges[newInvoice.boxId] || 0) + newAcct.cashBoxChange;
        }
        for (const [boxId, change] of Object.entries(boxChanges)) {
            if (change !== 0) {
                txn.set(doc(db, "cashBoxes", boxId), cleanData({ balance: increment(change), updatedAt: now }), { merge: true });
            }
        }

        // Reverse old stock, apply new stock
        this.reverseStockChanges(txn, oldInvoice.items || [], oldInvoice.type, now);
        this.applyStockChanges(txn, newInvoice.items || [], newInvoice.type, now);

        // Mark old transactions as deleted
        for (const transId of (ctx.linkedTransIds || [])) {
            txn.set(doc(db, "transactions", transId), { recordStatus: "deleted", updatedAt: now }, { merge: true });
        }

        // Write new transactions
        for (const transData of newAcct.transactionDocs) {
            const transRef = doc(collection(db, "transactions"));
            txn.set(transRef, cleanData({ ...transData, id: transRef.id, recordStatus: "active", updatedAt: now }));
        }

        // Aggregation: reverse old, apply new (net)
        const netAgg = AggregationEngine.combineImpacts(
            this.negateImpact(oldAcct.aggregationImpact),
            newAcct.aggregationImpact
        );
        AggregationEngine.applyFinancialImpact(txn, new Date(newInvoice.createdAt || now), netAgg);

        // Audit
        this.writeAuditLog(txn, "UPDATE", "Invoice", invoiceId,
            `تعديل فاتورة ${newInvoice.type} من ${oldInvoice.total} إلى ${newInvoice.total}`,
            user, oldInvoice, newInvoice);

        return invoiceId;
    }

    /**
     * DELETE_INVOICE
     * Pipeline: reverse all accounting effects → mark deleted → aggregation → audit
     */
    private static async handleDeleteInvoice(
        payload: any, txn: any, user: any, now: string, ctx: PrefetchedContext
    ): Promise<string> {
        const { invoice } = payload;
        const invoiceId = invoice.id;

        // Compute reversal impact
        const acct = computeInvoiceAccounting(invoice, user, true); // isReversal=true

        // Soft-delete the invoice
        txn.set(doc(db, "invoices", invoiceId), { recordStatus: "deleted", updatedAt: now }, { merge: true });

        // Reverse partner balance
        if (invoice.partnerId && acct.partnerBalanceChange !== 0) {
            txn.set(
                doc(db, acct.partnerCollection, invoice.partnerId),
                cleanData({ balance: increment(acct.partnerBalanceChange), updatedAt: now }),
                { merge: true }
            );
        }

        // Reverse cashBox balance
        if (invoice.boxId && acct.cashBoxChange !== 0) {
            txn.set(
                doc(db, "cashBoxes", invoice.boxId),
                cleanData({ balance: increment(acct.cashBoxChange), updatedAt: now }),
                { merge: true }
            );
        }

        // Reverse stock
        this.reverseStockChanges(txn, invoice.items || [], invoice.type, now);

        // Mark linked transactions as deleted
        for (const transId of (ctx.linkedTransIds || [])) {
            txn.set(doc(db, "transactions", transId), { recordStatus: "deleted", updatedAt: now }, { merge: true });
        }

        // Aggregation reversal
        AggregationEngine.applyFinancialImpact(txn, new Date(invoice.createdAt || now), acct.aggregationImpact);

        // Audit
        this.writeAuditLog(txn, "DELETE", "Invoice", invoiceId,
            `حذف فاتورة ${invoice.type} بمبلغ ${invoice.total}`, user, invoice, null);

        return invoiceId;
    }

    /**
     * RECORD_INVOICE_PAYMENT
     * Pipeline: check box balance → update invoice → create transaction doc →
     *           update partner balance → update cashBox → aggregation → audit
     *
     * paymentAmount: the NEW additional payment being made now
     */
    private static async handleRecordInvoicePayment(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { invoice, paymentAmount, boxId, newPaid, newStatus } = payload;

        const isSale = invoice.type === "sale" || invoice.type === "sale_return";
        const isReturn = invoice.type === "sale_return" || invoice.type === "purchase_return";
        const transType = isSale ? "قبض" : "صرف";
        const boxSign = isSale ? 1 : -1;
        const returnSign = isReturn ? -1 : 1;
        const boxAmount = paymentAmount * boxSign * returnSign;

        // Validate cashBox balance
        if (boxId && boxAmount < 0) {
            const boxSnap = await txn.get(doc(db, "cashBoxes", boxId));
            const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
            if (bal + boxAmount < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        // Update invoice
        const invRef = doc(db, "invoices", invoice.id);
        txn.set(invRef, cleanData({
            paid: newPaid,
            status: newStatus,
            boxId,
            updatedAt: now,
            updatedBy: user.name,
        }), { merge: true });

        // Create transaction document
        const transRef = doc(collection(db, "transactions"));
        const transId = transRef.id;
        txn.set(transRef, cleanData({
            id: transId,
            type: transType,
            sourceType: "invoice_payment",
            sourceId: invoice.id,
            amount: paymentAmount,
            currency: invoice.currency || "YER",
            description: `دفعة على فاتورة #${invoice.invoiceNumber || invoice.id?.slice(0, 8).toUpperCase()}`,
            partnerId: invoice.partnerId,
            partnerName: invoice.partnerName,
            boxId,
            debit: transType === "قبض" ? 0 : paymentAmount,
            credit: transType === "قبض" ? paymentAmount : 0,
            recordStatus: "active",
            createdAt: now,
            updatedAt: now,
            createdBy: user.name,
        }));

        // Update partner balance (payment reduces what they owe)
        if (invoice.partnerId) {
            const partnerColl = isSale ? "customers" : "suppliers";
            txn.set(
                doc(db, partnerColl, invoice.partnerId),
                cleanData({ balance: increment(-paymentAmount * returnSign), updatedAt: now }),
                { merge: true }
            );
        }

        // Update cashBox
        if (boxId) {
            txn.set(
                doc(db, "cashBoxes", boxId),
                cleanData({ balance: increment(boxAmount), updatedAt: now }),
                { merge: true }
            );
        }

        // Aggregation
        const agg: AggregationImpact = {
            transactionCount: 1,
            cashBalanceChange: boxAmount,
        };
        if (isSale) {
            agg.receiptsTotal = paymentAmount * returnSign;
            agg.receivablesChange = -paymentAmount * returnSign;
        } else {
            agg.paymentsTotal = paymentAmount * returnSign;
            agg.payablesChange = -paymentAmount * returnSign;
        }
        AggregationEngine.applyFinancialImpact(txn, new Date(now), agg);

        // Audit
        this.writeAuditLog(txn, "UPDATE", "Invoice", invoice.id,
            `تسجيل دفعة ${paymentAmount} على فاتورة #${invoice.invoiceNumber || invoice.id}`, user, null, { paymentAmount, newPaid, newStatus });

        return transId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSACTION OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ADD_TRANSACTION
     * Correct direction:
     *   قبض (receipt): cashBox += amount, partner.balance -= amount (they owe us less)
     *   صرف (payment): cashBox -= amount, partner.balance -= amount (we owe them less)
     */
    private static async handleAddTransaction(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { trans } = payload;

        const isReceipt = trans.type === "قبض" || trans.type === "customer_receipt";
        const boxAmount = isReceipt ? trans.amount : -trans.amount;

        // Validate cashBox balance
        if (trans.boxId && boxAmount < 0) {
            const boxSnap = await txn.get(doc(db, "cashBoxes", trans.boxId));
            const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
            if (bal + boxAmount < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        const transRef = doc(collection(db, "transactions"));
        const transId = transRef.id;
        txn.set(transRef, cleanData({
            ...trans,
            id: transId,
            recordStatus: "active",
            createdAt: trans.createdAt || now,
            updatedAt: now,
            createdBy: user.name,
        }));

        // Partner balance: always -amount (both receipt and payment reduce what partner owes/is owed)
        if (trans.partnerId) {
            const partnerColl = isReceipt ? "customers" : "suppliers";
            txn.set(doc(db, partnerColl, trans.partnerId),
                cleanData({ balance: increment(-trans.amount), updatedAt: now }), { merge: true });
        }

        // CashBox
        if (trans.boxId) {
            txn.set(doc(db, "cashBoxes", trans.boxId),
                cleanData({ balance: increment(boxAmount), updatedAt: now }), { merge: true });
        }

        // Aggregation
        const agg: AggregationImpact = { transactionCount: 1, cashBalanceChange: trans.boxId ? boxAmount : 0 };
        if (isReceipt) {
            agg.receiptsTotal = trans.amount;
            agg.receivablesChange = -trans.amount;
        } else {
            agg.paymentsTotal = trans.amount;
            agg.payablesChange = -trans.amount;
        }
        AggregationEngine.applyFinancialImpact(txn, new Date(trans.createdAt || now), agg);

        // Audit
        this.writeAuditLog(txn, "CREATE", "Transaction", transId,
            `إضافة حركة ${trans.type} بمبلغ ${trans.amount}`, user, null, trans);

        return transId;
    }

    /**
     * UPDATE_TRANSACTION
     * Pipeline: [reads first] validate cashBox → reverse old → apply new → update document → net aggregation → audit
     */
    private static async handleUpdateTransaction(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { oldTrans, newTrans } = payload;

        const isOldReceipt = oldTrans.type === "قبض" || oldTrans.type === "customer_receipt";
        const isNewReceipt = newTrans.type === "قبض" || newTrans.type === "customer_receipt";
        const newBoxAmount = newTrans.boxId ? (isNewReceipt ? newTrans.amount : -newTrans.amount) : 0;
        const oldBoxAmountForReversal = oldTrans.boxId ? (isOldReceipt ? oldTrans.amount : -oldTrans.amount) : 0;

        // ── ALL READS FIRST (Firestore transaction rule) ──────────────────────
        let newBoxSnap: any = null;
        if (newTrans.boxId && newBoxAmount < 0) {
            newBoxSnap = await txn.get(doc(db, "cashBoxes", newTrans.boxId));
        }

        // Validate new cashBox balance
        if (newBoxSnap) {
            const bal = newBoxSnap.exists() ? Number(newBoxSnap.data()?.balance || 0) : 0;
            const alreadyReverted = oldTrans.boxId === newTrans.boxId ? -oldBoxAmountForReversal : 0;
            if (bal + alreadyReverted + newBoxAmount < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        // ── ALL WRITES ───────────────────────────────────────────────────────

        // Update the transaction document
        txn.set(doc(db, "transactions", oldTrans.id), cleanData({
            ...newTrans,
            id: oldTrans.id,
            updatedAt: now,
            updatedBy: user.name,
        }), { merge: true });

        // Reverse old partner balance
        if (oldTrans.partnerId) {
            const partnerColl = isOldReceipt ? "customers" : "suppliers";
            txn.set(doc(db, partnerColl, oldTrans.partnerId),
                cleanData({ balance: increment(oldTrans.amount), updatedAt: now }), { merge: true });
        }

        // Reverse old cashBox
        if (oldTrans.boxId && oldBoxAmountForReversal !== 0) {
            txn.set(doc(db, "cashBoxes", oldTrans.boxId),
                cleanData({ balance: increment(-oldBoxAmountForReversal), updatedAt: now }), { merge: true });
        }

        // Apply new partner balance
        if (newTrans.partnerId) {
            const partnerColl = isNewReceipt ? "customers" : "suppliers";
            txn.set(doc(db, partnerColl, newTrans.partnerId),
                cleanData({ balance: increment(-newTrans.amount), updatedAt: now }), { merge: true });
        }

        // Apply new cashBox
        if (newTrans.boxId && newBoxAmount !== 0) {
            txn.set(doc(db, "cashBoxes", newTrans.boxId),
                cleanData({ balance: increment(newBoxAmount), updatedAt: now }), { merge: true });
        }

        // Net aggregation
        const oldAgg: AggregationImpact = {
            transactionCount: -1,
            cashBalanceChange: oldTrans.boxId ? (isOldReceipt ? -oldTrans.amount : oldTrans.amount) : 0,
        };
        if (isOldReceipt) { oldAgg.receiptsTotal = -oldTrans.amount; oldAgg.receivablesChange = oldTrans.amount; }
        else { oldAgg.paymentsTotal = -oldTrans.amount; oldAgg.payablesChange = oldTrans.amount; }

        const newAgg: AggregationImpact = {
            transactionCount: 1,
            cashBalanceChange: newTrans.boxId ? (isNewReceipt ? newTrans.amount : -newTrans.amount) : 0,
        };
        if (isNewReceipt) { newAgg.receiptsTotal = newTrans.amount; newAgg.receivablesChange = -newTrans.amount; }
        else { newAgg.paymentsTotal = newTrans.amount; newAgg.payablesChange = -newTrans.amount; }

        AggregationEngine.applyFinancialImpact(txn, new Date(newTrans.createdAt || now),
            AggregationEngine.combineImpacts(oldAgg, newAgg));

        // Audit
        this.writeAuditLog(txn, "UPDATE", "Transaction", oldTrans.id,
            `تعديل حركة ${oldTrans.type} من ${oldTrans.amount} إلى ${newTrans.amount}`, user, oldTrans, newTrans);

        return oldTrans.id;
    }

    /**
     * DELETE_TRANSACTION
     * Pipeline: [reads first] read linked invoice → delete transaction →
     *           reverse partner/cashBox → update invoice → aggregation → audit
     *
     * All reads are performed BEFORE any writes to comply with Firestore
     * transaction ordering requirements.
     */
    private static async handleDeleteTransaction(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { trans } = payload;
        const transId = trans.id;

        if (trans.type === "تحويل") {
            // ── Transfer deletion (no linked invoice, no reads needed) ──────
            txn.delete(doc(db, "transactions", transId));
            if (trans.fromBoxId) {
                txn.set(doc(db, "cashBoxes", trans.fromBoxId),
                    cleanData({ balance: increment(trans.amount), updatedAt: now }), { merge: true });
            }
            if (trans.toBoxId) {
                txn.set(doc(db, "cashBoxes", trans.toBoxId),
                    cleanData({ balance: increment(-trans.amount), updatedAt: now }), { merge: true });
            }
            AggregationEngine.applyFinancialImpact(txn, new Date(trans.createdAt || now), { transactionCount: -1 });
        } else {
            const isReceipt = trans.type === "قبض" || trans.type === "customer_receipt";
            const needsInvoiceUpdate =
                !!trans.sourceId &&
                (trans.sourceType === "invoice_payment" ||
                    trans.sourceType === "manual_receipt" ||
                    trans.sourceType === "manual_payment");

            // ── ALL READS FIRST (Firestore transaction rule) ────────────────
            let invSnap: any = null;
            if (needsInvoiceUpdate) {
                invSnap = await txn.get(doc(db, "invoices", trans.sourceId));
            }

            // ── ALL WRITES ─────────────────────────────────────────────────

            // Hard-delete the transaction
            txn.delete(doc(db, "transactions", transId));

            // Reverse partner balance (+amount to reverse the -amount from creation)
            if (trans.partnerId) {
                const partnerColl = isReceipt ? "customers" : "suppliers";
                txn.set(doc(db, partnerColl, trans.partnerId),
                    cleanData({ balance: increment(trans.amount), updatedAt: now }), { merge: true });
            }

            // Reverse cashBox
            if (trans.boxId) {
                const oldBoxAmount = isReceipt ? trans.amount : -trans.amount;
                txn.set(doc(db, "cashBoxes", trans.boxId),
                    cleanData({ balance: increment(-oldBoxAmount), updatedAt: now }), { merge: true });
            }

            // Update linked invoice using pre-read snapshot
            if (needsInvoiceUpdate && invSnap?.exists()) {
                const invData = invSnap.data();
                const discount = Number(invData?.discount || 0);
                const total = Number(invData?.total || 0);
                const netTotal = Math.max(0, total - discount);
                const oldPaid = Number(invData?.paid || 0);
                const newPaid = Math.max(0, oldPaid - trans.amount);
                const newStatus = newPaid <= 0 ? "آجل" : newPaid < netTotal ? "جزئي" : "مدفوع";
                txn.set(doc(db, "invoices", trans.sourceId),
                    { paid: newPaid, status: newStatus, updatedAt: now }, { merge: true });
            }

            // Aggregation reversal
            const reversalBoxAmount = isReceipt ? -trans.amount : trans.amount;
            const agg: AggregationImpact = {
                transactionCount: -1,
                cashBalanceChange: trans.boxId ? reversalBoxAmount : 0,
            };
            if (isReceipt) { agg.receiptsTotal = -trans.amount; agg.receivablesChange = trans.amount; }
            else { agg.paymentsTotal = -trans.amount; agg.payablesChange = trans.amount; }
            AggregationEngine.applyFinancialImpact(txn, new Date(trans.createdAt || now), agg);
        }

        // Audit
        this.writeAuditLog(txn, "DELETE", "Transaction", transId,
            `حذف حركة ${trans.type} بمبلغ ${trans.amount}`, user, trans, null);

        return transId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSFER OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * CREATE_TRANSFER
     * Validated: fromBox must have sufficient balance.
     * Writes complete transfer document with all required fields.
     */
    private static async handleCreateTransfer(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { fromBoxId, toBoxId, amount, currency, description } = payload;

        const fromBoxRef = doc(db, "cashBoxes", fromBoxId);
        const fromBoxSnap = await txn.get(fromBoxRef);
        const bal = fromBoxSnap.exists() ? Number(fromBoxSnap.data()?.balance || 0) : 0;
        if (bal - amount < 0) {
            throw new Error(`رصيد الصندوق المحول منه لا يكفي. الرصيد الحالي: ${bal}`);
        }

        const transRef = doc(collection(db, "transactions"));
        const transId = transRef.id;

        txn.set(transRef, cleanData({
            id: transId,
            type: "تحويل",
            sourceType: "transfer",
            sourceId: transId,
            amount,
            currency: currency || "YER",
            description: description || `تحويل من صندوق إلى صندوق`,
            fromBoxId,
            toBoxId,
            boxId: fromBoxId,   // canonical boxId for consistency
            debit: amount,
            credit: amount,
            recordStatus: "active",
            createdAt: now,
            updatedAt: now,
            createdBy: user.name,
        }));

        txn.set(fromBoxRef, cleanData({ balance: increment(-amount), updatedAt: now }), { merge: true });
        txn.set(doc(db, "cashBoxes", toBoxId), cleanData({ balance: increment(amount), updatedAt: now }), { merge: true });

        AggregationEngine.applyFinancialImpact(txn, new Date(now), { transactionCount: 1 });

        this.writeAuditLog(txn, "CREATE", "Transaction", transId,
            `تحويل ${amount} من صندوق ${fromBoxId} إلى صندوق ${toBoxId}`, user, null, { fromBoxId, toBoxId, amount });

        return transId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VOUCHER OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Voucher partner balance logic:
     *   Customer receipt (customer pays us): customer.balance -= amount (they owe us less)
     *   Customer payment (we pay customer / refund): customer.balance += amount (we owe them, or they over-paid and we're compensating)
     *   Supplier receipt (supplier pays us back): supplier.balance -= amount (we owe them less)
     *   Supplier payment (we pay supplier): supplier.balance -= amount (we owe them less)
     */
    private static voucherPartnerBalanceChange(voucher: any): number {
        if (!voucher.partnerType || voucher.partnerType === "none") return 0;
        if (voucher.partnerType === "customer") {
            return voucher.type === "receipt" ? -voucher.amount : voucher.amount;
        } else {
            // supplier: both receipt and payment reduce what we owe them
            return -voucher.amount;
        }
    }

    /** ADD_VOUCHER */
    private static async handleAddVoucher(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { voucher } = payload;

        // CashBox validation
        const cashChange = voucher.type === "receipt" ? voucher.amount : -voucher.amount;
        if (cashChange < 0 && voucher.boxId) {
            const boxSnap = await txn.get(doc(db, "cashBoxes", voucher.boxId));
            const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
            if (bal + cashChange < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        const vRef = voucher.id
            ? doc(db, "vouchers", voucher.id)
            : doc(collection(db, "vouchers"));
        const voucherId = vRef.id;

        txn.set(vRef, cleanData({
            ...voucher,
            id: voucherId,
            recordStatus: "active",
            createdAt: voucher.createdAt || now,
            updatedAt: now,
            createdBy: voucher.createdBy || user.name,
        }));

        // CashBox (guard: only write when boxId is present)
        if (voucher.boxId) {
            txn.set(doc(db, "cashBoxes", voucher.boxId),
                cleanData({ balance: increment(cashChange), updatedAt: now }), { merge: true });
        }

        // Partner balance
        const partnerChange = this.voucherPartnerBalanceChange(voucher);
        if (voucher.partnerId && partnerChange !== 0) {
            const coll = voucher.partnerType === "customer" ? "customers" : "suppliers";
            txn.set(doc(db, coll, voucher.partnerId),
                cleanData({ balance: increment(partnerChange), updatedAt: now }), { merge: true });
        }

        // Aggregation
        const agg: AggregationImpact = { cashBalanceChange: cashChange };
        if (voucher.type === "receipt") {
            agg.receiptsTotal = voucher.amount;
            if (partnerChange < 0) agg.receivablesChange = partnerChange;
        } else {
            agg.paymentsTotal = voucher.amount;
            if (partnerChange < 0) agg.payablesChange = partnerChange;
        }
        AggregationEngine.applyFinancialImpact(txn, new Date(voucher.createdAt || now), agg);

        this.writeAuditLog(txn, "CREATE", "Transaction", voucherId,
            `إضافة سند ${voucher.type === "receipt" ? "قبض" : "صرف"} بمبلغ ${voucher.amount}`, user, null, voucher);

        return voucherId;
    }

    /** UPDATE_VOUCHER */
    private static async handleUpdateVoucher(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { oldVoucher, newVoucher } = payload;
        const voucherId = newVoucher.id || oldVoucher.id;

        const oldCash = oldVoucher.type === "receipt" ? oldVoucher.amount : -oldVoucher.amount;
        const newCash = newVoucher.type === "receipt" ? newVoucher.amount : -newVoucher.amount;

        // Compute net cash-box deltas per box (pure calculation, no Firestore)
        const boxChanges: Record<string, number> = {};
        if (oldVoucher.boxId) boxChanges[oldVoucher.boxId] = (boxChanges[oldVoucher.boxId] || 0) - oldCash;
        if (newVoucher.boxId) boxChanges[newVoucher.boxId] = (boxChanges[newVoucher.boxId] || 0) + newCash;

        // ── ALL READS FIRST (Firestore transaction rule) ───────────────────────
        // Validate any cash-box whose net balance would decrease
        for (const [boxId, change] of Object.entries(boxChanges)) {
            if (change < 0) {
                const boxSnap = await txn.get(doc(db, "cashBoxes", boxId));
                const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
                if (bal + change < 0) {
                    throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
                }
            }
        }

        // ── ALL WRITES ─────────────────────────────────────────────────────────
        txn.set(doc(db, "vouchers", voucherId), cleanData({ ...newVoucher, id: voucherId, updatedAt: now, updatedBy: user.name }), { merge: true });

        for (const [boxId, change] of Object.entries(boxChanges)) {
            if (change !== 0) {
                txn.set(doc(db, "cashBoxes", boxId), cleanData({ balance: increment(change), updatedAt: now }), { merge: true });
            }
        }

        // Partner changes
        const oldPartnerChange = this.voucherPartnerBalanceChange(oldVoucher);
        const newPartnerChange = this.voucherPartnerBalanceChange(newVoucher);

        if (oldVoucher.partnerId && oldPartnerChange !== 0) {
            const coll = oldVoucher.partnerType === "customer" ? "customers" : "suppliers";
            txn.set(doc(db, coll, oldVoucher.partnerId),
                cleanData({ balance: increment(-oldPartnerChange), updatedAt: now }), { merge: true });
        }
        if (newVoucher.partnerId && newPartnerChange !== 0) {
            const coll = newVoucher.partnerType === "customer" ? "customers" : "suppliers";
            txn.set(doc(db, coll, newVoucher.partnerId),
                cleanData({ balance: increment(newPartnerChange), updatedAt: now }), { merge: true });
        }

        // Net aggregation
        const netCash = newCash - oldCash;
        const agg: AggregationImpact = { cashBalanceChange: netCash };
        if (newCash !== 0 || oldCash !== 0) {
            if (newVoucher.type === "receipt") agg.receiptsTotal = newVoucher.amount - oldVoucher.amount;
            else agg.paymentsTotal = newVoucher.amount - oldVoucher.amount;
        }
        AggregationEngine.applyFinancialImpact(txn, new Date(newVoucher.createdAt || now), agg);

        this.writeAuditLog(txn, "UPDATE", "Transaction", voucherId,
            `تعديل سند ${newVoucher.type === "receipt" ? "قبض" : "صرف"} من ${oldVoucher.amount} إلى ${newVoucher.amount}`,
            user, oldVoucher, newVoucher);

        return voucherId;
    }

    /** DELETE_VOUCHER */
    private static async handleDeleteVoucher(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { voucher } = payload;

        txn.delete(doc(db, "vouchers", voucher.id));

        const cashChange = voucher.type === "receipt" ? voucher.amount : -voucher.amount;

        // Reverse cashBox (guard: only write when boxId is present)
        if (voucher.boxId) {
            txn.set(doc(db, "cashBoxes", voucher.boxId),
                cleanData({ balance: increment(-cashChange), updatedAt: now }), { merge: true });
        }

        // Reverse partner
        const partnerChange = this.voucherPartnerBalanceChange(voucher);
        if (voucher.partnerId && partnerChange !== 0) {
            const coll = voucher.partnerType === "customer" ? "customers" : "suppliers";
            txn.set(doc(db, coll, voucher.partnerId),
                cleanData({ balance: increment(-partnerChange), updatedAt: now }), { merge: true });
        }

        // Aggregation reversal
        const agg: AggregationImpact = { cashBalanceChange: -cashChange };
        if (voucher.type === "receipt") agg.receiptsTotal = -voucher.amount;
        else agg.paymentsTotal = -voucher.amount;
        AggregationEngine.applyFinancialImpact(txn, new Date(voucher.createdAt || now), agg);

        this.writeAuditLog(txn, "DELETE", "Transaction", voucher.id,
            `حذف سند ${voucher.type === "receipt" ? "قبض" : "صرف"} بمبلغ ${voucher.amount}`, user, voucher, null);

        return voucher.id;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // QUICK ENTRY OPERATIONS  (pre-existing path, now with race condition fixed)
    // ─────────────────────────────────────────────────────────────────────────

    /** CREATE_QUICK_ENTRY */
    private static async handleCreateQuickEntry(payload: any, txn: any, user: any, now: string): Promise<string> {
        const { entry } = payload;

        // ── Determine partner ID locally (no write yet) ───────────────────────
        let finalPartnerId = entry.partnerId;
        let newPartnerRef: any = null;
        if (entry.autoCreatePartner && !finalPartnerId && entry.partnerName) {
            const partnerColl = (entry.entryType === "manual_sale" || entry.entryType === "receipt") ? "customers" : "suppliers";
            newPartnerRef = doc(collection(db, partnerColl));
            finalPartnerId = newPartnerRef.id;  // ID only — write deferred below
        }

        // Compute impact with finalized partnerId (pure calculation, no Firestore)
        const impact = FinancialEngine.getQuickEntryImpact({ ...entry, partnerId: finalPartnerId }, user);

        // ── ALL READS FIRST (Firestore transaction rule) ──────────────────────
        if (entry.cashBoxId && impact.cashBoxBalanceChange < 0) {
            const boxSnap = await txn.get(doc(db, "cashBoxes", entry.cashBoxId));
            const bal = boxSnap.exists() ? Number(boxSnap.data()?.balance || 0) : 0;
            if (bal + impact.cashBoxBalanceChange < 0) {
                throw new Error(`رصيد الصندوق لا يكفي. الرصيد الحالي: ${bal}`);
            }
        }

        // ── ALL WRITES ────────────────────────────────────────────────────────
        // Auto-create partner (write deferred until after all reads)
        if (newPartnerRef) {
            txn.set(newPartnerRef, cleanData({
                id: finalPartnerId,
                name: entry.partnerName,
                phone: entry.partnerPhone || "",
                address: "",
                balance: 0,
                recordStatus: "active",
                createdAt: now,
                updatedAt: now,
            }));
        }

        const entryRef = doc(collection(db, "quick_financial_entries"));
        const entryId = entryRef.id;

        txn.set(entryRef, cleanData({
            ...entry,
            id: entryId,
            partnerId: finalPartnerId,
            recordStatus: "active",
            createdAt: entry.createdAt || now,
            updatedAt: now,
        }));

        if (finalPartnerId && impact.partnerBalanceChange !== 0) {
            const coll = (entry.entryType === "manual_sale" || entry.entryType === "receipt") ? "customers" : "suppliers";
            txn.set(doc(db, coll, finalPartnerId),
                cleanData({ balance: increment(impact.partnerBalanceChange), updatedAt: now }), { merge: true });
        }

        if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
            txn.set(doc(db, "cashBoxes", entry.cashBoxId),
                cleanData({ balance: increment(impact.cashBoxBalanceChange), updatedAt: now }), { merge: true });
        }

        for (const transData of impact.transactions) {
            const tRef = doc(collection(db, "transactions"));
            txn.set(tRef, cleanData({ ...transData, id: tRef.id, sourceId: entryId, recordStatus: "active", updatedAt: now }));
        }

        if (impact.aggregationImpact) {
            AggregationEngine.applyFinancialImpact(txn, new Date(entry.createdAt || now), impact.aggregationImpact);
        }

        this.writeAuditLog(txn, "CREATE", "Transaction", entryId,
            `إضافة قيد سريع ${entry.entryType} بمبلغ ${entry.netAmount}`, user, null, entry);

        return entryId;
    }

    /** UPDATE_QUICK_ENTRY — pre-fetched linkedTransIds eliminates the getDocs race */
    private static async handleUpdateQuickEntry(
        payload: any, txn: any, user: any, now: string, ctx: PrefetchedContext
    ): Promise<string> {
        const { oldEntry, newEntry } = payload;
        const entryId = newEntry.id;

        const oldImpact = FinancialEngine.getQuickEntryImpact(oldEntry, user);
        const newImpact = FinancialEngine.getQuickEntryImpact(newEntry, user);

        txn.set(doc(db, "quick_financial_entries", entryId), cleanData({
            ...newEntry,
            recordStatus: "active",
            updatedAt: now,
        }));

        // Partner balance adjustment
        if (oldEntry.partnerId === newEntry.partnerId) {
            const net = newImpact.partnerBalanceChange - oldImpact.partnerBalanceChange;
            if (newEntry.partnerId && net !== 0) {
                const coll = (newEntry.entryType === "manual_sale" || newEntry.entryType === "receipt") ? "customers" : "suppliers";
                txn.set(doc(db, coll, newEntry.partnerId), { balance: increment(net), updatedAt: now }, { merge: true });
            }
        } else {
            if (oldEntry.partnerId && oldImpact.partnerBalanceChange !== 0) {
                const coll = (oldEntry.entryType === "manual_sale" || oldEntry.entryType === "receipt") ? "customers" : "suppliers";
                txn.set(doc(db, coll, oldEntry.partnerId), { balance: increment(-oldImpact.partnerBalanceChange), updatedAt: now }, { merge: true });
            }
            if (newEntry.partnerId && newImpact.partnerBalanceChange !== 0) {
                const coll = (newEntry.entryType === "manual_sale" || newEntry.entryType === "receipt") ? "customers" : "suppliers";
                txn.set(doc(db, coll, newEntry.partnerId), { balance: increment(newImpact.partnerBalanceChange), updatedAt: now }, { merge: true });
            }
        }

        // CashBox adjustment
        if (oldEntry.cashBoxId === newEntry.cashBoxId) {
            const net = newImpact.cashBoxBalanceChange - oldImpact.cashBoxBalanceChange;
            if (newEntry.cashBoxId && net !== 0) {
                txn.set(doc(db, "cashBoxes", newEntry.cashBoxId), { balance: increment(net), updatedAt: now }, { merge: true });
            }
        } else {
            if (oldEntry.cashBoxId && oldImpact.cashBoxBalanceChange !== 0) {
                txn.set(doc(db, "cashBoxes", oldEntry.cashBoxId), { balance: increment(-oldImpact.cashBoxBalanceChange), updatedAt: now }, { merge: true });
            }
            if (newEntry.cashBoxId && newImpact.cashBoxBalanceChange !== 0) {
                txn.set(doc(db, "cashBoxes", newEntry.cashBoxId), { balance: increment(newImpact.cashBoxBalanceChange), updatedAt: now }, { merge: true });
            }
        }

        // Mark old transactions deleted (using pre-fetched IDs, no getDocs inside txn)
        for (const transId of (ctx.linkedTransIds || [])) {
            txn.set(doc(db, "transactions", transId), { recordStatus: "deleted", updatedAt: now }, { merge: true });
        }

        // Write new transactions
        for (const transData of newImpact.transactions) {
            const tRef = doc(collection(db, "transactions"));
            txn.set(tRef, cleanData({ ...transData, id: tRef.id, sourceId: entryId, recordStatus: "active", updatedAt: now }));
        }

        // Net aggregation
        if (oldImpact.aggregationImpact || newImpact.aggregationImpact) {
            const netAgg = AggregationEngine.combineImpacts(
                this.negateImpact(oldImpact.aggregationImpact || {}),
                newImpact.aggregationImpact || {}
            );
            AggregationEngine.applyFinancialImpact(txn, new Date(newEntry.createdAt || now), netAgg);
        }

        this.writeAuditLog(txn, "UPDATE", "Transaction", entryId,
            `تعديل قيد سريع ${newEntry.entryType} إلى ${newEntry.netAmount}`, user, oldEntry, newEntry);

        return entryId;
    }

    /** DELETE_QUICK_ENTRY — pre-fetched linkedTransIds eliminates the getDocs race */
    private static async handleDeleteQuickEntry(
        payload: any, txn: any, user: any, now: string, ctx: PrefetchedContext
    ): Promise<string> {
        const { entry } = payload;
        const entryId = entry.id;

        const impact = FinancialEngine.getQuickEntryImpact(entry, user);

        txn.set(doc(db, "quick_financial_entries", entryId), { recordStatus: "deleted", updatedAt: now }, { merge: true });

        if (entry.partnerId && impact.partnerBalanceChange !== 0) {
            const coll = (entry.entryType === "manual_sale" || entry.entryType === "receipt") ? "customers" : "suppliers";
            txn.set(doc(db, coll, entry.partnerId), { balance: increment(-impact.partnerBalanceChange), updatedAt: now }, { merge: true });
        }

        if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
            txn.set(doc(db, "cashBoxes", entry.cashBoxId), { balance: increment(-impact.cashBoxBalanceChange), updatedAt: now }, { merge: true });
        }

        // Mark transactions deleted (pre-fetched, no getDocs inside txn)
        for (const transId of (ctx.linkedTransIds || [])) {
            txn.set(doc(db, "transactions", transId), { recordStatus: "deleted", updatedAt: now }, { merge: true });
        }

        if (impact.aggregationImpact) {
            AggregationEngine.applyFinancialImpact(txn, new Date(entry.createdAt || now), this.negateImpact(impact.aggregationImpact));
        }

        this.writeAuditLog(txn, "DELETE", "Transaction", entryId,
            `حذف قيد سريع ${entry.entryType} بمبلغ ${entry.netAmount}`, user, entry, null);

        return entryId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STOCK HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    private static applyStockChanges(txn: any, items: any[], invoiceType: string, now: string) {
        const baseType = invoiceType?.replace("_return", "");
        const isReturn = invoiceType?.includes("return");
        const stockChanges: Record<string, number> = {};

        for (const item of items) {
            if (!item.productId || item.productId === "ledger_entry_item") continue;
            let delta = baseType === "sale" ? -item.quantity : item.quantity;
            if (isReturn) delta = -delta;
            stockChanges[item.productId] = (stockChanges[item.productId] || 0) + delta;
        }

        for (const [pid, delta] of Object.entries(stockChanges)) {
            if (delta !== 0) {
                txn.set(doc(db, "products", pid),
                    cleanData({ stock: increment(delta), updatedAt: now }), { merge: true });
            }
        }
    }

    private static reverseStockChanges(txn: any, items: any[], invoiceType: string, now: string) {
        // Reversing stock = applying the inverse type
        const reversedType = invoiceType?.includes("return")
            ? invoiceType.replace("_return", "")
            : invoiceType + "_return";
        this.applyStockChanges(txn, items, reversedType, now);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AGGREGATION HELPER
    // ─────────────────────────────────────────────────────────────────────────

    private static negateImpact(agg: AggregationImpact): AggregationImpact {
        const result: AggregationImpact = {};
        for (const [k, v] of Object.entries(agg)) {
            if (typeof v === "number" && v !== 0) {
                (result as any)[k] = -v;
            }
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REBUILD — Recalculates ALL balances from source documents
    // ─────────────────────────────────────────────────────────────────────────

    static async rebuildFinancialState(): Promise<{ message: string }> {
        console.log("[FEE] Starting full financial state rebuild...");

        const [transSnap, allBoxes, allCustomers, allSuppliers, allInvoices, allVouchers, allQE] = await Promise.all([
            getDocs(query(collection(db, "transactions"), where("recordStatus", "==", "active"))),
            getDocs(collection(db, "cashBoxes")),
            getDocs(collection(db, "customers")),
            getDocs(collection(db, "suppliers")),
            getDocs(collection(db, "invoices")),
            getDocs(collection(db, "vouchers")),
            getDocs(collection(db, "quick_financial_entries")),
        ]);

        const transactions = transSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
        const boxes = allBoxes.docs.map((d) => ({ ...d.data(), id: d.id }));
        const customers = allCustomers.docs.map((d) => ({ ...d.data(), id: d.id }));
        const suppliers = allSuppliers.docs.map((d) => ({ ...d.data(), id: d.id }));
        const invoices = allInvoices.docs.map((d) => ({ ...d.data(), id: d.id }));
        const vouchers = allVouchers.docs.map((d) => ({ ...d.data(), id: d.id }));
        const quickEntries = allQE.docs.map((d) => ({ ...d.data(), id: d.id }));

        // Recalculate cash box balances
        const { boxBalances } = calculateUnifiedCashBalances(
            boxes as any[], transactions as any[], invoices as any[], vouchers as any[], quickEntries as any[]
        );

        // Recalculate partner balances
        const customerBalances = calculateUnifiedPartnerBalances(
            customers as any[], transactions as any[], invoices as any[], vouchers as any[], quickEntries as any[], "customer"
        );
        const supplierBalances = calculateUnifiedPartnerBalances(
            suppliers as any[], transactions as any[], invoices as any[], vouchers as any[], quickEntries as any[], "supplier"
        );

        const nowIso = new Date().toISOString();
        let batch = writeBatch(db);
        let count = 0;

        const flushBatch = async () => {
            if (count > 0) { await batch.commit(); batch = writeBatch(db); count = 0; }
        };

        const batchUpdate = async (ref: any, data: any) => {
            batch.update(ref, data);
            if (++count >= 400) await flushBatch();
        };

        // Update cash box balances
        for (const [boxId, balance] of Object.entries(boxBalances)) {
            await batchUpdate(doc(db, "cashBoxes", boxId), { balance, updatedAt: nowIso });
        }

        // Update customer balances
        for (const [custId, bal] of Object.entries(customerBalances)) {
            await batchUpdate(doc(db, "customers", custId), { balance: bal.remaining, updatedAt: nowIso });
        }

        // Update supplier balances
        for (const [supId, bal] of Object.entries(supplierBalances)) {
            await batchUpdate(doc(db, "suppliers", supId), { balance: bal.remaining, updatedAt: nowIso });
        }

        await flushBatch();

        console.log("[FEE] Financial state rebuild complete.");
        return { message: "تم إعادة بناء الحالة المالية بنجاح" };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC OPERATION ID GENERATOR
    // ─────────────────────────────────────────────────────────────────────────

    static generateOperationId(type: string): string {
        return `${type}_${generateId()}`;
    }
}
