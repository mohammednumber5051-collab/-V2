import re

with open('src/services/db.ts', 'r') as f:
    content = f.read()

delete_inv_old = """    async deleteInvoiceData(invoice) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "invoices", invoice.id));
        if (invoice.boxId) {
            batch.update(doc(db, "cashBoxes", invoice.boxId), { balance: increment(invoice.type === 'sale' ? -invoice.paid : invoice.paid) });
        }
        await batch.commit();
    },"""

delete_inv_new = """    async deleteInvoiceData(invoice) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "invoices", invoice.id));
        if (invoice.boxId) {
            batch.update(doc(db, "cashBoxes", invoice.boxId), { balance: increment(invoice.type === 'sale' ? -invoice.paid : invoice.paid) });
        }
        if (invoice.partnerId) {
            const partnerColl = invoice.type === 'sale' ? 'customers' : 'suppliers';
            batch.update(doc(db, partnerColl, invoice.partnerId), { balance: increment(invoice.type === 'sale' ? -(invoice.total - invoice.paid) : (invoice.total - invoice.paid)) });
        }
        await batch.commit();
    },"""

content = content.replace(delete_inv_old, delete_inv_new)

update_inv_old = """    async updateInvoiceData(oldInvoice, newInvoice) {
        const batch = writeBatch(db);
        batch.set(doc(db, "invoices", newInvoice.id), cleanData(newInvoice), { merge: true });
        if (oldInvoice.boxId === newInvoice.boxId && newInvoice.boxId) {
            const diff = newInvoice.paid - oldInvoice.paid;
            if (diff !== 0) batch.update(doc(db, "cashBoxes", newInvoice.boxId), { balance: increment(newInvoice.type === 'sale' ? diff : -diff) });
        }
        await batch.commit();
    },"""

update_inv_new = """    async updateInvoiceData(oldInvoice, newInvoice) {
        const batch = writeBatch(db);
        batch.set(doc(db, "invoices", newInvoice.id), cleanData(newInvoice), { merge: true });
        
        // Update CashBox
        if (oldInvoice.boxId === newInvoice.boxId && newInvoice.boxId) {
            const diff = newInvoice.paid - oldInvoice.paid;
            if (diff !== 0) batch.update(doc(db, "cashBoxes", newInvoice.boxId), { balance: increment(newInvoice.type === 'sale' ? diff : -diff) });
        } else {
            if (oldInvoice.boxId) {
                batch.update(doc(db, "cashBoxes", oldInvoice.boxId), { balance: increment(oldInvoice.type === 'sale' ? -oldInvoice.paid : oldInvoice.paid) });
            }
            if (newInvoice.boxId) {
                batch.update(doc(db, "cashBoxes", newInvoice.boxId), { balance: increment(newInvoice.type === 'sale' ? newInvoice.paid : -newInvoice.paid) });
            }
        }
        
        // Reverse old partner balance
        if (oldInvoice.partnerId) {
            const oldPartnerColl = oldInvoice.type === 'sale' ? 'customers' : 'suppliers';
            batch.update(doc(db, oldPartnerColl, oldInvoice.partnerId), { balance: increment(oldInvoice.type === 'sale' ? -(oldInvoice.total - oldInvoice.paid) : (oldInvoice.total - oldInvoice.paid)) });
        }
        
        // Apply new partner balance
        if (newInvoice.partnerId) {
            const newPartnerColl = newInvoice.type === 'sale' ? 'customers' : 'suppliers';
            batch.update(doc(db, newPartnerColl, newInvoice.partnerId), { balance: increment(newInvoice.type === 'sale' ? (newInvoice.total - newInvoice.paid) : -(newInvoice.total - newInvoice.paid)) });
        }

        await batch.commit();
    },"""

content = content.replace(update_inv_old, update_inv_new)

with open('src/services/db.ts', 'w') as f:
    f.write(content)
