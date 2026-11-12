import { useSyncExternalStore } from "react";

import { firebaseConfigured, getDb } from "@/lib/firebase";
import { parseSpotlight, SITE_CONFIG, SPOTLIGHT_DOC, type SpotlightSlide } from "@/lib/spotlight";

/**
 * The Spotlight list chosen in /admin, loaded with ONE request.
 *  - The last list is kept in the browser, so the next visit paints your slides at once (no waiting, no flash).
 *  - The request starts the moment this file loads, before the home page has even drawn.
 *  - `ready` turns true once the answer is in (or the cache already had one), so the home page never shows
 *    AniList's own list first and then swaps to yours.
 */
const CACHE_KEY = "tyshi-spotlight-v1";
const GIVE_UP_MS = 4000;

type State = { slides: SpotlightSlide[]; ready: boolean };
const SERVER: State = { slides: [], ready: false };

function readCache(): SpotlightSlide[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return parseSpotlight({ slides: JSON.parse(raw) });
  } catch {
    return null;
  }
}

const cached = readCache();
let state: State = cached ? { slides: cached, ready: true } : { slides: [], ready: !firebaseConfigured && typeof window !== "undefined" };
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function finish(slides: SpotlightSlide[] | null) {
  const next = slides ?? state.slides;
  const same = JSON.stringify(next) === JSON.stringify(state.slides);
  if (state.ready && same) return;
  state = { slides: same ? state.slides : next, ready: true };
  if (slides) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(slides));
    } catch {
      /* not remembered */
    }
  }
  emit();
}

function load() {
  if (started || typeof window === "undefined" || !firebaseConfigured) return;
  started = true;
  // Start fetching the first banner while the list is still being read.
  if (cached?.[0]) {
    const img = new Image();
    img.src = cached[0].banner;
  }
  const giveUp = window.setTimeout(() => finish(null), GIVE_UP_MS);
  Promise.all([getDb(), import("firebase/firestore")])
    .then(async ([db, fs]) => {
      const snap = await fs.getDoc(fs.doc(db, SITE_CONFIG, SPOTLIGHT_DOC));
      finish(parseSpotlight(snap.data()));
    })
    .catch((error) => {
      console.error(error);
      finish(null);
    })
    .finally(() => window.clearTimeout(giveUp));
}

// Begin as early as possible: when the module loads, not when the hero mounts.
load();

function subscribe(cb: () => void) {
  listeners.add(cb);
  load();
  return () => void listeners.delete(cb);
}

export function useSpotlightState(): State {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function useSpotlight(): SpotlightSlide[] {
  return useSpotlightState().slides;
}
