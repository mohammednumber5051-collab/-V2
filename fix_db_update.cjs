const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf-8');

const targetStart = `    async updateInvoiceData(oldInvoice, newInvoice) {`;
const targetEnd = `    async addTransaction(trans) {`;
const startIndex = code.indexOf(targetStart);
const endIndex = code.indexOf(targetEnd);

const replacement = `    async updateInvoiceData(oldInvoice, newInvoice) {
        const batch = writeBatch(db);
        const invoiceId = newInvoice.id || oldInvoice.id;
        if (!invoiceId) {
            throw new Error("ID الفاتورة غير محدد");
        }
        newInvoice.id = invoiceId;

        batch.set(doc(db, "invoices", invoiceId), cleanData({ ...newInvoice, isSystemFixed: true }), { merge: true });
        
        const oldType = oldInvoice.type || 'sale';
        const newType = newInvoice.type || 'sale';
        const oldBaseType = oldType.replace('_return', '');
        const newBaseType = newType.replace('_return', '');
        const isOldFixed = !!oldInvoice.isSystemFixed;

        // --- CASH BOX BALANCE FIX ---
        const boxChanges = {};
        if (isOldFixed && oldInvoice.boxId && oldInvoice.paid > 0) {
            let oldBox = oldBaseType === 'sale' ? oldInvoice.paid : -oldInvoice.paid;
            if (oldType.includes('return')) oldBox = -oldBox;
            boxChanges[oldInvoice.boxId] = (boxChanges[oldInvoice.boxId] || 0) - oldBox;
        }
        if (newInvoice.boxId && newInvoice.paid > 0) {
            let newBox = newBaseType === 'sale' ? newInvoice.paid : -newInvoice.paid;
            if (newType.includes('return')) newBox = -newBox;
            boxChanges[newInvoice.boxId] = (boxChanges[newInvoice.boxId] || 0) + newBox;
        }
        Object.keys(boxChanges).forEach(boxId => {
            if (boxChanges[boxId] !== 0) {
                batch.update(doc(db, "cashBoxes", boxId), { balance: increment(boxChanges[boxId]) });
            }
        });

        // --- PARTNER BALANCE FIX ---
        const partnerChanges = { customers: {}, suppliers: {} };
        if (oldInvoice.partnerId) {
            const oldPartnerColl = oldType.includes('sale') ? 'customers' : 'suppliers';
            let oldBalChange = 0;
            if (isOldFixed) {
                oldBalChange = oldInvoice.total - oldInvoice.paid;
                if (oldType.includes('return')) oldBalChange = -oldBalChange;
            } else {
                oldBalChange = oldBaseType === 'sale' ? -(oldInvoice.total - oldInvoice.paid) : (oldInvoice.total - oldInvoice.paid);
                if (oldType.includes('return')) oldBalChange = -oldBalChange;
            }
            partnerChanges[oldPartnerColl][oldInvoice.partnerId] = (partnerChanges[oldPartnerColl][oldInvoice.partnerId] || 0) - oldBalChange;
        }
        if (newInvoice.partnerId) {
            const newPartnerColl = newType.includes('sale') ? 'customers' : 'suppliers';
            let newBalChange = newInvoice.total - newInvoice.paid;
            if (newType.includes('return')) newBalChange = -newBalChange;
            partnerChanges[newPartnerColl][newInvoice.partnerId] = (partnerChanges[newPartnerColl][newInvoice.partnerId] || 0) + newBalChange;
        }
        Object.keys(partnerChanges.customers).forEach(pid => {
            if (partnerChanges.customers[pid] !== 0) {
                batch.update(doc(db, 'customers', pid), { balance: increment(partnerChanges.customers[pid]) });
            }
        });
        Object.keys(partnerChanges.suppliers).forEach(pid => {
            if (partnerChanges.suppliers[pid] !== 0) {
                batch.update(doc(db, 'suppliers', pid), { balance: increment(partnerChanges.suppliers[pid]) });
            }
        });

        // --- STOCK BALANCE FIX ---
        const stockChanges = {};
        if (oldInvoice.items && oldInvoice.items.length > 0) {
            for (const item of oldInvoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    let stockChange = 0;
                    if (isOldFixed) {
                        stockChange = oldBaseType === 'sale' ? -item.quantity : item.quantity;
                    } else {
                        stockChange = oldBaseType === 'sale' ? item.quantity : -item.quantity;
                    }
                    if (oldType.includes('return')) stockChange = -stockChange;
                    stockChanges[item.productId] = (stockChanges[item.productId] || 0) - stockChange;
                }
            }
        }
        if (newInvoice.items && newInvoice.items.length > 0) {
            for (const item of newInvoice.items) {
                if (item.productId && item.productId !== "ledger_entry_item") {
                    let stockChange = newBaseType === 'sale' ? -item.quantity : item.quantity;
                    if (newType.includes('return')) stockChange = -stockChange;
                    stockChanges[item.productId] = (stockChanges[item.productId] || 0) + stockChange;
                }
            }
        }
        Object.keys(stockChanges).forEach(pid => {
            if (stockChanges[pid] !== 0) {
                batch.update(doc(db, "products", pid), { stock: increment(stockChanges[pid]) });
            }
        });

        await batch.commit();
    },
`;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('src/services/db.ts', code, 'utf-8');
console.log("Successfully replaced updateInvoiceData.");
