import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [qeSnap] = await Promise.all([
        getDocs(collection(db, "quick_financial_entries"))
    ]);

    const qes = qeSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    let sumIn = 0;
    qes.forEach((qe: any) => {
        if (qe.recordStatus === 'deleted') return;
        if (qe.cashBoxId === "BtHFVeyzvzRiOP8C9QTS") {
            sumIn += Number(qe.paidAmount) || 0;
            console.log(`QE ${qe.id} - paidAmount: ${qe.paidAmount} (amount: ${qe.amount})`);
        }
    });

    console.log(`QE Sum In: ${sumIn}`);
}
main().catch(console.error);
