const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const target = `                // Fetch cash boxes and all movements directly for exact live calculation
                const [cashBoxes, txs, invs, vchs, qes] = await Promise.all([
                    dbService.getAll("cashBoxes"),
                    dbService.getAll("transactions"),
                    dbService.getAll("invoices"),
                    dbService.getAll("vouchers"),
                    dbService.getAll("quick_financial_entries")
                ]);`;

const replacement = `                // Fetch cash boxes directly
                const cashBoxes = await dbService.getAll("cashBoxes");`;

code = code.replace(target, replacement);

const target2 = `                    const { boxBalances, totalBalance } = calculateUnifiedCashBalances(
                        cashBoxes as CashBox[],
                        txs as any[],
                        invs as any[],
                        vchs as any[],
                        qes as any[]
                    );`;

const replacement2 = `                    let totalBalance = 0;
                    const boxBalances: Record<string, number> = {};
                    (cashBoxes as CashBox[]).forEach((b) => {
                        if (b.recordStatus !== 'deleted' && b.isActive !== false) {
                            totalBalance += (b.balance || 0);
                        }
                        boxBalances[b.id!] = (b.balance || 0);
                    });`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/Dashboard.tsx', code);
