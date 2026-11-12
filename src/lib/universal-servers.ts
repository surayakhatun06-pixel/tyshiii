import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cleanServerName,
  episodeSources,
  isCustomId,
  type Source,
} from "@/lib/cloud-episodes";
import { firebaseConfigured, getDb } from "@/lib/firebase";
import { toEmbed } from "@/lib/video-embed";
import { orderedEpisodes, type SavedVideo } from "@/hooks/use-videos";

/**
 * UNIVERSAL SERVERS
 *
 * Link patterns are saved ONCE for the whole site (Firebase: siteConfig/universalServers).
 * For any anime the site fills a pattern with the anime's ID and the episode number when someone
 * clicks, so nothing is saved per episode. A link saved by hand in Firebase always wins.
 *
 * Placeholders (any of these spellings work, in any letter case):
 *   {id}      the ID this server uses (AniList ID, or TMDB ID for a TMDB server)
 *   {ep}      the episode number            (also {episode})
 *   {season}  the TMDB season               (also {s})
 *   {anilistId} {tmdbId}  a specific ID, whichever the server type is
 */

/* ------------------------------------------------------------------ settings */

export type IdType = "anilist" | "tmdb";

export type UniversalServer = {
  /** The name on the server button, for example "Server 1". */
  name: string;
  enabled: boolean;
  /** Which ID this server needs to build its links. */
  idType: IdType;
  subPattern: string;
  dubPattern: string;
};

export type UniversalSettings = { servers: UniversalServer[] };

/** A new settings screen starts with this many empty servers. There is no upper limit below MAX. */
export const DEFAULT_SERVER_COUNT = 3;
export const MAX_UNIVERSAL_SERVERS = 12;
export const PLACEHOLDERS = ["{id}", "{ep}", "{season}"];

const SETTINGS_PATH = ["siteConfig", "universalServers"] as const;
const MATCHES_PATH = ["siteConfig", "universalTmdb"] as const;
const MAX_PATTERN = 2000;

export const blankServer = (n: number): UniversalServer => ({
  name: `Server ${n}`,
  enabled: false,
  idType: "anilist",
  subPattern: "",
  dubPattern: "",
});

export const emptySettings = (): UniversalSettings => ({
  servers: Array.from({ length: DEFAULT_SERVER_COUNT }, (_, i) => blankServer(i + 1)),
});

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Turn whatever Firebase returned into clean servers. Never throws. */
export function parseSettings(data: unknown): UniversalSettings {
  const list = (data as { servers?: unknown } | null | undefined)?.servers;
  if (!Array.isArray(list)) return emptySettings();
  const servers: UniversalServer[] = [];
  for (const raw of list.slice(0, MAX_UNIVERSAL_SERVERS)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    servers.push({
      name: cleanServerName(text(r.name, 60)) || `Server ${servers.length + 1}`,
      enabled: r.enabled === true,
      idType: r.idType === "tmdb" ? "tmdb" : "anilist",
      subPattern: text(r.subPattern, MAX_PATTERN),
      dubPattern: text(r.dubPattern, MAX_PATTERN),
    });
  }
  // Always leave room to type: pad with empty servers up to the default count.
  while (servers.length < DEFAULT_SERVER_COUNT) servers.push(blankServer(servers.length + 1));
  return { servers };
}

/** Unique, safe button labels (two servers with the same name get a number). */
export function serverLabels(settings: UniversalSettings): string[] {
  const used = new Set<string>();
  return settings.servers.map((s, i) => {
    let label = cleanServerName(s.name) || `Server ${i + 1}`;
    if (used.has(label.toLowerCase())) label = `${label} ${i + 1}`;
    used.add(label.toLowerCase());
    return label;
  });
}

/** Warnings shown when saving. They never block the save. */
export function settingWarnings(settings: UniversalSettings): string[] {
  const out: string[] = [];
  settings.servers.forEach((s, i) => {
    const who = s.name.trim() || `Server ${i + 1}`;
    for (const [label, pattern] of [
      ["SUB", s.subPattern],
      ["DUB", s.dubPattern],
    ] as const) {
      if (!pattern.trim()) continue;
      const { tokens, unknown } = readTokens(pattern);
      const needsId =
        s.idType === "tmdb"
          ? ["id", "tmdbId"].some((t) => tokens.has(t as TokenName))
          : ["id", "anilistId"].some((t) => tokens.has(t as TokenName));
      if (!needsId)
        out.push(
          `${who} ${label}: the link has no {id}, but this server uses the ${s.idType === "tmdb" ? "TMDB" : "AniList"} ID.`,
        );
      for (const u of unknown) out.push(`${who} ${label}: {${u}} is not a known placeholder.`);
      if (/^\s*http:\/\//i.test(pattern))
        out.push(`${who} ${label}: this link starts with http://. Browsers block it on a secure site, so use https://.`);
      const sample = buildLink(pattern, { id: 1, anilistId: 1, tmdbId: 1, season: 1, episode: 1 });
      if (!unknown.length && !sample)
        out.push(`${who} ${label}: this can't be turned into a playable link. Check it.`);
    }
  });
  return out;
}

/* Settings are read ONCE and kept in memory; every screen shares this copy. */
let current: UniversalSettings | null = null;
let loading: Promise<UniversalSettings> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

async function fetchSettings(): Promise<UniversalSettings> {
  if (!firebaseConfigured) return emptySettings();
  const [fs, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  const snap = await fs.getDoc(fs.doc(db, ...SETTINGS_PATH));
  return snap.exists() ? parseSettings(snap.data()) : emptySettings();
}

/**
 * Read the settings document (once). If it can't be read, the site simply has no Universal
 * Servers. After 4 seconds the page stops waiting; the settings still switch on if they arrive later.
 */
export function loadUniversalSettings(force = false): Promise<UniversalSettings> {
  if (current && !force) return Promise.resolve(current);
  if (loading && !force) return loading;
  const real = fetchSettings()
    .then((s) => {
      current = s;
      notify();
      return s;
    })
    .catch((error) => {
      console.warn("Universal Servers settings could not be read:", error);
      if (!current) {
        current = emptySettings();
        notify();
      }
      return current;
    });
  const waited = Promise.race([
    real,
    new Promise<UniversalSettings>((resolve) =>
      window.setTimeout(() => {
        if (!current) {
          current = emptySettings();
          notify();
        }
        resolve(current);
      }, 4000),
    ),
  ]);
  loading = waited.finally(() => {
    loading = null;
  });
  return loading;
}

/** Save the one settings document (admin only; the Firebase rules enforce that). */
export async function saveUniversalSettings(next: UniversalSettings): Promise<void> {
  if (!firebaseConfigured) throw new Error("Firebase isn't configured for this site yet.");
  const clean = parseSettings(next);
  const [fs, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  await fs.setDoc(fs.doc(db, ...SETTINGS_PATH), {
    servers: clean.servers,
    updatedAt: fs.serverTimestamp(),
  });
  current = clean;
  notify();
}

const NONE = emptySettings();

/** React hook: the settings (empty until loaded) and whether loading has finished. */
export function useUniversalSettings() {
  const [settings, setSettings] = useState<UniversalSettings | null>(current);
  useEffect(() => {
    const sync = () => setSettings(current);
    listeners.add(sync);
    sync();
    void loadUniversalSettings();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return { settings: settings ?? NONE, ready: settings !== null };
}

/* -------------------------------------------------------------- building links */

export type LinkIds = {
  /** The ID this server uses (AniList for an AniList server, TMDB for a TMDB server). */
  id?: number;
  anilistId?: number;
  tmdbId?: number;
  season?: number;
  episode?: number;
};

type TokenName = keyof LinkIds;

/** Every spelling that is accepted, lower case with spaces, dashes and underscores removed. */
const ALIASES: Record<string, TokenName> = {
  id: "id",
  ep: "episode",
  episode: "episode",
  epnumber: "episode",
  episodenumber: "episode",
  anilistid: "anilistId",
  anilist: "anilistId",
  aid: "anilistId",
  tmdbid: "tmdbId",
  tmdb: "tmdbId",
  season: "season",
  s: "season",
};

const canonical = (word: string): TokenName | undefined =>
  ALIASES[word.toLowerCase().replace(/[\s_-]/g, "")];

/** Make the different bracket styles look the same: ${id}  {{id}}  [id]  ->  {id} */
function unifyBrackets(pattern: string): string {
  return pattern
    .replace(/\$\{/g, "{")
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, "{$1}")
    .replace(/\[\s*(id|ep|episode|season|anilist_?id|tmdb_?id)\s*\]/gi, "{$1}");
}

/** Which placeholders a pattern uses (and which words it uses that we do not know). */
export function readTokens(pattern: string): { tokens: Set<TokenName>; unknown: string[] } {
  const tokens = new Set<TokenName>();
  const unknown: string[] = [];
  for (const m of unifyBrackets(pattern).matchAll(/\{\s*([A-Za-z][A-Za-z _-]{0,20})\s*\}/g)) {
    const name = canonical(m[1]);
    if (name) tokens.add(name);
    else if (!unknown.includes(m[1])) unknown.push(m[1]);
  }
  return { tokens, unknown };
}

/**
 * Fill a pattern with numbers. Pure text work, no network. The result is read by the same code the
 * player uses, so anything the player can open works: a plain link, a link without https://, or even a
 * pasted <iframe ...> embed code. Returns null when the link can't be built (empty pattern, a needed
 * number is missing, an unknown {word} is left over, or it is not a usable link), so a broken link is
 * never shown.
 */
export function buildLink(pattern: string, ids: LinkIds): string | null {
  const p = unifyBrackets(pattern).trim();
  if (!p) return null;
  let missing = false;
  const filled = p.replace(/\{\s*([A-Za-z][A-Za-z _-]{0,20})\s*\}/g, (all, word: string) => {
    const name = canonical(word);
    if (!name) return all; // unknown word: left as it is, caught below
    const value = ids[name];
    if (value === undefined || !Number.isFinite(value)) {
      missing = true;
      return "";
    }
    return String(value);
  });
  if (missing || /\{[^{}]*\}/.test(filled)) return null;
  return toEmbed(filled)?.src ?? null;
}

/** Where each episode sits on TMDB: [season, episode inside that season], or null. */
export type TmdbInfo = {
  tmdbId: number;
  positions: ([number, number] | null)[];
};

/** What the link builder knows about one anime. */
export type UniversalCtx = {
  anilistId: number;
  tmdb?: TmdbInfo | null;
};

const usesTmdbTokens = (s: UniversalServer) => {
  const { tokens } = readTokens(`${s.subPattern} ${s.dubPattern}`);
  return tokens.has("tmdbId") || tokens.has("season");
};

/** Does this server need a TMDB match to build its links? */
const serverNeedsTmdb = (s: UniversalServer) => s.idType === "tmdb" || usesTmdbTokens(s);

const hasPattern = (s: UniversalServer) => Boolean(s.subPattern.trim() || s.dubPattern.trim());

/** True when at least one server is switched on and has a pattern. */
export const hasUniversalServers = (settings: UniversalSettings | null) =>
  Boolean(settings?.servers.some((s) => s.enabled && hasPattern(s)));

/** True when a TMDB lookup is needed to build any of the links. */
export const settingsNeedTmdb = (settings: UniversalSettings) =>
  settings.servers.some(
    (s) => s.enabled && hasPattern(s) && (s.idType === "tmdb" || usesTmdbTokens(s)),
  );

/** The numbers one server needs for one site episode, or null when they can't be found. */
function idsFor(server: UniversalServer, ctx: UniversalCtx, n: number): LinkIds | null {
  const pos = ctx.tmdb?.positions[n - 1] ?? null;
  const ids: LinkIds = { anilistId: ctx.anilistId, id: ctx.anilistId };
  if (ctx.tmdb && pos) {
    ids.tmdbId = ctx.tmdb.tmdbId;
    ids.season = pos[0];
  }
  if (server.idType === "tmdb") {
    // TMDB numbers its episodes inside each season, so use TMDB's own season and episode.
    if (!pos) return null;
    ids.id = ctx.tmdb?.tmdbId;
    ids.episode = pos[1];
  } else {
    ids.episode = n;
  }
  return ids;
}

/** Every playable (server, language, link) that the Universal Servers can build for an episode. */
export function universalSourcesFor(
  settings: UniversalSettings,
  ctx: UniversalCtx,
  episode: number,
): Source[] {
  const labels = serverLabels(settings);
  const out: Source[] = [];
  settings.servers.forEach((s, i) => {
    if (!s.enabled || !hasPattern(s)) return;
    const ids = idsFor(s, ctx, episode);
    if (!ids) return; // a needed ID was not found: hide this server for this anime
    for (const lang of ["sub", "dub"] as const) {
      const url = buildLink(lang === "sub" ? s.subPattern : s.dubPattern, ids);
      if (url) out.push({ server: labels[i], lang, url });
    }
  });
  return out;
}

/**
 * Manual links first (they win), then Universal links for any server + language that has no
 * manual link. A manual "Server 1 SUB" hides the Universal "Server 1 SUB" but not its DUB.
 */
export function mergeSources(manual: Source[], universal: Source[]): Source[] {
  const taken = new Set(manual.map((s) => `${s.server.toLowerCase()}|${s.lang}`));
  return [
    ...manual,
    ...universal.filter((u) => !taken.has(`${u.server.toLowerCase()}|${u.lang}`)),
  ];
}

/* ------------------------------------------------------------- episode lists */

type CountInput = {
  episodes: number | null;
  status: string | null;
  format: string | null;
  nextAiringEpisode: { episode: number } | null;
};

/**
 * How many episodes are available right now, from AniList: finished shows use the full total;
 * running shows only what has aired; nothing known gives 0 (so no wrong number is ever shown).
 */
export function guessEpisodeCount(m: CountInput): number {
  const cap = (n: number) => Math.max(0, Math.min(3000, Math.floor(n)));
  // A movie is always one title, however many "episodes" (chapters, segments) AniList lists for it.
  if (m.format === "MOVIE") return m.status === "NOT_YET_RELEASED" ? 0 : 1;
  if (m.status === "RELEASING") {
    const aired = m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : (m.episodes ?? 0);
    return cap(m.episodes ? Math.min(m.episodes, aired) : aired);
  }
  if (m.status === "NOT_YET_RELEASED") return 0;
  if (!m.episodes) return m.format === "MOVIE" && m.status === "FINISHED" ? 1 : 0;
  return cap(m.episodes);
}

/**
 * Add the episodes that only the Universal Servers can play (numbers 1..count with nothing saved
 * in Firebase). Episodes saved by hand are never replaced.
 */
export function withUniversalEpisodes(
  manual: SavedVideo[],
  o: { animeId: number; count: number; settings: UniversalSettings; ctx: UniversalCtx },
): SavedVideo[] {
  if (o.count < 1 || isCustomId(o.animeId) || !hasUniversalServers(o.settings)) return manual;
  const have = new Set<number>();
  for (const v of manual)
    if (v.animeId === o.animeId && v.episode !== undefined) have.add(v.episode);
  const extra: SavedVideo[] = [];
  for (let n = 1; n <= o.count; n++) {
    if (have.has(n)) continue;
    const first = universalSourcesFor(o.settings, o.ctx, n)[0];
    if (!first) continue;
    extra.push({
      id: `ep-${n}`,
      url: first.url,
      title: `Episode ${n}`,
      addedAt: 0,
      animeId: o.animeId,
      episode: n,
      cloud: true,
    });
  }
  return extra.length ? orderedEpisodes([...manual, ...extra], o.animeId) : manual;
}

/* ------------------------------------------------- TMDB matches (admin-confirmed) */

/** anilistId -> the TMDB series the admin chose. tmdbId 0 means "no match": hide TMDB servers. */
export type TmdbMatches = Record<string, { tmdbId: number; name?: string }>;

let matches: TmdbMatches | null = null;
let matchesLoading: Promise<TmdbMatches> | null = null;

/** Read the confirmed TMDB matches (once; kept in memory). Never throws. */
export function loadTmdbMatches(force = false): Promise<TmdbMatches> {
  if (matches && !force) return Promise.resolve(matches);
  if (matchesLoading && !force) return matchesLoading;
  matchesLoading = (async () => {
    try {
      if (!firebaseConfigured) return (matches = {});
      const [fs, db] = await Promise.all([import("firebase/firestore"), getDb()]);
      const snap = await fs.getDoc(fs.doc(db, ...MATCHES_PATH));
      const raw = (snap.data()?.matches ?? {}) as Record<string, unknown>;
      const clean: TmdbMatches = {};
      for (const [id, v] of Object.entries(raw)) {
        const t = (v as { tmdbId?: unknown; name?: unknown } | null) ?? {};
        if (typeof t.tmdbId === "number" && t.tmdbId >= 0)
          clean[id] = { tmdbId: t.tmdbId, ...(typeof t.name === "string" ? { name: t.name } : {}) };
      }
      return (matches = clean);
    } catch {
      return (matches = matches ?? {});
    }
  })().finally(() => {
    matchesLoading = null;
  });
  return matchesLoading;
}

/** Remember the admin's choice for one anime. `null` = go back to the automatic guess. */
export async function saveTmdbMatch(
  anilistId: number,
  choice: { tmdbId: number; name?: string } | null,
): Promise<void> {
  const [fs, db] = await Promise.all([import("firebase/firestore"), getDb()]);
  await fs.setDoc(
    fs.doc(db, ...MATCHES_PATH),
    {
      matches: { [String(anilistId)]: choice ?? fs.deleteField() },
      updatedAt: fs.serverTimestamp(),
    },
    { merge: true },
  );
  const next = { ...(matches ?? {}) };
  if (choice) next[String(anilistId)] = choice;
  else delete next[String(anilistId)];
  matches = next;
  // Forget the browser copy so the new choice is used straight away.
  try {
    window.localStorage.removeItem(TMDB_CACHE + anilistId);
  } catch {
    /* nothing to forget */
  }
}

/* ----------------------------------------------------------------- TMDB lookup */

const TMDB_CACHE = "tyshi-universal-tmdb-v2:";
const NO_MATCH_DAYS = 7;

type Cached =
  | { none: true; at: number }
  | { none?: false; tmdbId: number; positions: ([number, number] | null)[]; at: number };

function readCache(anilistId: number): Cached | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(TMDB_CACHE + anilistId) ?? "null") as Cached | null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function writeCache(anilistId: number, value: Cached) {
  try {
    window.localStorage.setItem(TMDB_CACHE + anilistId, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the lookup just repeats next time */
  }
}

const inflight = new Map<string, Promise<TmdbInfo | null>>();

/**
 * Find the TMDB series for an anime and where each of its episodes sits (season + episode inside
 * it). `forced` is the admin's confirmed TMDB id (0 = "no match"). Without it, a confident guess by
 * title is used. The answer is cached in this browser, so each anime is looked up only once.
 */
export function getTmdbInfo(
  anilistId: number,
  count: number,
  forced?: number,
): Promise<TmdbInfo | null> {
  if (forced === 0) return Promise.resolve(null);
  const cached = readCache(anilistId);
  if (cached) {
    if (cached.none) {
      if (forced === undefined && Date.now() - cached.at < NO_MATCH_DAYS * 86_400_000)
        return Promise.resolve(null);
    } else if (
      (forced === undefined || cached.tmdbId === forced) &&
      cached.positions.length >= count
    ) {
      return Promise.resolve({ tmdbId: cached.tmdbId, positions: cached.positions });
    }
  }
  const key = `${anilistId}:${count}:${forced ?? "auto"}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = lookup(anilistId, forced)
    .then((info) => {
      writeCache(
        anilistId,
        info
          ? { tmdbId: info.tmdbId, positions: info.positions, at: Date.now() }
          : { none: true, at: Date.now() },
      );
      return info;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function lookup(anilistId: number, forced?: number): Promise<TmdbInfo | null> {
  // Loaded only now, so viewers who never need TMDB never download this code.
  const [{ crawlFranchise }, tmdb, { planEntry }] = await Promise.all([
    import("@/lib/franchise-crawl"),
    import("@/lib/tmdb"),
    import("@/lib/bulk-import"),
  ]);
  const { entries } = await crawlFranchise(anilistId);
  const first = entries[0];
  if (!first) return null;
  let tmdbId = forced;
  if (!tmdbId) {
    const names = [first.title.english, first.title.romaji, first.title.native].filter(
      (t): t is string => !!t,
    );
    const match = await tmdb.autoMatch(names, first.year);
    // A guess could play the wrong anime, so only a confident match counts.
    if (!match.best || !match.confident) return null;
    tmdbId = match.best.id;
  }
  const series = await tmdb.getTmdbSeries(tmdbId);
  const maps = tmdb.mapEntries(
    series,
    entries.map((e) => ({ id: e.id, kind: tmdb.kindOf(e.format), count: planEntry(e).count })),
  );
  const list = maps.get(anilistId) ?? [];
  return {
    tmdbId: series.id,
    positions: list.map((p) => (p ? ([p.season, p.episode] as [number, number]) : null)),
  };
}

/** React hook: TMDB info for the anime on screen (only looked up when `enabled`). */
export function useUniversalTmdb(anilistId: number, enabled: boolean, count: number) {
  const wanted = enabled && count > 0 && !isCustomId(anilistId);
  const key = `${anilistId}:${count}`;
  const [done, setDone] = useState<{ key: string; info: TmdbInfo | null } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    loadTmdbMatches()
      .then((m) => getTmdbInfo(anilistId, count, m[String(anilistId)]?.tmdbId))
      .then((info) => !cancelled && setDone({ key, info }))
      .catch(() => !cancelled && setDone({ key, info: null }));
    return () => {
      cancelled = true;
    };
  }, [wanted, anilistId, count, key]);
  const settled = done?.key === key;
  return useMemo(
    () => ({
      info: wanted && settled ? (done?.info ?? null) : null,
      loading: wanted && !settled,
    }),
    [wanted, settled, done],
  );
}

/* ------------------------------------------------------- admin: Test area helper */

export type PreviewRow = {
  name: string;
  enabled: boolean;
  sub: string | null;
  dub: string | null;
  note: string | null;
};

/** The links every server would make for the numbers typed in the Test area. */
export function previewLinks(
  settings: UniversalSettings,
  input: { anilistId?: number; episode?: number; tmdbId?: number; season?: number },
): PreviewRow[] {
  const labels = serverLabels(settings);
  return settings.servers.map((s, i) => {
    const ids: LinkIds = {
      id: s.idType === "tmdb" ? input.tmdbId : input.anilistId,
      anilistId: input.anilistId,
      episode: input.episode,
      tmdbId: input.tmdbId,
      season: input.season,
    };
    const need = s.idType === "tmdb" ? ids.tmdbId : ids.anilistId;
    const note =
      need === undefined
        ? s.idType === "tmdb"
          ? "Type a TMDB ID (and season) above to test this server."
          : "Type an AniList ID above."
        : null;
    return {
      name: labels[i],
      enabled: s.enabled,
      sub: note ? null : buildLink(s.subPattern, ids),
      dub: note ? null : buildLink(s.dubPattern, ids),
      note,
    };
  });
}

/* ------------------------------------------------- one list for the details + watch pages */

/** The bits of an AniList title the episode list needs. */
export type EpisodeMedia = CountInput & { id: number };

/** Every playable link for one episode: links saved by hand first, then the Universal Servers. */
export function sourcesOfEpisode(
  video: SavedVideo,
  settings: UniversalSettings,
  ctx: UniversalCtx,
): Source[] {
  const manual = video.cloud ? episodeSources(video) : [];
  const universal =
    video.episode !== undefined && !isCustomId(ctx.anilistId)
      ? universalSourcesFor(settings, ctx, video.episode)
      : [];
  return mergeSources(manual, universal);
}

/**
 * Saved episodes plus every episode AniList says is available now, each playable through the
 * Universal Servers. Used by the details page and the watch page so they always agree.
 */
export function useAllEpisodes(
  media: EpisodeMedia,
  manual: SavedVideo[],
  manualReady: boolean,
) {
  const { settings, ready: settingsReady } = useUniversalSettings();
  const count = guessEpisodeCount(media);
  const universalOn = hasUniversalServers(settings);
  const needTmdb = universalOn && settingsNeedTmdb(settings);
  const { info: tmdb, loading: tmdbLoading } = useUniversalTmdb(media.id, needTmdb, count);
  // Only wait for TMDB when every server needs it; otherwise play now and add TMDB servers later.
  const waitForTmdb =
    tmdbLoading &&
    settings.servers.filter((s) => s.enabled && hasPattern(s)).every(serverNeedsTmdb);

  const ctx = useMemo<UniversalCtx>(
    () => ({ anilistId: media.id, tmdb }),
    [media.id, tmdb],
  );
  const videos = useMemo(
    () => withUniversalEpisodes(manual, { animeId: media.id, count, settings, ctx }),
    [manual, media.id, count, settings, ctx],
  );
  const sourcesFor = useCallback(
    (video: SavedVideo) => sourcesOfEpisode(video, settings, ctx),
    [settings, ctx],
  );
  return {
    videos,
    sourcesFor,
    /** Episodes available right now according to AniList (0 = unknown or none yet). */
    count,
    ready: manualReady && settingsReady && !waitForTmdb,
  };
}
