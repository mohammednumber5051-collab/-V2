const fs = require('fs');
let code = fs.readFileSync('src/components/Partners.tsx', 'utf8');

const target2 = `    const partnerTotalsMap = React.useMemo(() => {
        return calculateUnifiedPartnerBalances(
            partners,
            allTransactions,
            invoices,
            vouchers,
            quickEntries,
            type
        );
    }, [partners, allTransactions, invoices, vouchers, quickEntries, type]);`;

const replacement2 = `    const partnerTotalsMap = React.useMemo(() => {
        const map: Record<string, { total: number, paid: number, remaining: number }> = {};
        partners.forEach(p => {
            map[p.id!] = { total: 0, paid: 0, remaining: p.balance || 0 };
        });
        return map;
    }, [partners]);`;

code = code.replace(target2, replacement2);
fs.writeFileSync('src/components/Partners.tsx', code);
