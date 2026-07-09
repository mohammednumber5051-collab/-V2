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

    console.log("=== Loading all active collections ===");
    const customers = (await getDocs(collection(db, "customers"))).docs.map(d => ({ id: d.id, ...d.data() as any })).filter(c => c.recordStatus === "active");
    const invoices = (await getDocs(collection(db, "invoices"))).docs.map(d => ({ id: d.id, ...d.data() as any })).filter(i => i.recordStatus === "active");
    const transactions = (await getDocs(collection(db, "transactions"))).docs.map(d => ({ id: d.id, ...d.data() as any })).filter(t => t.recordStatus === "active");

    console.log(`Active Customers: ${customers.length}`);
    console.log(`Active Invoices: ${invoices.length}`);
    console.log(`Active Transactions: ${transactions.length}`);

    console.log("\n=== Checking Customer Balances vs Transaction/Invoice History ===");
    
    // For each customer, let's trace their financial history:
    // How is the customer balance calculated?
    // Let's analyze if an invoice contributes to a customer's balance.
    // Usually, a sales invoice on credit (paymentType = "آجل") increases customer balance (they owe us, balance becomes positive or negative depending on sign convention).
    // Let's check how the code calculates a customer's balance in `src/services/financialEngine.ts` or `src/services/db.ts`.
    // Let's write down what the fields look like for each customer.
    for (const customer of customers) {
        console.log(`\nCustomer: ${customer.name} (ID: ${customer.id})`);
        console.log(`  Stored Balance in DB: ${customer.balance}`);

        // Find all invoices associated with this customer
        const customerInvoices = invoices.filter(i => i.partnerId === customer.id);
        console.log(`  Invoices (${customerInvoices.length}):`);
        customerInvoices.forEach(i => {
            console.log(`    - Invoice #${i.invoiceNumber} (ID: ${i.id}): Total: ${i.total}, Paid: ${i.paid}, PaymentType: ${i.paymentType}, Status: ${i.status}, LifecycleStatus: ${i.lifecycleStatus}`);
        });

        // Find all transactions associated with this customer
        const customerTrans = transactions.filter(t => t.partnerId === customer.id);
        console.log(`  Transactions (${customerTrans.length}):`);
        customerTrans.forEach(t => {
            console.log(`    - Trans ID: ${t.id}, Type: ${t.type}, Amount: ${t.amount}, SourceType: ${t.sourceType}, SourceId: ${t.sourceId}, Debit: ${t.debit}, Credit: ${t.credit}, Desc: ${t.description}`);
        });
    }
}

main().catch(err => {
    console.error("Audit script failed:", err);
});
