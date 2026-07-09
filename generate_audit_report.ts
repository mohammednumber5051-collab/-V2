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

    const customers = (await getDocs(collection(db, "customers"))).docs.map(d => ({ id: d.id, ...d.data() as any })).filter(c => c.recordStatus === "active");
    const invoices = (await getDocs(collection(db, "invoices"))).docs.map(d => ({ id: d.id, ...d.data() as any })).filter(i => i.recordStatus === "active");
    const transactions = (await getDocs(collection(db, "transactions"))).docs.map(d => ({ id: d.id, ...d.data() as any })).filter(t => t.recordStatus === "active");

    const report: any[] = [];

    for (const customer of customers) {
        const customerInvoices = invoices.filter(i => i.partnerId === customer.id);
        const customerTrans = transactions.filter(t => t.partnerId === customer.id);

        report.push({
            customerId: customer.id,
            customerName: customer.name,
            storedBalance: customer.balance,
            invoices: customerInvoices.map(i => ({
                id: i.id,
                invoiceNumber: i.invoiceNumber,
                total: i.total,
                paid: i.paid,
                paymentType: i.paymentType,
                status: i.status,
                lifecycleStatus: i.lifecycleStatus
            })),
            transactions: customerTrans.map(t => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                sourceType: t.sourceType,
                sourceId: t.sourceId,
                debit: t.debit,
                credit: t.credit,
                description: t.description
            }))
        });
    }

    fs.writeFileSync(path.join(process.cwd(), "audit_report.json"), JSON.stringify(report, null, 2), "utf-8");
    console.log("Audit report generated successfully inside audit_report.json.");
}

main().catch(err => {
    console.error("Report generation failed:", err);
});
