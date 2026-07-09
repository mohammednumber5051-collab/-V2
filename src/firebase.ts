import { initializeApp, getApps, getApp } from "firebase/app";
import {
    getFirestore,
    initializeFirestore,
    memoryLocalCache,
    persistentLocalCache,
    terminate,
    clearIndexedDbPersistence,
    Firestore,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    increment,
    runTransaction,
    writeBatch,
    limit,
    startAfter,
    QueryConstraint,
    onSnapshot
} from "firebase/firestore";

export {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    increment,
    runTransaction,
    writeBatch,
    limit,
    startAfter,
    QueryConstraint,
    onSnapshot,
    terminate,
    clearIndexedDbPersistence
};

import {
    getAuth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signInAnonymously
} from "firebase/auth";

import config from "../firebase-applet-config.json";

export const app =
    getApps().length === 0
        ? initializeApp(config)
        : getApp();


// =========================
// Firestore (Default Database)
// =========================

let firestoreInstance: Firestore;
try {
    const dbId = config.firestoreDatabaseId === "(default)" ? undefined : config.firestoreDatabaseId;
    console.log(`Initializing Firestore with database: ${config.firestoreDatabaseId}`);
    
    firestoreInstance = initializeFirestore(app, {
        localCache: memoryLocalCache(),
        experimentalAutoDetectLongPolling: true,
        ...(dbId ? { databaseId: dbId } : {})
    });
    console.log("Firestore initialized successfully.");
} catch (e) {
    console.warn("Firestore initialization failed, falling back to getFirestore:", e);
    const dbId = config.firestoreDatabaseId === "(default)" ? undefined : config.firestoreDatabaseId;
    firestoreInstance = getFirestore(app, dbId);
}

export const db: Firestore = firestoreInstance;


// =========================
// Authentication
// =========================

export const auth = getAuth(app);

let anonymousAttempted = false;

onAuthStateChanged(auth, (user) => {

    if (user) return;

    if (anonymousAttempted) return;

    anonymousAttempted = true;

    signInAnonymously(auth)
        .then(() => {
            console.log("Anonymous authentication succeeded.");
        })
        .catch((e) => {

            console.warn(
                "Anonymous authentication unavailable:",
                e.code
            );

            // لا نوقف التطبيق إذا فشل Anonymous Auth
            // لأن Firestore قد يكون متاحاً حسب قواعد الأمان.
        });

});


// =========================
// Google Login
// =========================

export const signInWithGoogle = async () => {

    const provider = new GoogleAuthProvider();

    provider.setCustomParameters({
        prompt: "select_account"
    });

    const result = await signInWithPopup(auth, provider);

    return result.user;

};


// =========================
// Wait For Auth
// =========================

export interface AuthState {

    user: any | null;

    status:
        | "loading"
        | "authenticated"
        | "unauthenticated";

}


export const waitForAuth = (): Promise<AuthState> => {

    return new Promise((resolve) => {

        if (auth.currentUser) {

            resolve({
                user: auth.currentUser,
                status: "authenticated"
            });

            return;

        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {

            unsubscribe();

            resolve({

                user,

                status: user
                    ? "authenticated"
                    : "unauthenticated"

            });

        });

        setTimeout(() => {

            unsubscribe();

            resolve({

                user: auth.currentUser,

                status: auth.currentUser
                    ? "authenticated"
                    : "unauthenticated"

            });

        }, 3000);

    });

};


console.log(
    "Firebase initialized for project:",
    config.projectId
);