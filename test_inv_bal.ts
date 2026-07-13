import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [invSnap] = await Promise.all([
        getDocs(collection(db, "invoices"))
    ]);

    const invs = invSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    let sumIn = 0;
    invs.forEach((inv: any) => {
        if (inv.recordStatus === 'deleted') return;
        if (inv.boxId === "BtHFVeyzvzRiOP8C9QTS") {
            sumIn += Number(inv.paid) || 0;
            console.log(`Inv ${inv.id} - paid: ${inv.paid} (total: ${inv.total})`);
        }
    });

    console.log(`Inv Sum In: ${sumIn}`);
}
main().catch(console.error);
