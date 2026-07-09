const fs = require('fs');
let code = fs.readFileSync('src/firebase.ts', 'utf8');
code = code.replace(/getFirestore\(app\)/g, 'getFirestore(app, config.firestoreDatabaseId)');
fs.writeFileSync('src/firebase.ts', code);
