import { useCallback, useSyncExternalStore } from "react";

/**
 * Player protection, saved in this browser.
 *
 *  - adShield:     the embedded player runs in a locked box. It can still play video and go fullscreen,
 *                  but it can NOT open pop-up tabs, send the page to another site, start downloads or
 *                  show pop-up dialogs. That is what the invisible "click anywhere and you land on an ad
 *                  site" overlays rely on, so clicking them does nothing.
 *  - freshPlayer:  the player starts clean every time the page loads (Chrome and Brave), and switching
 *                  Sub / Dub / server reloads the page so the new player is a brand-new one that can't
 *                  remember what the old one was doing.
 *  - altHost:      play aniembed links from the other aniembed address (aniembed.ac <-> aniembed.se).
 *                  Each address keeps its own saved player settings, so this is a way out if one
 *                  address has remembered the wrong language.
 */
export type Shield = { adShield: boolean; freshPlayer: boolean; altHost: boolean };

const KEY = "tyshi-shield-v1";
const DEFAULTS: Shield = { adShield: true, freshPlayer: true, altHost: false };

/** What a shielded player is allowed to do. No popups, no top-level navigation, no downloads, no dialogs. */
export const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation";

/** True when this browser can load a player with empty, throw-away storage (Chrome, Brave, Edge). */
export const freshSupported = () => typeof HTMLIFrameElement !== "undefined" && "credentialless" in HTMLIFrameElement.prototype;

let cache: Shield = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Shield {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Shield>;
    return { adShield: raw.adShield !== false, freshPlayer: raw.freshPlayer !== false, altHost: raw.altHost === true };
  } catch {
    return DEFAULTS;
  }
}

function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    cache = read();
    loaded = true;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useShield() {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return cache;
    },
    () => DEFAULTS,
  );
  const update = useCallback((patch: Partial<Shield>) => {
    ensureLoaded();
    cache = { ...cache, ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* a blocked store only means the choice isn't remembered */
    }
    listeners.forEach((l) => l());
  }, []);
  return { ...value, update };
}
