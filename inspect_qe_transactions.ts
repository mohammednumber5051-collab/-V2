import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const q = query(collection(db, "transactions"), where("sourceId", "in", ["gzuGjsRnzn8tz4OP6oB9", "ziN7UcLCAp7n59Jn4KZF"]));
    const snap = await getDocs(q);
    console.log("=== Transactions for the two QEs ===");
    snap.docs.forEach(d => {
        const t = d.data();
        console.log(`ID: ${d.id}, Type: ${t.type}, SourceType: ${t.sourceType}, Amount: ${t.amount}, BoxId: ${t.boxId}, Created: ${t.createdAt}, Status: ${t.recordStatus}`);
    });
}
main().catch(console.error);
