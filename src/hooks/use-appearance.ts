import { useCallback, useSyncExternalStore } from "react";

import { useBackdropArt } from "@/hooks/use-backdrop";

/**
 * Display choices saved in this browser:
 *  - playerBg: what sits behind the video
 *      "black"  plain black behind the whole watch page (default)
 *      "mix"    the anime's art, blurred and darkened, behind the whole watch page
 *      "banner" the anime's art behind the whole watch page, with only the blur you choose
 *  - playerBlur: blur strength in px, used by "mix" and "banner"
 *  - detailsBg: the picture behind the details / watch pages (banner, poster or plain black)
 *  - blackEverywhere: one switch that forces plain black behind every page (no banner, no poster, no blur)
 */
export type PlayerBg = "mix" | "banner" | "black";
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
};

/** The video player as it has always been. "Reset" in Settings puts these back. */
export const PLAYER_DEFAULTS = {
  playerLayout: "side",
  playerSide: "right",
  playerCorners: "rounded",
  playerGlow: false,
  phoneStyle: "full",
  phoneSticky: false,
} as const;

/** Full black is now the default everywhere (new key, so it applies to everyone once). A new key: earlier versions saved other choices ("transparent", a 0-40px blur) that no longer exist. */
const KEY = "tyshi-appearance-v4";
export const MAX_PLAYER_BLUR = 100;
const DEFAULTS: Appearance = { playerBg: "black", playerBlur: 30, detailsBg: "banner", blackEverywhere: true, ...PLAYER_DEFAULTS };

let cache: Appearance = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>;
    return {
      playerBg: raw.playerBg === "banner" || raw.playerBg === "mix" ? raw.playerBg : "black",
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
    };
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
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* a blocked store only means the choice isn't remembered */
    }
    listeners.forEach((l) => l());
  }, []);

  return { ...value, update };
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
