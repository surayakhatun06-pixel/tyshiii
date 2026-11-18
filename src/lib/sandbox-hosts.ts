import { useCallback, useSyncExternalStore } from "react";

import { firebaseConfigured, getDb } from "@/lib/firebase";

/**
 * Hosts that play WITHOUT the sandbox (doc 1.17).
 *  - The admin list is one small document: siteConfig/sandboxHosts ({ hosts: ["vidrift.in", ...] }).
 *  - A viewer can also choose "Play without protection" for one host; that is kept on this device only.
 * Every other host stays sandboxed exactly as before.
 */
export const DEFAULT_NO_SANDBOX_HOSTS = ["vidrift.in"];

const ADMIN_KEY = "tyshi-nosandbox-admin-v1";
const VIEWER_KEY = "tyshi-nosandbox-viewer-v1";
let adminHosts: string[] = DEFAULT_NO_SANDBOX_HOSTS;
let viewerHosts: string[] = [];
let loaded = false;
let fetched = false;
const listeners = new Set<() => void>();
let snapshot = { admin: adminHosts, viewer: viewerHosts };

/** "https://www.Vidrift.in/x" -> "vidrift.in". Returns "" when it is not a site name. */
export function cleanHost(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const readList = (key: string): string[] | null => {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return Array.isArray(v) ? v.map((x) => cleanHost(String(x))).filter(Boolean) : null;
  } catch {
    return null;
  }
};

function publish() {
  snapshot = { admin: adminHosts, viewer: viewerHosts };
  listeners.forEach((l) => l());
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  adminHosts = readList(ADMIN_KEY) ?? DEFAULT_NO_SANDBOX_HOSTS;
  viewerHosts = readList(VIEWER_KEY) ?? [];
  snapshot = { admin: adminHosts, viewer: viewerHosts };
  // One small read per visit; the answer is kept on the device for the next visit.
  if (!fetched && firebaseConfigured) {
    fetched = true;
    void readAdminHosts()
      .then((hosts) => {
        if (!hosts) return;
        adminHosts = hosts;
        try {
          window.localStorage.setItem(ADMIN_KEY, JSON.stringify(hosts));
        } catch {
          /* not remembered */
        }
        publish();
      })
      .catch(() => undefined);
  }
}

export async function readAdminHosts(): Promise<string[] | null> {
  if (!firebaseConfigured) return null;
  const [{ doc, getDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  const data = (await getDoc(doc(db, "siteConfig", "sandboxHosts"))).data();
  if (!data || !Array.isArray(data.hosts)) return null;
  return data.hosts.map((h: unknown) => cleanHost(String(h))).filter(Boolean);
}

export async function saveAdminHosts(hosts: string[]) {
  if (!firebaseConfigured) throw new Error("Firebase isn't configured for this site yet.");
  const clean = [...new Set(hosts.map(cleanHost).filter(Boolean))];
  const [{ doc, setDoc }, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  await setDoc(doc(db, "siteConfig", "sandboxHosts"), { hosts: clean, updatedAt: Date.now() });
  adminHosts = clean;
  try {
    window.localStorage.setItem(ADMIN_KEY, JSON.stringify(clean));
  } catch {
    /* not remembered */
  }
  publish();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Does this host match a list entry? "play.vidrift.in" matches "vidrift.in". */
export const hostInList = (host: string, list: string[]) =>
  list.some((h) => host === h || host.endsWith(`.${h}`));

export function useNoSandboxHosts() {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return snapshot;
    },
    () => snapshot,
  );
  /** True when this host should load without the sandbox (admin list or the viewer's own choice). */
  const isExempt = useCallback(
    (host: string) => hostInList(host, value.admin) || hostInList(host, value.viewer),
    [value],
  );
  const setViewerHost = useCallback((host: string, on: boolean) => {
    ensureLoaded();
    const h = cleanHost(host);
    if (!h) return;
    viewerHosts = on ? [...new Set([...viewerHosts, h])] : viewerHosts.filter((x) => x !== h);
    try {
      window.localStorage.setItem(VIEWER_KEY, JSON.stringify(viewerHosts));
    } catch {
      /* not remembered */
    }
    publish();
  }, []);
  return { ...value, isExempt, setViewerHost };
}
