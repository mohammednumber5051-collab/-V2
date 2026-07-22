import { dbService } from "./db";
import { localDbService } from "./localDb";
import { db, doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch } from "../firebase";
import { FinancialEngine } from "./financialEngine";
import firebaseConfig from "../../firebase-applet-config.json";

const COLLECTIONS = [
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

export const migrationService = {
    async migrateAll() {
        const results: Record<string, { success: number, failed: number }> = {};
        
        for (const collName of COLLECTIONS) {
            console.log(`Migrating collection: ${collName}...`);
            const localData = await localDbService.getAll(collName);
            
            // For archived data too
            const archivedData = await localDbService.getArchived(collName);
            const allLocalData = [...localData, ...archivedData];
            
            let successCount = 0;
            let failedCount = 0;
            
            for (const item of allLocalData) {
                try {
                    const { id, ...data } = item;
                    if (!id) continue;
                    
                    const docRef = doc(db, collName, id);
                    
                    // Check if already exists in Firestore to avoid overwriting newer data if any
                    // But for initial migration, we likely want to sync everything.
                    // For safety, we can skip if already exists, but "migration" usually implies "pushing to empty".
                    await setDoc(docRef, {
                        ...data,
                        updatedAt: data.updatedAt || new Date().toISOString()
                    }, { merge: true });
                    
                    successCount++;
                } catch (err) {
                    console.error(`Failed to migrate item in ${collName}`, err);
                    failedCount++;
                }
            }
            results[collName] = { success: successCount, failed: failedCount };
        }
        
        return results;
    },

    isMigrationNeeded() {
        // Check if there is any data in localStorage that hasn't been migrated
        for (const collName of COLLECTIONS) {
            try {
                const item = localStorage.getItem(`fp_db_${collName}`);
                if (item && JSON.parse(item).length > 0) {
                    return true;
                }
            } catch (e) {}
        }
        return false;
    },

    async migrateOldInvoices() {
        try {
            const invoices = await dbService.getAll("invoices");
            const missing = invoices.filter((inv: any) => {
                if (inv.recordStatus === 'deleted') return false;
                if (!inv.invoiceNumber) return true;
                const num = parseInt(String(inv.invoiceNumber), 10);
                return isNaN(num);
            }).sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
            
            // Calculate current max numeric invoice numbers across valid invoices
            let maxSale = 0;
            let maxPur = 0;
            invoices.forEach((inv: any) => {
                if (inv.recordStatus === 'deleted') return;
                if (inv.invoiceNumber) {
                    const n = parseInt(String(inv.invoiceNumber), 10);
                    if (!isNaN(n)) {
                        const invType = inv.type || 'sale';
                        if (invType.includes('sale') && n > maxSale) maxSale = n;
                        if (invType.includes('purchase') && n > maxPur) maxPur = n;
                    }
                }
            });

            if (missing.length === 0) return;

            console.log(`Migrating ${missing.length} old/non-numeric invoices to sequential numbers (maxSale: ${maxSale}, maxPur: ${maxPur})...`);
            const isFirebase = !!db && firebaseConfig.projectId;

            if (isFirebase) {
                const batch = writeBatch(db);
                let count = 0;

                for (const inv of missing) {
                    let seqNum = 1;
                    const invType = inv.type || 'sale';
                    if (invType.includes('sale')) {
                        maxSale++;
                        seqNum = maxSale;
                    } else {
                        maxPur++;
                        seqNum = maxPur;
                    }
                    
                    batch.set(doc(db, 'invoices', inv.id), {
                        invoiceNumber: String(seqNum)
                    }, { merge: true });
                    count++;
                }

                if (count > 0) {
                    await batch.commit();
                    await setDoc(doc(db, 'counters', 'sales_invoice'), { lastNumber: maxSale, updatedAt: new Date().toISOString() }, { merge: true });
                    await setDoc(doc(db, 'counters', 'purchase_invoice'), { lastNumber: maxPur, updatedAt: new Date().toISOString() }, { merge: true });
                }

            } else {
                for (const inv of missing) {
                    let seqNum = 1;
                    const invType = inv.type || 'sale';
                    if (invType.includes('sale')) {
                        maxSale++;
                        seqNum = maxSale;
                    } else {
                        maxPur++;
                        seqNum = maxPur;
                    }
                    
                    await localDbService.update("invoices", inv.id, {
                        invoiceNumber: String(seqNum)
                    }, true);
                }
            }
            console.log("Invoice numbering migration complete!");
        } catch (e) {
            console.error("Failed to migrate invoices", e);
        }
    },

    async migrateOldQuickEntries() {
        try {
            console.log("Checking and migrating old quick entries and their transactions...");
            const isFirebase = !!db && firebaseConfig.projectId;

            if (isFirebase) {
                // 1. Fetch all active quick entries
                const qeSnap = await getDocs(query(collection(db, "quick_financial_entries"), where("recordStatus", "==", "active")));
                if (qeSnap.empty) {
                    console.log("No active quick entries found.");
                    return;
                }

                console.log(`Found ${qeSnap.docs.length} active quick entries. Migrating transactions...`);
                
                const user = { name: "النظام" } as any; // Default user for migration

                for (const docSnap of qeSnap.docs) {
                    const entry = { ...docSnap.data(), id: docSnap.id } as any;

                    // Ensure paidAmount is correctly set
                    let paidAmount = entry.paidAmount;
                    if (paidAmount === undefined || paidAmount === null) {
                        if (entry.paymentStatus === 'مدفوع') {
                            paidAmount = entry.netAmount || entry.amount || 0;
                        } else if (entry.paymentStatus === 'آجل') {
                            paidAmount = 0;
                        } else {
                            paidAmount = entry.netAmount || entry.amount || 0;
                        }
                        // Update document in Firestore
                        await setDoc(doc(db, "quick_financial_entries", entry.id), { paidAmount }, { merge: true });
                        entry.paidAmount = paidAmount;
                    }

                    // Compute correct impact
                    const impact = FinancialEngine.getQuickEntryImpact(entry, user);

                    // Fetch existing transactions for this quick entry
                    const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", entry.id)));
                    
                    // Start a batch to delete old and write new transactions
                    const batch = writeBatch(db);

                    // Delete old ones
                    for (const tDoc of transSnap.docs) {
                        batch.delete(doc(db, "transactions", tDoc.id));
                    }

                    // Write new ones
                    for (const transData of impact.transactions) {
                        const newTransRef = doc(collection(db, "transactions"));
                        batch.set(newTransRef, {
                            ...transData,
                            id: newTransRef.id,
                            recordStatus: 'active',
                            updatedAt: new Date().toISOString()
                        });
                    }

                    await batch.commit();
                }

                console.log("Quick entry transactions rebuilt successfully. Rebuilding financial state...");
                // Call rebuildFinancialState to update all customer/supplier/cashbox balances based on new transactions!
                const { FinancialExecutionEngine } = await import("./financialExecutionEngine");
                await FinancialExecutionEngine.rebuildFinancialState();
                console.log("Financial state rebuild complete!");

            } else {
                // LocalDB mode (Offline)
                const entries = await localDbService.getAll("quick_financial_entries");
                const activeEntries = entries.filter((e: any) => e.recordStatus === 'active');
                if (activeEntries.length === 0) return;

                const user = { name: "النظام" } as any;

                for (const entry of activeEntries) {
                    let paidAmount = entry.paidAmount;
                    if (paidAmount === undefined || paidAmount === null) {
                        if (entry.paymentStatus === 'مدفوع') {
                            paidAmount = entry.netAmount || entry.amount || 0;
                        } else if (entry.paymentStatus === 'آجل') {
                            paidAmount = 0;
                        } else {
                            paidAmount = entry.netAmount || entry.amount || 0;
                        }
                        await localDbService.update("quick_financial_entries", entry.id, { paidAmount }, true);
                        entry.paidAmount = paidAmount;
                    }

                    const impact = FinancialEngine.getQuickEntryImpact(entry, user);

                    // Delete old transactions
                    const transactions = await localDbService.getAll("transactions");
                    const keptTransactions = transactions.filter((t: any) => t.sourceId !== entry.id);

                    // Add new transactions
                    for (const transData of impact.transactions) {
                        keptTransactions.push({
                            ...transData,
                            id: Math.random().toString(36).substring(2, 9),
                            recordStatus: 'active',
                            updatedAt: new Date().toISOString()
                        });
                    }

                    // Save transactions
                    localStorage.setItem("fp_db_transactions", JSON.stringify(keptTransactions));
                }
            }

        } catch (e) {
            console.error("Failed to migrate quick entries transactions", e);
        }
    },

    async recoverZeroedInvoices() {
        try {
            console.log("Checking and recovering invoices with zeroed-out paid amounts...");
            const isFirebase = !!db && firebaseConfig.projectId;

            if (isFirebase) {
                // Fetch all invoices
                const invSnap = await getDocs(collection(db, "invoices"));
                if (invSnap.empty) {
                    console.log("No invoices found to recover.");
                    return;
                }

                console.log(`Found ${invSnap.docs.length} total invoices in Firestore. Retrieving transactions...`);

                // Fetch all active transactions
                const transSnap = await getDocs(query(collection(db, "transactions"), where("recordStatus", "==", "active")));
                
                // Aggregate payment sums and transaction existence
                const paymentSums: Record<string, number> = {};
                const hasAnyTransactions: Record<string, boolean> = {};

                for (const tDoc of transSnap.docs) {
                    const trans = tDoc.data();
                    const invId = trans.sourceId || trans.relatedId;
                    if (!invId) continue;

                    if (trans.sourceType === 'sales_invoice' || trans.sourceType === 'purchase_invoice') {
                        hasAnyTransactions[invId] = true;
                        continue;
                    }

                    if (trans.sourceType === 'invoice_payment' || trans.sourceType === 'manual_receipt' || trans.sourceType === 'manual_payment') {
                        paymentSums[invId] = (paymentSums[invId] || 0) + Number(trans.amount || 0);
                        hasAnyTransactions[invId] = true;
                    }
                }

                const batch = writeBatch(db);
                let updateCount = 0;

                for (const docSnap of invSnap.docs) {
                    const invoice = { ...docSnap.data(), id: docSnap.id } as any;
                    if (invoice.recordStatus === 'deleted') continue;

                    const total = Number(invoice.total || 0);
                    const discount = Number(invoice.discount || 0);
                    const netTotal = Math.max(0, total - discount);
                    const originalPaid = Number(invoice.paid || 0);
                    const originalStatus = invoice.status || 'آجل';

                    let correctPaid = originalPaid;
                    let correctStatus = originalStatus;

                    const hasTx = !!hasAnyTransactions[invoice.id];
                    const txPaidSum = paymentSums[invoice.id] || 0;

                    if (hasTx) {
                        // Reconstruct from transactions!
                        if (txPaidSum >= netTotal && netTotal > 0) {
                            correctPaid = netTotal;
                            correctStatus = 'مدفوع';
                        } else if (txPaidSum > 0) {
                            correctPaid = txPaidSum;
                            correctStatus = 'جزئي';
                        } else {
                            correctPaid = 0;
                            correctStatus = 'آجل';
                        }
                    } else {
                        // Fallback to invoice status
                        if (originalStatus === 'مدفوع') {
                            correctPaid = netTotal;
                        } else if (originalStatus === 'آجل') {
                            correctPaid = 0;
                        } else if (originalStatus === 'جزئي') {
                            if (originalPaid === 0) {
                                correctPaid = txPaidSum; // 0, since no transactions
                            }
                        }
                    }

                    if (correctPaid !== originalPaid || correctStatus !== originalStatus) {
                        console.log(`Recovering invoice #${invoice.invoiceNumber || invoice.id}: status changed from ${originalStatus} to ${correctStatus}, paid changed from ${originalPaid} to ${correctPaid}`);
                        batch.update(doc(db, "invoices", invoice.id), {
                            paid: correctPaid,
                            status: correctStatus,
                            updatedAt: new Date().toISOString()
                        });
                        updateCount++;
                    }
                }

                if (updateCount > 0) {
                    await batch.commit();
                    console.log(`Successfully recovered ${updateCount} invoices in Firestore. Recalculating all financial balances...`);
                    // Run comprehensive recalculation to fix all cashbox and customer/supplier balances!
                    await dbService.recalculateFinancials();
                    console.log("Financial balance recalculation complete!");
                } else {
                    console.log("No invoices needed recovery.");
                    // Run recalculateFinancials anyway to ensure clean, non-double-counted state
                    await dbService.recalculateFinancials();
                }

            } else {
                // LocalDB mode (Offline)
                const invoices = await localDbService.getAll("invoices");
                if (invoices.length === 0) return;

                const transactions = await localDbService.getAll("transactions");
                const paymentSums: Record<string, number> = {};
                const hasAnyTransactions: Record<string, boolean> = {};

                transactions.forEach((trans: any) => {
                    if (trans.recordStatus === 'deleted') return;
                    const invId = trans.sourceId || trans.relatedId;
                    if (!invId) return;

                    if (trans.sourceType === 'sales_invoice' || trans.sourceType === 'purchase_invoice') {
                        hasAnyTransactions[invId] = true;
                        return;
                    }

                    if (trans.sourceType === 'invoice_payment' || trans.sourceType === 'manual_receipt' || trans.sourceType === 'manual_payment') {
                        paymentSums[invId] = (paymentSums[invId] || 0) + Number(trans.amount || 0);
                        hasAnyTransactions[invId] = true;
                    }
                });

                let updated = false;
                for (const invoice of invoices) {
                    if (invoice.recordStatus === 'deleted') continue;

                    const total = Number(invoice.total || 0);
                    const discount = Number(invoice.discount || 0);
                    const netTotal = Math.max(0, total - discount);
                    const originalPaid = Number(invoice.paid || 0);
                    const originalStatus = invoice.status || 'آجل';

                    let correctPaid = originalPaid;
                    let correctStatus = originalStatus;

                    const hasTx = !!hasAnyTransactions[invoice.id];
                    const txPaidSum = paymentSums[invoice.id] || 0;

                    if (hasTx) {
                        if (txPaidSum >= netTotal && netTotal > 0) {
                            correctPaid = netTotal;
                            correctStatus = 'مدفوع';
                        } else if (txPaidSum > 0) {
                            correctPaid = txPaidSum;
                            correctStatus = 'جزئي';
                        } else {
                            correctPaid = 0;
                            correctStatus = 'آجل';
                        }
                    } else {
                        if (originalStatus === 'مدفوع') {
                            correctPaid = netTotal;
                        } else if (originalStatus === 'آجل') {
                            correctPaid = 0;
                        } else if (originalStatus === 'جزئي') {
                            if (originalPaid === 0) {
                                correctPaid = txPaidSum;
                            }
                        }
                    }

                    if (correctPaid !== originalPaid || correctStatus !== originalStatus) {
                        invoice.paid = correctPaid;
                        invoice.status = correctStatus;
                        invoice.updatedAt = new Date().toISOString();
                        await localDbService.update("invoices", invoice.id, { paid: correctPaid, status: correctStatus }, true);
                        updated = true;
                    }
                }

                // Recalculate anyway to fix double-counting on the client side
                await dbService.recalculateFinancials();
            }
        } catch (e) {
            console.error("Failed to recover zeroed invoices:", e);
        }
    }
};
