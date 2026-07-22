import { app, auth, db, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDocs, getDoc, query, where, orderBy, Timestamp, increment, runTransaction, writeBatch, limit, startAfter, QueryConstraint } from "../firebase";
import { authService } from "./authService";
import { syncEngine } from "./syncEngine";
import { localDbService } from "./localDb";
import { FinancialExecutionEngine } from "./financialExecutionEngine";
import { StoreSettings } from "../types";

export const cleanData = (obj: any): any => {
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
};

import { AggregationEngine } from "./aggregationEngine";
import { FinancialEngine } from "./financialEngine";

function checkShouldBypassRemote() { return false; }

export const dbService = {
    async logAudit(action, entityType, entityId, description, oldValue, newValue, extraDetails) {
        try {
            const u = authService.getCurrentUser();
            await addDoc(collection(db, "audit_logs"), cleanData({
                action, entityType, entityId, description, oldValue, newValue, extraDetails,
                userId: u?.id || "SYS", userName: u?.name || "System", timestamp: new Date().toISOString()
            }));
        } catch(e) {}
    },
    async getAll(collectionName) {
        try {
            const snap = await getDocs(collection(db, collectionName));
            const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            console.log(`[dbService] getAll ${collectionName} returned ${data.length} records from Firestore.`);
            return data;
        } catch (e) {
            console.warn(`[dbService] getAll ${collectionName} failed (likely offline), attempting localDb fallback:`, e);
            const localData = await localDbService.getAll(collectionName);
            console.log(`[dbService] localDb fallback for ${collectionName} returned ${localData.length} records.`);
            return localData;
        }
    },
    async getById(collectionName: string, id: string) {
        try {
            const snap = await getDoc(doc(db, collectionName, id));
            if (snap.exists()) {
                return { ...snap.data(), id: snap.id };
            }
        } catch (e) {
            console.warn(`[dbService] getById ${collectionName}/${id} failed, attempting localDb fallback:`, e);
        }
        const localData = await localDbService.getAll(collectionName);
        return localData.find((item: any) => item.id === id) || null;
    },
    async getPaginated(collectionName, pageSize, lastVisible, filters = []) {
        const constraints = [];
        filters.forEach(f => constraints.push(where(f.field, f.op, f.value)));
        constraints.push(limit(pageSize + 1));
        const q = query(collection(db, collectionName), ...constraints);
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const hasMore = data.length > pageSize;
        const resultData = hasMore ? data.slice(0, pageSize) : data;
        const lastVisibleDoc = snap.docs[resultData.length - 1];
        return { 
            data: resultData, 
            lastDoc: lastVisibleDoc,
            lastVisibleDoc: lastVisibleDoc,
            hasMore 
        };
    },
    async getArchived(collectionName) {
        const snap = await getDocs(query(collection(db, collectionName), where("isArchived", "==", true)));
        return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    },
    async add(collectionName, data) {
        const docRef = await addDoc(collection(db, collectionName), cleanData({ ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
        return docRef.id;
    },
    async update(collectionName, id, data) {
        await setDoc(doc(db, collectionName, id), cleanData({ ...data, updatedAt: new Date().toISOString() }), { merge: true });
    },
    async softDelete(collectionName, id) {
        await deleteDoc(doc(db, collectionName, id));
    },
    async delete(collectionName, id) {
        await deleteDoc(doc(db, collectionName, id));
    },
    async createInvoice(invoice) {
        const batch = writeBatch(db);
        const invRef = doc(collection(db, "invoices"));
        
        const type = invoice.type || 'sale';
        let partnerId = invoice.partnerId;
        if (invoice.autoCreatePartner && !partnerId && invoice.partnerName) {
            const partnerColl = type.includes('sale') ? 'customers' : 'suppliers';
            const partnerRef = doc(collection(db, partnerColl));
            partnerId = partnerRef.id;
            batch.set(partnerRef, cleanData({
                id: partnerId,
                name: invoice.partnerName,
                phone: invoice.partnerPhone || "",
                balance: 0,
                recordStatus: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
            invoice.partnerId = partnerId;
        }

        // Auto-calculate sequential numeric invoiceNumber if not provided
        let invoiceNumber = invoice.invoiceNumber;
        if (!invoiceNumber) {
            try {
                const invoices = await this.getAll("invoices");
                let maxNum = 0;
                invoices.forEach((inv: any) => {
                    if (inv.recordStatus === 'deleted') return;
                    const invType = inv.type || 'sale';
                    const isSameCategory = (type.includes('sale') && invType.includes('sale')) ||
                                           (type.includes('purchase') && invType.includes('purchase')) ||
                                           (invType === type);
                    if (isSameCategory && inv.invoiceNumber) {
                        const num = parseInt(String(inv.invoiceNumber), 10);
                        if (!isNaN(num) && num > maxNum) {
                            maxNum = num;
                        }
                    }
                });
                invoiceNumber = String(maxNum + 1);
            } catch (e) {
                console.warn("Failed to calculate sequential invoice number", e);
                invoiceNumber = String(Date.now());
            }
        }

        // Save the invoice
        batch.set(invRef, cleanData({ ...invoice, invoiceNumber, id: invRef.id, isSystemFixed: true, createdAt: invoice.createdAt || new Date().toISOString() }));
        
        // Update partner balance
        if (partnerId) {
            const partnerColl = type.includes('sale') ? 'customers' : 'suppliers';
            let balChange = invoice.total - invoice.paid;
            if (type.includes('return')) balChange = -balChange;
            batch.update(doc(db, partnerColl, partnerId), { balance: increment(balChange) });
        }

        // Update CashBox balance
        if (invoice.boxId && invoice.paid > 0) {
            const baseType = type.replace('_return', '');
            let boxChange = baseType === 'sale' ? invoice.paid : -invoice.paid;
            if (type.includes('return')) boxChange = -boxChange;
            batch.update(doc(db, "cashBoxes", invoice.boxId), { balance: increment(boxChange) });
        }

        // Update Stock
        if (invoice.items && invoice.items.length > 0) {
            const baseType = type.replace('_return', '');
            const stockChanges = {};
            for (const item of invoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    let stockChange = baseType === 'sale' ? -item.quantity : item.quantity;
                    if (type.includes('return')) stockChange = -stockChange;
                    stockChanges[item.productId] = (stockChanges[item.productId] || 0) + stockChange;
                }
            }
            Object.keys(stockChanges).forEach(pid => {
                if (stockChanges[pid] !== 0) {
                    batch.update(doc(db, "products", pid), { stock: increment(stockChanges[pid]) });
                }
            });
        }

        await batch.commit();
        return invRef.id;
    },
    async deleteInvoiceData(invoice) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "invoices", invoice.id));
        
        const type = invoice.type || 'sale';
        const isFixed = !!invoice.isSystemFixed;
        
        // Revert CashBox balance ONLY if it was a system fixed/new invoice (legacy didn't update CashBox)
        if (isFixed && invoice.boxId && invoice.paid > 0) {
            const baseType = type.replace('_return', '');
            let boxChange = baseType === 'sale' ? invoice.paid : -invoice.paid;
            if (type.includes('return')) boxChange = -boxChange;
            batch.update(doc(db, "cashBoxes", invoice.boxId), { balance: increment(-boxChange) });
        }

        // Revert partner balance
        if (invoice.partnerId) {
            const partnerColl = type.includes('sale') ? 'customers' : 'suppliers';
            let balChange = 0;
            if (isFixed) {
                balChange = invoice.total - invoice.paid;
                if (type.includes('return')) balChange = -balChange;
            } else {
                const baseType = type.replace('_return', '');
                balChange = baseType === 'sale' ? -(invoice.total - invoice.paid) : (invoice.total - invoice.paid);
                if (type.includes('return')) balChange = -balChange;
            }
            batch.update(doc(db, partnerColl, invoice.partnerId), { balance: increment(-balChange) });
        }

        // Revert Stock
        if (invoice.items && invoice.items.length > 0) {
            const baseType = type.replace('_return', '');
            const stockChanges = {};
            for (const item of invoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    let stockChange = 0;
                    if (isFixed) {
                        stockChange = baseType === 'sale' ? -item.quantity : item.quantity;
                    } else {
                        stockChange = baseType === 'sale' ? item.quantity : -item.quantity;
                    }
                    if (type.includes('return')) stockChange = -stockChange;
                    stockChanges[item.productId] = (stockChanges[item.productId] || 0) - stockChange;
                }
            }
            Object.keys(stockChanges).forEach(pid => {
                if (stockChanges[pid] !== 0) {
                    batch.update(doc(db, "products", pid), { stock: increment(stockChanges[pid]) });
                }
            });
        }

        // Soft-delete any ledger (transactions) records tied to this invoice, so they stop
        // being counted by reconciliation/report calculations after the invoice is gone.
        try {
            const linkedSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", invoice.id)));
            linkedSnap.docs.forEach(d => {
                batch.update(d.ref, { recordStatus: 'deleted', updatedAt: new Date().toISOString() });
            });
        } catch (e) {
            console.error("Failed to soft-delete transactions linked to deleted invoice:", e);
        }

        // Reverse this invoice's contribution to the dashboard/daily/monthly report totals,
        // so reports don't keep showing a sale/purchase that no longer exists.
        try {
            const u = authService.getCurrentUser();
            const reversedImpact = FinancialEngine.getInvoiceImpact(invoice, u, true).aggregationImpact;
            if (reversedImpact) {
                AggregationEngine.applyFinancialImpact(batch, new Date(invoice.createdAt || Date.now()), reversedImpact);
            }
        } catch (e) {
            console.error("Failed to reverse report totals for deleted invoice:", e);
        }

        await batch.commit();
    },
    async updateInvoiceData(oldInvoice, newInvoice) {
        const batch = writeBatch(db);
        const invoiceId = newInvoice.id || oldInvoice.id;
        if (!invoiceId) {
            throw new Error("ID الفاتورة غير محدد");
        }
        newInvoice.id = invoiceId;

        batch.set(doc(db, "invoices", invoiceId), cleanData({ ...newInvoice, isSystemFixed: true }), { merge: true });
        
        const oldType = oldInvoice.type || 'sale';
        const newType = newInvoice.type || 'sale';
        const oldBaseType = oldType.replace('_return', '');
        const newBaseType = newType.replace('_return', '');
        const isOldFixed = !!oldInvoice.isSystemFixed;

        // --- CASH BOX BALANCE FIX ---
        const boxChanges = {};
        if (isOldFixed && oldInvoice.boxId && oldInvoice.paid > 0) {
            let oldBox = oldBaseType === 'sale' ? oldInvoice.paid : -oldInvoice.paid;
            if (oldType.includes('return')) oldBox = -oldBox;
            boxChanges[oldInvoice.boxId] = (boxChanges[oldInvoice.boxId] || 0) - oldBox;
        }
        if (newInvoice.boxId && newInvoice.paid > 0) {
            let newBox = newBaseType === 'sale' ? newInvoice.paid : -newInvoice.paid;
            if (newType.includes('return')) newBox = -newBox;
            boxChanges[newInvoice.boxId] = (boxChanges[newInvoice.boxId] || 0) + newBox;
        }
        Object.keys(boxChanges).forEach(boxId => {
            if (boxChanges[boxId] !== 0) {
                batch.update(doc(db, "cashBoxes", boxId), { balance: increment(boxChanges[boxId]) });
            }
        });

        // --- PARTNER BALANCE FIX ---
        const partnerChanges = { customers: {}, suppliers: {} };
        if (oldInvoice.partnerId) {
            const oldPartnerColl = oldType.includes('sale') ? 'customers' : 'suppliers';
            let oldBalChange = 0;
            if (isOldFixed) {
                oldBalChange = oldInvoice.total - oldInvoice.paid;
                if (oldType.includes('return')) oldBalChange = -oldBalChange;
            } else {
                oldBalChange = oldBaseType === 'sale' ? -(oldInvoice.total - oldInvoice.paid) : (oldInvoice.total - oldInvoice.paid);
                if (oldType.includes('return')) oldBalChange = -oldBalChange;
            }
            partnerChanges[oldPartnerColl][oldInvoice.partnerId] = (partnerChanges[oldPartnerColl][oldInvoice.partnerId] || 0) - oldBalChange;
        }
        if (newInvoice.partnerId) {
            const newPartnerColl = newType.includes('sale') ? 'customers' : 'suppliers';
            let newBalChange = newInvoice.total - newInvoice.paid;
            if (newType.includes('return')) newBalChange = -newBalChange;
            partnerChanges[newPartnerColl][newInvoice.partnerId] = (partnerChanges[newPartnerColl][newInvoice.partnerId] || 0) + newBalChange;
        }
        Object.keys(partnerChanges.customers).forEach(pid => {
            if (partnerChanges.customers[pid] !== 0) {
                batch.update(doc(db, 'customers', pid), { balance: increment(partnerChanges.customers[pid]) });
            }
        });
        Object.keys(partnerChanges.suppliers).forEach(pid => {
            if (partnerChanges.suppliers[pid] !== 0) {
                batch.update(doc(db, 'suppliers', pid), { balance: increment(partnerChanges.suppliers[pid]) });
            }
        });

        // --- STOCK BALANCE FIX ---
        const stockChanges = {};
        if (oldInvoice.items && oldInvoice.items.length > 0) {
            for (const item of oldInvoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    let stockChange = 0;
                    if (isOldFixed) {
                        stockChange = oldBaseType === 'sale' ? -item.quantity : item.quantity;
                    } else {
                        stockChange = oldBaseType === 'sale' ? item.quantity : -item.quantity;
                    }
                    if (oldType.includes('return')) stockChange = -stockChange;
                    stockChanges[item.productId] = (stockChanges[item.productId] || 0) - stockChange;
                }
            }
        }
        if (newInvoice.items && newInvoice.items.length > 0) {
            for (const item of newInvoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    let stockChange = newBaseType === 'sale' ? -item.quantity : item.quantity;
                    if (newType.includes('return')) stockChange = -stockChange;
                    stockChanges[item.productId] = (stockChanges[item.productId] || 0) + stockChange;
                }
            }
        }
        Object.keys(stockChanges).forEach(pid => {
            if (stockChanges[pid] !== 0) {
                batch.update(doc(db, "products", pid), { stock: increment(stockChanges[pid]) });
            }
        });

        // Reconcile dashboard/daily/monthly report totals: remove the old invoice's
        // contribution and apply the new one, so edited invoices don't leave stale numbers.
        try {
            const u = authService.getCurrentUser();
            const oldReversed = FinancialEngine.getInvoiceImpact(oldInvoice, u, true).aggregationImpact;
            const newApplied = FinancialEngine.getInvoiceImpact(newInvoice, u, false).aggregationImpact;
            if (oldReversed) AggregationEngine.applyFinancialImpact(batch, new Date(oldInvoice.createdAt || Date.now()), oldReversed);
            if (newApplied) AggregationEngine.applyFinancialImpact(batch, new Date(newInvoice.createdAt || Date.now()), newApplied);
        } catch (e) {
            console.error("Failed to reconcile report totals for edited invoice:", e);
        }

        await batch.commit();
    },
    async addTransaction(trans) {
        const batch = writeBatch(db);
        const transRef = doc(collection(db, "transactions"));
        const type = trans.type || '';
        if (trans.partnerId) {
            const partnerColl = type.includes('customer') || type === 'قبض' ? 'customers' : 'suppliers';
            batch.update(doc(db, partnerColl, trans.partnerId), { balance: increment(type.includes('قبض') || type === 'customer_receipt' ? -trans.amount : trans.amount) });
        }
        batch.set(transRef, cleanData({ ...trans, id: transRef.id, createdAt: new Date().toISOString() }));
        if (trans.boxId) {
            batch.update(doc(db, "cashBoxes", trans.boxId), { balance: increment(type.includes('قبض') || type === 'customer_receipt' ? trans.amount : -trans.amount) });
        }
        await batch.commit();
        return transRef.id;
    },
    async updateTransactionData(oldTrans, newTrans) {
        const batch = writeBatch(db);
        batch.set(doc(db, "transactions", oldTrans.id), cleanData({ ...newTrans, updatedAt: new Date().toISOString() }), { merge: true });

        const oldType = oldTrans.type || '';
        const newType = newTrans.type || '';

        // Revert old transaction's impact
        if (oldTrans.partnerId) {
            const partnerColl = oldType.includes('customer') || oldType === 'قبض' ? 'customers' : 'suppliers';
            batch.update(doc(db, partnerColl, oldTrans.partnerId), { 
                balance: increment(oldType.includes('قبض') || oldType === 'customer_receipt' ? oldTrans.amount : -oldTrans.amount) 
            });
        }
        if (oldTrans.boxId) {
            batch.update(doc(db, "cashBoxes", oldTrans.boxId), { 
                balance: increment(oldType.includes('قبض') || oldType === 'customer_receipt' ? -oldTrans.amount : oldTrans.amount) 
            });
        }

        // Apply new transaction's impact
        if (newTrans.partnerId) {
            const partnerColl = newType.includes('customer') || newType === 'قبض' ? 'customers' : 'suppliers';
            batch.update(doc(db, partnerColl, newTrans.partnerId), { 
                balance: increment(newType.includes('قبض') || newType === 'customer_receipt' ? -newTrans.amount : newTrans.amount) 
            });
        }
        if (newTrans.boxId) {
            batch.update(doc(db, "cashBoxes", newTrans.boxId), { 
                balance: increment(newType.includes('قبض') || newType === 'customer_receipt' ? newTrans.amount : -newTrans.amount) 
            });
        }

        await batch.commit();
    },
    async deleteTransactionData(trans) {
        const batch = writeBatch(db);
        batch.update(doc(db, "transactions", trans.id), { recordStatus: 'deleted', updatedAt: new Date().toISOString() });

        if (trans.type === "تحويل") {
            if (trans.fromBoxId) {
                batch.update(doc(db, "cashBoxes", trans.fromBoxId), { balance: increment(trans.amount) });
            }
            if (trans.toBoxId) {
                batch.update(doc(db, "cashBoxes", trans.toBoxId), { balance: increment(-trans.amount) });
            }
        } else {
            if (trans.partnerId) {
                const partnerColl = (trans.type === "قبض" || trans.type === "customer_receipt") ? "customers" : "suppliers";
                batch.update(doc(db, partnerColl, trans.partnerId), { balance: increment(trans.amount) });
            }
            if (trans.boxId) {
                const change = (trans.type === "قبض" || trans.type === "customer_receipt") ? trans.amount : -trans.amount;
                batch.update(doc(db, "cashBoxes", trans.boxId), { balance: increment(-change) });
            }
        }

        if ((trans.sourceType === "invoice_payment" || trans.sourceType === "manual_receipt" || trans.sourceType === "manual_payment") && trans.sourceId) {
            try {
                const invRef = doc(db, "invoices", trans.sourceId);
                const invSnap = await getDoc(invRef);
                if (invSnap.exists()) {
                    const invData = invSnap.data();
                    const oldPaid = Number(invData.paid || 0);
                    const newPaid = Math.max(0, oldPaid - trans.amount);
                    const netTotal = Number(invData.total || 0) - Number(invData.discount || 0);
                    let newStatus = invData.status;
                    if (newPaid <= 0) {
                        newStatus = "آجل";
                    } else if (newPaid < netTotal) {
                        newStatus = "جزئي";
                    } else {
                        newStatus = "مدفوع";
                    }
                    batch.update(invRef, { paid: newPaid, status: newStatus, updatedAt: new Date().toISOString() });
                }
            } catch (err) {
                console.error("Failed to update invoice linked to deleted transaction:", err);
            }
        }

        await batch.commit();
    },
    async recordInvoicePayment(invoice, amount, boxId, newPaid, newStatus) {
        const batch = writeBatch(db);
        
        const oldPaid = invoice.paid || 0;
        const oldBoxId = invoice.boxId;
        const baseType = invoice.type.replace('_return', '');
        
        let oldBoxChange = baseType === 'sale' ? oldPaid : -oldPaid;
        if (invoice.type.includes('return')) oldBoxChange = -oldBoxChange;

        let newBoxChange = baseType === 'sale' ? newPaid : -newPaid;
        if (invoice.type.includes('return')) newBoxChange = -newBoxChange;

        let finalPaymentType = invoice.paymentType;
        if (newStatus === 'مدفوع') finalPaymentType = 'نقدآ';
        else if (newStatus === 'جزئي') finalPaymentType = 'نقد_آجل';

        batch.update(doc(db, "invoices", invoice.id), { 
            paid: newPaid, 
            status: newStatus,
            boxId: boxId,
            paymentType: finalPaymentType
        });
        
        // Update CashBox
        if (oldBoxId === boxId) {
            batch.update(doc(db, "cashBoxes", boxId), { balance: increment(newBoxChange - oldBoxChange) });
        } else {
            if (oldBoxId) {
                batch.update(doc(db, "cashBoxes", oldBoxId), { balance: increment(-oldBoxChange) });
            }
            if (boxId) {
                batch.update(doc(db, "cashBoxes", boxId), { balance: increment(newBoxChange) });
            }
        }

        // Update Partner balance
        if (invoice.partnerId) {
            const partnerColl = invoice.type.includes('sale') ? 'customers' : 'suppliers';
            let balChange = -amount;
            if (invoice.type.includes('return')) balChange = -balChange;
            batch.update(doc(db, partnerColl, invoice.partnerId), { balance: increment(balChange) });
        }

        // Write the missing ledger record for this payment. Without this, the payment moves
        // money and updates balances but leaves no transaction/receipt trail, which is exactly
        // what causes stored balances to drift from what invoices/receipts actually show.
        const now = new Date().toISOString();
        const transType = invoice.type.includes('sale') ? 'قبض' : 'صرف';
        const u = authService.getCurrentUser();
        const transRef = doc(collection(db, "transactions"));
        batch.set(transRef, cleanData({
            id: transRef.id,
            type: transType,
            amount: amount,
            currency: invoice.currency || 'YER',
            description: `دفعة من الحساب للفاتورة: #${invoice.invoiceNumber || invoice.id?.slice(0, 8).toUpperCase()}`,
            partnerId: invoice.partnerId,
            partnerName: invoice.partnerName,
            boxId: boxId,
            relatedId: invoice.id,
            sourceType: 'invoice_payment',
            sourceId: invoice.id,
            recordStatus: 'active',
            createdAt: now,
            updatedAt: now,
            createdBy: u?.name || 'System',
        }));

        await batch.commit();
        return transRef.id;
    },
    async deleteAllTransactions() {},
    async createTransfer(fromBoxId, toBoxId, amount, currency, description) {
        const batch = writeBatch(db);
        const transRef = doc(collection(db, "transactions"));
        batch.set(transRef, cleanData({ type: "تحويل", amount, fromBoxId, toBoxId, description, createdAt: new Date().toISOString() }));
        batch.update(doc(db, "cashBoxes", fromBoxId), { balance: increment(-amount) });
        batch.update(doc(db, "cashBoxes", toBoxId), { balance: increment(amount) });
        await batch.commit();
        return transRef.id;
    },
    async addVoucher(voucher) {
        const batch = writeBatch(db);
        const voucherRef = doc(collection(db, "vouchers"));
        batch.set(voucherRef, cleanData({ ...voucher, id: voucherRef.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
        
        // Update CashBox balance
        batch.update(doc(db, "cashBoxes", voucher.boxId), {
            balance: increment(voucher.type === 'receipt' ? voucher.amount : -voucher.amount)
        });

        // Update Partner balance
        if (voucher.partnerId && voucher.partnerType && voucher.partnerType !== 'none') {
            const partnerColl = voucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            let balChange = 0;
            if (voucher.partnerType === 'customer') {
                balChange = voucher.type === 'receipt' ? -voucher.amount : voucher.amount;
            } else {
                balChange = -voucher.amount;
            }
            batch.update(doc(db, partnerColl, voucher.partnerId), {
                balance: increment(balChange)
            });
        }

        await batch.commit();
        return voucherRef.id;
    },
    async updateVoucher(oldVoucher, newVoucher) {
        const batch = writeBatch(db);
        batch.set(doc(db, "vouchers", newVoucher.id), cleanData({ ...newVoucher, updatedAt: new Date().toISOString() }), { merge: true });
        
        // Update CashBox balances
        if (oldVoucher.boxId === newVoucher.boxId) {
            const diff = newVoucher.amount - oldVoucher.amount;
            batch.update(doc(db, "cashBoxes", newVoucher.boxId), {
                balance: increment(newVoucher.type === 'receipt' ? diff : -diff)
            });
        } else {
            // Revert old box
            batch.update(doc(db, "cashBoxes", oldVoucher.boxId), {
                balance: increment(oldVoucher.type === 'receipt' ? -oldVoucher.amount : oldVoucher.amount)
            });
            // Apply new box
            batch.update(doc(db, "cashBoxes", newVoucher.boxId), {
                balance: increment(newVoucher.type === 'receipt' ? newVoucher.amount : -newVoucher.amount)
            });
        }

        // Update Partner balances
        // Revert old partner balance
        if (oldVoucher.partnerId && oldVoucher.partnerType && oldVoucher.partnerType !== 'none') {
            const partnerColl = oldVoucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            let oldBalChange = 0;
            if (oldVoucher.partnerType === 'customer') {
                oldBalChange = oldVoucher.type === 'receipt' ? -oldVoucher.amount : oldVoucher.amount;
            } else {
                oldBalChange = -oldVoucher.amount;
            }
            batch.update(doc(db, partnerColl, oldVoucher.partnerId), {
                balance: increment(-oldBalChange)
            });
        }
        // Apply new partner balance
        if (newVoucher.partnerId && newVoucher.partnerType && newVoucher.partnerType !== 'none') {
            const partnerColl = newVoucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            let newBalChange = 0;
            if (newVoucher.partnerType === 'customer') {
                newBalChange = newVoucher.type === 'receipt' ? -newVoucher.amount : newVoucher.amount;
            } else {
                newBalChange = -newVoucher.amount;
            }
            batch.update(doc(db, partnerColl, newVoucher.partnerId), {
                balance: increment(newBalChange)
            });
        }

        await batch.commit();
    },
    async deleteVoucher(voucher) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "vouchers", voucher.id));
        // Revert CashBox balance
        batch.update(doc(db, "cashBoxes", voucher.boxId), {
            balance: increment(voucher.type === 'receipt' ? -voucher.amount : voucher.amount)
        });
        // Revert Partner balance
        if (voucher.partnerId && voucher.partnerType && voucher.partnerType !== 'none') {
            const partnerColl = voucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            let balChange = 0;
            if (voucher.partnerType === 'customer') {
                balChange = voucher.type === 'receipt' ? -voucher.amount : voucher.amount;
            } else {
                balChange = -voucher.amount;
            }
            batch.update(doc(db, partnerColl, voucher.partnerId), {
                balance: increment(-balChange)
            });
        }
        await batch.commit();
    },
    async updateBoxBalance(boxId, amount) {
        await setDoc(doc(db, "cashBoxes", boxId), { balance: amount }, { merge: true });
    },
    async createFullDatabaseBackup() { return null; },
    async restoreFullDatabaseBackup(backupJson: any, callback: (msg: string) => void) { return null; },
    async dumpData() { return null; },
    async getStoreSettings(): Promise<StoreSettings | null> {
        const snap = await getDocs(collection(db, "settings"));
        return snap.docs[0] ? (snap.docs[0].data() as StoreSettings) : null;
    },
    async updateStoreSettings(data) {
        const snap = await getDocs(collection(db, "settings"));
        if (snap.docs[0]) {
            await setDoc(doc(db, "settings", snap.docs[0].id), cleanData(data), { merge: true });
        } else {
            await addDoc(collection(db, "settings"), cleanData(data));
        }
    },
    async recalculateFinancials() {
        const result = await FinancialExecutionEngine.rebuildFinancialState();
        await localDbService.clearLocalData();
        return result;
    },
    async resetAllFinancialData() {
        // Clear EVERYTHING in localStorage
        localStorage.clear();
        
        // Final desperate measure: reload
        window.location.reload();
    }
};

// Wrap with event emitter
Object.keys(dbService).forEach(method => {
    const original = (dbService as any)[method];
    if (typeof original === 'function' && !method.startsWith('get')) {
        (dbService as any)[method] = async function(...args: any[]) {
            const result = await original.apply(this, args);
            try { syncEngine.emit("DATA_CHANGED"); } catch(e) {}
            return result;
        };
    }
});
