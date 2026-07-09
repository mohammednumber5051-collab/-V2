const fs = require('fs');

let code = fs.readFileSync('src/services/financialExecutionEngine.ts', 'utf-8');

const target = `        if (type === 'CREATE_QUICK_ENTRY') {
            const { entry } = payload;
            const entryRef = doc(collection(db, "quick_financial_entries"));
            const entryId = entryRef.id;

            transaction.set(entryRef, cleanData({ ...entry, id: entryId, recordStatus: 'active', updatedAt: now, createdAt: entry.createdAt || now }));

            const impact = OldFinancialEngine.getQuickEntryImpact({ ...entry, id: entryId }, user);

            if (entry.partnerId && impact.partnerBalanceChange !== 0) {
                const partnerColl = (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, partnerColl, entry.partnerId);
                transaction.set(partnerRef, cleanData({ balance: increment(impact.partnerBalanceChange), updatedAt: now }), { merge: true });
            }`;

const replacement = `        if (type === 'CREATE_QUICK_ENTRY') {
            const { entry } = payload;
            const entryRef = doc(collection(db, "quick_financial_entries"));
            const entryId = entryRef.id;

            let finalPartnerId = entry.partnerId;
            if (entry.autoCreatePartner && !finalPartnerId && entry.partnerName) {
                const partnerColl = (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
                const newPartnerRef = doc(collection(db, partnerColl));
                finalPartnerId = newPartnerRef.id;
                entry.partnerId = finalPartnerId;
                
                transaction.set(newPartnerRef, cleanData({
                    id: finalPartnerId,
                    name: entry.partnerName,
                    phone: entry.partnerPhone || "",
                    balance: 0,
                    recordStatus: 'active',
                    createdAt: now,
                    updatedAt: now
                }));
            }

            transaction.set(entryRef, cleanData({ ...entry, id: entryId, recordStatus: 'active', updatedAt: now, createdAt: entry.createdAt || now }));

            const impact = OldFinancialEngine.getQuickEntryImpact({ ...entry, id: entryId }, user);

            if (finalPartnerId && impact.partnerBalanceChange !== 0) {
                const partnerColl = (entry.entryType === 'manual_sale' || entry.entryType === 'receipt') ? 'customers' : 'suppliers';
                const partnerRef = doc(db, partnerColl, finalPartnerId);
                transaction.set(partnerRef, cleanData({ balance: increment(impact.partnerBalanceChange), updatedAt: now }), { merge: true });
            }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/financialExecutionEngine.ts', code, 'utf-8');
    console.log("Successfully fixed FinancialExecutionEngine");
} else {
    console.log("Could not find target in FinancialExecutionEngine");
}
