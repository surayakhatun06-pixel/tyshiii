import { firebaseConfigured, getDb } from "@/lib/firebase";

export type SiteAnnouncement = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt?: number;
};

const ANNOUNCEMENTS_DOC = "announcements";
export const MAX_ANNOUNCEMENTS = 100;

function asTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeAnnouncements(value: unknown): SiteAnnouncement[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item): SiteAnnouncement[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.slice(0, 100) : "";
      const title = typeof record.title === "string" ? record.title.trim().slice(0, 120) : "";
      const body = typeof record.body === "string" ? record.body.trim().slice(0, 2000) : "";
      const createdAt = asTimestamp(record.createdAt);
      const updatedAt = asTimestamp(record.updatedAt);
      if (!id || !title || !body || createdAt === null) return [];
      return [{ id, title, body, createdAt, ...(updatedAt !== null ? { updatedAt } : {}) }];
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ANNOUNCEMENTS);
}

/** Live public feed. Firestore rules expose reads to everyone and reserve writes for admins. */
export function subscribeAnnouncements(
  listener: (items: SiteAnnouncement[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebaseConfigured) {
    listener([]);
    return () => undefined;
  }

  let active = true;
  let stop: (() => void) | undefined;
  void Promise.all([import("firebase/firestore"), getDb()])
    .then(([firestore, db]) => {
      if (!active) return;
      stop = firestore.onSnapshot(
        firestore.doc(db, "siteConfig", ANNOUNCEMENTS_DOC),
        (snapshot) => listener(normalizeAnnouncements(snapshot.data()?.items)),
        (error) => onError?.(error),
      );
    })
    .catch((error: unknown) => {
      if (active) onError?.(error instanceof Error ? error : new Error("Couldn't load announcements."));
    });

  return () => {
    active = false;
    stop?.();
  };
}

export async function saveAnnouncements(items: SiteAnnouncement[]) {
  if (!firebaseConfigured) throw new Error("Connect Firebase to publish announcements for all visitors.");
  const cleaned = normalizeAnnouncements(items);
  const [{ doc, serverTimestamp, setDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  await setDoc(
    doc(db, "siteConfig", ANNOUNCEMENTS_DOC),
    { items: cleaned, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function createAnnouncementId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
