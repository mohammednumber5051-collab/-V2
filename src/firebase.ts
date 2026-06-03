import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDocFromServer, enableIndexedDbPersistence, disableNetwork } from "firebase/firestore";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInAnonymously } from "firebase/auth";
import config from "../firebase-applet-config.json";

const app = initializeApp(config);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
}, config.firestoreDatabaseId);

// Enable Offline Persistence for Android/Mobile support
if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a a time.
            console.warn("Firestore Persistence: Failed-precondition (Multiple tabs?)");
        } else if (err.code === 'unimplemented') {
            // The current browser does not support all of the features required to enable persistence
            console.warn("Firestore Persistence: Unimplemented on this browser");
        }
    });
}

export const auth = getAuth(app);

// Helper to wait for auth readiness and ensure a session exists
export interface AuthState {
    user: any | null;
    status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
    error?: string;
}

export const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (e: any) {
        console.error("Google Auth Error:", e);
        throw e;
    }
};

export const waitForAuth = (): Promise<AuthState> => {
    return new Promise((resolve) => {
        // Resolve immediately if already authenticated
        if (auth.currentUser) {
            resolve({ user: auth.currentUser, status: 'authenticated' });
            return;
        }

        let isSignInProgress = false;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                if (isSignInProgress) return; // Wait for the sign-in we already triggered
                
                // Attempt anonymous login to satisfy Firestore rules even for unauthenticated web users
                try {
                    isSignInProgress = true;
                    await signInAnonymously(auth);
                    // onAuthStateChanged will fire again with the new user, so we don't resolve yet
                } catch (e) {
                    console.warn("Firebase: Anonymous login denied. Many rules will be restricted.");
                    unsubscribe();
                    resolve({ user: null, status: 'unauthenticated' });
                }
            } else {
                console.info("Firebase: Authenticated as", user.isAnonymous ? "Anonymous User" : user.email || user.uid);
                unsubscribe();
                resolve({ user, status: 'authenticated' });
            }
        });

        // Safety timeout
        setTimeout(() => {
            if (!auth.currentUser) {
                console.warn("Auth readiness timeout.");
                unsubscribe();
                resolve({ user: null, status: 'unauthenticated' });
            }
        }, 2500);
    });
};

// Validate Connection to Firestore (as per skill recommendation)
async function testConnection() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.info("Firestore status: Operating in offline cache mode.");
        try {
            await disableNetwork(db);
        } catch (e) {}
        return;
    }

    try {
        await waitForAuth();
        // Set a smart timeout of 2000ms to quickly fall back and prevent blocking
        const connectionPromise = getDocFromServer(doc(db, 'system', 'connection_test'));
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Connection check timed out")), 2000)
        );

        await Promise.race([connectionPromise, timeoutPromise]);
        console.log("Firebase connection established successfully.");
    } catch (error) {
        console.warn("Firebase client is offline or unreachable. Disabling network to prevent hangs.", error);
        try {
            await disableNetwork(db);
        } catch (e) {
            console.error("Failed to disable Firestore network:", e);
        }
    }
}

// Only test if not a placeholder
if (config.projectId && !config.projectId.includes("placeholder") && !config.projectId.startsWith("remixed-")) {
    testConnection();
}
