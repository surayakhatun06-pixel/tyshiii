import { dropParam, linkFromPaste, trackVariants } from "@/lib/track-link";
import { crawlFranchise, type FranchiseEntry } from "@/lib/franchise-crawl";
import { getTmdbSeries, nextPos, type TmdbPos } from "@/lib/tmdb";
import { titleOf } from "@/lib/anilist";
import { getDb } from "@/lib/firebase";
import { getSeasonStills } from "@/lib/tmdb";
import {
  deleteEpisodes,
  getAnimeDoc,
  animeToRef,
  parseEpisodeMap,
  publishGenerated,
  rewriteServerLinks,
  type GeneratedRow,
  type AnimeRef,
} from "@/lib/cloud-episodes";

/**
 * Bulk franchise import.
 *
 * Firestore layout written here (the "series" collection):
 *   series/{franchiseId}                                {title, seasonIds[], servers{key:{label,template}}, …}
 *   series/{franchiseId}/seasons/{anilistId}            {title, format, episodeCount, importedThrough, status, …}
 *   series/{franchiseId}/seasons/{anilistId}/episodes/{n}
 *                                                       {number, anilistId, servers:{server1:{dub,sub}, …}}
 *
 * The same links are also published to the live `anime` / `episodeLists` documents the player
 * already reads, so a bulk import plays on the site straight away.
 */
export { linkFromPaste, trackVariants };
export const SERIES = "series";
const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch; leave headroom.
export const MAX_TOTAL_EPISODES = 6000;

/* ---------------------------------------------------------------- templates */

/**
 * A server has a SUB link pattern and a DUB link pattern (either can be empty, for a server that only has one).
 * `mode` says what the links are built from:
 *   "anilist"  the AniList ID and the site's episode number ({id}, {ep});
 *   "tmdb"     the TMDB series ID, the TMDB season and the episode inside that season ({tmdb}, {season}, {ep}).
 * Older saves used one `template` with {track} plus `sub` / `dub` switches; those are still read.
 */
export type LinkMode = "anilist" | "tmdb";
export type ServerTemplate = {
  label: string;
  mode?: LinkMode;
  subLink?: string;
  dubLink?: string;
  /** Older single-link form (read only). */
  template?: string;
  sub?: boolean;
  dub?: boolean;
  /** Saved in the library but switched off: Bulk import leaves it out. */
  off?: boolean;
};

export const modeOf = (s: ServerTemplate): LinkMode =>
  s.mode === "tmdb" ? "tmdb" : "anilist";
export const usesTmdb = (servers: ServerTemplate[]) =>
  servers.some((s) => modeOf(s) === "tmdb");

/** The SUB and DUB patterns of a server, whichever way it was saved. Empty string = not provided. */
export function linksOf(s: ServerTemplate): { sub: string; dub: string } {
  if (s.subLink !== undefined || s.dubLink !== undefined)
    return { sub: (s.subLink ?? "").trim(), dub: (s.dubLink ?? "").trim() };
  const t = (s.template ?? "").trim();
  return {
    sub: t && s.sub !== false ? t.replace(/\{track\}/gi, "sub") : "",
    dub: t && s.dub !== false ? t.replace(/\{track\}/gi, "dub") : "",
  };
}

export const tracksOf = (s: ServerTemplate) => {
  const l = linksOf(s);
  return { sub: !!l.sub, dub: !!l.dub };
};

/**
 * Placeholders a template may use:
 *   {id}      the AniList ID          ({anilist_id} works too)
 *   {tmdb}    the TMDB ID             ({tmdb_id} works too)
 *   {season}  the TMDB season number
 *   {ep}      the episode number      ({episode}, {number})
 *   {track}   sub or dub
 */
const TOKEN =
  /\{(id|anilist_?id|tmdb_?id|tmdb|season|ep|episode|number|track)\}/gi;
type Kind = "id" | "tmdb" | "season" | "ep" | "track";
const kind = (raw: string): Kind => {
  const t = raw.toLowerCase();
  if (t === "id" || t.startsWith("anilist")) return "id";
  if (t.startsWith("tmdb")) return "tmdb";
  if (t === "season") return "season";
  if (t === "track") return "track";
  return "ep";
};

/** The IDs one entry (one AniList season) is known by. TMDB values are optional. */
export type Ids = { anilist: number; tmdb?: number; season?: number };

/** Fill the placeholders into a template. A placeholder with no value is left visible so it is easy to spot. */
export function fillTemplate(
  template: string,
  ids: Ids,
  ep: number,
  track: "sub" | "dub",
): string {
  const values: Record<Kind, string | undefined> = {
    id: String(ids.anilist),
    tmdb: ids.tmdb === undefined ? undefined : String(ids.tmdb),
    season: ids.season === undefined ? undefined : String(ids.season),
    ep: String(ep),
    track,
  };
  return template
    .trim()
    .replace(TOKEN, (whole, t: string) => values[kind(t)] ?? whole);
}

/** Returns a message when one link pattern can't be used, or null when it is fine. */
export function templateProblem(
  template: string,
  mode: LinkMode = "anilist",
): string | null {
  const t = template.trim();
  if (!t) return "Add a link.";
  const used = new Set([...t.matchAll(TOKEN)].map((m) => kind(m[1])));
  // {ep} and {season} are optional: a link with no {ep} is a MOVIE link (one fixed link per title).
  if (mode === "tmdb") {
    if (!used.has("tmdb")) return "Needs {tmdb} where the TMDB ID goes.";
    if (used.has("ep") && !used.has("season"))
      return "Needs {season} where the season number goes (or remove {ep} for a movie link).";
  } else if (!used.has("id")) return "Needs {id} where the AniList ID goes.";
  try {
    const u = new URL(
      fillTemplate(t, { anilist: 1, tmdb: 1, season: 1 }, 1, "sub"),
    );
    if (!["http:", "https:"].includes(u.protocol))
      return "The link must start with https://.";
  } catch {
    return "That isn't a valid link. Start with https:// and a host.";
  }
  return null;
}

/** A link with no {ep} is a movie link: the same link for the whole title, used for movies only. */
export const isMovieLink = (template: string) =>
  !/\{(ep|episode|number)\}/i.test(template);

/** True when a server has at least one movie-style link / at least one episode-style link. */
export const hasMovieLink = (s: ServerTemplate) => {
  const l = linksOf(s);
  return (!!l.sub && isMovieLink(l.sub)) || (!!l.dub && isMovieLink(l.dub));
};
export const hasSeriesLink = (s: ServerTemplate) => {
  const l = linksOf(s);
  return (!!l.sub && !isMovieLink(l.sub)) || (!!l.dub && !isMovieLink(l.dub));
};

/** What's wrong with a server's two links, per link, or null when it is ready. */
export function serverProblems(s: ServerTemplate): {
  sub: string | null;
  dub: string | null;
  both: string | null;
} {
  const l = linksOf(s);
  const mode = modeOf(s);
  return {
    sub: l.sub ? templateProblem(l.sub, mode) : null,
    dub: l.dub ? templateProblem(l.dub, mode) : null,
    both: !l.sub && !l.dub ? "Add a SUB link, a DUB link, or both." : null,
  };
}
export const serverReady = (s: ServerTemplate) => {
  const p = serverProblems(s);
  return !p.sub && !p.dub && !p.both;
};

/**
 * Turn a real link into a pattern: paste https://player.yenime.net/anime/ani/154587/1 and get
 * https://player.yenime.net/anime/ani/{id}/{ep}. The numbers are told apart by position: for AniList the
 * last two numbers in the path are the ID and the episode; for TMDB the last three are TMDB ID, season and
 * episode. If the real ID is known it is used to find the right number. Things like ?dub=1 stay as they are.
 * Returns null when nothing needs changing or the link can't be read safely.
 */
export function suggestTemplate(
  link: string,
  mode: LinkMode,
  ids: { anilist?: number; tmdb?: number } = {},
): string | null {
  const t = link.trim();
  const m = /^(https?:\/\/[^/?#]+)([^?#]*)([?#].*)?$/i.exec(t);
  if (!m) return null;
  const has = (re: RegExp) => re.test(t);
  const roles =
    mode === "tmdb"
      ? (["tmdb", "season", "ep"] as const).filter(
          (r) =>
            !has(
              r === "tmdb"
                ? /\{tmdb_?id\}|\{tmdb\}/i
                : r === "season"
                  ? /\{season\}/i
                  : /\{(ep|episode|number)\}/i,
            ),
        )
      : (["id", "ep"] as const).filter(
          (r) =>
            !has(
              r === "id" ? /\{(id|anilist_?id)\}/i : /\{(ep|episode|number)\}/i,
            ),
        );
  if (!roles.length) return null;

  // A movie link (…/movie/1440098) only has the title's ID: no season, no episode.
  if (/\/movies?\//i.test(m[2])) {
    const idToken = mode === "tmdb" ? "{tmdb}" : "{id}";
    const idAlready =
      mode === "tmdb"
        ? /\{tmdb_?id\}|\{tmdb\}/i.test(t)
        : /\{(id|anilist_?id)\}/i.test(t);
    if (!idAlready) {
      const parts = m[2].split("/");
      const at = parts.findIndex(
        (x, i) => /^\d+$/.test(x) && /^movies?$/i.test(parts[i - 1] ?? ""),
      );
      const target = at >= 0 ? at : parts.findIndex((x) => /^\d+$/.test(x));
      if (target >= 0) {
        parts[target] = idToken;
        // A fixed ?title=… would be wrong for every other movie.
        const q = dropParam(m[3] ?? "", "title");
        const out = m[1] + parts.join("/") + (q === "?" ? "" : q);
        return out === t ? null : out;
      }
    }
  }

  const token: Record<string, string> = {
    tmdb: "{tmdb}",
    id: "{id}",
    season: "{season}",
    ep: "{ep}",
  };
  const segs = m[2].split("/");
  const numeric = segs.flatMap((x, i) => (/^\d+$/.test(x) ? [i] : []));
  const left = [...roles];
  const knownId = mode === "tmdb" ? ids.tmdb : ids.anilist;
  const first = mode === "tmdb" ? "tmdb" : "id";

  if (left[0] === first && knownId) {
    // The real ID is known: it marks where the ID is, and what follows are season / episode.
    const at = numeric.find((i) => segs[i] === String(knownId));
    if (at !== undefined) {
      const after = numeric.filter((i) => i > at);
      segs[at] = token[first];
      left.shift();
      left.forEach((r, k) => {
        if (after[k] !== undefined) segs[after[k]] = token[r];
      });
      left.splice(0, Math.min(left.length, after.length));
    }
  }
  if (
    left.length &&
    numeric.length >= left.length &&
    left.every((r) =>
      /^\d+$/.test(
        segs[numeric[numeric.length - left.length + left.indexOf(r)]] ?? "x",
      ),
    )
  ) {
    left.forEach((r, k) => {
      segs[numeric[numeric.length - left.length + k]] = token[r];
    });
    left.length = 0;
  }

  // Not enough numbers in the path: look at the query (?ep=3&season=2).
  let query = m[3] ?? "";
  const keys: Record<string, string> = {
    ep: "ep|episode|e",
    season: "season|s",
    id: "id|anilist|anilist_id|ani",
    tmdb: "tmdb|tmdb_id|id",
  };
  for (const r of [...left]) {
    const re = new RegExp(`([?&#](?:${keys[r]})=)\\d+`, "i");
    if (re.test(query)) {
      query = query.replace(re, `$1${token[r]}`);
      left.splice(left.indexOf(r), 1);
    }
  }
  if (left.length) return null;
  const out = m[1] + segs.join("/") + query;
  return out === t ? null : out;
}

/** "Server 3" -> "server3". Unique inside one import. */
export function serverKeys(servers: ServerTemplate[]): string[] {
  const used = new Set<string>();
  return servers.map((s, i) => {
    let key =
      s.label.toLowerCase().replace(/[^a-z0-9]/g, "") || `server${i + 1}`;
    while (used.has(key)) key += "x";
    used.add(key);
    return key;
  });
}

/* ------------------------------------------------------------------- plan */

export type PlanEntry = {
  entry: FranchiseEntry;
  /** How many episodes this import will generate (1..count). */
  count: number;
  /** Why this entry needs a person to look at it, or null. */
  review: string | null;
  /** True when the show is still airing (more can be appended later). */
  ongoing: boolean;
  /** The TMDB series this import uses, and where each episode (1..count) sits in it. */
  tmdbId?: number;
  tmdbMap?: (TmdbPos | undefined)[];
  /** For a movie: its TMDB movie id (movie links like …/embed/movie/{tmdb}). */
  tmdbMovieId?: number;
};

/**
 * How many episodes to generate for an entry:
 *  - finished: AniList's episode count;
 *  - still airing: only what has aired so far (never past the final count when it is known);
 *  - nothing listed / not aired yet: 0, flagged for manual review (a number can be typed in).
 */
export function planEntry(entry: FranchiseEntry, manual?: number): PlanEntry {
  const ongoing = entry.status === "RELEASING";
  let count = 0;
  let review: string | null = null;
  if (ongoing) {
    const aired = entry.airedThrough ?? entry.episodes ?? 0;
    count = entry.episodes ? Math.min(entry.episodes, aired) : aired;
    if (count < 1) review = "Airing, but no aired episodes are listed yet.";
  } else if (entry.status === "NOT_YET_RELEASED") {
    review = "Not aired yet.";
  } else if (
    !entry.episodes &&
    entry.format === "MOVIE" &&
    entry.status === "FINISHED"
  ) {
    count = 1;
  } else if (!entry.episodes) {
    review = "AniList lists no episode count.";
  } else {
    count = entry.episodes;
  }
  if (manual && manual > 0)
    return { entry, count: manual, review: null, ongoing };
  return { entry, count, review, ongoing };
}

export const slugify = (text: string, fallback = "series") =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;

export type LinkPair = { dub?: string; sub?: string };

export type EpisodeRecord = {
  number: number;
  anilistId: number;
  tmdbId?: number;
  tmdbSeason?: number;
  tmdbEpisode?: number;
  servers: Record<string, LinkPair>;
};

export type BuildSource = {
  anilistId: number;
  tmdbId?: number;
  /** Where site episode n sits in TMDB (season + episode inside it), if anywhere. */
  tmdbAt?: (n: number) => TmdbPos | undefined;
  /** This entry is a movie: servers with a movie link (no {ep}) apply to it. */
  movie?: boolean;
  /** The TMDB MOVIE id of this entry (different from the TMDB series id). */
  tmdbMovieId?: number;
};

/**
 * Episodes from..to for one entry. Every server gets a dub and a sub link:
 *  - AniList servers use the AniList ID and the site's episode number;
 *  - TMDB servers use the TMDB ID, the TMDB season and the episode inside that season
 *    (an episode TMDB has no place for simply gets no link on that server).
 */
export function buildEpisodes(
  src: BuildSource,
  from: number,
  to: number,
  servers: ServerTemplate[],
): {
  records: EpisodeRecord[];
  labelled: { number: number; links: Record<string, LinkPair> }[];
} {
  const keys = serverKeys(servers);
  const records: EpisodeRecord[] = [];
  const labelled: { number: number; links: Record<string, LinkPair> }[] = [];
  for (let n = from; n <= to; n++) {
    const rec: EpisodeRecord = {
      number: n,
      anilistId: src.anilistId,
      servers: {},
    };
    const pos = src.tmdbAt?.(n);
    if (src.tmdbId) rec.tmdbId = src.tmdbId;
    if (pos) {
      rec.tmdbSeason = pos.season;
      rec.tmdbEpisode = pos.episode;
    }
    const links: Record<string, LinkPair> = {};
    servers.forEach((s, i) => {
      const l = linksOf(s);
      const mode = modeOf(s);
      const make = (tpl: string, track: "sub" | "dub"): string | undefined => {
        if (isMovieLink(tpl)) {
          // One fixed link per movie, so it only belongs on the first (only) episode of a movie.
          if (!src.movie || n !== 1) return undefined;
          if (mode === "tmdb") {
            if (!src.tmdbMovieId) return undefined;
            return fillTemplate(
              tpl,
              { anilist: src.anilistId, tmdb: src.tmdbMovieId, season: 1 },
              1,
              track,
            );
          }
          return fillTemplate(tpl, { anilist: src.anilistId }, 1, track);
        }
        if (mode === "tmdb") {
          if (!src.tmdbId || !pos) return undefined;
          return fillTemplate(
            tpl,
            { anilist: src.anilistId, tmdb: src.tmdbId, season: pos.season },
            pos.episode,
            track,
          );
        }
        return fillTemplate(tpl, { anilist: src.anilistId }, n, track);
      };
      const pair: LinkPair = {};
      const dub = l.dub ? make(l.dub, "dub") : undefined;
      const sub = l.sub ? make(l.sub, "sub") : undefined;
      if (dub) pair.dub = dub;
      if (sub) pair.sub = sub;
      if (!pair.dub && !pair.sub) return;
      rec.servers[keys[i]] = pair;
      links[s.label] = pair;
    });
    records.push(rec);
    labelled.push({ number: n, links });
  }
  return { records, labelled };
}

export const isMovieEntry = (p: PlanEntry) => p.entry.format === "MOVIE";

export const sourceOf = (p: PlanEntry): BuildSource => ({
  anilistId: p.entry.id,
  ...(p.tmdbId ? { tmdbId: p.tmdbId } : {}),
  ...(p.tmdbMovieId ? { tmdbMovieId: p.tmdbMovieId } : {}),
  movie: isMovieEntry(p),
  tmdbAt: (n) => p.tmdbMap?.[n - 1],
});

/** How many episodes of this entry one link of a server ends up on. */
export function linkEpisodeCount(
  p: PlanEntry,
  s: ServerTemplate,
  track: "sub" | "dub",
): number {
  const tpl = linksOf(s)[track];
  if (!tpl) return 0;
  const tmdb = modeOf(s) === "tmdb";
  if (isMovieLink(tpl))
    return isMovieEntry(p) && (!tmdb || p.tmdbMovieId) ? 1 : 0;
  return tmdb ? (p.tmdbMap?.filter(Boolean).length ?? 0) : p.count;
}

/** Why an entry can't be generated with these servers (no TMDB series chosen), or null. */
export function planProblem(
  p: PlanEntry,
  servers: ServerTemplate[],
): string | null {
  const tmdbServers = servers.filter((s) => modeOf(s) === "tmdb");
  if (!tmdbServers.length) return null;
  if (isMovieEntry(p)) {
    // A movie needs its TMDB MOVIE id for a movie link; episode-style TMDB links simply skip movies.
    if (tmdbServers.some(hasMovieLink) && !p.tmdbMovieId)
      return "needs a TMDB movie ID";
    if (
      tmdbServers.some(hasSeriesLink) &&
      !p.tmdbId &&
      !tmdbServers.some(hasMovieLink)
    )
      return "needs a TMDB series";
    return null;
  }
  if (tmdbServers.some(hasSeriesLink) && !p.tmdbId)
    return "needs a TMDB series";
  return null;
}

/* ------------------------------------------------------------------ write */

export type ImportProgress = { done: number; total: number; step: string };

type Fs = typeof import("firebase/firestore");

const refOf = (entry: FranchiseEntry): AnimeRef => ({
  anilistId: entry.id,
  title: titleOf(entry),
  poster: entry.poster,
  banner: entry.banner,
  about: entry.about,
  genres: entry.genres,
  year: entry.year,
  format: entry.format,
  status: entry.status,
});

/** Run writes in chunks of BATCH_LIMIT (one Firestore batch each). Safe to repeat: ids are fixed. */
async function writeChunks(
  fs: Fs,
  db: Awaited<ReturnType<typeof getDb>>,
  writes: { path: string[]; data: Record<string, unknown> }[],
  onChunk: (written: number) => void,
) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = fs.writeBatch(db);
    for (const w of writes.slice(i, i + BATCH_LIMIT)) {
      const [first, ...rest] = w.path;
      batch.set(fs.doc(db, first, ...rest), w.data, { merge: true });
    }
    await batch.commit();
    onChunk(Math.min(writes.length, i + BATCH_LIMIT));
  }
}

export type ImportInput = {
  franchiseId: string;
  franchiseTitle: string;
  plans: PlanEntry[];
  servers: ServerTemplate[];
  /** The series' TMDB ID, kept on the series record so later imports start from it. */
  tmdbId?: number;
  /** Also publish to the live player lists (on by default). */
  publish: boolean;
  keepExisting: boolean;
  /**
   * Existing links are kept unless a server + track is listed here (key: server name in lower case).
   * Listed slots get the new link. Servers and tracks not listed are never changed.
   */
  replaceSlots?: Record<string, { sub?: boolean; dub?: boolean }>;
};

export type ImportSummary = {
  seasons: number;
  episodes: number;
  batches: number;
  published: number;
};

export async function importFranchise(
  input: ImportInput,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportSummary> {
  const { franchiseId, plans, servers } = input;
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const keys = serverKeys(servers);
  const total = plans.reduce((n, p) => n + p.count, 0);

  // 1. The parent record and one document per season.
  const head: { path: string[]; data: Record<string, unknown> }[] = [
    {
      path: [SERIES, franchiseId],
      data: {
        franchiseId,
        title: input.franchiseTitle.trim().slice(0, 200),
        ...(input.tmdbId ? { tmdbId: input.tmdbId } : {}),
        seasonIds: fs.arrayUnion(...plans.map((p) => p.entry.id)),
        servers: Object.fromEntries(
          servers.map((s, i) => {
            const l = linksOf(s);
            return [
              keys[i],
              {
                label: s.label,
                mode: modeOf(s),
                subLink: l.sub,
                dubLink: l.dub,
                template: l.sub || l.dub,
                sub: !!l.sub,
                dub: !!l.dub,
              },
            ];
          }),
        ),
        updatedAt: fs.serverTimestamp(),
      },
    },
    ...plans.map((p, i) => ({
      path: [SERIES, franchiseId, "seasons", String(p.entry.id)],
      data: {
        anilistId: p.entry.id,
        title: titleOf(p.entry),
        format: p.entry.format,
        status: p.entry.status,
        year: p.entry.year,
        order: i + 1,
        ...(p.tmdbId ? { tmdbId: p.tmdbId } : {}),
        ...(p.tmdbMovieId ? { tmdbMovieId: p.tmdbMovieId } : {}),
        ...(p.tmdbMap?.find(Boolean)
          ? {
              tmdbSeason: p.tmdbMap.find(Boolean)!.season,
              tmdbStartEpisode: p.tmdbMap.find(Boolean)!.episode,
            }
          : {}),
        episodeCount: p.entry.episodes ?? p.count,
        importedThrough: p.count,
        ongoing: p.ongoing,
        updatedAt: fs.serverTimestamp(),
      },
    })),
  ];

  // What the live player lists already hold, so the admin records follow the same keep/replace choice.
  const keep = (server: string, lang: "sub" | "dub") => {
    const r = input.replaceSlots?.[server.trim().toLowerCase()];
    return !(r && r[lang]);
  };
  const liveBy = new Map<
    number,
    Map<number, ReturnType<typeof parseEpisodeMap>[number]>
  >();
  if (input.publish)
    for (const p of plans) {
      const snap = await fs.getDoc(
        fs.doc(db, "episodeLists", String(p.entry.id)),
      );
      liveBy.set(
        p.entry.id,
        new Map(parseEpisodeMap(snap.data()).map((e) => [e.number, e])),
      );
    }
  const labelOf = new Map(keys.map((k, i) => [k, servers[i].label]));
  const liveLink = (
    ep: ReturnType<typeof parseEpisodeMap>[number] | undefined,
    label: string,
    lang: "sub" | "dub",
  ) => {
    if (!ep) return undefined;
    const f = lang === "sub" ? "subUrl" : "dubUrl";
    if (label.trim().toLowerCase() === "server 1") return ep[f];
    const name = Object.keys(ep.servers ?? {}).find(
      (n) => n.toLowerCase() === label.trim().toLowerCase(),
    );
    return name ? ep.servers?.[name]?.[f] : undefined;
  };

  // 2. Every episode of every season.
  const episodeWrites = plans.flatMap((p) =>
    buildEpisodes(sourceOf(p), 1, p.count, servers)
      .records.map((rec) => {
        for (const [key, pair] of Object.entries(rec.servers)) {
          const label = labelOf.get(key) ?? key;
          for (const lang of ["sub", "dub"] as const) {
            const old = liveLink(
              liveBy.get(p.entry.id)?.get(rec.number),
              label,
              lang,
            );
            if (old && pair[lang] && old !== pair[lang] && keep(label, lang))
              delete pair[lang];
          }
          if (!pair.sub && !pair.dub) delete rec.servers[key];
        }
        return rec;
      })
      .map((rec) => ({
        path: [
          SERIES,
          franchiseId,
          "seasons",
          String(p.entry.id),
          "episodes",
          String(rec.number),
        ],
        data: { ...rec, updatedAt: fs.serverTimestamp() },
      })),
  );

  const all = [...head, ...episodeWrites];
  let batches = 0;
  onProgress({ done: 0, total: all.length, step: "Saving episodes" });
  await writeChunks(fs, db, all, (written) => {
    batches++;
    onProgress({ done: written, total: all.length, step: "Saving episodes" });
  });

  // 3. The live lists the player reads.
  let published = 0;
  if (input.publish) {
    for (const [i, p] of plans.entries()) {
      if (p.count < 1) continue;
      onProgress({
        done: all.length,
        total: all.length,
        step: `Publishing ${titleOf(p.entry)} (${i + 1}/${plans.length})`,
      });
      const built = buildEpisodes(sourceOf(p), 1, p.count, servers);
      const labelled: GeneratedRow[] = built.labelled;
      // Give every episode its own picture and name from TMDB where the title is mapped to a TMDB season.
      try {
        const cache = new Map<
          string,
          Awaited<ReturnType<typeof getSeasonStills>>
        >();
        for (const rec of built.records) {
          if (
            !rec.tmdbId ||
            rec.tmdbSeason === undefined ||
            rec.tmdbEpisode === undefined
          )
            continue;
          const key = `${rec.tmdbId}:${rec.tmdbSeason}`;
          if (!cache.has(key))
            cache.set(
              key,
              await getSeasonStills(rec.tmdbId, rec.tmdbSeason).catch(
                () => new Map(),
              ),
            );
          const info = cache.get(key)?.get(rec.tmdbEpisode);
          const row = labelled.find((r) => r.number === rec.number);
          if (info && row) {
            if (info.still) row.thumbnail = info.still;
            if (info.name && !/^episode\s*\d+$/i.test(info.name))
              row.title = info.name;
          }
        }
      } catch {
        /* pictures are a bonus; the links are what matter */
      }
      const r = await publishGenerated(
        refOf(p.entry),
        labelled,
        input.keepExisting ? keep : false,
      );
      published += r.added + r.replaced;
    }
  }
  return { seasons: plans.length, episodes: total, batches, published };
}

/* ----------------------------------------------------- append new episodes */

export type OngoingSeason = {
  franchiseId: string;
  anilistId: number;
  title: string;
  importedThrough: number;
  tmdbId?: number;
  tmdbSeason?: number;
};

/** Seasons that were imported while still airing. */
export async function listOngoing(): Promise<OngoingSeason[]> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const all = await fs.getDocs(fs.collection(db, SERIES));
  const out: OngoingSeason[] = [];
  for (const series of all.docs) {
    const seasons = await fs.getDocs(
      fs.query(
        fs.collection(db, SERIES, series.id, "seasons"),
        fs.where("ongoing", "==", true),
      ),
    );
    for (const d of seasons.docs) {
      const x = d.data();
      out.push({
        franchiseId: series.id,
        anilistId: Number(x.anilistId),
        title: String(x.title ?? d.id),
        importedThrough: Number(x.importedThrough ?? 0),
        ...(Number(x.tmdbId) > 0 ? { tmdbId: Number(x.tmdbId) } : {}),
        ...(Number.isSafeInteger(Number(x.tmdbSeason)) &&
        x.tmdbSeason !== undefined &&
        x.tmdbSeason !== null
          ? { tmdbSeason: Number(x.tmdbSeason) }
          : {}),
      });
    }
  }
  return out;
}

/**
 * Add the episodes that aired since the last import, using the server templates saved on the
 * series. Returns how many were added (0 means nothing new yet).
 */
export async function appendNewEpisodes(
  season: OngoingSeason,
  publish = true,
): Promise<number> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const seriesSnap = await fs.getDoc(fs.doc(db, SERIES, season.franchiseId));
  const stored = (seriesSnap.data()?.servers ?? {}) as Record<
    string,
    Partial<ServerTemplate>
  >;
  const servers: ServerTemplate[] = Object.values(stored).flatMap((s) =>
    s.label && (s.subLink || s.dubLink || s.template)
      ? [{ ...s, label: s.label } as ServerTemplate]
      : [],
  );
  if (!servers.length)
    throw new Error("This series has no saved server templates.");

  const crawl = await crawlFranchise(season.anilistId);
  const entry = crawl.entries.find((e) => e.id === season.anilistId);
  if (!entry) throw new Error("AniList didn't return this title.");
  const plan = planEntry(entry);
  if (plan.count <= season.importedThrough) return 0;

  // TMDB servers carry on from the last episode that was imported (season + episode inside it).
  const tmdbId = season.tmdbId;
  const positions = new Map<number, TmdbPos>();
  if (tmdbId && usesTmdb(servers)) {
    const last = await fs.getDoc(
      fs.doc(
        db,
        SERIES,
        season.franchiseId,
        "seasons",
        String(season.anilistId),
        "episodes",
        String(season.importedThrough),
      ),
    );
    const l = last.data();
    if (
      l &&
      typeof l.tmdbSeason === "number" &&
      typeof l.tmdbEpisode === "number"
    ) {
      const series = await getTmdbSeries(tmdbId);
      let pos: TmdbPos | undefined = {
        season: l.tmdbSeason,
        episode: l.tmdbEpisode,
      };
      for (let n = season.importedThrough + 1; n <= plan.count; n++) {
        pos = pos ? nextPos(series, pos) : undefined;
        if (pos) positions.set(n, pos);
      }
    }
  }

  const { records, labelled } = buildEpisodes(
    {
      anilistId: season.anilistId,
      ...(tmdbId ? { tmdbId } : {}),
      tmdbAt: (n) => positions.get(n),
    },
    season.importedThrough + 1,
    plan.count,
    servers,
  );
  const writes = records.map((rec) => ({
    path: [
      SERIES,
      season.franchiseId,
      "seasons",
      String(season.anilistId),
      "episodes",
      String(rec.number),
    ],
    data: { ...rec, updatedAt: fs.serverTimestamp() },
  }));
  await writeChunks(fs, db, writes, () => undefined);
  await fs.setDoc(
    fs.doc(db, SERIES, season.franchiseId, "seasons", String(season.anilistId)),
    {
      importedThrough: plan.count,
      episodeCount: entry.episodes ?? plan.count,
      status: entry.status,
      ongoing: plan.ongoing,
      updatedAt: fs.serverTimestamp(),
    },
    { merge: true },
  );
  if (publish) await publishGenerated(refOf(entry), labelled, true);
  return plan.count - season.importedThrough;
}

/* ------------------------------------------------- what was imported already */

export type ImportedSeries = {
  id: string;
  title: string;
  tmdbId?: number;
  servers: {
    key: string;
    label: string;
    sub: string;
    dub: string;
    mode: LinkMode;
  }[];
  seasons: {
    anilistId: number;
    title: string;
    tmdbId?: number;
    tmdbSeason?: number;
  }[];
};

/** The saved bulk-import record of every franchise that contains this AniList title (usually one). */
export async function loadImportedSeries(
  anilistId: number,
): Promise<ImportedSeries[]> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const found = await fs.getDocs(
    fs.query(
      fs.collection(db, SERIES),
      fs.where("seasonIds", "array-contains", anilistId),
    ),
  );
  const out: ImportedSeries[] = [];
  for (const d of found.docs) {
    const x = d.data();
    const stored = (x.servers ?? {}) as Record<string, Partial<ServerTemplate>>;
    const seasonDocs = await fs.getDocs(
      fs.collection(db, SERIES, d.id, "seasons"),
    );
    out.push({
      id: d.id,
      title: String(x.title ?? d.id),
      ...(Number(x.tmdbId) > 0 ? { tmdbId: Number(x.tmdbId) } : {}),
      servers: Object.entries(stored).map(([key, v]) => ({
        key,
        label: String(v.label ?? key),
        ...linksOf(v as ServerTemplate),
        mode: (v.mode === "tmdb" ? "tmdb" : "anilist") as LinkMode,
      })),
      seasons: seasonDocs.docs.map((s) => ({
        anilistId: Number(s.data().anilistId ?? s.id),
        title: String(s.data().title ?? s.id),
        ...(Number(s.data().tmdbId) > 0
          ? { tmdbId: Number(s.data().tmdbId) }
          : {}),
        ...(typeof s.data().tmdbSeason === "number"
          ? { tmdbSeason: Number(s.data().tmdbSeason) }
          : {}),
      })),
    });
  }
  return out;
}

/**
 * Remove one server from a whole imported series, and everything that came with it:
 *  - the server's template on the series record,
 *  - its links on every episode record of every season,
 *  - its links on the live player lists of every season (episodes left with no links are removed).
 * Safe to run again if it stops part-way.
 */
export async function removeServerEverywhere(
  franchiseId: string,
  serverKey: string,
  onStep?: (text: string) => void,
): Promise<{ seasons: number; episodes: number }> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const seriesRef = fs.doc(db, SERIES, franchiseId);
  const seriesSnap = await fs.getDoc(seriesRef);
  if (!seriesSnap.exists())
    throw new Error("That series isn't in the database any more.");
  const stored = (seriesSnap.data().servers ?? {}) as Record<
    string,
    { label?: string }
  >;
  const label = String(stored[serverKey]?.label ?? serverKey);

  const seasons = await fs.getDocs(
    fs.collection(db, SERIES, franchiseId, "seasons"),
  );
  let episodes = 0;
  for (const [i, season] of seasons.docs.entries()) {
    onStep?.(
      `Removing ${label} from ${String(season.data().title ?? season.id)} (${i + 1}/${seasons.size})…`,
    );
    const eps = await fs.getDocs(
      fs.collection(db, SERIES, franchiseId, "seasons", season.id, "episodes"),
    );
    const numbers: number[] = [];
    for (let k = 0; k < eps.docs.length; k += BATCH_LIMIT) {
      const batch = fs.writeBatch(db);
      for (const e of eps.docs.slice(k, k + BATCH_LIMIT)) {
        batch.update(e.ref, { [`servers.${serverKey}`]: fs.deleteField() });
        const n = Number(e.data().number ?? e.id);
        if (Number.isSafeInteger(n)) numbers.push(n);
      }
      await batch.commit();
    }
    episodes += eps.size;
    // The live lists the player reads.
    const live = await getAnimeDoc(Number(season.id));
    if (live && numbers.length)
      await deleteEpisodes(animeToRef(live), numbers, undefined, label);
  }

  onStep?.("Updating the series record…");
  await fs.updateDoc(seriesRef, {
    [`servers.${serverKey}`]: fs.deleteField(),
    updatedAt: fs.serverTimestamp(),
  });
  return { seasons: seasons.size, episodes };
}

/**
 * Change one server for a whole imported series: its name, what it uses (AniList / TMDB) and its SUB / DUB
 * links. Every episode of every season is rebuilt from the IDs stored with it, on the series records and on the
 * live site, so a dead link is fixed once instead of season by season.
 */
export async function updateServerEverywhere(
  franchiseId: string,
  serverKey: string,
  next: ServerTemplate,
  onStep?: (text: string) => void,
): Promise<{ seasons: number; episodes: number; skipped: number }> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const seriesRef = fs.doc(db, SERIES, franchiseId);
  const seriesSnap = await fs.getDoc(seriesRef);
  if (!seriesSnap.exists())
    throw new Error("That series isn't in the database any more.");
  const stored = (seriesSnap.data().servers ?? {}) as Record<
    string,
    Partial<ServerTemplate>
  >;
  const oldLabel = String(stored[serverKey]?.label ?? serverKey);

  const label = next.label.trim();
  if (!label) throw new Error("Give the server a name.");
  if (
    Object.entries(stored).some(
      ([k, v]) =>
        k !== serverKey &&
        String(v.label ?? k)
          .trim()
          .toLowerCase() === label.toLowerCase(),
    )
  )
    throw new Error("Another server in this series already has that name.");
  const problem = serverProblems(next);
  if (problem.both || problem.sub || problem.dub)
    throw new Error(
      problem.both ?? problem.sub ?? problem.dub ?? "Check the links.",
    );
  const mode = modeOf(next);
  const links = linksOf(next);
  const seriesStyle = [links.sub, links.dub].some((l) => l && !isMovieLink(l));
  if (mode === "tmdb" && seriesStyle && !(Number(seriesSnap.data().tmdbId) > 0))
    throw new Error(
      "This series was imported without TMDB, so a TMDB server can't be built for it. Re-import it with the TMDB series chosen.",
    );

  const seasons = await fs.getDocs(
    fs.collection(db, SERIES, franchiseId, "seasons"),
  );
  let episodes = 0;
  let skipped = 0;
  for (const [i, season] of seasons.docs.entries()) {
    onStep?.(
      `Updating ${label} on ${String(season.data().title ?? season.id)} (${i + 1}/${seasons.size})…`,
    );
    const eps = await fs.getDocs(
      fs.collection(db, SERIES, franchiseId, "seasons", season.id, "episodes"),
    );
    const rows: { number: number; sub?: string; dub?: string }[] = [];
    for (let k = 0; k < eps.docs.length; k += BATCH_LIMIT) {
      const batch = fs.writeBatch(db);
      for (const e of eps.docs.slice(k, k + BATCH_LIMIT)) {
        const x = e.data();
        const number = Number(x.number ?? e.id);
        const anilist = Number(x.anilistId ?? season.id);
        let ids: Ids = { anilist };
        let ep = number;
        let usable = true;
        if (mode === "tmdb") {
          const tmdb = Number(x.tmdbId ?? seriesSnap.data().tmdbId);
          if (
            tmdb > 0 &&
            typeof x.tmdbSeason === "number" &&
            typeof x.tmdbEpisode === "number"
          ) {
            ids = { anilist, tmdb, season: x.tmdbSeason };
            ep = x.tmdbEpisode;
          } else usable = false;
        }
        const isMovieSeason = season.data().format === "MOVIE";
        const tmdbMovie = Number(season.data().tmdbMovieId);
        const make = (
          tpl: string,
          track: "sub" | "dub",
        ): string | undefined => {
          if (isMovieLink(tpl)) {
            if (!isMovieSeason || number !== 1) return undefined;
            if (mode === "tmdb")
              return tmdbMovie > 0
                ? fillTemplate(
                    tpl,
                    { anilist, tmdb: tmdbMovie, season: 1 },
                    1,
                    track,
                  )
                : undefined;
            return fillTemplate(tpl, { anilist }, 1, track);
          }
          return usable ? fillTemplate(tpl, ids, ep, track) : undefined;
        };
        const pair: LinkPair = {};
        const newSub = links.sub ? make(links.sub, "sub") : undefined;
        const newDub = links.dub ? make(links.dub, "dub") : undefined;
        if (newSub) pair.sub = newSub;
        if (newDub) pair.dub = newDub;
        if (Object.keys(pair).length)
          batch.update(e.ref, { [`servers.${serverKey}`]: pair });
        else {
          batch.update(e.ref, { [`servers.${serverKey}`]: fs.deleteField() });
          skipped++;
        }
        if (Number.isSafeInteger(number)) rows.push({ number, ...pair });
      }
      await batch.commit();
    }
    episodes += eps.size;
    const live = await getAnimeDoc(Number(season.id));
    if (live) await rewriteServerLinks(animeToRef(live), oldLabel, label, rows);
  }

  onStep?.("Updating the series record…");
  await fs.updateDoc(seriesRef, {
    [`servers.${serverKey}`]: {
      label,
      mode,
      subLink: links.sub,
      dubLink: links.dub,
      template: links.sub || links.dub,
      sub: !!links.sub,
      dub: !!links.dub,
    },
    updatedAt: fs.serverTimestamp(),
  });
  return { seasons: seasons.size, episodes, skipped };
}
