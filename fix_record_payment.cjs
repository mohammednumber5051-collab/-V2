const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf-8');

const targetStart = `    async recordInvoicePayment(invoice, amount, boxId, newPaid, newStatus) {`;
const targetEnd = `    async deleteAllTransactions() {},`;

const startIndex = code.indexOf(targetStart);
const endIndex = code.indexOf(targetEnd);

const replacement = `    async recordInvoicePayment(invoice, amount, boxId, newPaid, newStatus) {
        const batch = writeBatch(db);
        
        const oldPaid = invoice.paid || 0;
        const oldBoxId = invoice.boxId;
        const baseType = invoice.type.replace('_return', '');
        
        let oldBoxChange = baseType === 'sale' ? oldPaid : -oldPaid;
        if (invoice.type.includes('return')) oldBoxChange = -oldBoxChange;

        let newBoxChange = baseType === 'sale' ? newPaid : -newPaid;
        if (invoice.type.includes('return')) newBoxChange = -newBoxChange;

        let finalPaymentType = invoice.paymentType;
        if (newStatus === 'مدفوع') finalPaymentType = 'نقدآ';
        else if (newStatus === 'جزئي') finalPaymentType = 'نقد_آجل';

        batch.update(doc(db, "invoices", invoice.id), { 
            paid: newPaid, 
            status: newStatus,
            boxId: boxId,
            paymentType: finalPaymentType
        });
        
        // Update CashBox
        if (oldBoxId === boxId) {
            batch.update(doc(db, "cashBoxes", boxId), { balance: increment(newBoxChange - oldBoxChange) });
        } else {
            if (oldBoxId) {
                batch.update(doc(db, "cashBoxes", oldBoxId), { balance: increment(-oldBoxChange) });
            }
            if (boxId) {
                batch.update(doc(db, "cashBoxes", boxId), { balance: increment(newBoxChange) });
            }
        }

        // Update Partner balance
        if (invoice.partnerId) {
            const partnerColl = invoice.type.includes('sale') ? 'customers' : 'suppliers';
            let balChange = -amount;
            if (invoice.type.includes('return')) balChange = -balChange;
            batch.update(doc(db, partnerColl, invoice.partnerId), { balance: increment(balChange) });
        }

        await batch.commit();
    },
`;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('src/services/db.ts', code, 'utf-8');
console.log("Successfully replaced recordInvoicePayment logic.");
