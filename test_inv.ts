import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import * as fs from "fs";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);
    const snap = await getDocs(query(collection(db, "invoices"), where("type", "==", "sale")));
    console.log("Total sales invoices:", snap.size);
    const data = snap.docs.map(d => d.data());
    const ids = data.map(d => d.invoiceNumber);
    console.log("Invoice numbers:", ids.sort((a,b)=>Number(a)-Number(b)).join(', '));
}
main().catch(console.error);
