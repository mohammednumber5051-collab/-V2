const fs = require('fs');

function fixDbTs() {
    let code = fs.readFileSync('src/services/db.ts', 'utf-8');
    const target = `export const cleanData = (obj: any): any => {
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

    const replacement = `export const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (typeof obj.toDate === 'function' || typeof obj.toMillis === 'function') return obj;
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
        console.log("Fixed db.ts");
    } else {
        console.log("Could not find in db.ts");
    }
}

function fixEngineTs() {
    let code = fs.readFileSync('src/services/financialExecutionEngine.ts', 'utf-8');
    const target = `function cleanData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanData).filter(v => v !== undefined);
    const newObj: any = {};
    for (const key in obj) {
        if (obj[key] !== undefined) {
            if (typeof obj[key] === 'object' && obj[key] !== null && !('toDate' in obj[key]) && !('toMillis' in obj[key])) {
                newObj[key] = cleanData(obj[key]);
            } else {
                newObj[key] = obj[key];
            }
        }
    }
    return newObj;
}`;

    const replacement = `function cleanData(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (typeof obj.toDate === 'function' || typeof obj.toMillis === 'function') return obj;
    if (Array.isArray(obj)) return obj.map(cleanData).filter(v => v !== undefined);
    
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && typeof obj[key] !== 'function') {
            cleaned[key] = cleanData(obj[key]);
        }
    });
    return cleaned;
}`;

    if (code.includes(target)) {
        code = code.replace(target, replacement);
        fs.writeFileSync('src/services/financialExecutionEngine.ts', code, 'utf-8');
        console.log("Fixed engine.ts");
    } else {
        console.log("Could not find in engine.ts");
    }
}

fixDbTs();
fixEngineTs();
