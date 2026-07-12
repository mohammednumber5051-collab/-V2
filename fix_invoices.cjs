const fs = require('fs');
let code = fs.readFileSync('src/components/Invoices.tsx', 'utf8');

const target2 = `        const { boxBalances } = calculateUnifiedCashBalances(
            boxData as CashBox[],
            txs as any[],
            invs as any[],
            vchs as any[],
            qes as any[]
        );
        setCalculatedBalances(boxBalances);`;

const replacement2 = `        const boxBalances: Record<string, number> = {};
        (boxData as CashBox[]).forEach(b => {
            boxBalances[b.id!] = b.balance || 0;
        });
        setCalculatedBalances(boxBalances);`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/Invoices.tsx', code);
