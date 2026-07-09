sed -i -e '31a\
import { migrationService } from "./services/migration";' src/App.tsx

sed -i -e 's/import('\''\.\/services\/migration'\'')\.then(m => m\.migrationService\.migrateOldInvoices())\.catch(console\.error);/migrationService.migrateOldInvoices().catch(console.error);/g' src/App.tsx
