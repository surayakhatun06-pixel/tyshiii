import { getAuthClient, getDb, firebaseConfigured } from "@/lib/firebase";

let visitorSignIn: Promise<string> | undefined;

/** Reuse the signed-in account, or create one anonymous visitor identity for this browser. */
export async function ensureVisitorUid() {
  const auth = await getAuthClient();
  if (auth.currentUser) return auth.currentUser.uid;
  visitorSignIn ??= import("firebase/auth").then(({ signInAnonymously }) =>
    signInAnonymously(auth).then((credential) => credential.user.uid),
  );
  try {
    return await visitorSignIn;
  } finally {
    visitorSignIn = undefined;
  }
}

/** Record one unique browser/account visit. Firestore rules prevent a visitor changing it later. */
export async function recordSiteVisit() {
  if (!firebaseConfigured || typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem("tyshi-visit-recorded") === "1") return;
  } catch {
    // Continue without the per-tab cache; the user UID document still de-duplicates the write.
  }

  const uid = await ensureVisitorUid();
  const [{ doc, getDoc, serverTimestamp, setDoc }, db] = await Promise.all([
    import("firebase/firestore"),
    getDb(),
  ]);
  const ref = doc(db, "siteVisits", uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) await setDoc(ref, { firstVisitedAt: serverTimestamp() });
  // Total visits: +1 per browser session (unique visitors are counted separately above).
  try {
    const { increment, updateDoc } = await import("firebase/firestore");
    const stats = doc(db, "siteStats", "visits");
    try {
      await updateDoc(stats, { total: increment(1) });
    } catch {
      await setDoc(stats, { total: 1 });
    }
  } catch {
    /* counting is best effort */
  }
  try {
    window.sessionStorage.setItem("tyshi-visit-recorded", "1");
  } catch {
    // The unique Firestore document remains the source of truth.
  }
}

const PRESENCE_EVERY_MS = 120_000;
let presenceTimer: number | undefined;

/** "Watching now": a tiny heartbeat while the tab is visible. Stops when hidden or closed. */
export function startPresence() {
  if (!firebaseConfigured || typeof window === "undefined" || presenceTimer !== undefined) return () => undefined;
  const beat = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const uid = await ensureVisitorUid();
      const [{ doc, serverTimestamp, setDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
      await setDoc(doc(db, "presence", uid), { lastSeen: serverTimestamp() });
    } catch {
      /* not counted this time */
    }
  };
  void beat();
  presenceTimer = window.setInterval(() => void beat(), PRESENCE_EVERY_MS);
  const onVisible = () => document.visibilityState === "visible" && void beat();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(presenceTimer);
    presenceTimer = undefined;
  };
}
