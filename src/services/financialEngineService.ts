/**
 * FinancialEngineService — Public API for Quick Financial Entry operations.
 *
 * Fixes applied:
 *  - operationId now uses crypto.randomUUID (never Math.random) for true uniqueness.
 *  - Sync events consolidated: one DATA_CHANGED instead of 4 separate events that
 *    caused 8 listener callbacks via the syncEngine double-emit.
 */

import { QuickFinancialEntry, AppUser } from "../types";
import { syncEngine } from "./syncEngine";
import { FinancialExecutionEngine } from "./financialExecutionEngine";

export class FinancialEngineService {

    static async createQuickEntry(entry: Omit<QuickFinancialEntry, "id">, user: AppUser): Promise<string> {
        const entryId = await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("CREATE_QUICK_ENTRY"),
            type: "CREATE_QUICK_ENTRY",
            payload: { entry },
            user: { id: user.id, name: user.name },
        });

        syncEngine.emit("DATA_CHANGED");
        return entryId as string;
    }

    static async updateQuickEntry(
        oldEntry: QuickFinancialEntry,
        newEntry: QuickFinancialEntry,
        user: AppUser
    ): Promise<void> {
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("UPDATE_QUICK_ENTRY"),
            type: "UPDATE_QUICK_ENTRY",
            payload: { oldEntry, newEntry },
            user: { id: user.id, name: user.name },
        });

        syncEngine.emit("DATA_CHANGED");
    }

    static async deleteQuickEntry(entry: QuickFinancialEntry, user: AppUser): Promise<void> {
        await FinancialExecutionEngine.execute({
            operationId: FinancialExecutionEngine.generateOperationId("DELETE_QUICK_ENTRY"),
            type: "DELETE_QUICK_ENTRY",
            payload: { entry },
            user: { id: user.id, name: user.name },
        });

        syncEngine.emit("DATA_CHANGED");
    }
}
