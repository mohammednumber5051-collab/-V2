import re

with open('src/services/db.ts', 'r') as f:
    content = f.read()

add_voucher_old = """    async addVoucher(voucher) {
        const batch = writeBatch(db);
        const voucherRef = doc(collection(db, "vouchers"));
        batch.set(voucherRef, cleanData({ ...voucher, id: voucherRef.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
        // Update CashBox balance
        batch.update(doc(db, "cashBoxes", voucher.boxId), {
            balance: increment(voucher.type === 'receipt' ? voucher.amount : -voucher.amount)
        });
        await batch.commit();
        return voucherRef.id;
    },"""

add_voucher_new = """    async addVoucher(voucher) {
        const batch = writeBatch(db);
        const voucherRef = doc(collection(db, "vouchers"));
        batch.set(voucherRef, cleanData({ ...voucher, id: voucherRef.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
        
        // Update CashBox balance
        batch.update(doc(db, "cashBoxes", voucher.boxId), {
            balance: increment(voucher.type === 'receipt' ? voucher.amount : -voucher.amount)
        });

        // Update Partner balance
        if (voucher.partnerId && voucher.partnerType && voucher.partnerType !== 'none') {
            const partnerColl = voucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            batch.update(doc(db, partnerColl, voucher.partnerId), {
                balance: increment(voucher.type === 'receipt' ? -voucher.amount : voucher.amount)
            });
        }

        await batch.commit();
        return voucherRef.id;
    },"""

content = content.replace(add_voucher_old, add_voucher_new)

update_voucher_old = """    async updateVoucher(oldVoucher, newVoucher) {
        const batch = writeBatch(db);
        batch.set(doc(db, "vouchers", newVoucher.id), cleanData({ ...newVoucher, updatedAt: new Date().toISOString() }), { merge: true });
        
        // Update CashBox balances
        if (oldVoucher.boxId === newVoucher.boxId) {
            const diff = newVoucher.amount - oldVoucher.amount;
            batch.update(doc(db, "cashBoxes", newVoucher.boxId), {
                balance: increment(newVoucher.type === 'receipt' ? diff : -diff)
            });
        } else {
            batch.update(doc(db, "cashBoxes", oldVoucher.boxId), {
                balance: increment(oldVoucher.type === 'receipt' ? -oldVoucher.amount : oldVoucher.amount)
            });
            batch.update(doc(db, "cashBoxes", newVoucher.boxId), {
                balance: increment(newVoucher.type === 'receipt' ? newVoucher.amount : -newVoucher.amount)
            });
        }

        await batch.commit();
    },"""

update_voucher_new = """    async updateVoucher(oldVoucher, newVoucher) {
        const batch = writeBatch(db);
        batch.set(doc(db, "vouchers", newVoucher.id), cleanData({ ...newVoucher, updatedAt: new Date().toISOString() }), { merge: true });
        
        // Update CashBox balances
        if (oldVoucher.boxId === newVoucher.boxId) {
            const diff = newVoucher.amount - oldVoucher.amount;
            batch.update(doc(db, "cashBoxes", newVoucher.boxId), {
                balance: increment(newVoucher.type === 'receipt' ? diff : -diff)
            });
        } else {
            batch.update(doc(db, "cashBoxes", oldVoucher.boxId), {
                balance: increment(oldVoucher.type === 'receipt' ? -oldVoucher.amount : oldVoucher.amount)
            });
            batch.update(doc(db, "cashBoxes", newVoucher.boxId), {
                balance: increment(newVoucher.type === 'receipt' ? newVoucher.amount : -newVoucher.amount)
            });
        }

        // Reverse old partner balance
        if (oldVoucher.partnerId && oldVoucher.partnerType && oldVoucher.partnerType !== 'none') {
            const oldPartnerColl = oldVoucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            batch.update(doc(db, oldPartnerColl, oldVoucher.partnerId), {
                balance: increment(oldVoucher.type === 'receipt' ? oldVoucher.amount : -oldVoucher.amount)
            });
        }

        // Apply new partner balance
        if (newVoucher.partnerId && newVoucher.partnerType && newVoucher.partnerType !== 'none') {
            const newPartnerColl = newVoucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            batch.update(doc(db, newPartnerColl, newVoucher.partnerId), {
                balance: increment(newVoucher.type === 'receipt' ? -newVoucher.amount : newVoucher.amount)
            });
        }

        await batch.commit();
    },"""

content = content.replace(update_voucher_old, update_voucher_new)

delete_voucher_old = """    async deleteVoucher(voucher) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "vouchers", voucher.id));
        batch.update(doc(db, "cashBoxes", voucher.boxId), {
            balance: increment(voucher.type === 'receipt' ? -voucher.amount : voucher.amount)
        });
        await batch.commit();
    },"""

delete_voucher_new = """    async deleteVoucher(voucher) {
        const batch = writeBatch(db);
        
        // Soft delete
        batch.set(doc(db, "vouchers", voucher.id), { recordStatus: 'deleted', updatedAt: new Date().toISOString() }, { merge: true });
        
        // Reverse cashbox
        batch.update(doc(db, "cashBoxes", voucher.boxId), {
            balance: increment(voucher.type === 'receipt' ? -voucher.amount : voucher.amount)
        });

        // Reverse partner balance
        if (voucher.partnerId && voucher.partnerType && voucher.partnerType !== 'none') {
            const partnerColl = voucher.partnerType === 'customer' ? 'customers' : 'suppliers';
            batch.update(doc(db, partnerColl, voucher.partnerId), {
                balance: increment(voucher.type === 'receipt' ? voucher.amount : -voucher.amount)
            });
        }

        await batch.commit();
    },"""

content = content.replace(delete_voucher_old, delete_voucher_new)

with open('src/services/db.ts', 'w') as f:
    f.write(content)
