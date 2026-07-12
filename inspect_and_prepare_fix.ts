import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const app = initializeApp(config);
    const db = getFirestore(app);

    // 1. Fetch the two quick entries
    const qe1Snap = await getDoc(doc(db, "quick_financial_entries", "gzuGjsRnzn8tz4OP6oB9"));
    const qe2Snap = await getDoc(doc(db, "quick_financial_entries", "ziN7UcLCAp7n59Jn4KZF"));

    const qe1 = qe1Snap.data();
    const qe2 = qe2Snap.data();

    console.log("=== Quick Entry 1 ===");
    console.log(JSON.stringify(qe1, null, 2));

    console.log("=== Quick Entry 2 ===");
    console.log(JSON.stringify(qe2, null, 2));

    if (qe1 && qe1.partnerId) {
        const partnerSnap = await getDoc(doc(db, "customers", qe1.partnerId));
        if (partnerSnap.exists()) {
            console.log(`\nPartner 1 (${qe1.partnerName}): Current stored balance: ${partnerSnap.data().balance}`);
        } else {
            const supplierSnap = await getDoc(doc(db, "suppliers", qe1.partnerId));
            if (supplierSnap.exists()) {
                console.log(`\nPartner 1 (Supplier - ${qe1.partnerName}): Current stored balance: ${supplierSnap.data().balance}`);
            }
        }
    }

    if (qe2 && qe2.partnerId) {
        const partnerSnap = await getDoc(doc(db, "customers", qe2.partnerId));
        if (partnerSnap.exists()) {
            console.log(`\nPartner 2 (${qe2.partnerName}): Current stored balance: ${partnerSnap.data().balance}`);
        } else {
            const supplierSnap = await getDoc(doc(db, "suppliers", qe2.partnerId));
            if (supplierSnap.exists()) {
                console.log(`\nPartner 2 (Supplier - ${qe2.partnerName}): Current stored balance: ${supplierSnap.data().balance}`);
            }
        }
    }
}

main().catch(console.error);
