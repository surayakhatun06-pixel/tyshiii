import { useCallback, useSyncExternalStore } from "react";

import { useBackdropArt } from "@/hooks/use-backdrop";

/**
 * Display choices saved in this browser:
 *  - playerBg: what sits behind the video
 *      "black"  plain black behind the whole watch page (default)
 *      "mix"    the anime's art, blurred and darkened, behind the whole watch page
 *      "poster" the anime's poster, blurred as you choose, behind the whole watch page
 *      "banner" the anime's art behind the whole watch page, with only the blur you choose
 *  - playerBlur: blur strength in px, used by "mix" and "banner"
 *  - detailsBg: the picture behind the details / watch pages (banner, poster or plain black)
 *  - blackEverywhere: one switch that forces plain black behind every page (no banner, no poster, no blur)
 */
export type PlayerBg = "mix" | "banner" | "poster" | "black";
export type DetailsBg = "banner" | "poster" | "black";

export type PlayerLayout = "side" | "theater";
export type PlayerSide = "right" | "left";
export type PlayerCorners = "rounded" | "square";
export type PhoneStyle = "full" | "card";

export type Appearance = {
  playerBg: PlayerBg;
  playerBlur: number;
  detailsBg: DetailsBg;
  blackEverywhere: boolean;
  /** Watch page: episode list beside the player (default) or the player full width with the list below. */
  playerLayout: PlayerLayout;
  /** Which side the episode list sits on in the default layout. */
  playerSide: PlayerSide;
  playerCorners: PlayerCorners;
  /** A soft glow around the player. */
  playerGlow: boolean;
  /** Phones: the player runs edge to edge (default) or sits in a rounded card with a little space around it. */
  phoneStyle: PhoneStyle;
  /** Phones: keep the player at the top of the screen while the page scrolls. */
  phoneSticky: boolean;
  /** Phones: hosts with cramped controls are shown at a normal width and scaled to fit (default on). */
  phoneScaled: boolean;
  /** Crops the host's thin black edge: the frame content is scaled up by about 1.5 percent (doc 1.8). */
  fillFrame: boolean;
  /** Site-wide look (doc 1.9). Applied as attributes on <html>, so every page follows. */
  cornerStyle: "sharp" | "normal" | "round";
  textSize: "small" | "normal" | "large";
  reduceMotion: boolean;
  highContrast: boolean;
  /** Which title AniList shows first on cards, details and the watch page. */
  titleLang: "english" | "romaji" | "native";
  dateFormat: "short" | "day" | "iso";
  /** Start playing when an episode opens (default on). */
  autoPlay: boolean;
};

/** The video player as it has always been. "Reset" in Settings puts these back. */
export const PLAYER_DEFAULTS = {
  playerLayout: "side",
  playerSide: "right",
  playerCorners: "rounded",
  playerGlow: false,
  phoneStyle: "full",
  phoneSticky: false,
  phoneScaled: true,
  fillFrame: true,
} as const;

/** Full black is now the default everywhere (new key, so it applies to everyone once). A new key: earlier versions saved other choices ("transparent", a 0-40px blur) that no longer exist. */
const KEY = "tyshi-appearance-v4";
export const MAX_PLAYER_BLUR = 100;
/** New v19.20 options with their defaults (the site looks exactly as before until you change one). */
export const SITE_DEFAULTS = {
  cornerStyle: "normal",
  textSize: "normal",
  reduceMotion: false,
  highContrast: false,
  titleLang: "english",
  dateFormat: "short",
  autoPlay: true,
} as const;
const DEFAULTS: Appearance = { playerBg: "black", playerBlur: 30, detailsBg: "banner", blackEverywhere: true, ...PLAYER_DEFAULTS, ...SITE_DEFAULTS };

/** Put the site-wide choices on <html> so CSS can follow them. */
function applyDom(a: Appearance) {
  if (typeof document === "undefined") return;
  const r = document.documentElement;
  r.dataset.corners = a.cornerStyle;
  r.dataset.textsize = a.textSize;
  r.dataset.motion = a.reduceMotion ? "reduce" : "full";
  r.dataset.contrast = a.highContrast ? "high" : "normal";
}

let cache: Appearance = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>;
    return {
      playerBg: raw.playerBg === "banner" || raw.playerBg === "mix" || raw.playerBg === "poster" ? raw.playerBg : "black",
      playerBlur:
        typeof raw.playerBlur === "number" && raw.playerBlur >= 0 && raw.playerBlur <= MAX_PLAYER_BLUR
          ? Math.round(raw.playerBlur)
          : DEFAULTS.playerBlur,
      detailsBg: raw.detailsBg === "poster" || raw.detailsBg === "black" ? raw.detailsBg : "banner",
      blackEverywhere: raw.blackEverywhere !== false,
      playerLayout: raw.playerLayout === "theater" ? "theater" : PLAYER_DEFAULTS.playerLayout,
      playerSide: raw.playerSide === "left" ? "left" : PLAYER_DEFAULTS.playerSide,
      playerCorners: raw.playerCorners === "square" ? "square" : PLAYER_DEFAULTS.playerCorners,
      playerGlow: raw.playerGlow === true,
      phoneStyle: raw.phoneStyle === "card" ? "card" : PLAYER_DEFAULTS.phoneStyle,
      phoneSticky: raw.phoneSticky === true,
      phoneScaled: raw.phoneScaled !== false,
      fillFrame: raw.fillFrame !== false,
      cornerStyle: raw.cornerStyle === "sharp" || raw.cornerStyle === "round" ? raw.cornerStyle : "normal",
      textSize: raw.textSize === "small" || raw.textSize === "large" ? raw.textSize : "normal",
      reduceMotion: raw.reduceMotion === true,
      highContrast: raw.highContrast === true,
      titleLang: raw.titleLang === "romaji" || raw.titleLang === "native" ? raw.titleLang : "english",
      dateFormat: raw.dateFormat === "day" || raw.dateFormat === "iso" ? raw.dateFormat : "short",
      autoPlay: raw.autoPlay !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    cache = read();
    loaded = true;
    applyDom(cache);
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAppearance() {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      ensureLoaded();
      return cache;
    },
    () => DEFAULTS,
  );

  const update = useCallback((patch: Partial<Appearance>) => {
    ensureLoaded();
    cache = { ...cache, ...patch };
    applyDom(cache);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* a blocked store only means the choice isn't remembered */
    }
    listeners.forEach((l) => l());
  }, []);

  return { ...value, update };
}

/** The admin's default look, applied once per admin save (see site-appearance.ts). */
export function applyAppearanceDefaults(patch: Partial<Appearance>) {
  ensureLoaded();
  cache = { ...cache, ...patch };
  applyDom(cache);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* not remembered */
  }
  listeners.forEach((l) => l());
}

/** Sets the page art for a details / watch page, following the "Details background" choice. */
export function useDetailsBackdrop(media: {
  bannerImage: string | null;
  coverImage: { extraLarge: string | null; large: string | null };
}) {
  const { detailsBg, blackEverywhere } = useAppearance();
  const poster = media.coverImage.extraLarge ?? media.coverImage.large;
  useBackdropArt(
    blackEverywhere || detailsBg === "black" ? null : detailsBg === "poster" ? (poster ?? media.bannerImage) : (media.bannerImage ?? poster),
  );
}


/** Read the title choice without a hook (used by titleOf and date helpers). */
export function getTitleLang(): Appearance["titleLang"] {
  ensureLoaded();
  return cache.titleLang;
}
export function getDateFormat(): Appearance["dateFormat"] {
  ensureLoaded();
  return cache.dateFormat;
}
/** Run once at start so the saved look is on <html> before the first paint of later pages. */
export function initAppearanceDom() {
  ensureLoaded();
  applyDom(cache);
}

/** A date written the way the visitor chose (Apr 07, 2013 / 07 Apr 2013 / 2013-04-07). Returns "" for bad input. */
export function formatDate(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  const d = typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(`${input}T00:00:00`) : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = getDateFormat();
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  if (fmt === "iso") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${day}`;
  if (fmt === "day") return `${day} ${mon} ${d.getFullYear()}`;
  return `${mon} ${day}, ${d.getFullYear()}`;
}
