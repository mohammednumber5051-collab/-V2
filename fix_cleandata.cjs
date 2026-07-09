const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf-8');

const target = `export const cleanData = (obj: any) => {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && typeof obj[key] !== 'function') {
            cleaned[key] = obj[key];
        }
    });
    return cleaned;
};`;

const replacement = `export const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (typeof obj.toDate === 'function') return obj; // Keep Firestore Timestamps
    if (Array.isArray(obj)) return obj.map(cleanData).filter(v => v !== undefined);
    
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && typeof obj[key] !== 'function') {
            cleaned[key] = cleanData(obj[key]);
        }
    });
    return cleaned;
};`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/db.ts', code, 'utf-8');
    console.log("Successfully replaced cleanData in db.ts.");
} else {
    console.log("Could not find cleanData in db.ts.");
}
