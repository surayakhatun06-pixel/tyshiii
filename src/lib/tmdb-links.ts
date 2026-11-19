import { getAnimeDoc, type CloudAnime, type CloudEpisode } from "@/lib/cloud-episodes";
import { fillTmdbPattern } from "@/lib/tmdb";

/**
 * TMDB series keep NO links per episode. The link patterns live on the season record and are
 * filled in when someone plays: season 3 episode 2 uses season 3 and episode 2.
 * Changing a pattern later fixes every episode at once.
 */
export const isTmdbRecord = (a: Pick<CloudAnime, "source"> | null | undefined) => a?.source === "tmdb";

/** Fill the patterns of one season record into its episodes (first server = Server 1). */
export function withTmdbLinks(anime: CloudAnime, episodes: CloudEpisode[]): CloudEpisode[] {
  const servers = anime.tmdbLinks?.servers ?? [];
  if (!anime.tmdbId || !servers.length) return episodes;
  return episodes.map((ep) => {
    const out: CloudEpisode = { ...ep };
    servers.forEach((server, index) => {
      const fill = (pattern?: string) =>
        pattern
          ? fillTmdbPattern(pattern, {
              tmdbId: anime.tmdbId!,
              season: anime.kind === "movie" ? undefined : anime.tmdbSeason,
              episode: anime.kind === "movie" ? undefined : ep.number,
            })
          : undefined;
      const sub = fill(server.langs[0]?.pattern);
      const dub = fill(server.langs[1]?.pattern);
      if (index === 0) {
        out.subUrl = sub;
        out.dubUrl = dub;
      } else {
        out.servers = { ...(out.servers ?? {}), [server.name]: { subUrl: sub, dubUrl: dub } };
      }
    });
    return out;
  });
}

/** The names you gave the languages (first = default audio). Shown in the Audio menu instead of Sub / Dub. */
export function tmdbLangNames(anime: CloudAnime | null | undefined): { sub: string; dub: string } | null {
  const langs = anime?.tmdbLinks?.servers?.[0]?.langs;
  if (!anime || anime.source !== "tmdb" || !langs?.length) return null;
  return { sub: langs[0]?.label || "Audio 1", dub: langs[1]?.label || "Audio 2" };
}

// The season record is read once per visit and kept, so playing never waits on it twice.
const docs = new Map<number, Promise<CloudAnime | null>>();
export function getTmdbDoc(id: number) {
  let p = docs.get(id);
  if (!p) {
    p = getAnimeDoc(id).catch(() => null);
    docs.set(id, p);
  }
  return p;
}

export const TMDB_ID_MIN = 1_000_000_000;

/**
 * For search: a TMDB series with several season records is shown as ONE series (the lowest season,
 * named by the series title). Movies and everything else stay as they are.
 */
export function collapseTmdb(list: CloudAnime[]): CloudAnime[] {
  const first = new Map<string, CloudAnime>();
  const out: CloudAnime[] = [];
  for (const a of list) {
    if (a.source !== "tmdb" || a.kind === "movie" || !a.seriesKey) {
      out.push(a);
      continue;
    }
    const keep = first.get(a.seriesKey);
    if (!keep || (a.seasonNumber ?? 99) < (keep.seasonNumber ?? 99)) first.set(a.seriesKey, a);
  }
  for (const a of first.values()) out.push({ ...a, title: a.seriesTitle ?? a.title });
  return out;
}

/** All season records of one imported TMDB series (they share the seriesKey), in season order. */
export async function getSeriesSeasons(seriesKey: string): Promise<CloudAnime[]> {
  const [{ getDb }, fs, { ANIME, parseAnime }] = await Promise.all([
    import("@/lib/firebase"),
    import("firebase/firestore"),
    import("@/lib/cloud-episodes"),
  ]);
  const db = await getDb();
  const snap = await fs.getDocs(fs.query(fs.collection(db, ANIME), fs.where("seriesKey", "==", seriesKey)));
  return snap.docs
    .map((d) => parseAnime(d.id, d.data()))
    .filter((a): a is CloudAnime => a !== null)
    .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0));
}
