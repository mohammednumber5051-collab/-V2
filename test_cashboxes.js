import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const snapshot = await getDocs(collection(db, "cashBoxes"));
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data().name, doc.data().balance);
  });
  process.exit(0);
}
run();
