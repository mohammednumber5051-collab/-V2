import fs from 'fs';
let code = fs.readFileSync('src/services/db.ts', 'utf8');

// Find the section where boxBalances are applied
const sectionToReplace = `            // 3. Update Boxes and calculate totalCashBalance for dashboard
            let totalCashBalance = 0;
            const boxSnap = await getDocs(collection(db, "cashBoxes"));
            for (const d of boxSnap.docs) {
                if (d.data().recordStatus !== 'deleted') {
                    const bal = boxBalances[d.id] || 0;
                    totalCashBalance += bal;
                    currentBatch.update(d.ref, { balance: bal, updatedAt: now });
                    await commitIfFull();
                }
            }`;

const newSection = `            // 2.5 Process Manual Transactions & Transfers for Boxes and Partners
            const transSnap = await getDocs(collection(db, "transactions"));
            transSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.recordStatus === 'deleted') return;
                
                // If this is a transfer
                if (data.type === 'تحويل') {
                    if (data.fromBoxId) boxBalances[data.fromBoxId] = (boxBalances[data.fromBoxId] || 0) - data.amount;
                    if (data.toBoxId) boxBalances[data.toBoxId] = (boxBalances[data.toBoxId] || 0) + data.amount;
                } else if (!data.sourceType || (!['sales_invoice', 'purchase_invoice', 'manual_sale', 'manual_purchase', 'receipt', 'payment'].includes(data.sourceType) && data.sourceType !== 'invoice_payment')) {
                    // Manual standalone transactions
                    if (data.boxId) {
                        const amt = (data.type === 'قبض' || data.type === 'customer_receipt') ? data.amount : -data.amount;
                        boxBalances[data.boxId] = (boxBalances[data.boxId] || 0) + amt;
                    }
                }
            });

            // 3. Update Boxes and calculate totalCashBalance for dashboard
            let totalCashBalance = 0;
            const boxSnap = await getDocs(collection(db, "cashBoxes"));
            for (const d of boxSnap.docs) {
                if (d.data().recordStatus !== 'deleted') {
                    const initial = Number(d.data().initialBalance || 0);
                    const bal = initial + (boxBalances[d.id] || 0);
                    totalCashBalance += bal;
                    currentBatch.update(d.ref, { balance: bal, updatedAt: now });
                    await commitIfFull();
                }
            }
            
            // 3.5 Update Customers & Suppliers with initial balances
            const allCust = await getDocs(collection(db, "customers"));
            for (const c of allCust.docs) {
                if (c.data().recordStatus !== 'deleted') {
                    const initial = Number(c.data().initialBalance || 0);
                    const bal = initial + (partnerBalances[c.id] || 0);
                    currentBatch.update(c.ref, { balance: bal, updatedAt: now });
                    await commitIfFull();
                }
            }
            const allSup = await getDocs(collection(db, "suppliers"));
            for (const s of allSup.docs) {
                if (s.data().recordStatus !== 'deleted') {
                    const initial = Number(s.data().initialBalance || 0);
                    const bal = initial + (partnerBalances[s.id] || 0);
                    currentBatch.update(s.ref, { balance: bal, updatedAt: now });
                    await commitIfFull();
                }
            }`;

code = code.replace(sectionToReplace, newSection);
fs.writeFileSync('src/services/db.ts', code);
