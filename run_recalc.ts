import "./src/firebase"; // init firebase
import { dbService } from "./src/services/db";

async function run() {
  console.log("Recalculating...");
  try {
      await dbService.recalculateFinancials();
      console.log("Done");
      process.exit(0);
  } catch(e) {
      console.error(e);
      process.exit(1);
  }
}
run();
