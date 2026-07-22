import firebaseConfig from "../../firebase-applet-config.json";
import { FinancialEngine } from "./financialEngine";
import { AppUser, AuditLog } from "../types";

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

export const localDbService = {
    async clearLocalData() {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('fp_db_')) {
                localStorage.removeItem(key);
            }
        });
        await this.logAudit('SETTINGS_CHANGE', 'System', 'RESET', 'تم مسح جميع البيانات المحلية من localStorage');
    },
    async logAudit(action: string, entityType: string, entityId: string, description: string, oldValue?: any, newValue?: any, extraDetails?: Partial<AuditLog>) {
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
                ...extraDetails,
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

    async add(collectionName: string, data: any, disableAudit: boolean = false, customDescription?: string) {
        const list = getLocalColl(collectionName);
        const u = getCurrentUser();
        const targetId = data.id || generateId();
        const existingIdx = list.findIndex((item: any) => item.id === targetId);
        const newDoc = {
            id: targetId,
            ...data,
            _isOfflineCreated: true, // Mark as offline created so sync engine knows to upload it instead of assuming it was deleted remotely
            recordStatus: 'active',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            createdBy: u?.id || "SYS",
            createdByName: u?.name || "System",
            createdByUsername: u?.username || "system",
            updatedBy: u?.id || "SYS",
            updatedByName: u?.name || "System",
            updatedByUsername: u?.username || "system"
        };
        if (existingIdx !== -1) {
            list[existingIdx] = { ...list[existingIdx], ...newDoc };
        } else {
            list.push(newDoc);
        }
        saveLocalColl(collectionName, list);

        if (!disableAudit && collectionName !== "auditLogs") {
            const entityLabel = collectionName === 'products' ? 'صنف/منتج' : collectionName === 'users' ? 'مستخدم' : collectionName;
            const desc = customDescription || `تم إضافة ${entityLabel} جديد: ${data.name || data.username || newDoc.id}`;
            await this.logAudit('CREATE', collectionName, newDoc.id, desc, null, data);
        }
        return newDoc.id;
    },

    async update(collectionName: string, id: string, data: any, disableAudit: boolean = false, customDescription?: string) {
        const list = getLocalColl(collectionName);
        const idx = list.findIndex((item: any) => item.id === id);
        if (idx !== -1) {
            const u = getCurrentUser();
            const oldVal = { ...list[idx] };
            list[idx] = {
                ...list[idx],
                ...data,
                updatedAt: new Date().toISOString(),
                updatedBy: u?.id || "SYS",
                updatedByName: u?.name || "System",
                updatedByUsername: u?.username || "system"
            };
            saveLocalColl(collectionName, list);

            // Cascade update for related records (invoices, transactions, quick_financial_entries)
            if (collectionName === 'customers' || collectionName === 'suppliers') {
                const partnerName = data.name;
                const partnerPhone = data.phone;
                
                const updateObj: any = {};
                if (partnerName !== undefined) updateObj.partnerName = partnerName;
                if (partnerPhone !== undefined) updateObj.partnerPhone = partnerPhone;
                
                if (Object.keys(updateObj).length > 0) {
                    const collectionsToUpdate = ["invoices", "transactions", "quick_financial_entries"];
                    collectionsToUpdate.forEach(collName => {
                        try {
                            const collList = getLocalColl(collName);
                            let modified = false;
                            const updatedCollList = collList.map((item: any) => {
                                if (item.partnerId === id) {
                                    modified = true;
                                    return { 
                                        ...item, 
                                        ...updateObj, 
                                        updatedAt: new Date().toISOString() 
                                    };
                                }
                                return item;
                            });
                            if (modified) {
                                saveLocalColl(collName, updatedCollList);
                                console.log(`[localDbService] Cascaded partner update to ${collName} for partnerId ${id}`);
                            }
                        } catch (err) {
                            console.error(`[localDbService] Failed to cascade partner update to ${collName}:`, err);
                        }
                    });
                }
            }

            if (!disableAudit && collectionName !== "auditLogs") {
                const entityLabel = collectionName === 'products' ? 'صنف/منتج' : collectionName === 'users' ? 'مستخدم' : collectionName;
                const desc = customDescription || `تم تعديل ${entityLabel}: ${oldVal?.name || oldVal?.username || id}`;
                await this.logAudit('UPDATE', collectionName, id, desc, oldVal, data);
            }
        }
    },

    async softDelete(collectionName: string, id: string) {
        await this.delete(collectionName, id);
    },

    async restoreArchived(collectionName: string, id: string) {
        // Since we now do permanent deletes, restore is no longer applicable
        console.warn(`Attempted to restore ${id} from ${collectionName}, but permanent deletion is enabled.`);
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

        let maxInvoiceNum = 0;
        const invoices = getLocalColl("invoices");
        invoices.forEach((inv: any) => {
            if (inv.recordStatus === 'deleted') return;
            const invType = inv.type || 'sale';
            const reqType = invoice.type || 'sale';
            const isSameCategory = (reqType.includes('sale') && invType.includes('sale')) ||
                                   (reqType.includes('purchase') && invType.includes('purchase')) ||
                                   (invType === reqType);
            if (isSameCategory && inv.invoiceNumber) {
                const num = parseInt(String(inv.invoiceNumber), 10);
                if (!isNaN(num) && num > maxInvoiceNum) maxInvoiceNum = num;
            }
        });
        const sequentialInvoiceNumber = invoice.invoiceNumber || String(maxInvoiceNum + 1);

        const invoiceId = generateId();
        const newInvoice = {
            ...invoice,
            id: invoiceId,
            invoiceNumber: sequentialInvoiceNumber,
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
        await this.logAudit('CREATE', 'invoices', invoiceId, `إنشاء فاتورة ${invoice.type === 'sale' ? 'مبيعات' : 'مشتريات'} جديدة بقيمة ${invoice.total}`, null, invoice);

        return invoiceId;
    },

    async deleteInvoiceData(invoice: any) {
        const transactions = getLocalColl("transactions");
        const linkedTransactions = transactions.filter(t => t.sourceId === invoice.id);

        const now = new Date().toISOString();
        const user = getCurrentUser();
        const isApproved = invoice.lifecycleStatus === 'معتمد' || !invoice.lifecycleStatus;

        let cashBoxBalanceBefore = 0;
        if (invoice.boxId) {
             const cashBoxes = getLocalColl("cashBoxes");
             const bIdx = cashBoxes.findIndex((b: any) => b.id === invoice.boxId);
             if (bIdx !== -1) cashBoxBalanceBefore = cashBoxes[bIdx].balance || 0;
        }

        // 1. Reverse financial impact of any linked payment transactions
        for (const trans of linkedTransactions) {
            if (trans.sourceType === 'invoice_payment') {
                // Reverse Cashbox balance
                if (trans.boxId) {
                    const cashBoxes = getLocalColl("cashBoxes");
                    const bIdx = cashBoxes.findIndex((b: any) => b.id === trans.boxId);
                    if (bIdx !== -1) {
                        const boxAmount = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? trans.amount : -trans.amount;
                        cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) - boxAmount;
                        cashBoxes[bIdx].updatedAt = now;
                        saveLocalColl("cashBoxes", cashBoxes);
                    }
                }

                // Reverse Partner balance
                if (trans.partnerId) {
                    const partnerColl = (trans.type === 'قبض' || trans.type === 'customer_receipt') ? "customers" : "suppliers";
                    const partners = getLocalColl(partnerColl);
                    const pIdx = partners.findIndex((p: any) => p.id === trans.partnerId);
                    if (pIdx !== -1) {
                        partners[pIdx].balance = (partners[pIdx].balance || 0) + trans.amount;
                        partners[pIdx].updatedAt = now;
                        saveLocalColl(partnerColl, partners);
                    }
                }
            }
        }

        if (isApproved) {
            // 2. Reverse stock changes
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

            // 3. Reverse Financial Impact
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
        }

        // 4. Hard Delete associated transactions
        const remainingTransactions = transactions.filter(t => t.sourceId !== invoice.id);
        saveLocalColl("transactions", remainingTransactions);

        // 5. Hard Delete the invoice itself
        if (invoice.id) {
            const invoices = getLocalColl("invoices");
            const filteredInvoices = invoices.filter((i: any) => i.id !== invoice.id);
            saveLocalColl("invoices", filteredInvoices);
        }

        let cashBoxBalanceAfter = 0;
        if (invoice.boxId) {
             const cashBoxes = getLocalColl("cashBoxes");
             const bIdx = cashBoxes.findIndex((b: any) => b.id === invoice.boxId);
             if (bIdx !== -1) cashBoxBalanceAfter = cashBoxes[bIdx].balance || 0;
        }

        await this.logAudit('DELETE', 'Invoice', invoice.id, `فاتورة ${invoice.type === 'sale' ? 'مبيعات' : 'مشتريات'} تم حذفها جذرياً من قاعدة البيانات`, invoice, null, {
            originalCreatedAt: invoice.createdAt,
            originalCreatedBy: invoice.createdBy,
            cashBoxBalanceBefore,
            cashBoxBalanceAfter
        });
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
        await this.logAudit('UPDATE', 'invoices', oldInvoice.id, `تعديل فاتورة ${oldInvoice.type === 'sale' ? 'مبيعات' : 'مشتريات'}`, oldInvoice, newInvoiceData, {
            originalCreatedAt: oldInvoice.createdAt,
            originalCreatedBy: oldInvoice.createdBy
        });
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

        await this.logAudit('CREATE', 'Transaction', tId, `إضافة حركة مالية جديدة بقيمة ${trans.amount}`, null, trans);
    },

    async recordInvoicePayment(invoice: any, paymentAmount: number, boxId: string, newPaid: number, newStatus: string) {
        const u = getCurrentUser();
        const now = new Date().toISOString();

        // 1. Update the invoice
        const invoices = getLocalColl("invoices");
        const invIdx = invoices.findIndex((i: any) => i.id === invoice.id);
        if (invIdx !== -1) {
            invoices[invIdx].paid = newPaid;
            invoices[invIdx].status = newStatus;
            invoices[invIdx].updatedAt = now;
            invoices[invIdx].updatedBy = u?.id || "SYS";
            saveLocalColl("invoices", invoices);
        }

        // 2. Create the transaction
        const transType = invoice.type === 'sale' ? 'قبض' : 'صرف';
        const trans = {
            id: generateId(),
            type: transType,
            amount: paymentAmount,
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
        };
        const transList = getLocalColl("transactions");
        transList.push(trans);
        saveLocalColl("transactions", transList);

        // 3. Update Partner Balance
        if (trans.partnerId) {
            const partnerCollName = (transType === 'قبض' || (transType as string) === 'customer_receipt') ? 'customers' : 'suppliers';
            const partners = getLocalColl(partnerCollName);
            const pIdx = partners.findIndex((p: any) => p.id === trans.partnerId);
            if (pIdx !== -1) {
                partners[pIdx].balance = (partners[pIdx].balance || 0) - trans.amount;
                partners[pIdx].updatedAt = now;
                saveLocalColl(partnerCollName, partners);
            }
        }

        // 4. Update Cash Box
        if (trans.boxId) {
            const cashBoxes = getLocalColl("cashBoxes");
            const bIdx = cashBoxes.findIndex((b: any) => b.id === trans.boxId);
            if (bIdx !== -1) {
                const boxAmount = (transType === 'قبض' || (transType as string) === 'customer_receipt') ? trans.amount : -trans.amount;
                cashBoxes[bIdx].balance = (cashBoxes[bIdx].balance || 0) + boxAmount;
                cashBoxes[bIdx].updatedAt = now;
                saveLocalColl("cashBoxes", cashBoxes);
            }
        }

        await this.logAudit('UPDATE', 'Invoice', invoice.id, `تسجيل دفعة نقدية للفاتورة: ${paymentAmount}`);
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
            await this.logAudit('UPDATE', 'Transaction', oldTrans.id, `تعديل حركة مالية`, oldTrans, newTrans);
        }
    },
    async deleteTransactionData(trans: any) {
        if (trans.type === "تحويل") {
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
                const pColl = (trans.type === "قبض" || trans.type === "customer_receipt") ? "customers" : "suppliers";
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
                    const change = (trans.type === "قبض" || trans.type === "customer_receipt") ? trans.amount : -trans.amount;
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) - change;
                }
                saveLocalColl("cashBoxes", cashBoxes);
            }
        }

        if ((trans.sourceType === "invoice_payment" || trans.sourceType === "manual_receipt" || trans.sourceType === "manual_payment") && trans.sourceId) {
            const invoices = getLocalColl("invoices");
            const idx = invoices.findIndex((i: any) => i.id === trans.sourceId);
            if (idx !== -1) {
                const invData = invoices[idx];
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
                invoices[idx].paid = newPaid;
                invoices[idx].status = newStatus;
                invoices[idx].updatedAt = new Date().toISOString();
                saveLocalColl("invoices", invoices);
            }
        }

        if (trans.id) {
            const transactions = getLocalColl("transactions");
            const filteredTransactions = transactions.filter((t: any) => t.id !== trans.id);
            saveLocalColl("transactions", filteredTransactions);
        }
        await this.logAudit("DELETE", "Transaction", trans.id, `إرسال حركة مالية بقيمة ${trans.amount} للأرشيف`, trans, null);
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
        const transId = generateId();
        trans.push({
            id: transId,
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

        await this.logAudit('CREATE', 'Transaction', transId, `عملية تحويل مالي بقيمة ${amount}`, null, { fromBoxId, toBoxId, amount, currency, description });
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
        await this.logAudit('UPDATE', 'cashBoxes', boxId, `تعديل رصيد الصندوق بقيمة ${amount}`);
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

    async dumpData() {
        const collections = ["products", "customers", "suppliers", "invoices", "transactions", "cashBoxes", "auditLogs"];
        const data: any = {};
        for (const col of collections) {
            data[col] = getLocalColl(col);
        }
        console.log("Database Dump:", JSON.stringify(data, null, 2));
        return data;
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

        await this.logAudit('CREATE', 'QuickEntry', entryRefId, `إضافة إدخال مالي سريع بقيمة ${entry.netAmount}`, null, entry);

        return entryRefId;
    },

    async updateQuickFinancialEntry(oldEntry: any, newEntry: any) {
        const now = new Date().toISOString();
        const user = getCurrentUser();

        // 1. Reverse Old Impact
        const oldImpact = FinancialEngine.getQuickEntryImpact(oldEntry, user);
        if (oldEntry.partnerId && oldImpact.partnerBalanceChange !== 0) {
            const partnerColl = oldEntry.partnerType === 'customer' ? "customers" : "suppliers";
            const partners = getLocalColl(partnerColl);
            const idx = partners.findIndex((p: any) => p.id === oldEntry.partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) - oldImpact.partnerBalanceChange;
                partners[idx].updatedAt = now;
            }
            saveLocalColl(partnerColl, partners);
        }
        if (oldEntry.cashBoxId && oldImpact.cashBoxBalanceChange !== 0) {
            const boxes = getLocalColl("cashBoxes");
            const idx = boxes.findIndex((b: any) => b.id === oldEntry.cashBoxId);
            if (idx !== -1) {
                boxes[idx].balance = (boxes[idx].balance || 0) - oldImpact.cashBoxBalanceChange;
                boxes[idx].updatedAt = now;
            }
            saveLocalColl("cashBoxes", boxes);
        }

        // 2. Handle Partner Auto-creation for new state
        let partnerId = newEntry.partnerId;
        if (newEntry.autoCreatePartner && !partnerId) {
            const pColl = newEntry.partnerType === 'customer' ? "customers" : "suppliers";
            const partners = getLocalColl(pColl);
            partnerId = generateId();
            partners.push({
                id: partnerId,
                name: newEntry.partnerName,
                phone: newEntry.partnerPhone || "جديد",
                balance: 0,
                recordStatus: 'active',
                updatedAt: now,
                createdAt: now
            });
            saveLocalColl(pColl, partners);
        }

        // 3. Apply New Impact
        const newImpact = FinancialEngine.getQuickEntryImpact({ ...newEntry, id: oldEntry.id, partnerId }, user);
        if (partnerId && newImpact.partnerBalanceChange !== 0) {
            const pColl = newEntry.partnerType === 'customer' ? "customers" : "suppliers";
            const partners = getLocalColl(pColl);
            const idx = partners.findIndex((p: any) => p.id === partnerId);
            if (idx !== -1) {
                partners[idx].balance = (partners[idx].balance || 0) + newImpact.partnerBalanceChange;
                partners[idx].updatedAt = now;
            }
            saveLocalColl(pColl, partners);
        }
        if (newEntry.cashBoxId && newImpact.cashBoxBalanceChange !== 0) {
            const boxes = getLocalColl("cashBoxes");
            const idx = boxes.findIndex((b: any) => b.id === newEntry.cashBoxId);
            if (idx !== -1) {
                boxes[idx].balance = (boxes[idx].balance || 0) + newImpact.cashBoxBalanceChange;
                boxes[idx].updatedAt = now;
            }
            saveLocalColl("cashBoxes", boxes);
        }

        // 4. Update Entry Record
        const entries = getLocalColl("quick_financial_entries");
        const eIdx = entries.findIndex(e => e.id === oldEntry.id);
        if (eIdx !== -1) {
            entries[eIdx] = {
                ...entries[eIdx],
                ...newEntry,
                id: oldEntry.id,
                partnerId,
                updatedAt: now
            };
            saveLocalColl("quick_financial_entries", entries);
        }

        // 5. Update Transactions
        const transactions = getLocalColl("transactions");
        const filteredTrans = transactions.filter(t => t.sourceId !== oldEntry.id);
        for (const transData of newImpact.transactions) {
            filteredTrans.push({
                ...transData,
                id: generateId(),
                recordStatus: 'active',
                updatedAt: now
            });
        }
        saveLocalColl("transactions", filteredTrans);

        await this.logAudit('UPDATE', 'QuickEntry', oldEntry.id, `تعديل إدخال مالي سريع`, oldEntry, newEntry);
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
        const filteredEntries = entries.filter(e => e.id !== entry.id);
        saveLocalColl("quick_financial_entries", filteredEntries);

        const transactions = getLocalColl("transactions");
        const filteredTransactions = transactions.filter(t => t.sourceId !== entry.id);
        saveLocalColl("transactions", filteredTransactions);
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
        await this.logAudit('SETTINGS_CHANGE', 'Settings', 'main_settings', 'تحديث إعدادات النظام والمتجر', null, data);
    }
};
