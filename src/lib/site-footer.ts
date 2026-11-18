import { firebaseConfigured, getDb } from "@/lib/firebase";

export const DEFAULT_FOOTER_TEXT =
  "Anime data and artwork come from the public AniList API. TYSHI ZONE does not host any video — playback comes from the sources added to each title.\n© 2026 TYSHI ZONE";

const FOOTER_EVENT = "tyshi-site-footer-updated";

export function publishFooterText(text: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOOTER_EVENT, { detail: text }));
}

export function onFooterTextUpdate(listener: (text: string) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handle = (event: Event) => {
    const text = (event as CustomEvent<unknown>).detail;
    if (typeof text === "string") listener(text);
  };
  window.addEventListener(FOOTER_EVENT, handle);
  return () => window.removeEventListener(FOOTER_EVENT, handle);
}

export async function readFooterText(): Promise<string | null> {
  if (!firebaseConfigured) return null;
  const [{ doc, getDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  const snapshot = await getDoc(doc(db, "siteConfig", "footer"));
  const text = snapshot.data()?.text;
  return typeof text === "string" ? text : null;
}

export async function saveFooterText(text: string) {
  if (!firebaseConfigured) throw new Error("Firebase isn't configured for this site yet.");
  const [{ doc, serverTimestamp, setDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  await setDoc(doc(db, "siteConfig", "footer"), { text, updatedAt: serverTimestamp() }, { merge: true });
}
