const fs = require('fs');
let code = fs.readFileSync('src/components/DailyLedger.tsx', 'utf8');

const target2 = `        const { boxBalances } = calculateUnifiedCashBalances(
            boxes as CashBox[],
            txs as any[],
            invs as any[],
            vchs as any[],
            qes as any[]
        );

        const updatedBoxes = (boxes as CashBox[]).map(b => ({
            ...b,
            balance: boxBalances[b.id!] || 0
        }));`;

const replacement2 = `        const updatedBoxes = (boxes as CashBox[]).map(b => ({
            ...b,
            balance: b.balance || 0
        }));`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/DailyLedger.tsx', code);
