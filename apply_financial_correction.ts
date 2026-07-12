import { initializeApp } from "firebase/app";
import { getFirestore, doc, deleteDoc, getDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";
import { FinancialExecutionEngine } from "./src/services/financialExecutionEngine";

async function main() {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    const duplicateIds = [
        "G2A3vRscJW14PwbBxrZt", // Duplicate manual_receipt for ziN7UcLCAp7n59Jn4KZF
        "tYI784PUTkSZffrjXL1g", // Duplicate quick_financial_entry for ziN7UcLCAp7n59Jn4KZF
        "SzjNxbm7ggJ2zZqzphUc", // Duplicate manual_receipt for gzuGjsRnzn8tz4OP6oB9
        "zkwMCff5SldoYOVHveNE"  // Duplicate quick_financial_entry for gzuGjsRnzn8tz4OP6oB9
    ];

    console.log("=== STEP 1: Deleting duplicate transaction documents ===");
    for (const id of duplicateIds) {
        const transRef = doc(db, "transactions", id);
        const snap = await getDoc(transRef);
        if (snap.exists()) {
            console.log(`Deleting duplicate transaction ${id}:`, snap.data());
            await deleteDoc(transRef);
            console.log(`Transaction ${id} deleted successfully.`);
        } else {
            console.log(`Transaction ${id} does not exist or was already deleted.`);
        }
    }

    console.log("\n=== STEP 2: Running Financial Execution State Rebuild ===");
    await FinancialExecutionEngine.rebuildFinancialState();

    console.log("\n=== STEP 3: Verifying final Fatima Box Balance ===");
    const boxSnap = await getDoc(doc(db, "cashBoxes", "BtHFVeyzvzRiOP8C9QTS"));
    if (boxSnap.exists()) {
        console.log(`Final Stored Balance in DB for ${boxSnap.data().name}: ${boxSnap.data().balance}`);
    } else {
        console.error("Fatima Box document not found!");
    }
}

main().catch(console.error);
