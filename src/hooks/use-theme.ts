import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "tyshi-theme-v1";
const EVENT = "tyshi-theme-change";

export const THEMES = [
  { id: "mono", label: "Black", color: "#f2f2f2" },
  { id: "purple", label: "Deep violet", color: "#9b78e8" },
  { id: "sunset", label: "Ember orange", color: "#c96b24" },
  { id: "rose", label: "Rose", color: "#d84c82" },
  { id: "teal", label: "Deep teal", color: "#35b8aa" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "mono";

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

function read(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Inline script run before first paint so the page never flashes the wrong theme. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t&&["mono","purple","rose","sunset","teal"].indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const sync = () => {
      const next = read();
      setThemeState(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the theme still applies for this visit */
    }
    document.documentElement.setAttribute("data-theme", next);
    window.dispatchEvent(new Event(EVENT));
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
