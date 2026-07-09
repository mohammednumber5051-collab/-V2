import { QuickFinancialEntry, AppUser } from "../types";
import { dbService } from "./db";
import { syncEngine } from "./syncEngine";
import { FinancialExecutionEngine } from "./financialExecutionEngine";

export class FinancialEngineService {
    static async createQuickEntry(entry: Omit<QuickFinancialEntry, 'id'>, user: AppUser) {
        // Delegate write to FinancialExecutionEngine which correctly handles transactional safety,
        // idempotency, and fallback logic.
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

    static async updateQuickEntry(oldEntry: QuickFinancialEntry, newEntry: QuickFinancialEntry, user: AppUser) {
        await dbService.updateQuickFinancialEntry(oldEntry, newEntry);
        
        syncEngine.emit('ENTRY_UPDATED');
        syncEngine.emit('CASHBOX_UPDATED');
        syncEngine.emit('CUSTOMER_UPDATED');
        syncEngine.emit('DATA_CHANGED');
    }

    static async deleteQuickEntry(entry: QuickFinancialEntry, user: AppUser) {
        await dbService.deleteQuickFinancialEntry(entry);
        
        syncEngine.emit('ENTRY_DELETED');
        syncEngine.emit('CASHBOX_UPDATED');
        syncEngine.emit('CUSTOMER_UPDATED');
        syncEngine.emit('DATA_CHANGED');
    }
}
