import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const [vchSnap] = await Promise.all([
        getDocs(collection(db, "vouchers"))
    ]);

    const vchs = vchSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    let sumIn = 0;
    vchs.forEach((vch: any) => {
        if (vch.recordStatus === 'deleted') return;
        if (vch.boxId === "BtHFVeyzvzRiOP8C9QTS") {
            sumIn += Number(vch.amount) || 0;
            console.log(`VCH ${vch.id} - amount: ${vch.amount}`);
        }
    });

    console.log(`VCH Sum In: ${sumIn}`);
}
main().catch(console.error);
