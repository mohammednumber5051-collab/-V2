import fs from 'fs';
const code = fs.readFileSync('src/services/db.ts', 'utf-8');
if (code.includes('console.log("DB IN DB.TS:", db);')) {
  console.log('Already patched');
} else {
  const newCode = code.replace(
    'import { app, auth, db } from "../firebase";',
    'import { app, auth, db } from "../firebase";\nconsole.log("DB IN DB.TS:", db);'
  );
  fs.writeFileSync('src/services/db.ts', newCode);
  console.log('Patched');
}
