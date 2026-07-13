import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import * as fs from "fs";

async function main() {
    const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const boxId = "BtHFVeyzvzRiOP8C9QTS"; // Fatima box
    const snap = await getDoc(doc(db, "cashBoxes", boxId));
    console.log(`Box DB Balance: ${snap.data()?.balance}`);

    const qeSnap = await getDocs(collection(db, "transactions"));
    // check any new operations
}
main().catch(console.error);
