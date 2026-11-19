import type { MediaCard, MediaDetail } from "@/lib/anilist";
import { getAnimeDoc, type CloudAnime } from "@/lib/cloud-episodes";

/** Search-card shape for a series stored in Firestore. */
export function cloudToCard(a: CloudAnime): MediaCard {
  return {
    id: a.anilistId,
    title: { romaji: a.title, english: a.title, native: null },
    coverImage: { extraLarge: a.poster, large: a.poster, color: null },
    bannerImage: a.banner,
    format: a.format,
    status: a.status,
    episodes: a.episodeCount || null,
    averageScore: null,
    seasonYear: a.year,
    genres: a.genres,
    description: a.about,
    nextAiringEpisode: null,
  };
}

/** A full detail page model for a custom series, so the normal pages can render it. */
export function cloudToDetail(a: CloudAnime): MediaDetail {
  return {
    ...cloudToCard(a),
    duration: null,
    season: null,
    startDate: a.year ? { year: a.year, month: null, day: null } : null,
    popularity: null,
    favourites: null,
    studios: { nodes: [] },
    mainStudios: { nodes: [] },
    trailer: null,
    externalLinks: [],
    characters: { edges: [] },
    relations: { edges: [] },
    recommendations: { nodes: [] },
  };
}

/**
 * Custom series live only in Firestore, which the server can't read. The server
 * renders a neutral placeholder; the browser immediately loads the real series.
 */
export async function getCustomMedia(id: number): Promise<MediaDetail> {
  if (typeof window === "undefined") {
    return cloudToDetail({
      anilistId: id,
      title: "Loading…",
      poster: null,
      episodeCount: 0,
      subCount: 0,
      dubCount: 0,
      custom: true,
      edited: false,
      about: null,
      banner: null,
      genres: [],
      year: null,
      format: null,
      status: null,
      updatedAt: null,
    });
  }
  const doc = await getAnimeDoc(id);
  if (!doc) throw new Error("This series doesn't exist.");
  return cloudToDetail(doc);
}

/** Apply details an admin saved by hand (title, poster, banner, about, genres) to an AniList title. */
export function applyOverride(media: MediaDetail, doc: CloudAnime | null | undefined): MediaDetail {
  if (!doc?.edited) return media;
  return {
    ...media,
    title: { ...media.title, english: doc.title, romaji: doc.title },
    coverImage: doc.poster
      ? { ...media.coverImage, extraLarge: doc.poster, large: doc.poster }
      : media.coverImage,
    bannerImage: doc.banner ?? media.bannerImage,
    description: doc.about ?? media.description,
    genres: doc.genres.length ? doc.genres : media.genres,
  };
}
