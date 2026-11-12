import { useEffect, useSyncExternalStore } from "react";

/**
 * The art blurred behind the whole site. A page tells the shell which picture to show
 * (home: the current spotlight slide, details/watch: that anime's banner). Pages that
 * set nothing get the soft dark gradient.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useBackdropValue(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Call from a page with the picture to show; it is cleared when the page goes away. */
export function useBackdropArt(url: string | null | undefined) {
  useEffect(() => {
    set(url ?? null);
  }, [url]);
  useEffect(() => () => set(null), []);
}
