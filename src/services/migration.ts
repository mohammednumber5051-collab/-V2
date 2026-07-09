import { dbService } from "./db";
import { localDbService } from "./localDb";
import { db, doc, getDoc, setDoc } from "../firebase";
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
            const missing = invoices.filter((inv: any) => !inv.invoiceNumber).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            
            if (missing.length === 0) return;

            console.log(`Migrating ${missing.length} old invoices to sequential numbers...`);
            const isFirebase = !!db && firebaseConfig.projectId;

            if (isFirebase) {
                let salesNext = 1;
                let purchasesNext = 1;

                const salesRef = doc(db, 'counters', 'sales_invoice');
                const purRef = doc(db, 'counters', 'purchase_invoice');
                
                const [salesSnap, purSnap] = await Promise.all([
                    getDoc(salesRef).catch(() => null),
                    getDoc(purRef).catch(() => null)
                ]);

                if (salesSnap && salesSnap.exists()) salesNext = (salesSnap.data().lastNumber || 0) + 1;
                if (purSnap && purSnap.exists()) purchasesNext = (purSnap.data().lastNumber || 0) + 1;

                let salesMaxUsed = salesNext - 1;
                let purMaxUsed = purchasesNext - 1;

                for (const inv of missing) {
                    let seqNum = 1;
                    if (inv.type === 'sale') {
                        seqNum = salesNext++;
                        salesMaxUsed = Math.max(salesMaxUsed, seqNum);
                    } else {
                        seqNum = purchasesNext++;
                        purMaxUsed = Math.max(purMaxUsed, seqNum);
                    }
                    
                    await setDoc(doc(db, 'invoices', inv.id), {
                        invoiceNumber: String(seqNum)
                    }, { merge: true });
                }

                await setDoc(salesRef, { lastNumber: salesMaxUsed, updatedAt: new Date().toISOString() }, { merge: true });
                await setDoc(purRef, { lastNumber: purMaxUsed, updatedAt: new Date().toISOString() }, { merge: true });

            } else {
                let maxSale = 0;
                let maxPur = 0;
                invoices.forEach((inv: any) => {
                    if (inv.invoiceNumber) {
                        const n = parseInt(inv.invoiceNumber, 10);
                        if (!isNaN(n)) {
                            if (inv.type === 'sale' && n > maxSale) maxSale = n;
                            if (inv.type === 'purchase' && n > maxPur) maxPur = n;
                        }
                    }
                });

                for (const inv of missing) {
                    let seqNum = 1;
                    if (inv.type === 'sale') {
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
    }
};
