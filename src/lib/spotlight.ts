import type { DocumentData } from "firebase/firestore";

import type { MediaCard } from "@/lib/anilist";
import { getDb } from "@/lib/firebase";

/**
 * Firestore: siteConfig/spotlight
 *   { slides: [{ anilistId, title, banner, poster, about, genres, year, format, episodes }],
 *     updatedAt }
 *
 * The admin picks up to MAX_SPOTLIGHT titles and a banner link for each. The home
 * page shows these first and fills any empty slot with AniList trending.
 */
export const MAX_SPOTLIGHT = 12;
export const SITE_CONFIG = "siteConfig";
export const SPOTLIGHT_DOC = "spotlight";

export type SpotlightSlide = {
  anilistId: number;
  title: string;
  banner: string;
  poster: string | null;
  about: string | null;
  genres: string[];
  year: number | null;
  format: string | null;
  episodes: number | null;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function isHttpUrl(v: string | null) {
  if (!v) return false;
  try {
    return ["http:", "https:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

export function parseSpotlight(data: DocumentData | undefined): SpotlightSlide[] {
  const raw = data?.slides;
  if (!Array.isArray(raw)) return [];
  const out: SpotlightSlide[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const anilistId = Number(r.anilistId);
    const banner = str(r.banner);
    if (!Number.isSafeInteger(anilistId) || anilistId < 1 || !isHttpUrl(banner)) continue;
    out.push({
      anilistId,
      title: str(r.title) ?? `Anime ${anilistId}`,
      banner: banner as string,
      poster: str(r.poster),
      about: str(r.about),
      genres: Array.isArray(r.genres)
        ? r.genres.filter((g): g is string => typeof g === "string" && !!g.trim()).slice(0, 6)
        : [],
      year: typeof r.year === "number" ? r.year : null,
      format: str(r.format),
      episodes: typeof r.episodes === "number" ? r.episodes : null,
    });
    if (out.length >= MAX_SPOTLIGHT) break;
  }
  return out;
}

/** A saved slide, shaped like an AniList card so the hero can show it unchanged. */
export function slideToCard(s: SpotlightSlide): MediaCard {
  return {
    id: s.anilistId,
    title: { romaji: s.title, english: s.title, native: null },
    coverImage: { extraLarge: s.poster, large: s.poster, color: null },
    bannerImage: s.banner,
    format: s.format,
    status: null,
    episodes: s.episodes,
    averageScore: null,
    seasonYear: s.year,
    genres: s.genres,
    description: s.about,
    nextAiringEpisode: null,
  };
}

/** Live Spotlight list. Updates arrive without reloading the page. */
export function watchSpotlight(
  onData: (slides: SpotlightSlide[]) => void,
  onError: (error: unknown) => void,
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | undefined;
  Promise.all([getDb(), import("firebase/firestore")])
    .then(([db, fs]) => {
      if (cancelled) return;
      unsubscribe = fs.onSnapshot(
        fs.doc(db, SITE_CONFIG, SPOTLIGHT_DOC),
        (snap) => onData(parseSpotlight(snap.data())),
        onError,
      );
    })
    .catch((error) => {
      if (!cancelled) onError(error);
    });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** Replace the whole Spotlight list (an empty list means "AniList trending only"). */
export async function saveSpotlight(slides: SpotlightSlide[]): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const clean = slides.slice(0, MAX_SPOTLIGHT).map((s) => ({
    anilistId: s.anilistId,
    title: s.title.trim().slice(0, 300),
    banner: s.banner.trim().slice(0, 2000),
    poster: s.poster?.trim().slice(0, 2000) || null,
    about: s.about?.trim().slice(0, 1200) || null,
    genres: s.genres.map((g) => g.trim().slice(0, 40)).filter(Boolean).slice(0, 6),
    year: s.year,
    format: s.format,
    episodes: s.episodes,
  }));
  await fs.setDoc(fs.doc(db, SITE_CONFIG, SPOTLIGHT_DOC), {
    slides: clean,
    updatedAt: fs.serverTimestamp(),
  });
  // Keep this browser's saved copy in step so the home page shows the change straight away.
  try {
    window.localStorage.setItem("tyshi-spotlight-v1", JSON.stringify(clean));
  } catch {
    /* not remembered */
  }
}
