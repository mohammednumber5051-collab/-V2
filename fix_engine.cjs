const fs = require('fs');
let code = fs.readFileSync('src/services/financialExecutionEngine.ts', 'utf-8');

const target1 = `            transaction.set(opRef, { ...operation, status: 'processing', startedAt: new Date().toISOString() });`;
const replacement1 = `            transaction.set(opRef, cleanData({ ...operation, status: 'processing', startedAt: new Date().toISOString() }));`;

if (code.includes(target1)) {
    code = code.replace(target1, replacement1);
    console.log("Replaced target1");
}

fs.writeFileSync('src/services/financialExecutionEngine.ts', code, 'utf-8');
