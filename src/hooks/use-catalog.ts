import { useSyncExternalStore } from "react";

import { watchCatalog, type CloudAnime } from "@/lib/cloud-episodes";
import { firebaseConfigured } from "@/lib/firebase";

/**
 * One shared live subscription to the Firestore catalog, so the search bar, home
 * page and search page don't each open their own listener.
 */
let data: CloudAnime[] = [];
let ready = false;
let stop: (() => void) | null = null;
let stopTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const EMPTY: CloudAnime[] = [];

const emit = () => listeners.forEach((l) => l());

function start() {
  if (stop || !firebaseConfigured || typeof window === "undefined") return;
  stop = watchCatalog(
    (list) => {
      data = list;
      ready = true;
      emit();
    },
    (error) => {
      console.error(error);
      ready = true;
      emit();
    },
    200,
  );
}

function subscribe(cb: () => void) {
  clearTimeout(stopTimer);
  listeners.add(cb);
  start();
  return () => {
    listeners.delete(cb);
    if (!listeners.size) {
      stopTimer = setTimeout(() => {
        stop?.();
        stop = null;
      }, 30_000);
    }
  };
}

/** Titles stored in Firestore (your own series plus every title with episodes). */
export function useCatalog(): { catalog: CloudAnime[]; ready: boolean } {
  const catalog = useSyncExternalStore(subscribe, () => data, () => EMPTY);
  const isReady = useSyncExternalStore(subscribe, () => ready, () => false);
  return { catalog, ready: isReady };
}
