sed -i -e 's/export const db: Firestore = getFirestore(app);/export const db: Firestore = getFirestore(app, config.firestoreDatabaseId || "(default)");/' src/firebase.ts
