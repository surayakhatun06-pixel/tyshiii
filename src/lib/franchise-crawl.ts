import { anilist, titleOf, type MediaTitle } from "@/lib/anilist";

/**
 * Relation crawler. Starting from one AniList entry it follows PREQUEL, SEQUEL, SIDE_STORY,
 * ALTERNATIVE, SPIN_OFF and PARENT links (anime only) until nothing new turns up, so every
 * season, OVA, ONA, movie and special of a franchise is found. Entries are de-duplicated by
 * AniList id and returned in watch order (start date).
 */
export const FOLLOWED = ["PREQUEL", "SEQUEL", "SIDE_STORY", "ALTERNATIVE", "SPIN_OFF", "PARENT"] as const;

/** Safety stops: some franchises (Fate, Gundam…) link to hundreds of titles. */
export const MAX_ENTRIES = 80;
const MAX_DEPTH = 15;

type FuzzyDate = { year: number | null; month: number | null; day: number | null } | null;

export type FranchiseEntry = {
  id: number;
  title: MediaTitle;
  format: string | null;
  status: string | null;
  /** Total episodes AniList lists (null while a running show has no final count). */
  episodes: number | null;
  year: number | null;
  startDate: FuzzyDate;
  /** Last episode that has already aired, for shows that are still running. */
  airedThrough: number | null;
  poster: string | null;
  banner: string | null;
  genres: string[];
  about: string | null;
};

export type CrawlResult = {
  entries: FranchiseEntry[];
  /** True when the safety limit stopped the crawl early. */
  truncated: boolean;
};

type Raw = {
  id: number;
  title: MediaTitle;
  format: string | null;
  status: string | null;
  episodes: number | null;
  seasonYear: number | null;
  startDate: FuzzyDate;
  genres: string[];
  description: string | null;
  bannerImage: string | null;
  coverImage: { extraLarge: string | null; large: string | null };
  nextAiringEpisode: { episode: number } | null;
  relations: { edges: { relationType: string | null; node: { id: number; type: string } }[] };
};

const QUERY = `query Crawl($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      title { romaji english native }
      format status episodes seasonYear genres
      description(asHtml: false)
      bannerImage
      coverImage { extraLarge large }
      startDate { year month day }
      nextAiringEpisode { episode }
      relations { edges { relationType(version: 2) node { id type } } }
    }
  }
}`;

function toEntry(r: Raw): FranchiseEntry {
  const airing = r.nextAiringEpisode?.episode;
  return {
    id: r.id,
    title: r.title,
    format: r.format,
    status: r.status,
    episodes: r.episodes,
    year: r.startDate?.year ?? r.seasonYear,
    startDate: r.startDate,
    airedThrough: typeof airing === "number" ? Math.max(0, airing - 1) : null,
    poster: r.coverImage.extraLarge ?? r.coverImage.large,
    banner: r.bannerImage,
    genres: r.genres ?? [],
    about: r.description,
  };
}

const dateKey = (d: FuzzyDate) =>
  d?.year ? d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 28) : Number.MAX_SAFE_INTEGER;

/** Watch order: earliest start date first; entries with no date go last, then by id. */
export const byWatchOrder = (a: FranchiseEntry, b: FranchiseEntry) =>
  dateKey(a.startDate) - dateKey(b.startDate) || a.id - b.id;

export async function crawlFranchise(
  rootId: number,
  onProgress?: (found: number) => void,
): Promise<CrawlResult> {
  const found = new Map<number, FranchiseEntry>();
  const queued = new Set<number>([rootId]);
  let frontier = [rootId];
  let truncated = false;

  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next: number[] = [];
    for (let i = 0; i < frontier.length; i += 50) {
      const data = await anilist<{ Page: { media: Raw[] } }>(QUERY, { ids: frontier.slice(i, i + 50) });
      for (const raw of data.Page.media) {
        found.set(raw.id, toEntry(raw));
        for (const edge of raw.relations.edges) {
          if (!edge.relationType || !(FOLLOWED as readonly string[]).includes(edge.relationType)) continue;
          if (edge.node.type !== "ANIME" || queued.has(edge.node.id)) continue;
          if (queued.size >= MAX_ENTRIES) {
            truncated = true;
            continue;
          }
          queued.add(edge.node.id);
          next.push(edge.node.id);
        }
      }
      onProgress?.(found.size);
    }
    frontier = next;
  }
  if (frontier.length) truncated = true;
  return { entries: [...found.values()].sort(byWatchOrder), truncated };
}

/** Just the seasons directly before / after one title (one request), for "Next season" buttons. */
export async function relatedSeasons(id: number) {
  const data = await anilist<{
    Media: {
      relations: {
        edges: {
          relationType: string | null;
          node: { id: number; type: string; format: string | null; title: MediaTitle };
        }[];
      };
    };
  }>(
    `query Related($id: Int) {
      Media(id: $id, type: ANIME) {
        relations { edges { relationType(version: 2) node { id type format title { romaji english native } } } }
      }
    }`,
    { id },
  );
  return data.Media.relations.edges
    .filter(
      (e) =>
        (e.relationType === "SEQUEL" || e.relationType === "PREQUEL") &&
        e.node.type === "ANIME" &&
        ["TV", "TV_SHORT", "MOVIE", "ONA"].includes(e.node.format ?? ""),
    )
    .map((e) => ({ relation: e.relationType as "SEQUEL" | "PREQUEL", id: e.node.id, title: titleOf(e.node) }));
}
