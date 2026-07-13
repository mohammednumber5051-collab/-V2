import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import * as fs from "fs";
import { calculateUnifiedCashBalances } from "./src/lib/financialUtils";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [transSnap, allBoxes, allCust, allSup, allInv, allVch, allQE] = await Promise.all([
        getDocs(collection(db, "transactions")),
        getDocs(collection(db, "cashBoxes")),
        getDocs(collection(db, "customers")),
        getDocs(collection(db, "suppliers")),
        getDocs(collection(db, "invoices")),
        getDocs(collection(db, "vouchers")),
        getDocs(collection(db, "quick_financial_entries"))
    ]);

    const transactions = transSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    const boxes = allBoxes.docs.map(d => ({ ...d.data(), id: d.id }));
    const invoices = allInv.docs.map(d => ({ ...d.data(), id: d.id }));
    const vouchers = allVch.docs.map(d => ({ ...d.data(), id: d.id }));
    const quickEntries = allQE.docs.map(d => ({ ...d.data(), id: d.id }));

    const { boxBalances } = calculateUnifiedCashBalances(
        boxes as any[],
        transactions as any[],
        invoices as any[],
        vouchers as any[],
        quickEntries as any[]
    );

    console.log(`Calculated Fatima Box Balance: ${boxBalances['BtHFVeyzvzRiOP8C9QTS']}`);
}
main().catch(console.error);
