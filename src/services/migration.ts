import { dbService } from "./db";
import { localDbService } from "./localDb";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

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
    }
};
