import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";
import { calculateUnifiedCashBalances } from "./src/lib/financialUtils";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [transSnap] = await Promise.all([
        getDocs(collection(db, "transactions"))
    ]);

    const txs = transSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    let sumIn = 0;
    let sumOut = 0;
    txs.forEach((tx: any) => {
        if (tx.recordStatus === 'deleted') return;
        if (tx.boxId === "BtHFVeyzvzRiOP8C9QTS") {
            if (tx.type === 'قبض' || tx.type === 'customer_receipt') sumIn += Number(tx.amount) || 0;
            else sumOut += Number(tx.amount) || 0;
        }
    });

    console.log(`TX Sum In: ${sumIn}, Sum Out: ${sumOut}`);
    
    // show what the transactions are
    txs.filter((t: any) => t.recordStatus !== 'deleted' && t.boxId === "BtHFVeyzvzRiOP8C9QTS").forEach((t: any) => {
        console.log(`Tx ${t.id} - ${t.type} ${t.amount} (source: ${t.sourceId})`);
    });
}
main().catch(console.error);
