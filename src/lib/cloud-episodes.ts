import { mirrorAnimeDelete, mirrorEpisodeDelete } from "@/lib/series-mirror";
import type { DocumentData } from "firebase/firestore";

import { describeFirebaseError, getAuthClient, getDb } from "@/lib/firebase";

/**
 * Firestore layout
 *
 *   anime/{anilistId}         { anilistId, title, poster, episodeCount, subCount, dubCount, updatedAt,
 *                               custom?, edited?, about?, banner?, genres?, year?, format?, status? }
 *   episodeLists/{anilistId}  { anilistId, updatedAt, episodes: { "<number>": EpisodeDoc } }
 *   admins/{uid}              any fields; existence = admin (created by hand in the Firebase console)
 *
 *   EpisodeDoc = { title?, thumbnail?, subUrl?, dubUrl?, servers?: { "<name>": { subUrl?, dubUrl? } } }
 *
 * `subUrl` / `dubUrl` on the episode itself are the default server ("Server 1"), so
 * everything saved by earlier versions keeps working. Any extra servers live under
 * `servers`, each with its own SUB and DUB link.
 *
 * Custom series (ones that aren't on AniList) use an id of CUSTOM_ID_BASE or higher
 * so they can never collide with a real AniList id.
 *
 * All episodes of one title live in a single document so a viewer loads a whole
 * series with one read. SUB, DUB and every server are separate fields, so writing
 * one never touches the others.
 */

export type Lang = "sub" | "dub";

export type ServerLinks = { subUrl?: string; dubUrl?: string };

export type CloudEpisode = {
  number: number;
  title?: string;
  thumbnail?: string;
  /** Actual dub premiere date in milliseconds; never inferred from an upload/save time. */
  dubReleasedAt?: number;
  /** Default server (“Server 1”) links. */
  subUrl?: string;
  dubUrl?: string;
  /** Extra named servers. */
  servers?: Record<string, ServerLinks>;
};

export type CloudAnime = {
  anilistId: number;
  title: string;
  poster: string | null;
  episodeCount: number;
  subCount: number;
  dubCount: number;
  custom: boolean;
  /** True once an admin saved title/poster/about by hand for an AniList title. */
  edited: boolean;
  about: string | null;
  banner: string | null;
  genres: string[];
  year: number | null;
  format: string | null;
  status: string | null;
  /** Last time episodes or details changed (ms since epoch), when known. */
  updatedAt: number | null;
};

export type AnimeRef = {
  anilistId: number;
  title: string;
  poster: string | null;
  custom?: boolean;
  edited?: boolean;
  about?: string | null;
  banner?: string | null;
  genres?: string[];
  year?: number | null;
  format?: string | null;
  status?: string | null;
};

export const ANIME = "anime";
export const EPISODE_LISTS = "episodeLists";
export const ADMINS = "admins";

/** AniList ids are well below this, so a custom id never matches a real title. */
export const CUSTOM_ID_BASE = 900_000_000;
export const isCustomId = (id: number) =>
  Number.isSafeInteger(id) && id >= CUSTOM_ID_BASE;

export const DEFAULT_SERVER = "Server 1";
const MAX_SERVER_NAME = 24;

/** Firestore documents max out at 1 MiB; leave headroom. */
const MAX_DOC_BYTES = 900_000;
const MAX_URL = 4000;

export const langField = (lang: Lang) => (lang === "sub" ? "subUrl" : "dubUrl");
export const langLabel = (lang: Lang) => (lang === "sub" ? "SUB" : "DUB");

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/* ------------------------------------------------------------------ servers */

/** Short, safe server name: letters, digits, spaces and a few symbols. */
export function cleanServerName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _\-+&()']/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SERVER_NAME)
    .trim();
}

export const isDefaultServer = (name: string) =>
  name.trim().toLowerCase() === DEFAULT_SERVER.toLowerCase();

type EpisodeFields = Omit<CloudEpisode, "number">;

/** Link of one language on one server, or undefined. */
export function getLink(
  ep: EpisodeFields | undefined,
  server: string,
  lang: Lang,
): string | undefined {
  if (!ep) return undefined;
  const key = langField(lang);
  return isDefaultServer(server) ? ep[key] : ep.servers?.[server]?.[key];
}

function setLink(
  ep: EpisodeFields,
  server: string,
  lang: Lang,
  url: string | undefined,
): EpisodeFields {
  const key = langField(lang);
  if (isDefaultServer(server)) return { ...ep, [key]: url };
  return {
    ...ep,
    servers: {
      ...(ep.servers ?? {}),
      [server]: { ...ep.servers?.[server], [key]: url },
    },
  };
}

const linksOf = (l: ServerLinks | undefined) => Boolean(l?.subUrl || l?.dubUrl);

export function hasAnyLink(ep: EpisodeFields): boolean {
  return linksOf(ep) || Object.values(ep.servers ?? {}).some((s) => linksOf(s));
}

const naturalSort = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Servers an episode has links on. The default server always comes first. */
export function episodeServers(
  ep: EpisodeFields,
): { name: string; subUrl?: string; dubUrl?: string }[] {
  const out: { name: string; subUrl?: string; dubUrl?: string }[] = [];
  if (linksOf(ep))
    out.push({ name: DEFAULT_SERVER, subUrl: ep.subUrl, dubUrl: ep.dubUrl });
  for (const name of Object.keys(ep.servers ?? {}).sort(naturalSort)) {
    const s = ep.servers![name];
    if (linksOf(s)) out.push({ name, subUrl: s.subUrl, dubUrl: s.dubUrl });
  }
  return out;
}

/** Every server name used by any of these episodes (default first). */
export function serverNames(episodes: EpisodeFields[]): string[] {
  const names = new Set<string>();
  let hasDefault = false;
  for (const ep of episodes) {
    if (linksOf(ep)) hasDefault = true;
    for (const [name, s] of Object.entries(ep.servers ?? {}))
      if (linksOf(s)) names.add(name);
  }
  return [
    ...(hasDefault ? [DEFAULT_SERVER] : []),
    ...[...names].sort(naturalSort),
  ];
}

/** Reuse the casing of an existing server so “vidplay” and “VidPlay” don't become two. */
function canonicalServer(
  name: string,
  episodes: Iterable<EpisodeFields>,
): string {
  if (isDefaultServer(name)) return DEFAULT_SERVER;
  const lower = name.toLowerCase();
  for (const ep of episodes)
    for (const existing of Object.keys(ep.servers ?? {}))
      if (existing.toLowerCase() === lower) return existing;
  return name;
}

export type Source = { server: string; lang: Lang; url: string };

/** Every playable (server, language) pair of an episode. */
export function episodeSources(ep: EpisodeFields): Source[] {
  const out: Source[] = [];
  for (const s of episodeServers(ep)) {
    if (s.subUrl) out.push({ server: s.name, lang: "sub", url: s.subUrl });
    if (s.dubUrl) out.push({ server: s.name, lang: "dub", url: s.dubUrl });
  }
  return out;
}

/**
 * Keep the chosen server first. If it does not offer the preferred language, use
 * its other language before looking for that language on another server.
 */
export function pickSource(
  sources: Source[],
  server: string | undefined,
  lang: Lang,
): Source | undefined {
  const sameServer = (s: Source) =>
    server !== undefined && s.server.toLowerCase() === server.toLowerCase();
  return (
    sources.find((s) => sameServer(s) && s.lang === lang) ??
    sources.find((s) => sameServer(s)) ??
    sources.find((s) => s.lang === lang) ??
    sources[0]
  );
}

/* ------------------------------------------------------------------ parsing */

export function parseEpisodeMap(
  data: DocumentData | undefined,
): CloudEpisode[] {
  const map = data?.episodes;
  if (!map || typeof map !== "object") return [];
  const out: CloudEpisode[] = [];
  for (const [key, raw] of Object.entries(map as Record<string, unknown>)) {
    const number = Number(key);
    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      !raw ||
      typeof raw !== "object"
    )
      continue;
    const r = raw as Record<string, unknown>;
    const ep: CloudEpisode = {
      number,
      title: str(r.title),
      thumbnail: str(r.thumbnail),
      dubReleasedAt:
        typeof r.dubReleasedAt === "number" &&
        Number.isFinite(r.dubReleasedAt) &&
        r.dubReleasedAt > 0
          ? r.dubReleasedAt
          : undefined,
      subUrl: str(r.subUrl),
      dubUrl: str(r.dubUrl),
    };
    if (r.servers && typeof r.servers === "object") {
      const servers: Record<string, ServerLinks> = {};
      for (const [name, sv] of Object.entries(
        r.servers as Record<string, unknown>,
      )) {
        if (!sv || typeof sv !== "object") continue;
        const links = {
          subUrl: str((sv as Record<string, unknown>).subUrl),
          dubUrl: str((sv as Record<string, unknown>).dubUrl),
        };
        if (linksOf(links)) servers[name] = links;
      }
      if (Object.keys(servers).length) ep.servers = servers;
    }
    if (hasAnyLink(ep)) out.push(ep);
  }
  return out.sort((a, b) => a.number - b.number);
}

/** Read the episode documents for a small, known set of titles in parallel. */
export async function readEpisodeLists(
  animeIds: number[],
): Promise<Record<number, CloudEpisode[]>> {
  const ids = [
    ...new Set(animeIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ].slice(0, 32);
  if (!ids.length) return {};

  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const snapshots = await Promise.all(
    ids.map((id) => fs.getDoc(fs.doc(db, EPISODE_LISTS, String(id)))),
  );
  const out: Record<number, CloudEpisode[]> = {};
  snapshots.forEach((snapshot, index) => {
    out[ids[index]] = parseEpisodeMap(
      snapshot.exists() ? snapshot.data() : undefined,
    );
  });
  return out;
}

export function parseAnime(
  id: string,
  data: DocumentData | undefined,
): CloudAnime | null {
  const anilistId = Number(data?.anilistId ?? id);
  if (!data || !Number.isSafeInteger(anilistId)) return null;
  const n = (v: unknown) => (typeof v === "number" && v >= 0 ? v : 0);
  return {
    anilistId,
    title: str(data.title) ?? `Anime ${anilistId}`,
    poster: str(data.poster) ?? null,
    episodeCount: n(data.episodeCount),
    subCount: n(data.subCount),
    dubCount: n(data.dubCount),
    custom: data.custom === true || isCustomId(anilistId),
    edited: data.edited === true,
    about: str(data.about) ?? null,
    banner: str(data.banner) ?? null,
    genres: Array.isArray(data.genres)
      ? data.genres.filter(
          (g): g is string => typeof g === "string" && !!g.trim(),
        )
      : [],
    year: typeof data.year === "number" ? data.year : null,
    format: str(data.format) ?? null,
    status: str(data.status) ?? null,
    updatedAt:
      data.updatedAt && typeof data.updatedAt.toMillis === "function"
        ? (data.updatedAt.toMillis() as number)
        : null,
  };
}

export function animeToRef(a: CloudAnime): AnimeRef {
  return {
    anilistId: a.anilistId,
    title: a.title,
    poster: a.poster,
    custom: a.custom,
    edited: a.edited,
    about: a.about,
    banner: a.banner,
    genres: a.genres,
    year: a.year,
    format: a.format,
    status: a.status,
  };
}

type Unsubscribe = () => void;

/** Live episode list for one title. Updates arrive without reloading the page. */
export function watchEpisodeList(
  anilistId: number,
  onData: (episodes: CloudEpisode[], offline: boolean) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let cancelled = false;
  let unsubscribe: Unsubscribe | undefined;
  Promise.all([getDb(), import("firebase/firestore")])
    .then(([db, fs]) => {
      if (cancelled) return;
      unsubscribe = fs.onSnapshot(
        fs.doc(db, EPISODE_LISTS, String(anilistId)),
        (snap) =>
          onData(
            parseEpisodeMap(snap.data()),
            snap.metadata.fromCache && !snap.exists(),
          ),
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

/** Live list of titles stored in Firestore, newest first. */
export function watchCatalog(
  onData: (anime: CloudAnime[]) => void,
  onError: (error: unknown) => void,
  max = 60,
): Unsubscribe {
  let cancelled = false;
  let unsubscribe: Unsubscribe | undefined;
  Promise.all([getDb(), import("firebase/firestore")])
    .then(([db, fs]) => {
      if (cancelled) return;
      unsubscribe = fs.onSnapshot(
        fs.query(
          fs.collection(db, ANIME),
          fs.orderBy("updatedAt", "desc"),
          fs.limit(max),
        ),
        (snap) =>
          onData(
            snap.docs
              .map((d) => parseAnime(d.id, d.data()))
              .filter((a): a is CloudAnime => a !== null),
          ),
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

/** One title's stored details (custom series, or details an admin edited by hand). */
export async function getAnimeDoc(
  anilistId: number,
): Promise<CloudAnime | null> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const snap = await fs.getDoc(fs.doc(db, ANIME, String(anilistId)));
  return snap.exists() ? parseAnime(snap.id, snap.data()) : null;
}

export async function checkIsAdmin(uid: string): Promise<boolean> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const snap = await fs.getDoc(fs.doc(db, ADMINS, uid));
  return snap.exists();
}

/* ------------------------------------------------------------------- writes */

type Mutator = (episodes: Map<number, EpisodeFields>) => void;

const cloneFields = (v: EpisodeFields): EpisodeFields => ({
  ...v,
  servers: v.servers
    ? Object.fromEntries(
        Object.entries(v.servers).map(([k, s]) => [k, { ...s }]),
      )
    : undefined,
});

/**
 * Read-modify-write inside a transaction so two admins (or a SUB and a DUB import
 * running back to back) never lose each other's changes. Only the episode keys the
 * mutator touched are written; other episodes and fields are left as they are.
 */
async function mutateEpisodes(anime: AnimeRef, mutate: Mutator) {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const id = String(anime.anilistId);
  const listRef = fs.doc(db, EPISODE_LISTS, id);
  const animeRef = fs.doc(db, ANIME, id);

  await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(listRef);
    const animeSnap = await tx.get(animeRef);
    const before = new Map(
      parseEpisodeMap(snap.data()).map(({ number, ...rest }) => [number, rest]),
    );
    const after = new Map([...before].map(([k, v]) => [k, cloneFields(v)]));
    mutate(after);
    for (const [number, episode] of after) {
      if (
        episode.dubReleasedAt !== undefined &&
        !episodeSources(episode).some((source) => source.lang === "dub")
      )
        after.set(number, { ...episode, dubReleasedAt: undefined });
    }

    const patch: Record<string, unknown> = {};
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of keys) {
      const prev = before.get(key);
      const next = after.get(key);
      if (!next || !hasAnyLink(next)) {
        if (prev) patch[String(key)] = fs.deleteField();
        continue;
      }
      const fields: Record<string, unknown> = {};
      let changed = !prev;
      for (const f of ["title", "thumbnail", "subUrl", "dubUrl"] as const) {
        const value = next[f]?.trim() || undefined;
        if (value === prev?.[f]) {
          if (value !== undefined) fields[f] = value;
          continue;
        }
        changed = true;
        fields[f] = value ?? fs.deleteField();
      }

      if (next.dubReleasedAt === prev?.dubReleasedAt) {
        if (next.dubReleasedAt !== undefined)
          fields.dubReleasedAt = next.dubReleasedAt;
      } else {
        changed = true;
        fields.dubReleasedAt = next.dubReleasedAt ?? fs.deleteField();
      }

      const serverPatch: Record<string, unknown> = {};
      const names = new Set([
        ...Object.keys(prev?.servers ?? {}),
        ...Object.keys(next.servers ?? {}),
      ]);
      for (const name of names) {
        const p = prev?.servers?.[name];
        const n = next.servers?.[name];
        if (!linksOf(n)) {
          if (p) {
            serverPatch[name] = fs.deleteField();
            changed = true;
          }
          continue;
        }
        const sf: Record<string, unknown> = {};
        let serverChanged = !p;
        for (const f of ["subUrl", "dubUrl"] as const) {
          const value = n![f]?.trim() || undefined;
          if (value === p?.[f]) {
            if (value !== undefined) sf[f] = value;
            continue;
          }
          serverChanged = true;
          sf[f] = value ?? fs.deleteField();
        }
        if (serverChanged) changed = true;
        serverPatch[name] = sf;
      }
      if (Object.keys(serverPatch).length) fields.servers = serverPatch;

      if (changed) patch[String(key)] = fields;
    }
    if (!Object.keys(patch).length) return;

    const remaining = [...after.entries()].filter(([, v]) => hasAnyLink(v));
    const bytes = JSON.stringify(Object.fromEntries(remaining)).length;
    if (bytes > MAX_DOC_BYTES)
      throw new Error(
        "This title has too many links for one Firestore document (about 1 MB). Split it into seasons.",
      );

    const hasLang = (v: EpisodeFields, lang: Lang) =>
      episodeSources(v).some((s) => s.lang === lang);

    // Hand-edited or custom titles keep their own name and poster.
    const existing = animeSnap.exists() ? animeSnap.data() : undefined;
    const keepDetails =
      anime.custom ||
      anime.edited ||
      existing?.custom === true ||
      existing?.edited === true;

    tx.set(
      listRef,
      {
        anilistId: anime.anilistId,
        episodes: patch,
        updatedAt: fs.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(
      animeRef,
      {
        anilistId: anime.anilistId,
        ...(keepDetails && animeSnap.exists()
          ? {}
          : {
              title:
                anime.title.trim().slice(0, 300) || `Anime ${anime.anilistId}`,
              poster: anime.poster?.trim() || null,
            }),
        episodeCount: remaining.length,
        subCount: remaining.filter(([, v]) => hasLang(v, "sub")).length,
        dubCount: remaining.filter(([, v]) => hasLang(v, "dub")).length,
        updatedAt: fs.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export type ImportResult = { added: number; replaced: number; skipped: number };

/**
 * Writes SUB *or* DUB links for one server only. Other languages and other servers
 * on the same episode are never changed. Existing links of the same language and
 * server are kept unless `replaceExisting`.
 */
export async function importLinks(
  anime: AnimeRef,
  lang: Lang,
  entries: { number: number; url: string }[],
  replaceExisting: boolean,
  server: string = DEFAULT_SERVER,
): Promise<ImportResult> {
  const wanted = cleanServerName(server) || DEFAULT_SERVER;
  const result: ImportResult = { added: 0, replaced: 0, skipped: 0 };
  await mutateEpisodes(anime, (episodes) => {
    result.added = result.replaced = result.skipped = 0;
    const name = canonicalServer(wanted, episodes.values());
    for (const { number, url } of entries) {
      if (
        !Number.isSafeInteger(number) ||
        number < 1 ||
        !url ||
        url.length > MAX_URL
      )
        continue;
      const current = episodes.get(number) ?? {};
      const existing = getLink(current, name, lang);
      if (existing === url) {
        result.skipped++;
        continue;
      }
      if (existing && !replaceExisting) {
        result.skipped++;
        continue;
      }
      if (existing) result.replaced++;
      else result.added++;
      episodes.set(number, setLink(current, name, lang, url));
    }
  });
  return result;
}

export type GeneratedRow = {
  number: number;
  /** Picture and name for the episode (for example from TMDB). Only filled in where the episode has none yet. */
  thumbnail?: string;
  title?: string;
  /** Server name (as the admin typed it) -> that server's SUB and DUB link. */
  links: Record<string, { sub?: string; dub?: string }>;
};

/**
 * Put generated links (many episodes, several servers, SUB and DUB) into the live episode list
 * the player reads, in ONE transaction. With `keepExisting`, any link already stored is left alone
 * so hand-fixed links survive a re-import.
 */
export async function publishGenerated(
  anime: AnimeRef,
  rows: GeneratedRow[],
  keepExisting: boolean | ((server: string, lang: Lang) => boolean),
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, replaced: 0, skipped: 0 };
  await mutateEpisodes(anime, (episodes) => {
    result.added = result.replaced = result.skipped = 0;
    for (const row of rows) {
      if (!Number.isSafeInteger(row.number) || row.number < 1) continue;
      let ep = episodes.get(row.number) ?? {};
      if (row.thumbnail && !ep.thumbnail)
        ep = { ...ep, thumbnail: row.thumbnail };
      if (row.title && !ep.title) ep = { ...ep, title: row.title };
      for (const [serverLabel, urls] of Object.entries(row.links)) {
        const name = canonicalServer(
          cleanServerName(serverLabel) || DEFAULT_SERVER,
          episodes.values(),
        );
        for (const lang of ["sub", "dub"] as const) {
          const url = urls[lang];
          if (!url || url.length > MAX_URL) continue;
          const existing = getLink(ep, name, lang);
          const keep =
            typeof keepExisting === "function"
              ? keepExisting(name, lang)
              : keepExisting;
          if (existing === url || (existing && keep)) {
            result.skipped++;
            continue;
          }
          if (existing) result.replaced++;
          else result.added++;
          ep = setLink(ep, name, lang, url);
        }
      }
      episodes.set(row.number, ep);
    }
  });
  return result;
}

/** Create or edit one episode. Empty strings clear a field. */
export async function saveEpisode(
  anime: AnimeRef,
  episode: CloudEpisode,
  previousNumber?: number,
): Promise<void> {
  if (!hasAnyLink(episode))
    throw new Error("Add at least one SUB or DUB link.");
  await mutateEpisodes(anime, (episodes) => {
    const moving =
      previousNumber !== undefined && previousNumber !== episode.number;
    if (moving && episodes.has(episode.number))
      throw new Error(`Episode ${episode.number} already exists.`);
    if (moving) episodes.delete(previousNumber);
    const { number, ...fields } = episode;
    const hasDub = episodeSources(fields).some(
      (source) => source.lang === "dub",
    );
    episodes.set(number, {
      ...fields,
      dubReleasedAt: hasDub ? fields.dubReleasedAt : undefined,
    });
  });
}

/**
 * Swap one server's links on many episodes in a single save: the old server's links are removed and the
 * new ones set. Used to change a server for a whole series at once (rename, new link, or both).
 */
export async function rewriteServerLinks(
  anime: AnimeRef,
  oldLabel: string,
  newLabel: string,
  rows: { number: number; sub?: string; dub?: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  await mutateEpisodes(anime, (episodes) => {
    for (const row of rows) {
      let ep = episodes.get(row.number);
      if (!ep) {
        if (!row.sub && !row.dub) continue;
        ep = {};
      }
      const oldName = canonicalServer(
        cleanServerName(oldLabel) || DEFAULT_SERVER,
        [ep],
      );
      for (const l of ["sub", "dub"] as const)
        ep = setLink(ep, oldName, l, undefined);
      const name = canonicalServer(
        cleanServerName(newLabel) || DEFAULT_SERVER,
        episodes.values(),
      );
      for (const l of ["sub", "dub"] as const) {
        const url = row[l];
        if (url && url.length <= MAX_URL) ep = setLink(ep, name, l, url);
      }
      episodes.set(row.number, ep);
    }
  });
}

/** Remove one language from an episode, or the whole episode when `lang` is omitted. */
export async function deleteEpisode(
  anime: AnimeRef,
  number: number,
  lang?: Lang,
) {
  await deleteEpisodes(anime, [number], lang);
}

/**
 * Delete several episodes in a single write. With `lang` only that language is
 * removed (from every server, or just `server`); with only `server`, that whole
 * server is removed from each episode.
 */
export async function deleteEpisodes(
  anime: AnimeRef,
  numbers: number[],
  lang?: Lang,
  server?: string,
) {
  if (numbers.length === 0) return;
  await mutateEpisodes(anime, (episodes) => {
    for (const number of numbers) {
      let current = episodes.get(number);
      if (!current) continue;
      if (!lang && !server) {
        episodes.delete(number);
        continue;
      }
      const names = server
        ? [canonicalServer(server, [current])]
        : [DEFAULT_SERVER, ...Object.keys(current.servers ?? {})];
      const langs: Lang[] = lang ? [lang] : ["sub", "dub"];
      for (const name of names)
        for (const l of langs) current = setLink(current, name, l, undefined);
      episodes.set(number, current);
    }
  });
  // Keep the admin record (series/…/episodes) in step so no stale copy is left behind.
  await mirrorEpisodeDelete(anime.anilistId, numbers, lang, server);
}

/** Rename a server on every episode. Refuses to overwrite links that already exist. */
export async function renameServer(anime: AnimeRef, from: string, to: string) {
  const target = cleanServerName(to);
  if (!target) throw new Error("Enter a server name.");
  await mutateEpisodes(anime, (episodes) => {
    const dest = canonicalServer(target, episodes.values());
    if (dest.toLowerCase() === from.toLowerCase()) return;
    for (const [number, original] of [...episodes]) {
      let ep = original;
      for (const lang of ["sub", "dub"] as const) {
        const url = getLink(ep, from, lang);
        if (!url) continue;
        const clash = getLink(ep, dest, lang);
        if (clash && clash !== url)
          throw new Error(
            `Episode ${number} already has a ${lang.toUpperCase()} link on “${dest}”.`,
          );
        ep = setLink(setLink(ep, from, lang, undefined), dest, lang, url);
      }
      episodes.set(number, ep);
    }
  });
}

/** Details written to the `anime` document. Fields the admin leaves empty are cleared. */
function detailsPayload(anime: AnimeRef) {
  const clean = (v: string | null | undefined, max: number) =>
    v?.trim() ? v.trim().slice(0, max) : null;
  return {
    anilistId: anime.anilistId,
    title: anime.title.trim().slice(0, 300) || `Anime ${anime.anilistId}`,
    poster: clean(anime.poster, 2000),
    about: clean(anime.about, 5000),
    banner: clean(anime.banner, 2000),
    genres: (anime.genres ?? [])
      .map((g) => g.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20),
    year:
      typeof anime.year === "number" && Number.isSafeInteger(anime.year)
        ? anime.year
        : null,
    format: clean(anime.format, 40),
    status: clean(anime.status, 40),
  };
}

/** Update the details stored for a title. Marks AniList titles as hand-edited. */
export async function saveAnimeDetails(anime: AnimeRef) {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  await fs.setDoc(
    fs.doc(db, ANIME, String(anime.anilistId)),
    {
      ...detailsPayload(anime),
      ...(anime.custom ? { custom: true } : { edited: true }),
      updatedAt: fs.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Make a brand-new series that isn't on AniList. Returns it with its generated id. */
export async function createCustomSeries(
  details: Omit<AnimeRef, "anilistId" | "custom">,
): Promise<AnimeRef> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  for (let attempt = 0; attempt < 6; attempt++) {
    const anilistId = CUSTOM_ID_BASE + Math.floor(Math.random() * 90_000_000);
    const ref = fs.doc(db, ANIME, String(anilistId));
    if ((await fs.getDoc(ref)).exists()) continue;
    const anime: AnimeRef = { ...details, anilistId, custom: true };
    await fs.setDoc(ref, {
      ...detailsPayload(anime),
      custom: true,
      episodeCount: 0,
      subCount: 0,
      dubCount: 0,
      updatedAt: fs.serverTimestamp(),
    });
    return { ...anime, title: detailsPayload(anime).title };
  }
  throw new Error("Couldn't create the series. Try again.");
}

/** Remove a title and all of its episodes from Firestore. */
export async function deleteAnime(anilistId: number) {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const id = String(anilistId);
  await fs.deleteDoc(fs.doc(db, EPISODE_LISTS, id));
  await fs.deleteDoc(fs.doc(db, ANIME, id));
  await mirrorAnimeDelete(anilistId);
}

/* ------------------------------------------------------------ access check */

export type AccessProblem =
  "ok" | "signed-out" | "admins-doc" | "rules" | "network";

export type AccessReport = {
  problem: AccessProblem;
  /** Plain-language result for the admin. */
  message: string;
  /** The signed-in user's ID (what the admins document must be named). */
  uid?: string;
  email?: string | null;
};

const projectName = () =>
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "unknown";

const codeOf = (e: unknown) =>
  e && typeof e === "object" && "code" in e
    ? String((e as { code: unknown }).code)
    : "";

/**
 * Works out WHY a save is refused. Two things can be wrong:
 *   1. the "admins" document for this user is missing, or
 *   2. the published Firestore rules are old / not the ones in this project.
 * It reads your own admins document, then tries a harmless delete of a document that
 * doesn't exist (it changes nothing) to see whether the rules accept admin writes.
 */
export async function diagnoseAccess(): Promise<AccessReport> {
  try {
    const auth = await getAuthClient();
    const user = auth.currentUser;
    if (!user)
      return {
        problem: "signed-out",
        message:
          "You're signed out. Sign in again on the Admin page, then try once more.",
      };
    const who = { uid: user.uid, email: user.email };
    const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);

    let adminDocExists: boolean;
    try {
      adminDocExists = (await fs.getDoc(fs.doc(db, ADMINS, user.uid))).exists();
    } catch (error) {
      if (codeOf(error) === "permission-denied")
        return {
          problem: "rules",
          ...who,
          message:
            "THE RULES are the problem: Firestore won't even let you read your own admin document, so the rules published in Firebase are old. Publish the firestore.rules file from this project (Firebase console → Firestore Database → Rules → paste → Publish).",
        };
      throw error;
    }

    if (!adminDocExists)
      return {
        problem: "admins-doc",
        ...who,
        message:
          "THE ADMINS DOCUMENT is the problem: there is no document in the “admins” collection named after your user ID. In Firebase console → Firestore Database → Data → collection “admins” → Add document, and paste your user ID as the Document ID (copy it below).",
      };

    // Try every collection the site writes to (deleting a document that doesn't exist
    // changes nothing, but the rules still judge it) and read the Spotlight setup.
    const blocked: string[] = [];
    for (const name of [ANIME, EPISODE_LISTS, "siteConfig"]) {
      try {
        await fs.deleteDoc(fs.doc(db, name, "_access_check"));
      } catch (error) {
        if (codeOf(error) === "permission-denied") blocked.push(name);
        else throw error;
      }
    }
    try {
      await fs.getDoc(fs.doc(db, "siteConfig", "spotlight"));
    } catch (error) {
      if (codeOf(error) === "permission-denied") {
        if (!blocked.includes("siteConfig")) blocked.push("siteConfig");
      } else throw error;
    }
    if (blocked.length)
      return {
        problem: "rules",
        ...who,
        message: `THE RULES are the problem: your admins document is fine, but the rules published in Firebase block: ${blocked.join(", ")}. Publish the firestore.rules file from this project (Firebase console → Firestore Database → Rules → paste → Publish). Project the site is using: ${projectName()}.`,
      };

    return {
      problem: "ok",
      ...who,
      message: `Everything checks out for project ${projectName()}: your admins document exists and the published rules accept admin changes to the anime, episode and spotlight data.`,
    };
  } catch (error) {
    return { problem: "network", message: describeFirebaseError(error) };
  }
}

/** Turns a failed save into a message that says what to fix. */
export async function explainWriteError(error: unknown): Promise<string> {
  if (codeOf(error) !== "permission-denied")
    return describeFirebaseError(error);
  const report = await diagnoseAccess();
  if (report.problem === "ok")
    return "Firestore refused this save even though your admins document exists. The published rules are probably an older version with stricter checks — publish the firestore.rules file from this project (Firestore Database → Rules → paste → Publish).";
  return report.message;
}

/** Shows a failed save as a toast, with the real reason when it was a permission problem. */
export async function toastWriteError(error: unknown): Promise<void> {
  const { toast } = await import("sonner");
  toast.error(await explainWriteError(error), { duration: 14_000 });
}
