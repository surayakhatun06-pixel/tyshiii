import { useCallback, useEffect, useState } from "react";

const KEY = "tyshi-prefs-v1";
const EVENT = "tyshi-prefs-change";

type Prefs = { autoNext: boolean; lang: "sub" | "dub"; server: string };
const DEFAULTS: Prefs = { autoNext: true, lang: "sub", server: "" };

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULTS;
  }
}

/** Small viewer preferences: auto-play the next episode, SUB/DUB and server choice. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    const sync = () => setPrefs(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((patch: Partial<Prefs>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  return { prefs, set };
}
