import { ANIME, EPISODE_LISTS, type TmdbLinks } from "@/lib/cloud-episodes";
import { getDb } from "@/lib/firebase";
import {
  getTmdbSeasonEpisodes,
  tmdbMovieRecordId,
  tmdbSeasonRecordId,
  type TmdbMovie,
  type TmdbSeason,
} from "@/lib/tmdb";

/**
 * Import from TMDB into Firebase (doc 1.2, parts 3 and 5).
 * Each season is its own record; importing again UPDATES it (fixed record id), and anything
 * you edited by hand (title, poster, about) is kept.
 */
export type ImportSeriesInput = {
  tmdbId: number;
  title: string;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  genres: string[];
  year: number | null;
  status: string | null;
  seasons: TmdbSeason[]; // only the ticked ones
  links: TmdbLinks | undefined;
  /** Season 0 (Specials) is skipped unless this is true. */
  includeSpecials?: boolean;
};

export type ImportResult = { seasons: number; episodes: number; skipped: string[] };

const seasonTitle = (series: string, season: number) =>
  season === 0 ? `${series} Specials` : season === 1 ? series : `${series} Season ${season}`;

/** Make a record without wiping hand edits or links saved earlier. */
async function writeRecord(opts: {
  id: number;
  fields: Record<string, unknown>;
  editable: { title: string; poster: string | null; banner: string | null; about: string; genres: string[] };
  episodes: Record<string, unknown>;
}) {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const ref = fs.doc(db, ANIME, String(opts.id));
  const existing = await fs.getDoc(ref);
  const edited = existing.exists() && existing.data()?.edited === true;
  const payload: Record<string, unknown> = { ...opts.fields, updatedAt: fs.serverTimestamp() };
  // Hand edits stay: only fill these when the record is new or was never edited.
  if (!edited) {
    payload.title = opts.editable.title;
    payload.poster = opts.editable.poster;
    payload.banner = opts.editable.banner;
    payload.about = opts.editable.about || null;
    payload.genres = opts.editable.genres;
  }
  await fs.setDoc(ref, payload, { merge: true });
  await fs.setDoc(
    fs.doc(db, EPISODE_LISTS, String(opts.id)),
    { anilistId: opts.id, updatedAt: fs.serverTimestamp(), episodes: opts.episodes },
    { merge: true },
  );
}

export async function importTmdbSeries(
  input: ImportSeriesInput,
  onProgress: (message: string) => void,
): Promise<ImportResult> {
  const result: ImportResult = { seasons: 0, episodes: 0, skipped: [] };
  const seriesKey = `tmdb-${input.tmdbId}`;
  const wanted = input.seasons
    .filter((s) => s.season >= 1 || input.includeSpecials)
    .sort((a, b) => a.season - b.season);
  for (const s of wanted) {
    onProgress(`Reading season ${s.season} (${result.seasons + 1} of ${wanted.length})…`);
    let list;
    try {
      list = await getTmdbSeasonEpisodes(input.tmdbId, s.season, true);
    } catch {
      result.skipped.push(`Season ${s.season}: TMDB has no data`);
      continue;
    }
    if (!list.length) {
      result.skipped.push(`Season ${s.season}: no aired episodes`);
      continue;
    }
    // Episodes with no title or picture are still imported (as "Episode N"); nothing is invented.
    const episodes: Record<string, unknown> = {};
    for (const e of list) {
      episodes[String(e.number)] = {
        title: e.title,
        ...(e.still ? { thumbnail: e.still } : {}),
        ...(e.airDate ? { airDate: e.airDate } : {}),
        tmdb: true,
      };
    }
    onProgress(`Saving season ${s.season} (${list.length} episodes)…`);
    const id = tmdbSeasonRecordId(input.tmdbId, s.season);
    await writeRecord({
      id,
      fields: {
        anilistId: id,
        custom: true,
        source: "tmdb",
        hidden: true,
        kind: "tv",
        tmdbId: input.tmdbId,
        tmdbSeason: s.season,
        seriesKey,
        seriesTitle: input.title,
        seasonNumber: s.season,
        episodeCount: list.length,
        subCount: list.length,
        dubCount: input.links?.servers.some((v) => v.langs.length > 1) ? list.length : 0,
        year: s.year ?? input.year,
        format: "TV",
        status: input.status,
        ...(input.links ? { tmdbLinks: input.links } : {}),
      },
      editable: {
        title: seasonTitle(input.title, s.season),
        poster: input.poster,
        banner: input.backdrop,
        about: input.overview,
        genres: input.genres,
      },
      episodes,
    });
    result.seasons += 1;
    result.episodes += list.length;
  }
  return result;
}

/** Movies: one record each, shown as "Movie", the same hidden rules as a series. */
export async function importTmdbMovies(
  movies: TmdbMovie[],
  links: TmdbLinks | undefined,
  onProgress: (message: string) => void,
): Promise<ImportResult> {
  const result: ImportResult = { seasons: 0, episodes: 0, skipped: [] };
  for (const m of movies) {
    onProgress(`Saving movie ${m.title}…`);
    const id = tmdbMovieRecordId(m.id);
    await writeRecord({
      id,
      fields: {
        anilistId: id,
        custom: true,
        source: "tmdb",
        hidden: true,
        kind: "movie",
        tmdbId: m.id,
        seriesKey: `tmdb-movie-${m.id}`,
        seriesTitle: m.title,
        episodeCount: 1,
        subCount: 1,
        dubCount: links?.servers.some((v) => v.langs.length > 1) ? 1 : 0,
        year: m.year,
        format: "MOVIE",
        status: "FINISHED",
        ...(links ? { tmdbLinks: links } : {}),
      },
      editable: { title: m.title, poster: m.poster, banner: m.backdrop, about: m.overview, genres: [] },
      episodes: { "1": { title: m.title, ...(m.backdrop ? { thumbnail: m.backdrop } : {}), tmdb: true } },
    });
    result.seasons += 1;
    result.episodes += 1;
  }
  return result;
}
