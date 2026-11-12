/**
 * TMDB (themoviedb.org) helper for Bulk import.
 *
 * TMDB has ONE id per series and splits it into seasons (each with its own episode numbers), while
 * AniList often has one entry per season, or one long entry for the whole run. This file:
 *   - searches TMDB by title or by TMDB code and reads a series with all its seasons,
 *   - guesses the right TMDB series for an anime (so Bulk can fill itself in),
 *   - maps the site's episode numbers (1, 2, 3...) onto TMDB's season + episode, so a link always
 *     gets the right season and the right episode inside that season.
 *
 * The key is a TMDB v3 key. Set VITE_TMDB_API_KEY to use a different one without touching the code.
 */
const FALLBACK_KEY = "8cb044481e23a94c5cc44ffeb4ed6ace";
export const TMDB_KEY: string =
  (import.meta.env?.VITE_TMDB_API_KEY as string | undefined) || FALLBACK_KEY;

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w154";

export class TmdbError extends Error {}

async function call<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params))
    url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new TmdbError("Couldn't reach TMDB. Check your connection.");
  }
  if (res.status === 401) throw new TmdbError("TMDB rejected the API key.");
  if (res.status === 404)
    throw new TmdbError("TMDB has no series with that code.");
  if (res.status === 429)
    throw new TmdbError("TMDB is busy. Try again in a moment.");
  if (!res.ok) throw new TmdbError(`TMDB error (${res.status}).`);
  return (await res.json()) as T;
}

const year = (date?: string | null) => {
  const y = Number((date ?? "").slice(0, 4));
  return Number.isSafeInteger(y) && y > 1800 ? y : null;
};

/* ------------------------------------------------------------------ types */

export type TmdbHit = {
  id: number;
  name: string;
  originalName: string;
  year: number | null;
  poster: string | null;
  overview: string;
  popularity: number;
};

export type TmdbSeason = {
  /** 0 is TMDB's "Specials"; 1, 2, 3... are the real seasons. */
  season: number;
  name: string;
  /** Episodes TMDB lists for the season. */
  count: number;
  /** Episodes that have already aired (same as count for finished seasons). */
  aired: number;
  year: number | null;
};

export type TmdbSeries = TmdbHit & {
  status: string | null;
  seasons: TmdbSeason[];
};

type RawHit = {
  id: number;
  name?: string;
  original_name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  popularity?: number;
};

const toHit = (r: RawHit): TmdbHit => ({
  id: r.id,
  name: r.name ?? r.original_name ?? `TMDB ${r.id}`,
  originalName: r.original_name ?? r.name ?? "",
  year: year(r.first_air_date),
  poster: r.poster_path ? IMG + r.poster_path : null,
  overview: r.overview ?? "",
  popularity: r.popularity ?? 0,
});

/* ---------------------------------------------------------------- search */

/** Search series by title. */
export async function searchTmdb(query: string): Promise<TmdbHit[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await call<{ results: RawHit[] }>("/search/tv", {
    query: q,
    include_adult: "false",
  });
  return data.results.slice(0, 8).map(toHit);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** One series with every season and how many episodes of each have aired. */
export async function getTmdbSeries(id: number): Promise<TmdbSeries> {
  const raw = await call<
    RawHit & {
      status?: string;
      seasons?: {
        season_number: number;
        episode_count: number;
        name?: string;
        air_date?: string | null;
      }[];
    }
  >(`/tv/${id}`);
  const base = (raw.seasons ?? []).filter(
    (s) => s.episode_count > 0 || s.season_number > 0,
  );

  // Season details give each episode's air date, so a running season only counts what has aired.
  const now = today();
  const seasons: TmdbSeason[] = await Promise.all(
    base.map(async (s): Promise<TmdbSeason> => {
      const out: TmdbSeason = {
        season: s.season_number,
        name: s.name ?? `Season ${s.season_number}`,
        count: s.episode_count,
        aired: s.episode_count,
        year: year(s.air_date),
      };
      if (s.season_number < 1) return out;
      try {
        const d = await call<{ episodes?: { air_date?: string | null }[] }>(
          `/tv/${id}/season/${s.season_number}`,
        );
        const eps = d.episodes ?? [];
        if (eps.length) {
          out.count = eps.length;
          // If TMDB has no air dates at all, trust the count rather than showing zero.
          out.aired = eps.some((e) => e.air_date)
            ? eps.filter((e) => e.air_date && e.air_date <= now).length
            : eps.length;
        }
      } catch {
        /* keep the plain count */
      }
      return out;
    }),
  );
  seasons.sort((a, b) => a.season - b.season);
  return { ...toHit(raw), status: raw.status ?? null, seasons };
}

/** A search box entry: digits are a TMDB code, anything else is a title. */
export async function lookupTmdb(input: string): Promise<TmdbHit[]> {
  const t = input.trim();
  if (/^\d{1,9}$/.test(t)) return [toHit(await getTmdbSeries(Number(t)))];
  return searchTmdb(t);
}

/* ----------------------------------------------------------- auto-match */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "");

/**
 * Pick the TMDB series that best matches an anime (its titles and start year).
 * `confident` is true when a title matched exactly; otherwise the caller should ask the admin to check.
 */
export async function autoMatch(
  titles: string[],
  startYear: number | null,
): Promise<{ best: TmdbHit | null; hits: TmdbHit[]; confident: boolean }> {
  const wanted = [
    ...new Set(titles.map((t) => t.trim()).filter(Boolean)),
  ].slice(0, 3);
  const seen = new Map<number, TmdbHit>();
  for (const t of wanted) {
    try {
      for (const h of await searchTmdb(t))
        if (!seen.has(h.id)) seen.set(h.id, h);
    } catch (error) {
      if (!seen.size) throw error;
    }
    if (
      seen.size >= 5 &&
      [...seen.values()].some((h) => scoreOf(h, wanted, startYear) >= 5)
    )
      break;
  }
  const hits = [...seen.values()]
    .map((h) => ({ h, s: scoreOf(h, wanted, startYear) }))
    .sort((a, b) => b.s - a.s || b.h.popularity - a.h.popularity);
  const best = hits[0] ?? null;
  return {
    best: best?.h ?? null,
    hits: hits.map((x) => x.h).slice(0, 6),
    confident: !!best && best.s >= 5,
  };
}

function scoreOf(
  h: TmdbHit,
  titles: string[],
  startYear: number | null,
): number {
  const names = [norm(h.name), norm(h.originalName)];
  let s = 0;
  for (const t of titles.map(norm)) {
    if (!t) continue;
    if (names.includes(t)) s = Math.max(s, 3);
    else if (names.some((n) => n && (n.includes(t) || t.includes(n))))
      s = Math.max(s, 1);
  }
  if (startYear && h.year) {
    const d = Math.abs(h.year - startYear);
    if (d === 0) s += 2;
    else if (d === 1) s += 1;
  }
  return s;
}

/* ------------------------------------------------------ episode mapping */

/** A position inside TMDB: season number and the episode number inside that season. */
export type TmdbPos = { season: number; episode: number };

export type MapInput = {
  id: number;
  /** TV seasons follow TMDB's real seasons; OVA / special / ONA follow Specials; movies map to nothing unless set by hand. */
  kind: "main" | "extra" | "movie";
  /** How many site episodes this entry has (1..count). */
  count: number;
  /** Start by hand (blank = carry on from where the last entry ended). */
  startSeason?: number;
  startEpisode?: number;
};

/** AniList format -> how its episodes line up with TMDB. */
export const kindOf = (format: string | null): MapInput["kind"] =>
  format === "TV" || format === "TV_SHORT"
    ? "main"
    : format === "MOVIE"
      ? "movie"
      : "extra";

/**
 * Walk the entries in watch order and give every site episode its TMDB season + episode.
 * Works for both shapes: one AniList entry per season (each takes the next TMDB season), and one
 * long entry covering several TMDB seasons (episode 15 of 40 becomes season 2, episode 5).
 * An episode TMDB has no place for gets `undefined`.
 */
export function mapEntries(
  series: TmdbSeries,
  entries: MapInput[],
): Map<number, (TmdbPos | undefined)[]> {
  const regular = series.seasons.filter((s) => s.season >= 1 && s.count > 0);
  const specials = series.seasons.find((s) => s.season === 0 && s.count > 0);
  const out = new Map<number, (TmdbPos | undefined)[]>();

  // Cursor into the real seasons.
  let si = 0;
  let ei = 1;
  // Cursor into the Specials season.
  let sp = 1;

  for (const e of entries) {
    const list: (TmdbPos | undefined)[] = [];
    const typed = e.startSeason !== undefined || e.startEpisode !== undefined;

    if (
      e.kind === "main" ||
      (e.kind === "movie" && typed && e.startSeason !== 0)
    ) {
      if (e.startSeason !== undefined) {
        const at = regular.findIndex((s) => s.season === e.startSeason);
        if (at >= 0) {
          si = at;
          ei = e.startEpisode ?? 1;
        }
      } else if (e.startEpisode !== undefined) ei = e.startEpisode;
      for (let k = 0; k < e.count; k++) {
        const season = regular[si];
        if (!season) {
          list.push(undefined);
          continue;
        }
        list.push({ season: season.season, episode: ei });
        ei++;
        if (ei > season.count) {
          si++;
          ei = 1;
        }
      }
    } else if (e.kind === "extra" || (e.kind === "movie" && typed)) {
      if (e.startEpisode !== undefined) sp = e.startEpisode;
      for (let k = 0; k < e.count; k++) {
        if (!specials || sp > specials.count) list.push(undefined);
        else list.push({ season: 0, episode: sp++ });
      }
    } else {
      for (let k = 0; k < e.count; k++) list.push(undefined);
    }
    out.set(e.id, list);
  }
  return out;
}

/**
 * The position right after `last` (for adding newly aired episodes later), or undefined when TMDB
 * has no more episodes.
 */
export function nextPos(
  series: TmdbSeries,
  last: TmdbPos,
): TmdbPos | undefined {
  const list = series.seasons.filter(
    (s) => (last.season === 0 ? s.season === 0 : s.season >= 1) && s.count > 0,
  );
  const at = list.findIndex((s) => s.season === last.season);
  if (at < 0) return undefined;
  if (last.episode < list[at].count)
    return { season: last.season, episode: last.episode + 1 };
  const next = list[at + 1];
  return last.season === 0 || !next
    ? undefined
    : { season: next.season, episode: 1 };
}

/** "S1 · E1" style label, and "S1 E1 → S4 E10" for a run. */
export function describeRun(positions: (TmdbPos | undefined)[]): string | null {
  const real = positions.filter((p): p is TmdbPos => !!p);
  if (!real.length) return null;
  const a = real[0];
  const b = real[real.length - 1];
  const f = (p: TmdbPos) =>
    `${p.season === 0 ? "Sp" : `S${p.season}`} E${p.episode}`;
  return real.length === 1 ? f(a) : `${f(a)} → ${f(b)}`;
}

/* ------------------------------------------------------------------ movies */

export type TmdbMovieHit = { id: number; name: string; year: number | null };

/** Find the TMDB MOVIE for an anime movie (movies have their own TMDB ids, separate from series ids). */
export async function findTmdbMovie(
  titles: string[],
  year: number | null,
): Promise<TmdbMovieHit | null> {
  const wanted = [
    ...new Set(titles.map((t) => t.trim()).filter(Boolean)),
  ].slice(0, 3);
  let best: { hit: TmdbMovieHit; score: number } | null = null;
  for (const t of wanted) {
    let data: {
      results: {
        id: number;
        title?: string;
        original_title?: string;
        release_date?: string;
        popularity?: number;
      }[];
    };
    try {
      data = await call("/search/movie", {
        query: t,
        include_adult: "false",
        ...(year ? { year } : {}),
      });
    } catch (error) {
      if (!best) throw error;
      continue;
    }
    for (const r of data.results.slice(0, 6)) {
      const hit: TmdbMovieHit = {
        id: r.id,
        name: r.title ?? r.original_title ?? `TMDB ${r.id}`,
        year: year_(r.release_date),
      };
      let score = 0;
      const names = [r.title, r.original_title]
        .filter(Boolean)
        .map((x) => norm(x as string));
      if (wanted.some((w) => names.includes(norm(w)))) score += 5;
      if (year && hit.year)
        score +=
          hit.year === year ? 3 : Math.abs(hit.year - year) === 1 ? 1 : -2;
      score += Math.min(2, (r.popularity ?? 0) / 50);
      if (!best || score > best.score) best = { hit, score };
    }
    if (best && best.score >= 7) break;
  }
  return best?.hit ?? null;
}
const year_ = (d?: string | null) => year(d);

/** Search TMDB movies by title (for the "find the ID by name" box). */
export async function searchTmdbMovies(query: string): Promise<TmdbMovieHit[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await call<{
    results: {
      id: number;
      title?: string;
      original_title?: string;
      release_date?: string;
    }[];
  }>("/search/movie", {
    query: q,
    include_adult: "false",
  });
  return data.results.slice(0, 6).map((r) => ({
    id: r.id,
    name: r.title ?? r.original_title ?? `TMDB ${r.id}`,
    year: year_(r.release_date),
  }));
}

/** TMDB's picture and title for every episode of one season: episode number -> still image URL and name. */
export async function getSeasonStills(
  tvId: number,
  season: number,
): Promise<Map<number, { still: string | null; name: string | null }>> {
  type Raw = {
    episodes?: {
      episode_number: number;
      name?: string;
      still_path?: string | null;
    }[];
  };
  const raw = await call<Raw>(`/tv/${tvId}/season/${season}`);
  const out = new Map<number, { still: string | null; name: string | null }>();
  for (const e of raw.episodes ?? [])
    out.set(e.episode_number, {
      still: e.still_path
        ? `https://image.tmdb.org/t/p/w300${e.still_path}`
        : null,
      name: e.name?.trim() ? e.name.trim() : null,
    });
  return out;
}
