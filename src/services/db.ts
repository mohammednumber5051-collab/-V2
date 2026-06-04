import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    setDoc,
    getDocs, 
    query, 
    where, 
    orderBy,
    Timestamp,
    increment,
    runTransaction,
    writeBatch,
    limit,
    startAfter,
    QueryConstraint
} from "firebase/firestore";
import { db, auth } from "../firebase";
import firebaseConfig from "../../firebase-applet-config.json";
import { AggregationEngine } from "./aggregationEngine";
import { FinancialEngine } from "./financialEngine";
import { SecurityEngine } from "./securityEngine";
import { 
    AppUser, 
    AggregationImpact,
    OperationType 
} from "../types";

const isPlaceholderConfig = !firebaseConfig || !firebaseConfig.projectId || firebaseConfig.projectId.startsWith("remixed-") || firebaseConfig.projectId.includes("placeholder") || firebaseConfig.projectId.includes("your-");

// Local fallback DB system
const getLocalColl = (coll: string): any[] => {
    try {
        const item = localStorage.getItem(`fp_db_${coll}`);
        return item ? JSON.parse(item) : [];
    } catch (e) {
        return [];
    }
};

const saveLocalColl = (coll: string, data: any[]) => {
    try {
        localStorage.setItem(`fp_db_${coll}`, JSON.stringify(data));
    } catch (e) {
        console.error(`LocalStorage save failed for ${coll}`, e);
    }
};

const generateId = () => Math.random().toString(36).substring(2, 11);

// Initialize default local storage collections if empty
if (isPlaceholderConfig) {
    const defaultUsers = getLocalColl("users");
    const exists = defaultUsers.find(u => u.name === "محمد الصبيحي");
    if (!exists) {
        defaultUsers.push({
            id: "system-admin-default",
            name: "محمد الصبيحي",
            email: "mohammednumber5051@gmail.com",
            password: "1234",
            role: "SUPER_ADMIN",
            permissions: ['*'],
            recordStatus: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        saveLocalColl("users", defaultUsers);
    }
    
    // Default cash box
    const defaultBoxes = getLocalColl("cashBoxes");
    if (defaultBoxes.length === 0) {
        defaultBoxes.push({
            id: "main-box",
            name: "الصندوق الرئيسي",
            balance: 0,
            currency: "YER",
            recordStatus: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        saveLocalColl("cashBoxes", defaultBoxes);
    }
}

export interface FirestoreErrorInfo {
    error: string;
    operationType: OperationType;
    path: string | null;
    authInfo: {
        userId?: string | null;
        email?: string | null;
        emailVerified?: boolean | null;
        isAnonymous?: boolean | null;
        tenantId?: string | null;
        providerInfo?: {
            providerId?: string | null;
            email?: string | null;
        }[];
    }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
        error: error instanceof Error ? error.message : String(error),
        authInfo: {
            userId: auth.currentUser?.uid || null,
            email: auth.currentUser?.email || null,
            emailVerified: auth.currentUser?.emailVerified || null,
            isAnonymous: auth.currentUser?.isAnonymous || null,
            tenantId: auth.currentUser?.tenantId || null,
            providerInfo: auth.currentUser?.providerData?.map(provider => ({
                providerId: provider.providerId,
                email: provider.email,
            })) || []
        },
        operationType,
        path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
}

const getCurrentUser = (): AppUser => {
    try {
        const sessionStr = localStorage.getItem("optical_auth_session");
        if (sessionStr) {
            const session = JSON.parse(sessionStr);
            return {
                id: session.userId,
                name: session.userName,
                role: session.role,
                username: session.userName,
                permissions: ['*'],
                createdAt: new Date(session.createdAt).toISOString()
            };
        }
    } catch(e) {}
    return { 
        id: "system", 
        name: "System", 
        role: "SUPER_ADMIN", 
        username: "system", 
        permissions: ['*'], 
        createdAt: new Date().toISOString() 
    };
};

const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    
    // Protect Firestore special objects from being traversed
    // FieldValue (increment, serverTimestamp) and Timestamp
    if (obj.constructor && (obj.constructor.name === 'Timestamp' || obj.constructor.name === 'FieldValue')) {
        return obj;
    }
    
    // Additional check for minified/direct field matches if constructor name isn't reliable
    if (obj._methodName || (obj.seconds !== undefined && obj.nanoseconds !== undefined)) {
        return obj;
    }

    if (Array.isArray(obj)) return obj.map(cleanData);
    const result: any = {};
    for (const key in obj) {
        if (obj[key] !== undefined) {
            result[key] = cleanData(obj[key]);
        }
    }
    return result;
};

const fixReadData = (data: any): any => {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map(fixReadData);
    
    // Fallback for corrupted FieldValue numbers (like FieldValue.increment) which crash React
    if (data._methodName) {
        return 0; 
    }
    
    const fixed: any = {};
    for (const key in data) {
        fixed[key] = fixReadData(data[key]);
    }
    return fixed;
};

import { localDbService } from "./localDb";

const remoteDbService = {
    async logAudit(action: string, entityType: string, entityId: string, description: string, oldValue?: any, newValue?: any) {
        try {
            const u = getCurrentUser();
            await addDoc(collection(db, "auditLogs"), cleanData({
                userId: u.id || "SYS",
                userName: u.name || "System",
                action,
                entityType,
                entityId,
                description,
                oldValue: oldValue || null,
                newValue: newValue || null,
                deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
                createdAt: new Date().toISOString()
            }));
        } catch (e) {
            console.error("Audit Log Writing Failed", e);
        }
    },

    // Generic methods
    async getPaginated(collectionName: string, pageSize: number, lastVisibleDoc?: any, filters: {field: string, op: any, value: any}[] = []) {
        try {
            const constraints: QueryConstraint[] = [];
            
            for (const f of filters) {
                constraints.push(where(f.field, f.op, f.value));
            }

            if (collectionName !== "auditLogs" && collectionName !== "app_users") {
                constraints.push(where("recordStatus", "==", "active"));
            }
            
            constraints.push(orderBy("updatedAt", "desc"));
            
            if (lastVisibleDoc) {
                constraints.push(startAfter(lastVisibleDoc));
            }
            
            constraints.push(limit(pageSize));
            
            let querySnapshot;
            try {
                querySnapshot = await getDocs(query(collection(db, collectionName), ...constraints));
            } catch (orderedError) {
                console.warn(`Ordered query for ${collectionName} failed or requires index, falling back to unordered fetch.`, orderedError);
                // Fallback for missing index: Try without ordering, just filters and limits. Note: pagination (startAfter) might not work well without order.
                const fallbackConstraints = [];
                for (const f of filters) {
                    fallbackConstraints.push(where(f.field, f.op, f.value));
                }
                
                if (collectionName !== "auditLogs" && collectionName !== "app_users") {
                    fallbackConstraints.push(where("recordStatus", "==", "active"));
                }
                fallbackConstraints.push(limit(pageSize));
                querySnapshot = await getDocs(query(collection(db, collectionName), ...fallbackConstraints));
            }

            const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...fixReadData(doc.data()) }));
            const lastDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

            return {
                data: docs,
                lastDoc,
                hasMore: docs.length === pageSize
            };
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, collectionName);
            throw error;
        }
    },

    async getAll(collectionName: string) {
        try {
            let querySnapshot;
            try {
                querySnapshot = await getDocs(query(collection(db, collectionName), orderBy("updatedAt", "desc")));
            } catch (orderedError) {
                console.warn(`Ordered query for ${collectionName} failed or requires index, falling back to unordered fetch.`, orderedError);
                querySnapshot = await getDocs(collection(db, collectionName));
            }
            const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...fixReadData(doc.data()) }));
            // Only return docs that are not explicitly soft deleted, unless it's auditLogs or users
            let filtered = docs;
            if (collectionName !== "auditLogs" && collectionName !== "app_users") {
                filtered = docs.filter((d: any) => d.recordStatus !== 'deleted');
            }
            
            // Consistently sort in memory to ensure proper order even if fallback or lack of updatedAt field occurred
            filtered.sort((a: any, b: any) => {
                const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return dateB - dateA;
            });
            return filtered;
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, collectionName);
            throw error;
        }
    },

    async getArchived(collectionName: string) {
        try {
            const querySnapshot = await getDocs(query(collection(db, collectionName), orderBy("updatedAt", "desc")));
            const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...fixReadData(doc.data()) }));
            return docs.filter((d: any) => d.recordStatus === 'deleted');
        } catch (error) {
            handleFirestoreError(error, OperationType.GET, collectionName);
            throw error;
        }
    },

    async add(collectionName: string, data: any, disableAudit: boolean = false) {
        try {
            const u = getCurrentUser();
            
            // RBAC Check
            if (!SecurityEngine.validateRoleAccess(u.role, collectionName, 'write')) {
                throw new Error("عذراً، ليس لديك صلاحية إضافة سجلات في هذا القسم");
            }

            const batch = writeBatch(db);
            const docRef = doc(collection(db, collectionName));
            batch.set(docRef, cleanData({
                ...data,
                recordStatus: 'active',
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            }));

            // Dashboard aggregation - base entities
            if (['customers', 'suppliers', 'products', 'cashBoxes'].includes(collectionName)) {
                AggregationEngine.applyEntityCount(batch, collectionName as any, 1);
            }

            // Dashboard aggregation - optical status counters (initial counts)
            if (collectionName === 'repairs' && data.status !== 'تم التسليم') {
                AggregationEngine.applyEntityStatusCount(batch, 'repair', 1);
            }
            if (collectionName === 'special_orders' && data.status === 'جاهز للعميل') {
                AggregationEngine.applyEntityStatusCount(batch, 'specialOrder', 1);
            }
            if (collectionName === 'warranties' && data.status === 'نشط') {
                AggregationEngine.applyEntityStatusCount(batch, 'warranty', 1);
            }

            await batch.commit();
            if (!disableAudit && collectionName !== "auditLogs") {
                await this.logAudit('CREATE', collectionName as any, docRef.id, `تم إنشاء سجل جديد في ${collectionName}`, null, data);
            }
            return docRef.id;
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, collectionName);
            throw error;
        }
    },

    async update(collectionName: string, id: string, data: any, disableAudit: boolean = false) {
        try {
            const u = getCurrentUser();
            
            // 1. RBAC Check
            if (!SecurityEngine.validateRoleAccess(u.role, collectionName, 'write')) {
                throw new Error("عذراً، ليس لديك صلاحية تعديل هذا السجل");
            }

            // 2. Immutability Guard for Accounting
            if (collectionName === 'invoices') {
                const results = await this.getAll('invoices');
                const existing = results.find(i => i.id === id);
                if (existing && existing.lifecycleStatus === 'معتمد' && u.role !== 'SUPER_ADMIN') {
                    throw new Error("لا يمكن تعديل الفواتير المعتمدة. يرجى استخدام نظام المرجوعات أو التواصل مع المدير.");
                }
            }

            const batch = writeBatch(db);
            const docRef = doc(db, collectionName, id);
            
            // Re-fetch existing for audit
            let oldData = null;
            try {
                const snap = await this.getAll(collectionName);
                oldData = snap.find(d => d.id === id);
            } catch(e) {}

            batch.set(docRef, cleanData({
                ...data,
                updatedAt: new Date().toISOString()
            }), { merge: true });

            // Dashboard status transitions (handling most common cases)
            if (collectionName === 'repairs' && data.status === 'تم التسليم') {
                AggregationEngine.applyEntityStatusCount(batch, 'repair', -1);
            } else if (collectionName === 'special_orders' && data.status === 'جاهز للعميل') {
                AggregationEngine.applyEntityStatusCount(batch, 'specialOrder', 1);
            } else if (collectionName === 'special_orders' && data.status === 'تم التسليم للعميل') {
                AggregationEngine.applyEntityStatusCount(batch, 'specialOrder', -1);
            } else if (collectionName === 'warranties' && data.status === 'منتهي') {
                AggregationEngine.applyEntityStatusCount(batch, 'warranty', -1);
            }

            await batch.commit();
            if (!disableAudit && collectionName !== "auditLogs") {
                await this.logAudit('UPDATE', collectionName as any, id, `تم تعديل السجل في ${collectionName}`, oldData, data);
            }
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
            throw error;
        }
    },

    // Replaced dangerous permanent delete with Soft Delete wrapper
    async softDelete(collectionName: string, id: string) {
        try {
            const u = getCurrentUser();
            
            // Immutability Guard
            if (['invoices', 'transactions'].includes(collectionName) && u.role !== 'SUPER_ADMIN') {
                throw new Error("حذف السجلات المالية محظور للأدوار العادية. يرجى التواصل مع مسؤول النظام.");
            }

            const batch = writeBatch(db);
            const docRef = doc(db, collectionName, id);
            batch.update(docRef, {
                recordStatus: 'deleted',
                updatedAt: new Date().toISOString()
            });
            if (['customers', 'suppliers', 'products', 'cashBoxes'].includes(collectionName)) {
                AggregationEngine.applyEntityCount(batch, collectionName as any, -1);
            }
            await batch.commit();

            await this.logAudit('DELETE', collectionName as any, id, `نقل إلى سلة المحذوفات في ${collectionName}`);
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
            throw error;
        }
    },

    async restoreArchived(collectionName: string, id: string) {
        try {
            const u = getCurrentUser();
            if (!SecurityEngine.validateRoleAccess(u.role, collectionName, 'write')) {
                throw new Error("عذراً، ليس لديك صلاحية استعادة سجلات");
            }

            const batch = writeBatch(db);
            const docRef = doc(db, collectionName, id);
            batch.update(docRef, {
                recordStatus: 'active',
                updatedAt: new Date().toISOString()
            });
            if (['customers', 'suppliers', 'products', 'cashBoxes'].includes(collectionName)) {
                AggregationEngine.applyEntityCount(batch, collectionName as any, 1);
            }
            await batch.commit();

            await this.logAudit('RESTORE', collectionName as any, id, `استعادة سجل من المحذوفات في ${collectionName}`);
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
            throw error;
        }
    },

    async delete(collectionName: string, id: string) {
        try {
            const u = getCurrentUser();
            if (u.role !== 'SUPER_ADMIN') {
                throw new Error("عذراً، الحذف النهائي مسموح للمدير العام فقط");
            }
            const batch = writeBatch(db);
            batch.delete(doc(db, collectionName, id));
            await batch.commit();
            await this.logAudit('DELETE', collectionName as any, id, `تم حذف نهائي للسجل من ${collectionName}`);
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
            throw error;
        }
    },

    // Transactional Invoice Creating (updates stock and balances)
    async createInvoice(invoice: any) {
        try {
            const now = new Date().toISOString();
            const user: AppUser = { 
                id: auth.currentUser?.uid || 'sys', 
                name: auth.currentUser?.displayName || 'System',
                username: 'system',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
                createdAt: now
            };

            return await runTransaction(db, async (transaction) => {
                let partnerId = invoice.partnerId;

                // 1. Handle Partner Creation if needed
                if (invoice.autoCreatePartner && !partnerId) {
                    const partnerColl = invoice.type === 'sale' ? "customers" : "suppliers";
                    const pDoc = doc(collection(db, partnerColl));
                    transaction.set(pDoc, cleanData({
                        name: invoice.partnerName,
                        phone: invoice.partnerPhone || "جديد",
                        balance: 0,
                        recordStatus: 'active',
                        updatedAt: now,
                        createdAt: now
                    }));
                    partnerId = pDoc.id;
                }

                // 2. Add Invoice
                const invoiceRef = doc(collection(db, "invoices"));
                const invoiceId = invoiceRef.id;
                transaction.set(invoiceRef, cleanData({
                    ...invoice,
                    partnerId: partnerId,
                    recordStatus: 'active',
                    updatedAt: now,
                    createdAt: invoice.createdAt || now
                }));

                const isApproved = invoice.lifecycleStatus === 'معتمد' || !invoice.lifecycleStatus;
                if (isApproved) {
                    // 3. Update Stock for each item
                    if (invoice.items && Array.isArray(invoice.items)) {
                        for (const item of invoice.items) {
                            if (item.productId && item.productId !== "ledger_entry_item") {
                                const productRef = doc(db, "products", item.productId);
                                const stockChange = invoice.type === 'sale' ? -item.quantity : item.quantity;
                                transaction.set(productRef, cleanData({
                                    stock: increment(stockChange),
                                    updatedAt: now
                                }), { merge: true });
                            }
                        }
                    }

                    // 4. Generate Financial Impact via Engine
                    const impact = FinancialEngine.getInvoiceImpact({ ...invoice, id: invoiceId, partnerId }, user);

                    // Apply Partner Balance Change
                    if (partnerId && impact.partnerBalanceChange !== 0) {
                        const partnerColl = invoice.type === 'sale' ? "customers" : "suppliers";
                        const partnerRef = doc(db, partnerColl, partnerId);
                        transaction.set(partnerRef, cleanData({
                            balance: increment(impact.partnerBalanceChange),
                            updatedAt: now
                        }), { merge: true });
                    }

                    // Apply Cash Box Change
                    if (invoice.boxId && impact.cashBoxBalanceChange !== 0) {
                        const boxRef = doc(db, "cashBoxes", invoice.boxId);
                        transaction.set(boxRef, cleanData({
                            balance: increment(impact.cashBoxBalanceChange),
                            updatedAt: now
                        }), { merge: true });
                    }

                    // Save Standardized Transactions
                    for (const transData of impact.transactions) {
                        const transRef = doc(collection(db, "transactions"));
                        transaction.set(transRef, cleanData({
                            ...transData,
                            recordStatus: 'active',
                            updatedAt: now
                        }));
                    }
                    if (impact.aggregationImpact) {
                        AggregationEngine.applyFinancialImpact(transaction as any, new Date(invoice.createdAt || now), impact.aggregationImpact);
                    }
                }

                return invoiceId;
            });
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'invoices/create');
            throw error;
        }
    },

    async deleteInvoiceData(invoice: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const user: AppUser = { 
                id: auth.currentUser?.uid || 'sys', 
                name: auth.currentUser?.displayName || 'System',
                username: 'system',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
                createdAt: now
            };

            const isApproved = invoice.lifecycleStatus === 'معتمد' || !invoice.lifecycleStatus;
            if (isApproved) {
                // 1. Reverse stock changes
                if (invoice.items && Array.isArray(invoice.items)) {
                    for (const item of invoice.items) {
                        if (item.productId && item.productId !== "ledger_entry_item") {
                            const productRef = doc(db, "products", item.productId);
                            const stockChange = invoice.type === 'sale' ? item.quantity : -item.quantity;
                            batch.set(productRef, cleanData({
                                stock: increment(stockChange),
                                updatedAt: now
                            }), { merge: true });
                        }
                    }
                }

                // 2. Reverse Financial Impact
                // We use the same engine but reverse the results
                const impact = FinancialEngine.getInvoiceImpact(invoice, user);

                if (invoice.partnerId && impact.partnerBalanceChange !== 0) {
                    const partnerColl = invoice.type === 'sale' ? "customers" : "suppliers";
                    const partnerRef = doc(db, partnerColl, invoice.partnerId);
                    batch.set(partnerRef, cleanData({
                        balance: increment(-impact.partnerBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                if (invoice.boxId && impact.cashBoxBalanceChange !== 0) {
                    const boxRef = doc(db, "cashBoxes", invoice.boxId);
                    batch.set(boxRef, cleanData({
                        balance: increment(-impact.cashBoxBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }
                
                const reverseAggImpact = FinancialEngine.getInvoiceImpact(invoice, user, true).aggregationImpact;
                if (reverseAggImpact) {
                    AggregationEngine.applyFinancialImpact(batch, new Date(invoice.createdAt || now), reverseAggImpact);
                }

                // 3. Soft Delete related Transactions
                try {
                    const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", invoice.id)));
                    for (const d of transSnap.docs) {
                        batch.update(doc(db, "transactions", d.id), {
                            recordStatus: 'deleted',
                            updatedAt: now
                        });
                    }
                } catch (err) {
                    console.error("Failed to soft-delete transactions for invoice:", invoice.id, err);
                }
            }

            // 4. Soft Delete the invoice document
            if (invoice.id) {
                const invoiceRef = doc(db, "invoices", invoice.id);
                batch.update(invoiceRef, cleanData({
                    recordStatus: 'deleted',
                    updatedAt: now
                }));
            }

            await batch.commit();
            await this.logAudit('DELETE', 'Invoice', invoice.id, `فاتورة ${invoice.type === 'sale' ? 'مبيعات' : 'مشتريات'} أرسلت للأرشيف`, invoice, null);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `invoices/${invoice.id}/delete`);
            throw error;
        }
    },

    async updateInvoiceData(oldInvoice: any, newInvoiceData: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const user: AppUser = { 
                id: auth.currentUser?.uid || 'sys', 
                name: auth.currentUser?.displayName || 'System',
                username: 'system',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
                createdAt: now
            };

            const oldIsApproved = oldInvoice.lifecycleStatus === 'معتمد' || !oldInvoice.lifecycleStatus;
            const newIsApproved = newInvoiceData.lifecycleStatus === 'معتمد' || !newInvoiceData.lifecycleStatus;

            // --- 1. Reverse OLD Invoice ---
            if (oldIsApproved) {
                // A. Reverse old stock changes
                if (oldInvoice.items && Array.isArray(oldInvoice.items)) {
                    for (const item of oldInvoice.items) {
                        if (item.productId && item.productId !== "ledger_entry_item") {
                            const productRef = doc(db, "products", item.productId);
                            const stockChange = oldInvoice.type === 'sale' ? item.quantity : -item.quantity;
                            batch.set(productRef, cleanData({
                                stock: increment(stockChange),
                                updatedAt: now
                            }), { merge: true });
                        }
                    }
                }

                // B. Reverse old Financial Impact
                const oldImpact = FinancialEngine.getInvoiceImpact(oldInvoice, user);
                if (oldInvoice.partnerId && oldImpact.partnerBalanceChange !== 0) {
                    const partnerColl = oldInvoice.type === 'sale' ? "customers" : "suppliers";
                    const partnerRef = doc(db, partnerColl, oldInvoice.partnerId);
                    batch.set(partnerRef, cleanData({
                        balance: increment(-oldImpact.partnerBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                if (oldInvoice.boxId && oldImpact.cashBoxBalanceChange !== 0) {
                    const boxRef = doc(db, "cashBoxes", oldInvoice.boxId);
                    batch.set(boxRef, cleanData({
                        balance: increment(-oldImpact.cashBoxBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                const reverseAggImpact = FinancialEngine.getInvoiceImpact(oldInvoice, user, true).aggregationImpact;
                if (reverseAggImpact) {
                    AggregationEngine.applyFinancialImpact(batch, new Date(oldInvoice.createdAt || now), reverseAggImpact);
                }

                // C. Delete old transactions tied to this source
                const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", oldInvoice.id)));
                transSnap.forEach(d => {
                    batch.delete(doc(db, "transactions", d.id));
                });
            }

            // --- 2. Apply NEW Invoice ---
            let partnerId = newInvoiceData.partnerId;

            if (newInvoiceData.autoCreatePartner && !partnerId) {
                const partnerColl = newInvoiceData.type === 'sale' ? "customers" : "suppliers";
                const pDoc = doc(collection(db, partnerColl));
                batch.set(pDoc, cleanData({
                    name: newInvoiceData.partnerName,
                    phone: newInvoiceData.partnerPhone || "جديد",
                    balance: 0,
                    recordStatus: 'active',
                    updatedAt: now,
                    createdAt: now
                }));
                partnerId = pDoc.id;
            }

            if (newIsApproved) {
                // A. Apply new stock changes
                if (newInvoiceData.items && Array.isArray(newInvoiceData.items)) {
                    for (const item of newInvoiceData.items) {
                        if (item.productId && item.productId !== "ledger_entry_item") {
                            const productRef = doc(db, "products", item.productId);
                            const stockChange = newInvoiceData.type === 'sale' ? -item.quantity : item.quantity;
                            batch.set(productRef, cleanData({
                                stock: increment(stockChange),
                                updatedAt: now
                            }), { merge: true });
                        }
                    }
                }

                // B. Apply new Financial Impact
                const newImpact = FinancialEngine.getInvoiceImpact({ ...newInvoiceData, id: oldInvoice.id, partnerId }, user);

                if (partnerId && newImpact.partnerBalanceChange !== 0) {
                    const partnerColl = newInvoiceData.type === 'sale' ? "customers" : "suppliers";
                    const partnerRef = doc(db, partnerColl, partnerId);
                    batch.set(partnerRef, cleanData({
                        balance: increment(newImpact.partnerBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                if (newInvoiceData.boxId && newImpact.cashBoxBalanceChange !== 0) {
                    const boxRef = doc(db, "cashBoxes", newInvoiceData.boxId);
                    batch.set(boxRef, cleanData({
                        balance: increment(newImpact.cashBoxBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                // C. Save New Transactions
                for (const transData of newImpact.transactions) {
                    const transRef = doc(collection(db, "transactions"));
                    batch.set(transRef, cleanData({
                        ...transData,
                        recordStatus: 'active',
                        updatedAt: now
                    }));
                }
                
                if (newImpact.aggregationImpact) {
                    AggregationEngine.applyFinancialImpact(batch, new Date(newInvoiceData.createdAt || now), newImpact.aggregationImpact);
                }
            }

            // --- 3. Update the invoice document ---
            if (oldInvoice.id) {
                const invoiceRef = doc(db, "invoices", oldInvoice.id);
                batch.set(invoiceRef, cleanData({
                    ...newInvoiceData,
                    partnerId: partnerId,
                    updatedAt: now
                }), { merge: true });
            }

            await batch.commit();
            await this.logAudit('UPDATE', 'Invoice', oldInvoice.id, `تعديل فاتورة ${oldInvoice.type === 'sale' ? 'مبيعات' : 'مشتريات'}`, oldInvoice, newInvoiceData);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `invoices/${oldInvoice.id}/update`);
            throw error;
        }
    },

    // Add financial transaction and update balance
    async addTransaction(trans: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const transRef = doc(collection(db, "transactions"));
            batch.set(transRef, cleanData({
                ...trans,
                createdAt: now,
                updatedAt: now
            }));

            const impact: AggregationImpact = { transactionCount: 1 };

            if (trans.partnerId) {
                const collectionName = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, collectionName, trans.partnerId);
                batch.set(partnerRef, cleanData({
                    balance: increment(-trans.amount),
                    updatedAt: now
                }), { merge: true });

                if (trans.type === 'قبض' || trans.type === 'customer_receipt') {
                    impact.receiptsTotal = trans.amount;
                    impact.receivablesChange = -trans.amount;
                } else {
                    impact.paymentsTotal = trans.amount;
                    impact.payablesChange = -trans.amount;
                }
            }

            if (trans.boxId) {
                const boxRef = doc(db, "cashBoxes", trans.boxId);
                const boxAmount = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? trans.amount : -trans.amount;
                batch.set(boxRef, cleanData({
                    balance: increment(boxAmount),
                    updatedAt: now
                }), { merge: true });
                impact.cashBalanceChange = boxAmount;
            }

            AggregationEngine.applyFinancialImpact(batch, new Date(trans.createdAt || now), impact);

            await batch.commit();
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'transactions/add');
            throw error;
        }
    },

    async updateTransactionData(oldTrans: any, newTrans: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            // Reverse old effects
            const oldImpact: AggregationImpact = { transactionCount: -1 };
            if (oldTrans.partnerId) {
                const collectionName = (oldTrans.type === 'قبض' || oldTrans.type === 'customer_receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, collectionName, oldTrans.partnerId);
                batch.set(partnerRef, cleanData({
                    balance: increment(oldTrans.amount),
                    updatedAt: now
                }), { merge: true });
                
                if (oldTrans.type === 'قبض' || oldTrans.type === 'customer_receipt') {
                    oldImpact.receiptsTotal = -oldTrans.amount;
                    oldImpact.receivablesChange = oldTrans.amount;
                } else {
                    oldImpact.paymentsTotal = -oldTrans.amount;
                    oldImpact.payablesChange = oldTrans.amount;
                }
            }
            if (oldTrans.boxId) {
                const boxRef = doc(db, "cashBoxes", oldTrans.boxId);
                const boxAmount = (oldTrans.type === 'قبض' || oldTrans.type === 'customer_receipt') ? oldTrans.amount : -oldTrans.amount;
                batch.set(boxRef, cleanData({
                    balance: increment(-boxAmount),
                    updatedAt: now
                }), { merge: true });
                oldImpact.cashBalanceChange = -boxAmount;
            }
            AggregationEngine.applyFinancialImpact(batch, new Date(oldTrans.createdAt || now), oldImpact);

            // Apply new effects
            const newImpact: AggregationImpact = { transactionCount: 1 };
            if (newTrans.partnerId) {
                const collectionName = (newTrans.type === 'قبض' || newTrans.type === 'customer_receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, collectionName, newTrans.partnerId);
                batch.set(partnerRef, cleanData({
                    balance: increment(-newTrans.amount),
                    updatedAt: now
                }), { merge: true });

                if (newTrans.type === 'قبض' || newTrans.type === 'customer_receipt') {
                    newImpact.receiptsTotal = newTrans.amount;
                    newImpact.receivablesChange = -newTrans.amount;
                } else {
                    newImpact.paymentsTotal = newTrans.amount;
                    newImpact.payablesChange = -newTrans.amount;
                }
            }
            if (newTrans.boxId) {
                const boxRef = doc(db, "cashBoxes", newTrans.boxId);
                const boxAmount = (newTrans.type === 'قبض' || newTrans.type === 'customer_receipt') ? newTrans.amount : -newTrans.amount;
                batch.set(boxRef, cleanData({
                    balance: increment(boxAmount),
                    updatedAt: now
                }), { merge: true });
                newImpact.cashBalanceChange = boxAmount;
            }
            AggregationEngine.applyFinancialImpact(batch, new Date(newTrans.createdAt || now), newImpact);

            // Update transaction doc
            const transRef = doc(db, "transactions", oldTrans.id);
            batch.set(transRef, cleanData({
                ...newTrans,
                updatedAt: now
            }), { merge: true });

            await batch.commit();
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `transactions/${oldTrans.id}/update`);
            throw error;
        }
    },

    async deleteTransactionData(trans: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const impact: AggregationImpact = { transactionCount: -1 };

            // Reverse effects
            if (trans.type === 'تحويل') {
                if (trans.fromBoxId) {
                    const fromRef = doc(db, "cashBoxes", trans.fromBoxId);
                    batch.set(fromRef, cleanData({
                        balance: increment(trans.amount),
                        updatedAt: now
                    }), { merge: true });
                }
                if (trans.toBoxId) {
                    const toRef = doc(db, "cashBoxes", trans.toBoxId);
                    batch.set(toRef, cleanData({
                        balance: increment(-trans.amount),
                        updatedAt: now
                    }), { merge: true });
                }
            } else {
                if (trans.partnerId) {
                    const collectionName = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? 'customers' : 'suppliers';
                    const partnerRef = doc(db, collectionName, trans.partnerId);
                    batch.set(partnerRef, cleanData({
                        balance: increment(trans.amount),
                        updatedAt: now
                    }), { merge: true });

                    if (trans.type === 'قبض' || trans.type === 'customer_receipt') {
                        impact.receiptsTotal = -trans.amount;
                        impact.receivablesChange = trans.amount;
                    } else {
                        impact.paymentsTotal = -trans.amount;
                        impact.payablesChange = trans.amount;
                    }
                }
                if (trans.boxId) {
                    const boxRef = doc(db, "cashBoxes", trans.boxId);
                    const boxAmount = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? trans.amount : -trans.amount;
                    batch.set(boxRef, cleanData({
                        balance: increment(-boxAmount),
                        updatedAt: now
                    }), { merge: true });
                    impact.cashBalanceChange = -boxAmount;
                }
            }

            AggregationEngine.applyFinancialImpact(batch, new Date(trans.createdAt || now), impact);
            
            // Soft Delete doc
            if (trans.id) {
                const transRef = doc(db, "transactions", trans.id);
                batch.update(transRef, cleanData({
                    recordStatus: 'deleted',
                    updatedAt: now
                }));
            }
            await batch.commit();
            await this.logAudit('DELETE', 'Transaction', trans.id, `إرسال حركة مالية بقيمة ${trans.amount} للأرشيف`, trans, null);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `transactions/${trans.id}/delete`);
            throw error;
        }
    },

    async deleteAllTransactions() {
        const transList = await this.getAll("transactions");
        for (const t of transList) {
            try {
                await this.deleteTransactionData(t);
            } catch (err) {
                console.error("Failed to delete transaction data for:", t.id, err);
                const transRef = doc(db, "transactions", t.id);
                await deleteDoc(transRef).catch(e => {
                    handleFirestoreError(e, OperationType.DELETE, `transactions/${t.id}`);
                });
            }
        }
    },
    async createTransfer(fromBoxId: string, toBoxId: string, amount: number, currency: string, description: string) {
        try {
            const batch = writeBatch(db);
            const fromRef = doc(db, "cashBoxes", fromBoxId);
            const toRef = doc(db, "cashBoxes", toBoxId);
            const transRef = doc(collection(db, "transactions"));
            const now = new Date().toISOString();

            batch.set(fromRef, cleanData({
                balance: increment(-amount),
                updatedAt: now
            }), { merge: true });

            batch.set(toRef, cleanData({
                balance: increment(amount),
                updatedAt: now
            }), { merge: true });

            batch.set(transRef, cleanData({
                type: 'تحويل',
                amount,
                currency,
                description,
                fromBoxId,
                toBoxId,
                recordStatus: 'active',
                createdAt: now,
                updatedAt: now
            }));

            AggregationEngine.applyFinancialImpact(batch, new Date(now), { transactionCount: 1 });

            await batch.commit();
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'transactions/transfer');
            throw error;
        }
    },

    async updateBoxBalance(boxId: string, amount: number) {
        try {
            const boxRef = doc(db, "cashBoxes", boxId);
            await updateDoc(boxRef, {
                balance: increment(amount),
                updatedAt: new Date().toISOString()
            }).catch(async (e) => {
                // fallback if doc doesn't exist
                await setDoc(boxRef, {
                    balance: amount,
                    updatedAt: new Date().toISOString()
                }, { merge: true }).catch(error => {
                    handleFirestoreError(error, OperationType.WRITE, `cashBoxes/${boxId}`);
                });
            });
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `cashBoxes/${boxId}`);
            throw error;
        }
    },

    async createFullDatabaseBackup() {
        const collectionsList = [
            "users", 
            "products", 
            "customers", 
            "suppliers", 
            "invoices", 
            "transactions", 
            "cashBoxes", 
            "warranties", 
            "repairJobs", 
            "specialOrders", 
            "auditLogs"
        ];
        
        const backupData: Record<string, any[]> = {};
        
        for (const colName of collectionsList) {
            try {
                const querySnapshot = await getDocs(collection(db, colName));
                const docs = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                backupData[colName] = docs;
            } catch (error) {
                console.error(`Failed to export collection ${colName}:`, error);
                backupData[colName] = [];
            }
        }
        
        return {
            version: "1.0",
            createdAt: new Date().toISOString(),
            collections: backupData
        };
    },

    async restoreFullDatabaseBackup(backupJson: any, onProgress?: (msg: string) => void) {
        if (!backupJson || typeof backupJson !== 'object' || !backupJson.collections) {
            throw new Error("ملف النسخة الاحتياطية غير صالح أو تالف.");
        }
        
        const collections = backupJson.collections;
        const keys = Object.keys(collections);
        
        for (const colName of keys) {
            const docs = collections[colName];
            if (!Array.isArray(docs)) continue;
            
            if (onProgress) onProgress(`جاري استعادة مجموعة: ${colName} (${docs.length} سجل)...`);
            
            for (const docData of docs) {
                const { id, ...cleanDoc } = docData;
                if (!id) continue;
                
                const docRef = doc(db, colName, id);
                await setDoc(docRef, cleanData({
                    ...cleanDoc,
                    updatedAt: new Date().toISOString()
                }), { merge: true });
            }
        }
        
        await this.logAudit('SETTINGS_CHANGE', 'System', 'RESTORE', 'تم استعادة قاعدة البيانات من نسخة احتياطية بنجاح');
    },

    async getStoreSettings(): Promise<any> {
        try {
            const docRef = doc(db, "settings", "main_settings");
            const snap = await getDocs(query(collection(db, "settings")));
            const mainDoc = snap.docs.find(d => d.id === 'main_settings');
            
            const defaultSettings = {
                id: 'main_settings',
                storeNameAr: 'مركز الصبيحي للبصريات والنظارات',
                phone: '777123456',
                whatsapp: '777123456',
                address: 'اليمن - صنعاء - شارع البصريات الرئيسي',
                printLogo: true,
                printStoreName: true,
                printPhone: true,
                printAddress: true,
                printWhatsapp: true,
                printQR: true,
                printFooterText: 'شكراً لزيارتكم — نتمنى لكم دوام الصحة',
                defaultPrintSize: 'A4',
                language: 'ar',
                defaultTheme: 'system',
                primaryColor: '#3b82f6',
                accentColor: '#10b981',
                updatedAt: new Date().toISOString()
            };

            if (!mainDoc) {
                // Return default but don't save yet to avoid permission issues during guest view
                return defaultSettings;
            }
            return { id: 'main_settings', ...fixReadData(mainDoc.data()) };
        } catch (error) {
            console.error("Failed to fetch settings, using defaults", error);
            return { id: 'main_settings' };
        }
    },

    async updateStoreSettings(data: any) {
        try {
            const docRef = doc(db, "settings", "main_settings");
            await setDoc(docRef, cleanData({
                ...data,
                updatedAt: new Date().toISOString()
            }), { merge: true });
            await this.logAudit('UPDATE_SETTINGS', 'System', 'main_settings', 'تم تحديث إعدادات المتجر والهوية البصرية');
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, "settings/main_settings");
            throw error;
        }
    },

    async createQuickFinancialEntry(entry: any) {
        try {
            const user: AppUser = { 
                id: auth.currentUser?.uid || 'sys', 
                name: auth.currentUser?.displayName || 'System',
                username: 'system',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
                createdAt: new Date().toISOString()
            };
            return await runTransaction(db, async (transaction) => {
                const now = new Date().toISOString();
                const entryRef = doc(collection(db, "quick_financial_entries"));
                
                // 1. Handle Partner Creation/Update if needed
                let partnerId = entry.partnerId;
                if (entry.partnerType !== 'none' && !partnerId) {
                    const partnerColl = entry.partnerType === 'customer' ? "customers" : "suppliers";
                    const pDoc = doc(collection(db, partnerColl));
                    transaction.set(pDoc, cleanData({
                        name: entry.partnerName,
                        phone: entry.partnerPhone || "جديد",
                        balance: 0,
                        recordStatus: 'active',
                        updatedAt: now,
                        createdAt: now
                    }));
                    partnerId = pDoc.id;
                }

                // 2. Add Quick Entry record
                transaction.set(entryRef, cleanData({
                    ...entry,
                    partnerId,
                    recordStatus: 'active',
                    updatedAt: now,
                    createdAt: now
                }));

                const impact = FinancialEngine.getQuickEntryImpact({ ...entry, id: entryRef.id, partnerId }, user);

                // 3. Update Partner Balance
                if (partnerId && impact.partnerBalanceChange !== 0) {
                    const partnerCollection = entry.partnerType === 'customer' ? "customers" : "suppliers";
                    const partnerRef = doc(db, partnerCollection, partnerId);
                    transaction.set(partnerRef, cleanData({
                        balance: increment(impact.partnerBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                // 4. Update Cash Box Balance
                if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
                    const boxRef = doc(db, "cashBoxes", entry.cashBoxId);
                    transaction.set(boxRef, cleanData({
                        balance: increment(impact.cashBoxBalanceChange),
                        updatedAt: now
                    }), { merge: true });
                }

                // 5. Generate Standardized Transactions
                for (const transData of impact.transactions) {
                    const transRef = doc(collection(db, "transactions"));
                    transaction.set(transRef, cleanData({
                        ...transData,
                        recordStatus: 'active',
                        updatedAt: now
                    }));
                }
                
                if (impact.aggregationImpact) {
                    AggregationEngine.applyFinancialImpact(transaction as any, new Date(now), impact.aggregationImpact);
                }

                return entryRef.id;
            });
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'quick_financial_entries/create');
            throw error;
        }
    },

    async deleteQuickFinancialEntry(entry: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const user: AppUser = { 
                id: auth.currentUser?.uid || 'sys', 
                name: auth.currentUser?.displayName || 'System',
                username: 'system',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
                createdAt: now
            };

            // 1. Reverse Financial Impact
            const impact = FinancialEngine.getQuickEntryImpact(entry, user);

            if (entry.partnerId && impact.partnerBalanceChange !== 0) {
                const partnerCollection = entry.partnerType === 'customer' ? "customers" : "suppliers";
                const partnerRef = doc(db, partnerCollection, entry.partnerId);
                batch.set(partnerRef, cleanData({
                    balance: increment(-impact.partnerBalanceChange),
                    updatedAt: now
                }), { merge: true });
            }

            if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
                const boxRef = doc(db, "cashBoxes", entry.cashBoxId);
                batch.set(boxRef, cleanData({
                    balance: increment(-impact.cashBoxBalanceChange),
                    updatedAt: now
                }), { merge: true });
            }
            
            const reverseAggImpact = FinancialEngine.getQuickEntryImpact(entry, user, true).aggregationImpact;
            if (reverseAggImpact) {
                AggregationEngine.applyFinancialImpact(batch, new Date(entry.createdAt || now), reverseAggImpact);
            }

            // 2. Soft Delete the Entry
            const entryRef = doc(db, "quick_financial_entries", entry.id);
            batch.update(entryRef, cleanData({
                recordStatus: 'deleted',
                updatedAt: now
            }));

            // 3. Soft Delete the related transactions using sourceId
            try {
                const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", entry.id)));
                for (const d of transSnap.docs) {
                    batch.update(doc(db, "transactions", d.id), {
                        recordStatus: 'deleted',
                        updatedAt: now
                    });
                }
            } catch (err) {
                console.error("Failed to soft-delete transactions for quick entry:", entry.id, err);
            }

            await batch.commit();
            await this.logAudit('DELETE', 'QuickEntry', entry.id, `حذف إدخال سريع بقيمة ${entry.netAmount}`, entry, null);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `quick_financial_entries/${entry.id}/delete`);
            throw error;
        }
    },

    async updateQuickFinancialEntry(oldEntry: any, newEntry: any) {
        try {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const user: AppUser = { 
                id: auth.currentUser?.uid || 'sys', 
                name: auth.currentUser?.displayName || 'System',
                username: 'system',
                role: 'SUPER_ADMIN',
                permissions: ['*'],
                createdAt: now
            };

            // --- 1. REVERSE OLD ---
            const oldImpact = FinancialEngine.getQuickEntryImpact(oldEntry, user);
            if (oldEntry.partnerId && oldImpact.partnerBalanceChange !== 0) {
                const partnerCollection = oldEntry.partnerType === 'customer' ? "customers" : "suppliers";
                const partnerRef = doc(db, partnerCollection, oldEntry.partnerId);
                batch.set(partnerRef, cleanData({
                    balance: increment(-oldImpact.partnerBalanceChange),
                    updatedAt: now
                }), { merge: true });
            }

            if (oldEntry.cashBoxId && oldImpact.cashBoxBalanceChange !== 0) {
                const boxRef = doc(db, "cashBoxes", oldEntry.cashBoxId);
                batch.set(boxRef, cleanData({
                    balance: increment(-oldImpact.cashBoxBalanceChange),
                    updatedAt: now
                }), { merge: true });
            }

            // Delete old transactions
            try {
                const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", oldEntry.id)));
                for (const d of transSnap.docs) {
                    batch.delete(doc(db, "transactions", d.id));
                }
            } catch (err) {
                console.error("Failed to cleanup transactions for updated quick entry:", oldEntry.id, err);
            }
            
            const reverseAggImpact = FinancialEngine.getQuickEntryImpact(oldEntry, user, true).aggregationImpact;
            if (reverseAggImpact) {
                AggregationEngine.applyFinancialImpact(batch, new Date(oldEntry.createdAt || now), reverseAggImpact);
            }

            // --- 2. APPLY NEW ---
            let partnerId = newEntry.partnerId;
            if (newEntry.autoCreatePartner && !partnerId) {
                const partnerColl = newEntry.partnerType === 'customer' ? "customers" : "suppliers";
                const pDoc = doc(collection(db, partnerColl));
                batch.set(pDoc, cleanData({
                    name: newEntry.partnerName,
                    phone: newEntry.partnerPhone || "جديد",
                    balance: 0,
                    recordStatus: 'active',
                    updatedAt: now,
                    createdAt: now
                }));
                partnerId = pDoc.id;
            }

            const newImpact = FinancialEngine.getQuickEntryImpact({ ...newEntry, id: oldEntry.id, partnerId }, user);
            if (partnerId && newImpact.partnerBalanceChange !== 0) {
                const partnerCollection = newEntry.partnerType === 'customer' ? "customers" : "suppliers";
                const partnerRef = doc(db, partnerCollection, partnerId);
                batch.set(partnerRef, cleanData({
                    balance: increment(newImpact.partnerBalanceChange),
                    updatedAt: now
                }), { merge: true });
            }

            if (newEntry.cashBoxId && newImpact.cashBoxBalanceChange !== 0) {
                const boxRef = doc(db, "cashBoxes", newEntry.cashBoxId);
                batch.set(boxRef, cleanData({
                    balance: increment(newImpact.cashBoxBalanceChange),
                    updatedAt: now
                }), { merge: true });
            }

            // Save new transactions
            for (const transData of newImpact.transactions) {
                const transRef = doc(collection(db, "transactions"));
                batch.set(transRef, cleanData({
                    ...transData,
                    recordStatus: 'active',
                    updatedAt: now
                }));
            }
            
            if (newImpact.aggregationImpact) {
                AggregationEngine.applyFinancialImpact(batch, new Date(newEntry.createdAt || now), newImpact.aggregationImpact);
            }

            const entryRef = doc(db, "quick_financial_entries", oldEntry.id);
            batch.set(entryRef, cleanData({
                ...newEntry,
                partnerId,
                updatedAt: now
            }), { merge: true });

            await batch.commit();
            await this.logAudit('UPDATE', 'QuickEntry', oldEntry.id, `تحديث إدخال سريع`, oldEntry, newEntry);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `quick_financial_entries/${oldEntry.id}/update`);
            throw error;
        }
    }
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 2500): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
        )
    ]);
}

export const dbService = {
    async logAudit(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.logAudit as any)(...args);
        try {
            return await withTimeout((remoteDbService.logAudit as any)(...args));
        } catch (e) {
            console.warn("[dbService] remote logAudit failed, falling back to localDbService", e);
            return await (localDbService.logAudit as any)(...args);
        }
    },
    async getAll(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.getAll as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.getAll as any)(...args));
            // Symmetrically cache results locally
            try {
                const collectionName = args[0];
                if (res && Array.isArray(res) && collectionName) {
                    saveLocalColl(collectionName, res);
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote getAll(${args[0]}) failed, falling back to localDbService`, e);
            return await (localDbService.getAll as any)(...args);
        }
    },
    async getArchived(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.getArchived as any)(...args);
        try {
            return await withTimeout((remoteDbService.getArchived as any)(...args));
        } catch (e) {
            console.warn(`[dbService] remote getArchived(${args[0]}) failed, falling back to localDbService`, e);
            return await (localDbService.getArchived as any)(...args);
        }
    },
    async getPaginated(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.getPaginated as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.getPaginated as any)(...args)) as any;
            // Symmetrically cache the first page
            try {
                const collectionName = args[0];
                const lastVisibleDoc = args[2];
                if (res && res.data && Array.isArray(res.data) && !lastVisibleDoc && collectionName) {
                    const existingLocal = getLocalColl(collectionName);
                    const merged = [...res.data];
                    for (const item of existingLocal) {
                        const hasNew = merged.some(m => m.id === item.id);
                        if (!hasNew) {
                            merged.push(item);
                        }
                    }
                    saveLocalColl(collectionName, merged);
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote getPaginated(${args[0]}) failed, falling back to localDbService`, e);
            return await (localDbService.getPaginated as any)(...args);
        }
    },
    async add(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.add as any)(...args);
        try {
            const newId = await withTimeout((remoteDbService.add as any)(...args));
            try {
                const collectionName = args[0];
                const data = args[1];
                if (collectionName && data) {
                    const localColl = getLocalColl(collectionName);
                    const localDoc = { ...data, id: newId, recordStatus: 'active', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
                    localColl.push(localDoc);
                    saveLocalColl(collectionName, localColl);
                }
            } catch (e) {}
            return newId;
        } catch (e) {
            console.warn(`[dbService] remote add(${args[0]}) failed, falling back to localDbService`, e);
            return await (localDbService.add as any)(...args);
        }
    },
    async update(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.update as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.update as any)(...args));
            try {
                const collectionName = args[0];
                const id = args[1];
                const data = args[2];
                if (collectionName && id && data) {
                    const localColl = getLocalColl(collectionName);
                    const idx = localColl.findIndex(item => item.id === id);
                    if (idx !== -1) {
                        localColl[idx] = { ...localColl[idx], ...data, updatedAt: new Date().toISOString() };
                        saveLocalColl(collectionName, localColl);
                    }
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote update(${args[0]}, ${args[1]}) failed, falling back to localDbService`, e);
            return await (localDbService.update as any)(...args);
        }
    },
    async softDelete(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.softDelete as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.softDelete as any)(...args));
            try {
                const collectionName = args[0];
                const id = args[1];
                if (collectionName && id) {
                    const localColl = getLocalColl(collectionName);
                    const idx = localColl.findIndex(item => item.id === id);
                    if (idx !== -1) {
                        localColl[idx].recordStatus = 'deleted';
                        localColl[idx].updatedAt = new Date().toISOString();
                        saveLocalColl(collectionName, localColl);
                    }
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote softDelete(${args[0]}, ${args[1]}) failed, falling back to localDbService`, e);
            return await (localDbService.softDelete as any)(...args);
        }
    },
    async restoreArchived(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.restoreArchived as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.restoreArchived as any)(...args));
            try {
                const collectionName = args[0];
                const id = args[1];
                if (collectionName && id) {
                    const localColl = getLocalColl(collectionName);
                    const idx = localColl.findIndex(item => item.id === id);
                    if (idx !== -1) {
                        localColl[idx].recordStatus = 'active';
                        localColl[idx].updatedAt = new Date().toISOString();
                        saveLocalColl(collectionName, localColl);
                    }
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote restoreArchived(${args[0]}, ${args[1]}) failed, falling back to localDbService`, e);
            return await (localDbService.restoreArchived as any)(...args);
        }
    },
    async delete(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.delete as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.delete as any)(...args));
            try {
                const collectionName = args[0];
                const id = args[1];
                if (collectionName && id) {
                    const localColl = getLocalColl(collectionName);
                    const filtered = localColl.filter(item => item.id !== id);
                    saveLocalColl(collectionName, filtered);
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote delete(${args[0]}, ${args[1]}) failed, falling back to localDbService`, e);
            return await (localDbService.delete as any)(...args);
        }
    },
    async createInvoice(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.createInvoice as any)(...args);
        try {
            const resInvoiceId = await withTimeout((remoteDbService.createInvoice as any)(...args));
            try {
                const invoice = args[0];
                if (invoice) {
                    await (localDbService.createInvoice as any)({ ...invoice, id: resInvoiceId });
                }
            } catch (e) {}
            return resInvoiceId;
        } catch (e) {
            console.warn(`[dbService] remote createInvoice failed, falling back to localDbService`, e);
            return await (localDbService.createInvoice as any)(...args);
        }
    },
    async deleteInvoiceData(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.deleteInvoiceData as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.deleteInvoiceData as any)(...args));
            try {
                await (localDbService.deleteInvoiceData as any)(...args);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote deleteInvoiceData failed, falling back to localDbService`, e);
            return await (localDbService.deleteInvoiceData as any)(...args);
        }
    },
    async updateInvoiceData(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.updateInvoiceData as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.updateInvoiceData as any)(...args));
            try {
                await (localDbService.updateInvoiceData as any)(...args);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote updateInvoiceData failed, falling back to localDbService`, e);
            return await (localDbService.updateInvoiceData as any)(...args);
        }
    },
    async addTransaction(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.addTransaction as any)(...args);
        try {
            const resTransId = await withTimeout((remoteDbService.addTransaction as any)(...args));
            try {
                const trans = args[0];
                if (trans) {
                    await (localDbService.addTransaction as any)({ ...trans, id: resTransId });
                }
            } catch (e) {}
            return resTransId;
        } catch (e) {
            console.warn(`[dbService] remote addTransaction failed, falling back to localDbService`, e);
            return await (localDbService.addTransaction as any)(...args);
        }
    },
    async updateTransactionData(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.updateTransactionData as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.updateTransactionData as any)(...args));
            try {
                await (localDbService.updateTransactionData as any)(...args);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote updateTransactionData failed, falling back to localDbService`, e);
            return await (localDbService.updateTransactionData as any)(...args);
        }
    },
    async deleteTransactionData(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.deleteTransactionData as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.deleteTransactionData as any)(...args));
            try {
                await (localDbService.deleteTransactionData as any)(...args);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote deleteTransactionData failed, falling back to localDbService`, e);
            return await (localDbService.deleteTransactionData as any)(...args);
        }
    },
    async deleteAllTransactions(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.deleteAllTransactions as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.deleteAllTransactions as any)(...args));
            try {
                await (localDbService.deleteAllTransactions as any)(...args);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote deleteAllTransactions failed, falling back to localDbService`, e);
            return await (localDbService.deleteAllTransactions as any)(...args);
        }
    },
    async createTransfer(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.createTransfer as any)(...args);
        try {
            const resTransferId = await withTimeout((remoteDbService.createTransfer as any)(...args));
            try {
                const [fromBoxId, toBoxId, amount, currency, description] = args;
                await (localDbService.createTransfer as any)(fromBoxId, toBoxId, amount, currency, description);
            } catch (e) {}
            return resTransferId;
        } catch (e) {
            console.warn(`[dbService] remote createTransfer failed, falling back to localDbService`, e);
            return await (localDbService.createTransfer as any)(...args);
        }
    },
    async updateBoxBalance(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.updateBoxBalance as any)(...args);
        try {
            const res = await withTimeout((remoteDbService.updateBoxBalance as any)(...args));
            try {
                await (localDbService.updateBoxBalance as any)(...args);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote updateBoxBalance failed, falling back to localDbService`, e);
            return await (localDbService.updateBoxBalance as any)(...args);
        }
    },
    async createFullDatabaseBackup(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.createFullDatabaseBackup as any)(...args);
        try {
            return await withTimeout((remoteDbService.createFullDatabaseBackup as any)(...args));
        } catch (e) {
            console.warn(`[dbService] remote createFullDatabaseBackup failed, falling back to localDbService`, e);
            return await (localDbService.createFullDatabaseBackup as any)(...args);
        }
    },
    async restoreFullDatabaseBackup(...args: any[]) {
        if (isPlaceholderConfig) return (localDbService.restoreFullDatabaseBackup as any)(...args);
        try {
            return await withTimeout((remoteDbService.restoreFullDatabaseBackup as any)(...args));
        } catch (e) {
            console.warn(`[dbService] remote restoreFullDatabaseBackup failed, falling back to localDbService`, e);
            return await (localDbService.restoreFullDatabaseBackup as any)(...args);
        }
    },
    async getStoreSettings() {
        if (isPlaceholderConfig) return localDbService.getStoreSettings();
        try {
            const res = await withTimeout(remoteDbService.getStoreSettings());
            try {
                if (res) {
                    localStorage.setItem(`fp_db_settings`, JSON.stringify([res]));
                }
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote getStoreSettings failed, falling back to localDbService`, e);
            return await localDbService.getStoreSettings();
        }
    },
    async updateStoreSettings(data: any) {
        if (isPlaceholderConfig) return localDbService.updateStoreSettings(data);
        try {
            const res = await withTimeout(remoteDbService.updateStoreSettings(data));
            try {
                await localDbService.updateStoreSettings(data);
            } catch (e) {}
            return res;
        } catch (e) {
            console.warn(`[dbService] remote updateStoreSettings failed, falling back to localDbService`, e);
            return await localDbService.updateStoreSettings(data);
        }
    },
    async createQuickFinancialEntry(entry: any) {
        if (isPlaceholderConfig) {
            const id = generateId();
            const coll = getLocalColl("quick_financial_entries");
            coll.push({ ...entry, id, createdAt: new Date().toISOString() });
            saveLocalColl("quick_financial_entries", coll);
            return id;
        }
        try {
            const resEntryId = await withTimeout(remoteDbService.createQuickFinancialEntry(entry));
            try {
                const coll = getLocalColl("quick_financial_entries");
                coll.push({ ...entry, id: resEntryId, createdAt: new Date().toISOString() });
                saveLocalColl("quick_financial_entries", coll);
            } catch (e) {}
            return resEntryId;
        } catch (e) {
            console.warn(`[dbService] remote createQuickFinancialEntry failed, falling back to localDbService`, e);
            const id = generateId();
            const coll = getLocalColl("quick_financial_entries");
            coll.push({ ...entry, id, createdAt: new Date().toISOString() });
            saveLocalColl("quick_financial_entries", coll);
            return id;
        }
    },
    async updateQuickFinancialEntry(oldEntry: any, newEntry: any) {
        if (isPlaceholderConfig) {
            const coll = getLocalColl("quick_financial_entries");
            const idx = coll.findIndex(e => e.id === oldEntry.id);
            if (idx !== -1) {
                coll[idx] = { ...newEntry, id: oldEntry.id, updatedAt: new Date().toISOString() };
                saveLocalColl("quick_financial_entries", coll);
            }
            return;
        }
        try {
            await withTimeout(remoteDbService.updateQuickFinancialEntry(oldEntry, newEntry));
            try {
                const coll = getLocalColl("quick_financial_entries");
                const idx = coll.findIndex(e => e.id === oldEntry.id);
                if (idx !== -1) {
                    coll[idx] = { ...newEntry, id: oldEntry.id, updatedAt: new Date().toISOString() };
                    saveLocalColl("quick_financial_entries", coll);
                }
            } catch (e) {}
        } catch (e) {
            console.warn(`[dbService] remote updateQuickFinancialEntry failed, falling back to localDbService`, e);
            const coll = getLocalColl("quick_financial_entries");
            const idx = coll.findIndex(e => e.id === oldEntry.id);
            if (idx !== -1) {
                coll[idx] = { ...newEntry, id: oldEntry.id, updatedAt: new Date().toISOString() };
                saveLocalColl("quick_financial_entries", coll);
            }
        }
    },
    async deleteQuickFinancialEntry(entry: any) {
        if (isPlaceholderConfig) {
            const coll = getLocalColl("quick_financial_entries");
            const idx = coll.findIndex(e => e.id === entry.id);
            if (idx !== -1) {
                coll[idx].recordStatus = 'deleted';
                saveLocalColl("quick_financial_entries", coll);
            }
            return;
        }
        try {
            await withTimeout(remoteDbService.deleteQuickFinancialEntry(entry));
            try {
                const coll = getLocalColl("quick_financial_entries");
                const idx = coll.findIndex(e => e.id === entry.id);
                if (idx !== -1) {
                    coll[idx].recordStatus = 'deleted';
                    saveLocalColl("quick_financial_entries", coll);
                }
            } catch (e) {}
        } catch (e) {
            console.warn(`[dbService] remote deleteQuickFinancialEntry failed, falling back to localDbService`, e);
            try {
                const coll = getLocalColl("quick_financial_entries");
                const idx = coll.findIndex(e => e.id === entry.id);
                if (idx !== -1) {
                    coll[idx].recordStatus = 'deleted';
                    saveLocalColl("quick_financial_entries", coll);
                }
            } catch (e) {}
        }
    }
};
