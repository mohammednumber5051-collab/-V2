import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
        console.error("firebase-applet-config.json not found!");
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [allBoxes, transSnap, allInv, allVch, allQE] = await Promise.all([
        getDocs(collection(db, "cashBoxes")),
        getDocs(collection(db, "transactions")),
        getDocs(collection(db, "invoices")),
        getDocs(collection(db, "vouchers")),
        getDocs(collection(db, "quick_financial_entries"))
    ]);

    const boxes = allBoxes.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const transactions = transSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const invoices = allInv.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const vouchers = allVch.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const quickEntries = allQE.docs.map(d => ({ id: d.id, ...d.data() as any }));

    console.log("=== Cash Boxes in DB ===");
    boxes.forEach(b => {
        console.log(`Box ID: ${b.id}, Name: ${b.name}, Balance: ${b.balance}, InitialBalance: ${b.initialBalance}, status: ${b.recordStatus}`);
    });

    const targetBox = boxes.find(b => b.name.includes("فاطمة"));
    if (!targetBox) {
        console.error("Target box not found!");
        return;
    }
    const boxId = targetBox.id;
    console.log(`\nAnalyzing box: ${targetBox.name} (ID: ${boxId})`);

    console.log("\n=== Direct Transactions linked to this Box ===");
    const boxTrans = transactions.filter(t => (t.boxId === boxId || t.fromBoxId === boxId || t.toBoxId === boxId) && t.recordStatus !== "deleted");
    boxTrans.forEach(t => {
        console.log(`- ID: ${t.id}, Type: ${t.type}, Amount: ${t.amount}, SourceType: ${t.sourceType}, SourceId: ${t.sourceId}, Created: ${t.createdAt}, Status: ${t.recordStatus}`);
    });

    console.log("\n=== Invoices linked to this Box ===");
    const boxInvoices = invoices.filter(i => i.boxId === boxId && i.recordStatus !== "deleted");
    boxInvoices.forEach(i => {
        console.log(`- ID: ${i.id}, Invoice #: ${i.invoiceNumber}, Type: ${i.type}, Total: ${i.total}, Paid: ${i.paid}, PaymentType: ${i.paymentType}, Created: ${i.createdAt}`);
    });

    console.log("\n=== Vouchers linked to this Box ===");
    const boxVouchers = vouchers.filter(v => v.boxId === boxId && v.recordStatus !== "deleted");
    boxVouchers.forEach(v => {
        console.log(`- ID: ${v.id}, Type: ${v.type}, Amount: ${v.amount}, Created: ${v.createdAt}`);
    });

    console.log("\n=== Quick Entries linked to this Box ===");
    const boxQEs = quickEntries.filter(q => q.cashBoxId === boxId && q.recordStatus !== "deleted");
    boxQEs.forEach(q => {
        console.log(`- ID: ${q.id}, Type: ${q.entryType}, Total: ${q.amount}, Paid: ${q.paidAmount}, Created: ${q.createdAt}`);
    });

    // Run unified calculation for this box specifically
    const boxBalances: Record<string, number> = {};
    boxes.forEach(b => {
        boxBalances[b.id!] = Number(b.initialBalance || 0);
    });

    const invoiceCashFromTransactions: Record<string, number> = {};
    const qeCashFromTransactions: Record<string, number> = {};

    transactions.forEach(tx => {
        if (tx.recordStatus === 'deleted') return;
        if (tx.sourceType === 'sales_invoice' || tx.sourceType === 'purchase_invoice' || tx.sourceType === 'quick_financial_entry') {
            return;
        }
        const amount = Number(tx.amount || 0);
        if (tx.sourceId) {
            if (tx.sourceType === 'invoice_payment' || tx.sourceType === 'manual_receipt' || tx.sourceType === 'manual_payment') {
                if (invoices.some(inv => inv.id === tx.sourceId)) {
                    invoiceCashFromTransactions[tx.sourceId] = (invoiceCashFromTransactions[tx.sourceId] || 0) + amount;
                }
                if (quickEntries.some(qe => qe.id === tx.sourceId)) {
                    qeCashFromTransactions[tx.sourceId] = (qeCashFromTransactions[tx.sourceId] || 0) + amount;
                }
            }
        }
        if (tx.type === 'تحويل') {
            if (tx.fromBoxId) boxBalances[tx.fromBoxId] = (boxBalances[tx.fromBoxId] || 0) - amount;
            if (tx.toBoxId) boxBalances[tx.toBoxId] = (boxBalances[tx.toBoxId] || 0) + amount;
        } else if (tx.boxId) {
            const changeAmount = (tx.type === 'قبض' || tx.type === 'customer_receipt') ? amount : -amount;
            boxBalances[tx.boxId] = (boxBalances[tx.boxId] || 0) + changeAmount;
        }
    });

    console.log(`\nUnified Calc after Transactions phase: ${boxBalances[boxId]}`);

    invoices.forEach(inv => {
        if (inv.recordStatus === 'deleted' || !inv.boxId) return;
        const totalPaid = Number(inv.paid || 0);
        const alreadyInTransactions = invoiceCashFromTransactions[inv.id!] || 0;
        const unrecordedPaid = Math.max(0, totalPaid - alreadyInTransactions);
        if (unrecordedPaid > 0) {
            const type = inv.type || 'sale';
            const isReturn = type.includes('return');
            const baseType = type.replace('_return', '');
            let boxChange = baseType === 'sale' ? unrecordedPaid : -unrecordedPaid;
            if (isReturn) boxChange = -boxChange;
            boxBalances[inv.boxId] = (boxBalances[inv.boxId] || 0) + boxChange;
            if (inv.boxId === boxId) {
                console.log(`- Invoice ${inv.invoiceNumber} added unrecorded paid of ${boxChange}`);
            }
        }
    });

    console.log(`Unified Calc after Invoices phase: ${boxBalances[boxId]}`);

    quickEntries.forEach(qe => {
        if (qe.recordStatus === 'deleted' || !qe.cashBoxId) return;
        const totalPaid = Number(qe.paidAmount || 0);
        const alreadyInTransactions = qeCashFromTransactions[qe.id!] || 0;
        const unrecordedPaid = Math.max(0, totalPaid - alreadyInTransactions);
        if (unrecordedPaid > 0) {
            const type = qe.entryType;
            const isIncoming = ['sale', 'manual_sale', 'customer_receipt', 'receipt'].includes(type);
            const boxChange = isIncoming ? unrecordedPaid : -unrecordedPaid;
            boxBalances[qe.cashBoxId] = (boxBalances[qe.cashBoxId] || 0) + boxChange;
            if (qe.cashBoxId === boxId) {
                console.log(`- QuickEntry ${qe.id} added unrecorded paid of ${boxChange}`);
            }
        }
    });

    console.log(`Unified Calc final value for Fatima Box: ${boxBalances[boxId]}`);
}

main().catch(console.error);
