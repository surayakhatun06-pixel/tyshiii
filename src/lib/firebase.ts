import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

/**
 * Public Firebase web config. These values identify the project; they are not
 * secrets. Access is controlled by Firebase Authentication + Firestore rules.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as
    string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    string | undefined,
};

/** Local development only: talk to the Firebase emulators instead of the real project. */
const useEmulator = import.meta.env.VITE_FIREBASE_USE_EMULATOR === "true";

export const firebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

export class FirebaseUnavailableError extends Error {
  constructor(message = "Firebase isn't configured for this site yet.") {
    super(message);
    this.name = "FirebaseUnavailableError";
  }
}

let appPromise: Promise<FirebaseApp> | undefined;
let dbPromise: Promise<Firestore> | undefined;
let authPromise: Promise<Auth> | undefined;

/** Firebase is only started in the browser, and only loaded when a page needs it. */
function getApp(): Promise<FirebaseApp> {
  if (typeof window === "undefined")
    return Promise.reject(
      new FirebaseUnavailableError("Firebase runs in the browser only."),
    );
  if (!firebaseConfigured)
    return Promise.reject(new FirebaseUnavailableError());
  appPromise ??= import("firebase/app").then(({ initializeApp, getApps }) => {
    const existing = getApps()[0];
    return existing ?? initializeApp(config);
  });
  return appPromise;
}

export function getDb(): Promise<Firestore> {
  dbPromise ??= getApp().then(async (app) => {
    const { getFirestore, connectFirestoreEmulator } =
      await import("firebase/firestore");
    const db = getFirestore(app);
    if (useEmulator) connectFirestoreEmulator(db, "127.0.0.1", 8080);
    return db;
  });
  dbPromise.catch(() => {
    dbPromise = undefined;
  });
  return dbPromise;
}

export function getAuthClient(): Promise<Auth> {
  authPromise ??= getApp().then(async (app) => {
    const { getAuth, connectAuthEmulator } = await import("firebase/auth");
    const auth = getAuth(app);
    if (useEmulator)
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
    return auth;
  });
  authPromise.catch(() => {
    authPromise = undefined;
  });
  return authPromise;
}

/** Turns Firebase error codes into short, readable messages. */
export function describeFirebaseError(error: unknown): string {
  if (error instanceof FirebaseUnavailableError) return error.message;
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  switch (code) {
    case "permission-denied":
      return "Firestore refused this change. Check two things: your user ID must have a document in the “admins” collection, and the latest firestore.rules from this project must be published (Firestore → Rules → Publish).";
    case "unavailable":
      return "Couldn't reach the database. Check your internet connection and try again.";
    case "resource-exhausted":
      return "The Firebase daily quota has been reached. Try again later.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in isn't enabled in Firebase Authentication.";
  }
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong.";
}
