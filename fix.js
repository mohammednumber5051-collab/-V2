const fs = require('fs');
const code = fs.readFileSync('src/components/Transactions.tsx', 'utf-8');
const startIdx = code.indexOf(`        if (printFormat === 'thermal') {`);
const endIdx = code.indexOf(`        setPrintPreview({`);
console.log(code.substring(startIdx, endIdx));
