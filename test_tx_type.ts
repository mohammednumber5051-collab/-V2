import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [transSnap] = await Promise.all([
        getDocs(collection(db, "transactions"))
    ]);

    const txs = transSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    txs.forEach((t: any) => {
        if (t.recordStatus !== 'deleted' && t.boxId === "BtHFVeyzvzRiOP8C9QTS") {
            console.log(`Tx ${t.id} - ${t.type} ${t.amount} (source: ${t.sourceId}, sourceType: ${t.sourceType})`);
        }
    });
}
main().catch(console.error);
