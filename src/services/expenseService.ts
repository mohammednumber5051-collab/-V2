import { Expense, ExpenseCategory, Currency } from '../types';
import { dbService } from './db';
import { financialEngine } from './financialEngine';
import { authService } from './authService';

/**
 * ✅ NEW: Expense Service
 * Handles all expense-related operations
 * - Record expenses
 * - Get expenses
 * - Update expenses
 * - Delete expenses
 * 
 * Expenses impact:
 * - Cash box balance (direct reduction)
 * - P&L statement (expense account)
 * - Financial aggregation
 */

export const expenseService = {
    /**
     * Record a new expense
     * Directly reduces the cash box balance
     * Creates accounting transaction
     */
    async recordExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) {
        try {
            const user = authService.getCurrentUser();
            if (!user) throw new Error('User not authenticated');

            const now = new Date().toISOString();
            
            // ✅ Create expense record
            const expenseData: Expense = {
                ...expense,
                createdBy: user.name,
                createdAt: now
            };

            // ✅ Process through financial engine
            // This creates the proper accounting entry
            const { transactions, cashBoxBalanceChange, aggregationImpact } = 
                financialEngine.recordExpense(expenseData, user);

            // ✅ Save to database
            const expenseRef = await dbService.create('expenses', expenseData);
            expenseData.id = expenseRef;

            // ✅ Create transaction records
            for (const transaction of transactions) {
                await dbService.create('transactions', transaction);
            }

            // ✅ Update cash box balance
            if (expense.boxId && cashBoxBalanceChange !== 0) {
                const cashBoxRef = dbService.getDocRef('cash_boxes', expense.boxId);
                await dbService.updateWithTransaction(cashBoxRef, {
                    balance: dbService.getFieldValue('increment', cashBoxBalanceChange)
                });
            }

            // ✅ Log audit
            await dbService.logAudit(
                'CREATE',
                'expense',
                expenseRef,
                `مصروف جديد: ${expense.category} - ${expense.amount}`,
                null,
                expenseData,
                { aggregationImpact }
            );

            return {
                success: true,
                expenseId: expenseRef,
                message: `تم تسجيل المصروف بنجاح - ${expense.category}`
            };
        } catch (error) {
            console.error('[expenseService] Error recording expense:', error);
            throw error;
        }
    },

    /**
     * Get all expenses
     */
    async getAllExpenses() {
        try {
            const expenses = await dbService.getAll('expenses');
            return expenses.filter(e => e.recordStatus !== 'deleted');
        } catch (error) {
            console.error('[expenseService] Error fetching expenses:', error);
            return [];
        }
    },

    /**
     * Get expenses by category
     */
    async getExpensesByCategory(category: ExpenseCategory) {
        try {
            const expenses = await dbService.getAll('expenses');
            return expenses.filter(e => 
                e.category === category && e.recordStatus !== 'deleted'
            );
        } catch (error) {
            console.error('[expenseService] Error fetching expenses by category:', error);
            return [];
        }
    },

    /**
     * Get expenses for a specific cash box
     */
    async getExpensesByBox(boxId: string) {
        try {
            const expenses = await dbService.getAll('expenses');
            return expenses.filter(e =>
                e.boxId === boxId && e.recordStatus !== 'deleted'
            );
        } catch (error) {
            console.error('[expenseService] Error fetching box expenses:', error);
            return [];
        }
    },

    /**
     * Get total expenses within a date range
     */
    async getTotalExpenses(dateStart: string, dateEnd: string) {
        try {
            const expenses = await dbService.getAll('expenses');
            const filtered = expenses.filter(e =>
                e.recordStatus !== 'deleted' &&
                e.createdAt >= dateStart &&
                e.createdAt <= dateEnd
            );

            return {
                count: filtered.length,
                total: filtered.reduce((sum, e) => sum + e.amount, 0),
                byCategory: this.groupExpensesByCategory(filtered)
            };
        } catch (error) {
            console.error('[expenseService] Error calculating total expenses:', error);
            return { count: 0, total: 0, byCategory: {} };
        }
    },

    /**
     * Group expenses by category
     */
    groupExpensesByCategory(expenses: Expense[]) {
        const grouped: Record<ExpenseCategory, number> = {} as any;
        
        expenses.forEach(e => {
            if (!grouped[e.category]) {
                grouped[e.category] = 0;
            }
            grouped[e.category] += e.amount;
        });

        return grouped;
    },

    /**
     * Delete an expense (soft delete)
     */
    async deleteExpense(expenseId: string) {
        try {
            const user = authService.getCurrentUser();
            if (!user) throw new Error('User not authenticated');

            // ✅ Soft delete
            await dbService.update('expenses', expenseId, {
                recordStatus: 'deleted',
                updatedAt: new Date().toISOString()
            });

            // ✅ Retrieve the deleted expense to reverse its impact
            const deletedExpense = await dbService.getOne('expenses', expenseId);
            if (deletedExpense && deletedExpense.boxId) {
                // ✅ Reverse the cash box impact (add back the amount)
                const cashBoxRef = dbService.getDocRef('cash_boxes', deletedExpense.boxId);
                await dbService.updateWithTransaction(cashBoxRef, {
                    balance: dbService.getFieldValue('increment', deletedExpense.amount)
                });
            }

            await dbService.logAudit(
                'DELETE',
                'expense',
                expenseId,
                `حذف مصروف: ${deletedExpense?.category}`,
                deletedExpense,
                { recordStatus: 'deleted' }
            );

            return { success: true, message: 'تم حذف المصروف بنجاح' };
        } catch (error) {
            console.error('[expenseService] Error deleting expense:', error);
            throw error;
        }
    }
};
