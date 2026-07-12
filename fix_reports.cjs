const fs = require('fs');
let code = fs.readFileSync('src/components/Reports.tsx', 'utf8');

const target2 = `            // Calculate Live Stats
            const { totalBalance } = calculateUnifiedCashBalances(
                boxes as CashBox[],
                transactions as Transaction[],
                invoices as Invoice[],
                vouchers as Voucher[],
                quickEntries as QuickFinancialEntry[]
            );`;

const replacement2 = `            // Calculate Live Stats
            let totalBalance = 0;
            (boxes as CashBox[]).forEach((b) => {
                if (b.recordStatus !== 'deleted' && b.isActive !== false) {
                    totalBalance += (b.balance || 0);
                }
            });`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/Reports.tsx', code);
