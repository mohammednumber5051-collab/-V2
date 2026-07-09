const fs = require('fs');
let code = fs.readFileSync('src/components/Invoices.tsx', 'utf8');

code = code.replace(/document\.title = `\$\{type === 'sale' \? 'فاتورة_بيع' : type === 'purchase' \? 'فاتورة_شراء' : type === 'sale_return' \? 'مرتجع_مبيعات' : 'مرتجع_مشتريات'\}`_\$\{/g, "document.title = `${type === 'sale' ? 'فاتورة_بيع' : type === 'purchase' ? 'فاتورة_شراء' : type === 'sale_return' ? 'مرتجع_مبيعات' : 'مرتجع_مشتريات'}_${");

fs.writeFileSync('src/components/Invoices.tsx', code);
