import fs from 'fs';
let code = fs.readFileSync('src/services/db.ts', 'utf8');

// Use cleanData for all set and update calls in transactions
code = code.replace(/transaction\.set\(([^,]+),\s*\{([\s\S]*?)\}(,\s*\{ merge:\s*true \})?\)/g, (match, ref, data, merge) => {
    return `transaction.set(${ref}, cleanData({${data}})${merge || ''})`;
});

code = code.replace(/batch\.set\(([^,]+),\s*\{([\s\S]*?)\}(,\s*\{ merge:\s*true \})?\)/g, (match, ref, data, merge) => {
    return `batch.set(${ref}, cleanData({${data}})${merge || ''})`;
});

code = code.replace(/batch\.update\(([^,]+),\s*\{([\s\S]*?)\}\)/g, (match, ref, data) => {
    return `batch.update(${ref}, cleanData({${data}}))`;
});

fs.writeFileSync('src/services/db.ts', code);
