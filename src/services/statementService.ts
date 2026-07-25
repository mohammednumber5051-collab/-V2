import { PartnerStatement, CashBoxStatement } from '../types';
import { getPartnerStatement, getCashBoxStatement } from '../lib/financialUtils';
import { dbService } from './db';

/**
 * ✅ NEW: Statement Service
 * Handles account statement generation
 * - Partner (Customer/Supplier) statements
 * - Cash Box statements
 * - Chronologically ordered
 * - With running balances
 */

export const statementService = {
    /**
     * Get partner account statement
     * Shows all invoices and payments in chronological order
     * with running balances
     */
    async getPartnerStatement(
        partnerId: string,
        dateStart: string = '1970-01-01',
        dateEnd: string = '2099-12-31'
    ): Promise<PartnerStatement | null> {
        try {
            // ✅ Fetch all data
            const [invoices, transactions, partners] = await Promise.all([
                dbService.getAll('invoices'),
                dbService.getAll('transactions'),
                dbService.getAll('partners')
            ]);

            // ✅ Find partner data
            const partnerData = partners.find((p: any) => p.id === partnerId);
            if (!partnerData) {
                console.warn('[statementService] Partner not found:', partnerId);
                return null;
            }

            // ✅ Generate statement using utility function
            const statement = getPartnerStatement(
                partnerId,
                invoices,
                transactions,
                partnerData,
                dateStart,
                dateEnd
            );

            console.log(`[statementService] Generated statement for partner ${partnerId}:`, {
                entries: statement.entries.length,
                opening: statement.openingBalance,
                closing: statement.closingBalance
            });

            return statement;
        } catch (error) {
            console.error('[statementService] Error generating partner statement:', error);
            return null;
        }
    },

    /**
     * Get cash box account statement
     * Shows all cash movements with running balance
     */
    async getCashBoxStatement(
        boxId: string,
        dateStart: string = '1970-01-01',
        dateEnd: string = '2099-12-31'
    ): Promise<CashBoxStatement | null> {
        try {
            // ✅ Fetch all data
            const [transactions, cashBoxes] = await Promise.all([
                dbService.getAll('transactions'),
                dbService.getAll('cash_boxes')
            ]);

            // ✅ Find cash box data
            const boxData = cashBoxes.find((b: any) => b.id === boxId);
            if (!boxData) {
                console.warn('[statementService] Cash box not found:', boxId);
                return null;
            }

            // ✅ Generate statement using utility function
            const statement = getCashBoxStatement(
                boxId,
                transactions,
                boxData,
                dateStart,
                dateEnd
            );

            console.log(`[statementService] Generated statement for box ${boxId}:`, {
                entries: statement.entries.length,
                opening: statement.openingBalance,
                closing: statement.closingBalance,
                totalIn: statement.totalIn,
                totalOut: statement.totalOut
            });

            return statement;
        } catch (error) {
            console.error('[statementService] Error generating cash box statement:', error);
            return null;
        }
    },

    /**
     * Get monthly financial summary for a partner
     */
    async getPartnerMonthlySummary(partnerId: string, year: number) {
        try {
            const months: any[] = [];

            // ✅ Generate statement for each month
            for (let month = 1; month <= 12; month++) {
                const dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const dateEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

                const statement = await this.getPartnerStatement(partnerId, dateStart, dateEnd);
                
                if (statement && statement.entries.length > 0) {
                    months.push({
                        month: month,
                        monthName: this.getMonthName(month),
                        opening: statement.openingBalance,
                        closing: statement.closingBalance,
                        transactions: statement.entries.length,
                        totalDebits: statement.totalDebits,
                        totalCredits: statement.totalCredits
                    });
                }
            }

            return months;
        } catch (error) {
            console.error('[statementService] Error generating monthly summary:', error);
            return [];
        }
    },

    /**
     * Get monthly cash box summary
     */
    async getCashBoxMonthlySummary(boxId: string, year: number) {
        try {
            const months: any[] = [];

            // ✅ Generate statement for each month
            for (let month = 1; month <= 12; month++) {
                const dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const dateEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

                const statement = await this.getCashBoxStatement(boxId, dateStart, dateEnd);
                
                if (statement && statement.entries.length > 0) {
                    months.push({
                        month: month,
                        monthName: this.getMonthName(month),
                        opening: statement.openingBalance,
                        closing: statement.closingBalance,
                        transactions: statement.entries.length,
                        totalIn: statement.totalIn,
                        totalOut: statement.totalOut,
                        net: statement.totalIn - statement.totalOut
                    });
                }
            }

            return months;
        } catch (error) {
            console.error('[statementService] Error generating cash box monthly summary:', error);
            return [];
        }
    },

    /**
     * Helper: Get month name in Arabic
     */
    getMonthName(month: number): string {
        const names = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];
        return names[month - 1] || '';
    },

    /**
     * Export statement as CSV
     */
    async exportStatementAsCSV(
        type: 'partner' | 'cashbox',
        id: string,
        dateStart: string,
        dateEnd: string
    ): Promise<string> {
        try {
            let statement;

            if (type === 'partner') {
                statement = await this.getPartnerStatement(id, dateStart, dateEnd);
            } else {
                statement = await this.getCashBoxStatement(id, dateStart, dateEnd);
            }

            if (!statement) {
                return '';
            }

            // ✅ CSV Header
            let csv = `${type === 'partner' ? 'كشف حساب عميل' : 'كشف حساب صندوق'}\n`;
            csv += `${type === 'partner' ? 'العميل' : 'الصندوق'}: ${statement.partnerName || statement.boxName}\n`;
            csv += `من: ${dateStart}, إلى: ${dateEnd}\n\n`;

            // ✅ Summary
            csv += `الرصيد الافتتاحي,${statement.openingBalance}\n`;

            // ✅ Column headers
            csv += 'التاريخ,الوصف,نوع,المبلغ,الرصيد\n';

            // ✅ Data rows
            statement.entries.forEach(entry => {
                csv += `${entry.date},"${entry.description}",${entry.type},${entry.amount},${entry.balance}\n`;
            });

            // ✅ Footer
            csv += `\nالرصيد الختامي,${statement.closingBalance}\n`;

            return csv;
        } catch (error) {
            console.error('[statementService] Error exporting statement:', error);
            return '';
        }
    }
};
