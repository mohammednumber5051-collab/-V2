import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
export const db = getFirestore(app);

// Use a simple dynamic import to invoke it
import('./src/services/db.js').then(m => {
  console.log("Recalculating...");
  m.dbService.recalculateFinancials().then(() => {
    console.log("Done");
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}).catch(err => {
   console.error("Failed to import:", err);
});
