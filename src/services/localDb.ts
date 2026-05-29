import firebaseConfig from "../../firebase-applet-config.json";
import { FinancialEngine } from "./financialEngine";
import { AppUser } from "../types";

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

// Initialize default local storage collections if empty
const defaultUsers = getLocalColl("users");
const existsExists = defaultUsers.find(u => u.name === "محمد الصبيحي");
if (!existsExists) {
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

const defaultBoxes = getLocalColl("cashBoxes");
if (defaultBoxes.length === 0) {
    defaultBoxes.push({
        id: "main-box",
        name: "الصندوق الرئيسي",
        balance: 100000,
        currency: "YER",
        recordStatus: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    saveLocalColl("cashBoxes", defaultBoxes);
}

export const localDbService = {
    async logAudit(action: string, entityType: string, entityId: string, description: string, oldValue?: any, newValue?: any) {
        try {
            const u = getCurrentUser();
            const auditLogs = getLocalColl("auditLogs");
            auditLogs.push({
                id: generateId(),
                userId: u.id || "SYS",
                userName: u.name || "System",
                action,
                entityType,
                entityId,
                description,
                oldValue: oldValue || null,
                newValue: newValue || null,
                deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            saveLocalColl("auditLogs", auditLogs);
        } catch (e) {
            console.error("Local audit log writing failed", e);
        }
    },

    async getAll(collectionName: string) {
        const data = getLocalColl(collectionName);
        let filtered = data;
        if (collectionName !== "auditLogs" && collectionName !== "app_users") {
            filtered = data.filter((d: any) => d.recordStatus !== 'deleted');
        }
        filtered.sort((a: any, b: any) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateB - dateA;
        });
        return filtered;
    },

    async getPaginated(collectionName: string, pageSize: number, lastVisibleDoc?: any, filters: {field: string, op: any, value: any}[] = []) {
        let allData = await this.getAll(collectionName);
        
        for (const filter of filters) {
            allData = allData.filter(item => {
                if (filter.op === '==') return item[filter.field] === filter.value;
                if (filter.op === '!=') return item[filter.field] !== filter.value;
                if (filter.op === '>') return item[filter.field] > filter.value;
                if (filter.op === '<') return item[filter.field] < filter.value;
                if (filter.op === '>=') return item[filter.field] >= filter.value;
                if (filter.op === '<=') return item[filter.field] <= filter.value;
                return true;
            });
        }
        
        // Very basic simple pagination logic assuming default sorting (descending)
        let startIndex = 0;
        if (lastVisibleDoc) {
            startIndex = allData.findIndex(item => item.id === lastVisibleDoc.id) + 1;
            if (startIndex === 0) startIndex = allData.length;
        }
        
        const page = allData.slice(startIndex, startIndex + pageSize);
        const lastDoc = page.length > 0 ? page[page.length - 1] : null;
        
        return {
            data: page,
            lastDoc,
            hasMore: startIndex + pageSize < allData.length
        };
    },

    async getArchived(collectionName: string) {
        const data = getLocalColl(collectionName);
        const filtered = data.filter((d: any) => d.recordStatus === 'deleted');
        filtered.sort((a: any, b: any) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateB - dateA;
        });
        return filtered;
    },

    async add(collectionName: string, data: any, disableAudit: boolean = false) {
        const list = getLocalColl(collectionName);
        const newDoc = {
            id: data.id || generateId(),
            ...data,
            recordStatus: 'active',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        list.push(newDoc);
        saveLocalColl(collectionName, list);

        if (!disableAudit && collectionName !== "auditLogs") {
            await this.logAudit('CREATE', collectionName, newDoc.id, `تم إنشاء سجل جديد في ${collectionName}`, null, data);
        }
        return newDoc.id;
    },

    async update(collectionName: string, id: string, data: any, disableAudit: boolean = false) {
        const list = getLocalColl(collectionName);
        const idx = list.findIndex((item: any) => item.id === id);
        if (idx !== -1) {
            const oldVal = { ...list[idx] };
            list[idx] = {
                ...list[idx],
                ...data,
                updatedAt: new Date().toISOString()
            };
            saveLocalColl(collectionName, list);
            if (!disableAudit && collectionName !== "auditLogs") {
                await this.logAudit('UPDATE', collectionName, id, `تم تعديل السجل في ${collectionName}`, oldVal, data);
            }
        }
    },

    async softDelete(collectionName: string, id: string) {
        await this.update(collectionName, id, { recordStatus: 'deleted' }, true);
        await this.logAudit('DELETE', collectionName, id, `نقل إلى سلة المحذوفات في ${collectionName}`);
    },

    async restoreArchived(collectionName: string, id: string) {
        await this.update(collectionName, id, { recordStatus: 'active' }, true);
        await this.logAudit('RESTORE', collectionName, id, `استعادة سجل من المحذوفات في ${collectionName}`);
    },

    async delete(collectionName: string, id: string) {
        const list = getLocalColl(collectionName);
        const filtered = list.filter((item: any) => item.id !== id);
        saveLocalColl(collectionName, filtered);
        await this.logAudit('DELETE', collectionName, id, `تم حذف نهائي للسجل من ${collectionName}`);
    },

    async createInvoice(invoice: any) {
        const user: AppUser = getCurrentUser();
        const now = new Date().toISOString();
        let partnerId = invoice.partnerId;

        if (invoice.autoCreatePartner && !partnerId) {
            const partnerColl = invoice.type === 'sale' ? "customers" : "suppliers";
            const pList = getLocalColl(partnerColl);
            const pId = generateId();
            pList.push({
                id: pId,
                name: invoice.partnerName,
                phone: invoice.partnerPhone || "جديد",
                balance: 0,
                recordStatus: 'active',
                updatedAt: now,
                createdAt: now
            });
            saveLocalColl(partnerColl, pList);
            partnerId = pId;
        }

        const invoiceId = generateId();
        const invoices = getLocalColl("invoices");
        const newInvoice = {
            ...invoice,
            id: invoiceId,
            partnerId: partnerId,
            recordStatus: 'active',
            updatedAt: now,
            createdAt: invoice.createdAt || now
        };
        invoices.push(newInvoice);
        saveLocalColl("invoices", invoices);

        const isApproved = invoice.lifecycleStatus === 'معتمد' || !invoice.lifecycleStatus;
        if (isApproved) {
            // Apply Stock Changes
            const products = getLocalColl("products");
            for (const item of invoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    const idx = products.findIndex((p: any) => p.id === item.productId);
                    if (idx !== -1) {
                        const change = invoice.type === 'sale' ? -item.quantity : item.quantity;
                        products[idx].stock = (products[idx].stock || 0) + change;
                        products[idx].updatedAt = now;
                    }
                }
            }
            saveLocalColl("products", products);

            // Financial Engine Impact
            const impact = FinancialEngine.getInvoiceImpact({ ...newInvoice }, user);

            if (partnerId && impact.partnerBalanceChange !== 0) {
                const pColl = invoice.type === 'sale' ? "customers" : "suppliers";
                const partners = getLocalColl(pColl);
                const idx = partners.findIndex((p: any) => p.id === partnerId);
                if (idx !== -1) {
                    partners[idx].balance = (partners[idx].balance || 0) + impact.partnerBalanceChange;
                    partners[idx].updatedAt = now;
                }
                saveLocalColl(pColl, partners);
            }

            if (invoice.boxId && impact.cashBoxBalanceChange !== 0) {
                const cashBoxes = getLocalColl("cashBoxes");
                const bIdx = cashBoxes.findIndex((b: any) => b.id === invoice.boxId);
                if (bIdx !== -1) {
                    cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) + impact.cashBoxBalanceChange;
                    cashBoxes[bIdx].updatedAt = now;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }

            // Save Transactions
            const trans = getLocalColl("transactions");
            for (const transData of impact.transactions) {
                trans.push({
                    ...transData,
                    id: generateId(),
                    recordStatus: 'active',
                    updatedAt: now
                });
            }
            saveLocalColl("transactions", trans);
        }

        return invoiceId;
    },

    async deleteInvoiceData(invoice: any) {
        const now = new Date().toISOString();
        const user = getCurrentUser();
        const isApproved = invoice.lifecycleStatus === 'معتمد' || !invoice.lifecycleStatus;

        if (isApproved) {
            // 1. Reverse stock changes
            if (invoice.items && Array.isArray(invoice.items)) {
                const products = getLocalColl("products");
                for (const item of invoice.items) {
                    if (item.productId && item.productId !== "ledger_entry_item") {
                        const idx = products.findIndex((p: any) => p.id === item.productId);
                        if (idx !== -1) {
                            const change = invoice.type === 'sale' ? item.quantity : -item.quantity;
                            products[idx].stock = (products[idx].stock || 0) + change;
                            products[idx].updatedAt = now;
                        }
                    }
                }
                saveLocalColl("products", products);
            }

            // 2. Reverse Financial Impact
            const impact = FinancialEngine.getInvoiceImpact(invoice, user);

            if (invoice.partnerId && impact.partnerBalanceChange !== 0) {
                const pColl = invoice.type === 'sale' ? "customers" : "suppliers";
                const partners = getLocalColl(pColl);
                const idx = partners.findIndex((p: any) => p.id === invoice.partnerId);
                if (idx !== -1) {
                    partners[idx].balance = (partners[idx].balance || 0) - impact.partnerBalanceChange;
                    partners[idx].updatedAt = now;
                }
                saveLocalColl(pColl, partners);
            }

            if (invoice.boxId && impact.cashBoxBalanceChange !== 0) {
                const cashBoxes = getLocalColl("cashBoxes");
                const bIdx = cashBoxes.findIndex((b: any) => b.id === invoice.boxId);
                if (bIdx !== -1) {
                    cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) - impact.cashBoxBalanceChange;
                    cashBoxes[bIdx].updatedAt = now;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }

            // 3. Soft Delete associated transactions
            const transactions = getLocalColl("transactions");
            transactions.forEach(t => {
                if (t.sourceId === invoice.id) {
                    t.recordStatus = 'deleted';
                    t.updatedAt = now;
                }
            });
            saveLocalColl("transactions", transactions);
        }

        if (invoice.id) {
            const invoices = getLocalColl("invoices");
            const idx = invoices.findIndex((i: any) => i.id === invoice.id);
            if (idx !== -1) {
                invoices[idx].recordStatus = 'deleted';
                invoices[idx].updatedAt = now;
            }
            saveLocalColl("invoices", invoices);
        }

        await this.logAudit('DELETE', 'Invoice', invoice.id, `فاتورة ${invoice.type === 'sale' ? 'مبيعات' : 'مشتريات'} أرسلت للأرشيف`, invoice, null);
    },

    async updateInvoiceData(oldInvoice: any, newInvoiceData: any) {
        const oldIsApproved = oldInvoice.lifecycleStatus === 'معتمد' || !oldInvoice.lifecycleStatus;
        if (oldIsApproved) {
            if (oldInvoice.items && Array.isArray(oldInvoice.items)) {
                const products = getLocalColl("products");
                for (const item of oldInvoice.items) {
                    const idx = products.findIndex((p: any) => p.id === item.productId);
                    if (idx !== -1) {
                        const change = oldInvoice.type === 'sale' ? item.quantity : -item.quantity;
                        products[idx].stock = (products[idx].stock || 0) + change;
                    }
                }
                saveLocalColl("products", products);
            }

            const oldRemaining = (oldInvoice.total || 0) - (oldInvoice.paid || 0) - (oldInvoice.discount || 0);
            if (oldRemaining !== 0 && oldInvoice.partnerId) {
                const pColl = oldInvoice.type === 'sale' ? "customers" : "suppliers";
                const partners = getLocalColl(pColl);
                const idx = partners.findIndex((p: any) => p.id === oldInvoice.partnerId);
                if (idx !== -1) {
                    partners[idx].balance = (partners[idx].balance || 0) - oldRemaining;
                }
                saveLocalColl(pColl, partners);
            }

            if (oldInvoice.paid > 0 && oldInvoice.boxId) {
                const cashBoxes = getLocalColl("cashBoxes");
                const bIdx = cashBoxes.findIndex((b: any) => b.id === oldInvoice.boxId);
                if (bIdx !== -1) {
                    const change = oldInvoice.type === 'sale' ? oldInvoice.paid : -oldInvoice.paid;
                    cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) - change;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }

            const trans = getLocalColl("transactions");
            const filteredTrans = trans.filter((t: any) => t.relatedId !== oldInvoice.id);
            saveLocalColl("transactions", filteredTrans);
        }

        let partnerId = newInvoiceData.partnerId;
        const now = new Date().toISOString();

        if (newInvoiceData.autoCreatePartner && !partnerId) {
            const pColl = newInvoiceData.type === 'sale' ? "customers" : "suppliers";
            const partners = getLocalColl(pColl);
            const pId = generateId();
            partners.push({
                id: pId,
                name: newInvoiceData.partnerName,
                phone: "جديد",
                balance: 0,
                recordStatus: 'active',
                createdAt: now,
                updatedAt: now
            });
            saveLocalColl(pColl, partners);
            partnerId = pId;
        }

        const newIsApproved = newInvoiceData.lifecycleStatus === 'معتمد' || !newInvoiceData.lifecycleStatus;
        if (newIsApproved) {
            if (newInvoiceData.items && Array.isArray(newInvoiceData.items)) {
                const products = getLocalColl("products");
                for (const item of newInvoiceData.items) {
                    const idx = products.findIndex((p: any) => p.id === item.productId);
                    if (idx !== -1) {
                        const change = newInvoiceData.type === 'sale' ? -item.quantity : item.quantity;
                        products[idx].stock = (products[idx].stock || 0) + change;
                    }
                }
                saveLocalColl("products", products);
            }

            const newRemaining = (newInvoiceData.total || 0) - (newInvoiceData.paid || 0) - (newInvoiceData.discount || 0);
            if (newRemaining !== 0 && partnerId) {
                const pColl = newInvoiceData.type === 'sale' ? "customers" : "suppliers";
                const partners = getLocalColl(pColl);
                const idx = partners.findIndex((p: any) => p.id === partnerId);
                if (idx !== -1) {
                    partners[idx].balance = (partners[idx].balance || 0) + newRemaining;
                }
                saveLocalColl(pColl, partners);
            }

            if (newInvoiceData.paid > 0 && newInvoiceData.boxId) {
                const cashBoxes = getLocalColl("cashBoxes");
                const bIdx = cashBoxes.findIndex((b: any) => b.id === newInvoiceData.boxId);
                if (bIdx !== -1) {
                    const change = newInvoiceData.type === 'sale' ? newInvoiceData.paid : -newInvoiceData.paid;
                    cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) + change;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }

            if (newInvoiceData.paid > 0 && oldInvoice.id) {
                const trans = getLocalColl("transactions");
                const transData: any = {
                    id: generateId(),
                    type: newInvoiceData.type === 'sale' ? 'قبض' : 'صرف',
                    amount: newInvoiceData.paid,
                    currency: newInvoiceData.currency || 'YER',
                    description: `دفعة من فاتورة ${newInvoiceData.type === 'sale' ? 'مبيعات' : 'مشتريات'} - المرجع: ${newInvoiceData.referenceNumber || oldInvoice.id}`,
                    relatedId: oldInvoice.id,
                    partnerId: partnerId,
                    partnerName: newInvoiceData.partnerName,
                    recordStatus: 'active',
                    createdAt: now,
                    updatedAt: now
                };
                if (newInvoiceData.boxId) {
                    transData.boxId = newInvoiceData.boxId;
                }
                trans.push(transData);
                saveLocalColl("transactions", trans);
            }
        }

        if (oldInvoice.id) {
            const invoices = getLocalColl("invoices");
            const idx = invoices.findIndex((i: any) => i.id === oldInvoice.id);
            if (idx !== -1) {
                invoices[idx] = {
                    ...invoices[idx],
                    ...newInvoiceData,
                    partnerId: partnerId,
                    updatedAt: now
                };
                saveLocalColl("invoices", invoices);
            }
        }
    },

    async addTransaction(trans: any) {
        const transList = getLocalColl("transactions");
        const tId = trans.id || generateId();
        const newTrans = {
            id: tId,
            ...trans,
            recordStatus: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        transList.push(newTrans);
        saveLocalColl("transactions", transList);

        if (trans.partnerId) {
            const partnerColl = trans.type === 'قبض' ? 'customers' : 'suppliers';
            const partners = getLocalColl(partnerColl);
            const idx = partners.findIndex((p: any) => p.id === trans.partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) - trans.amount;
                partners[idx].updatedAt = new Date().toISOString();
            }
            saveLocalColl(partnerColl, partners);
        }

        if (trans.boxId) {
            const cashBoxes = getLocalColl("cashBoxes");
            const bIdx = cashBoxes.findIndex((b: any) => b.id === trans.boxId);
            if (bIdx !== -1) {
                const change = trans.type === 'قبض' ? trans.amount : -trans.amount;
                cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) + change;
                cashBoxes[bIdx].updatedAt = new Date().toISOString();
            }
            saveLocalColl("cashBoxes", cashBoxes);
        }
    },

    async updateTransactionData(oldTrans: any, newTrans: any) {
        if (oldTrans.partnerId) {
            const pColl = oldTrans.type === 'قبض' ? 'customers' : 'suppliers';
            const partners = getLocalColl(pColl);
            const idx = partners.findIndex((p: any) => p.id === oldTrans.partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) + oldTrans.amount;
            }
            saveLocalColl(pColl, partners);
        }
        if (oldTrans.boxId) {
            const cashBoxes = getLocalColl("cashBoxes");
            const idx = cashBoxes.findIndex((b: any) => b.id === oldTrans.boxId);
            if (idx !== -1) {
                const change = oldTrans.type === 'قبض' ? oldTrans.amount : -oldTrans.amount;
                cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) - change;
            }
            saveLocalColl("cashBoxes", cashBoxes);
        }

        if (newTrans.partnerId) {
            const pColl = newTrans.type === 'قبض' ? 'customers' : 'suppliers';
            const partners = getLocalColl(pColl);
            const idx = partners.findIndex((p: any) => p.id === newTrans.partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) - newTrans.amount;
            }
            saveLocalColl(pColl, partners);
        }
        if (newTrans.boxId) {
            const cashBoxes = getLocalColl("cashBoxes");
            const idx = cashBoxes.findIndex((b: any) => b.id === newTrans.boxId);
            if (idx !== -1) {
                const change = newTrans.type === 'قبض' ? newTrans.amount : -newTrans.amount;
                cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) + change;
            }
            saveLocalColl("cashBoxes", cashBoxes);
        }

        const trans = getLocalColl("transactions");
        const idx = trans.findIndex((t: any) => t.id === oldTrans.id);
        if (idx !== -1) {
            trans[idx] = {
                ...trans[idx],
                ...newTrans,
                updatedAt: new Date().toISOString()
            };
            saveLocalColl("transactions", trans);
        }
    },

    async deleteTransactionData(trans: any) {
        if (trans.type === 'تحويل') {
            if (trans.fromBoxId) {
                const cashBoxes = getLocalColl("cashBoxes");
                const idx = cashBoxes.findIndex((b: any) => b.id === trans.fromBoxId);
                if (idx !== -1) {
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) + trans.amount;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }
            if (trans.toBoxId) {
                const cashBoxes = getLocalColl("cashBoxes");
                const idx = cashBoxes.findIndex((b: any) => b.id === trans.toBoxId);
                if (idx !== -1) {
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) - trans.amount;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }
        } else {
            if (trans.partnerId) {
                const pColl = trans.type === 'قبض' ? 'customers' : 'suppliers';
                const partners = getLocalColl(pColl);
                const idx = partners.findIndex((p: any) => p.id === trans.partnerId);
                if (idx !== -1) {
                    partners[idx].balance = (partners[idx].balance || 0) + trans.amount;
                }
                saveLocalColl(pColl, partners);
            }
            if (trans.boxId) {
                const cashBoxes = getLocalColl("cashBoxes");
                const idx = cashBoxes.findIndex((b: any) => b.id === trans.boxId);
                if (idx !== -1) {
                    const change = trans.type === 'قبض' ? trans.amount : -trans.amount;
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) - change;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }
        }

        if (trans.id) {
            const transactions = getLocalColl("transactions");
            const idx = transactions.findIndex((t: any) => t.id === trans.id);
            if (idx !== -1) {
                transactions[idx].recordStatus = 'deleted';
                transactions[idx].updatedAt = new Date().toISOString();
                saveLocalColl("transactions", transactions);
            }
        }

        await this.logAudit('DELETE', 'Transaction', trans.id, `إرسال حركة مالية بقيمة ${trans.amount} للأرشيف`, trans, null);
    },

    async deleteAllTransactions() {
        const transList = await this.getAll("transactions");
        for (const t of transList) {
            try {
                await this.deleteTransactionData(t);
            } catch (err) {
                console.error("Failed to delete transaction data for:", t.id, err);
            }
        }
    },

    async createTransfer(fromBoxId: string, toBoxId: string, amount: number, currency: string, description: string) {
        const cashBoxes = getLocalColl("cashBoxes");
        const fIdx = cashBoxes.findIndex((b: any) => b.id === fromBoxId);
        const tIdx = cashBoxes.findIndex((b: any) => b.id === toBoxId);
        const now = new Date().toISOString();

        if (fIdx !== -1) {
            cashBoxes[fIdx].balance = (cashBoxes[fIdx].balance || 0) - amount;
            cashBoxes[fIdx].updatedAt = now;
        }
        if (tIdx !== -1) {
            cashBoxes[tIdx].balance = (cashBoxes[tIdx].balance || 0) + amount;
            cashBoxes[tIdx].updatedAt = now;
        }
        saveLocalColl("cashBoxes", cashBoxes);

        const trans = getLocalColl("transactions");
        trans.push({
            id: generateId(),
            type: 'تحويل',
            amount,
            currency,
            description,
            fromBoxId,
            toBoxId,
            recordStatus: 'active',
            createdAt: now,
            updatedAt: now
        });
        saveLocalColl("transactions", trans);
    },

    async updateBoxBalance(boxId: string, amount: number) {
        const cashBoxes = getLocalColl("cashBoxes");
        const idx = cashBoxes.findIndex((b: any) => b.id === boxId);
        if (idx !== -1) {
            cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) + amount;
            cashBoxes[idx].updatedAt = new Date().toISOString();
        } else {
            cashBoxes.push({
                id: boxId,
                name: "مجهول",
                balance: amount,
                recordStatus: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        saveLocalColl("cashBoxes", cashBoxes);
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
            backupData[colName] = getLocalColl(colName);
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
            saveLocalColl(colName, docs);
        }
        
        await this.logAudit('SETTINGS_CHANGE', 'System', 'RESTORE', 'تم استعادة قاعدة البيانات من نسخة احتياطية بنجاح');
    },

    async getStoreSettings() {
        const settings = getLocalColl("settings");
        const main = settings.find(s => s.id === 'main_settings');
        if (!main) {
            return {
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
        }
        return main;
    },

    async createQuickFinancialEntry(entry: any) {
        const now = new Date().toISOString();
        const user = getCurrentUser();
        const entryRefId = generateId();

        let partnerId = entry.partnerId;
        if (entry.partnerType !== 'none' && !partnerId) {
            const partnerColl = entry.partnerType === 'customer' ? "customers" : "suppliers";
            const pList = getLocalColl(partnerColl);
            const pId = generateId();
            pList.push({
                id: pId,
                name: entry.partnerName,
                phone: entry.partnerPhone || "جديد",
                balance: 0,
                recordStatus: 'active',
                updatedAt: now,
                createdAt: now
            });
            saveLocalColl(partnerColl, pList);
            partnerId = pId;
        }

        const entries = getLocalColl("quick_financial_entries");
        const newEntry = {
            ...entry,
            id: entryRefId,
            partnerId,
            recordStatus: 'active',
            updatedAt: now,
            createdAt: now
        };
        entries.push(newEntry);
        saveLocalColl("quick_financial_entries", entries);

        const impact = FinancialEngine.getQuickEntryImpact(newEntry, user);

        if (partnerId && impact.partnerBalanceChange !== 0) {
            const partnerColl = entry.partnerType === 'customer' ? "customers" : "suppliers";
            const partners = getLocalColl(partnerColl);
            const idx = partners.findIndex((p: any) => p.id === partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) + impact.partnerBalanceChange;
                partners[idx].updatedAt = now;
            }
            saveLocalColl(partnerColl, partners);
        }

        if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
            const boxes = getLocalColl("cashBoxes");
            const idx = boxes.findIndex((b: any) => b.id === entry.cashBoxId);
            if (idx !== -1) {
                boxes[idx].balance = (boxes[idx].balance || 0) + impact.cashBoxBalanceChange;
                boxes[idx].updatedAt = now;
            }
            saveLocalColl("cashBoxes", boxes);
        }

        const trans = getLocalColl("transactions");
        for (const transData of impact.transactions) {
            trans.push({
                ...transData,
                id: generateId(),
                recordStatus: 'active',
                updatedAt: now
            });
        }
        saveLocalColl("transactions", trans);

        return entryRefId;
    },

    async deleteQuickFinancialEntry(entry: any) {
        const now = new Date().toISOString();
        const user = getCurrentUser();

        const impact = FinancialEngine.getQuickEntryImpact(entry, user);

        if (entry.partnerId && impact.partnerBalanceChange !== 0) {
            const partnerColl = entry.partnerType === 'customer' ? "customers" : "suppliers";
            const partners = getLocalColl(partnerColl);
            const idx = partners.findIndex((p: any) => p.id === entry.partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) - impact.partnerBalanceChange;
                partners[idx].updatedAt = now;
            }
            saveLocalColl(partnerColl, partners);
        }

        if (entry.cashBoxId && impact.cashBoxBalanceChange !== 0) {
            const boxes = getLocalColl("cashBoxes");
            const idx = boxes.findIndex((b: any) => b.id === entry.cashBoxId);
            if (idx !== -1) {
                boxes[idx].balance = (boxes[idx].balance || 0) - impact.cashBoxBalanceChange;
                boxes[idx].updatedAt = now;
            }
            saveLocalColl("cashBoxes", boxes);
        }

        const entries = getLocalColl("quick_financial_entries");
        const eIdx = entries.findIndex(e => e.id === entry.id);
        if (eIdx !== -1) {
            entries[eIdx].recordStatus = 'deleted';
            entries[eIdx].updatedAt = now;
        }
        saveLocalColl("quick_financial_entries", entries);

        const transactions = getLocalColl("transactions");
        transactions.forEach(t => {
            if (t.sourceId === entry.id) {
                t.recordStatus = 'deleted';
                t.updatedAt = now;
            }
        });
        saveLocalColl("transactions", transactions);
    },

    async updateStoreSettings(data: any) {
        const settings = getLocalColl("settings");
        const idx = settings.findIndex(s => s.id === 'main_settings');
        const now = new Date().toISOString();
        if (idx !== -1) {
            settings[idx] = { ...settings[idx], ...data, updatedAt: now };
        } else {
            settings.push({ id: 'main_settings', ...data, updatedAt: now });
        }
        saveLocalColl("settings", settings);
    }
};
