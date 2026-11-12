import { isSeasonLike, sameSeries } from "@/lib/season-titles";

const ENDPOINT = "https://graphql.anilist.co";

export type MediaTitle = {
  romaji: string | null;
  english: string | null;
  native: string | null;
};

export type MediaCard = {
  id: number;
  title: MediaTitle;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    color: string | null;
  };
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  averageScore: number | null;
  seasonYear: number | null;
  genres: string[];
  description: string | null;
  nextAiringEpisode: {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
  } | null;
  /** Only set when a query asked for it. */
  isAdult?: boolean;
  popularity?: number | null;
};

export type MediaDetail = MediaCard & {
  duration: number | null;
  season: string | null;
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  } | null;
  popularity: number | null;
  favourites: number | null;
  meanScore?: number | null;
  endDate?: {
    year: number | null;
    month: number | null;
    day: number | null;
  } | null;
  studios: { nodes: { id: number; name: string }[] };
  mainStudios?: { nodes: { id: number; name: string }[] };
  trailer: { id: string | null; site: string | null } | null;
  externalLinks: {
    id: number;
    site: string;
    url: string;
    type: string | null;
    color: string | null;
  }[];
  /** Public thumbnails for the legal streaming episodes AniList has linked for this title. */
  streamingEpisodes?:
    | {
        title: string | null;
        thumbnail: string | null;
        url: string | null;
        site: string | null;
      }[]
    | null;
  characters: {
    edges: {
      id: number;
      role: string | null;
      node: {
        id: number;
        name: { full: string };
        image: { large: string | null };
      };
      voiceActors: {
        id: number;
        name: { full: string };
        image: { large: string | null };
        languageV2?: string | null;
      }[];
    }[];
  };
  relations: {
    edges: {
      id: number;
      relationType: string | null;
      node: MediaCard & {
        type: string;
        startDate?: {
          year: number | null;
          month: number | null;
          day: number | null;
        } | null;
      };
    }[];
  };
  recommendations: {
    nodes: { id: number; mediaRecommendation: MediaCard | null }[];
  };
};

const RELATED_ANIME_RELATIONS = new Set([
  "ADAPTATION",
  "ALTERNATIVE",
  "SIDE_STORY",
  "SPIN_OFF",
]);

/** Keep franchise side stories here; the main season chain and catch-all relations go elsewhere. */
export function isRelatedAnimeRelation(relationType: string | null) {
  return relationType !== null && RELATED_ANIME_RELATIONS.has(relationType);
}

export type PageResult<T> = {
  pageInfo: { currentPage: number; hasNextPage: boolean; total: number };
  media: T[];
};

const CARD_FIELDS = `
  id
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage
  format
  status
  episodes
  averageScore
  seasonYear
  genres
  description(asHtml: false)
  nextAiringEpisode { episode airingAt timeUntilAiring }
  isAdult
  popularity
`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * AniList allows about 90 requests a minute. When it says "slow down" (429) or the
 * network blips, wait and try again instead of showing an empty page.
 */
export async function anilist<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await wait(
          Math.min(
            8000,
            (Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter
              : 2 ** attempt) * 1000,
          ),
        );
        lastError = new Error(
          `AniList is busy (${res.status}). Try again in a moment.`,
        );
        continue;
      }
      const json = (await res.json()) as {
        data?: T;
        errors?: { message: string }[];
      };
      if (!res.ok || json.errors?.length) {
        throw new Error(
          json.errors?.[0]?.message ?? `AniList request failed (${res.status})`,
        );
      }
      return json.data as T;
    } catch (error) {
      // fetch() itself throws a TypeError when the network drops; anything else is a real answer.
      if (!(error instanceof TypeError)) throw error;
      lastError = error;
      await wait(600 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Couldn't reach AniList.");
}

export type BrowseVars = {
  page?: number;
  perPage?: number;
  search?: string;
  genre?: string;
  season?: string;
  seasonYear?: number;
  format?: string;
  status?: string;
  sort?: string[];
  /** Include 18+ titles. Off by default for the home page rows. */
  includeAdult?: boolean;
};

export function browseMedia({ includeAdult, ...vars }: BrowseVars) {
  return anilist<{ Page: PageResult<MediaCard> }>(
    `query Browse($page: Int, $perPage: Int, $search: String, $genre: String, $season: MediaSeason,
                  $seasonYear: Int, $format: MediaFormat, $status: MediaStatus, $sort: [MediaSort],
                  $isAdult: Boolean) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { currentPage hasNextPage total }
        media(type: ANIME, isAdult: $isAdult, search: $search, genre: $genre, season: $season,
              seasonYear: $seasonYear, format: $format, status: $status, sort: $sort) {
          ${CARD_FIELDS}
        }
      }
    }`,
    // Leaving isAdult out returns both kinds; false hides 18+.
    {
      perPage: 24,
      page: 1,
      sort: ["POPULARITY_DESC"],
      ...vars,
      isAdult: includeAdult ? undefined : false,
    },
  ).then((d) => d.Page);
}

/** Cards for a list of AniList ids (used to fetch banners for titles stored in Firestore). */
export function mediaByIds(ids: number[]) {
  if (!ids.length) return Promise.resolve([] as MediaCard[]);
  return anilist<{ Page: PageResult<MediaCard> }>(
    `query ByIds($ids: [Int], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        pageInfo { currentPage hasNextPage total }
        media(id_in: $ids, type: ANIME) { ${CARD_FIELDS} }
      }
    }`,
    { ids, perPage: Math.min(50, ids.length) },
  ).then((d) => d.Page.media);
}

export type AiredEpisode = {
  id: number;
  episode: number;
  airingAt: number;
  media: MediaCard;
};

/** Episodes that aired most recently, newest first, one per title. */
export function recentlyAired(perPage = 50) {
  return anilist<{
    Page: {
      airingSchedules: {
        id: number;
        episode: number;
        airingAt: number;
        media: MediaCard | null;
      }[];
    };
  }>(
    `query Aired($perPage: Int, $now: Int) {
      Page(page: 1, perPage: $perPage) {
        airingSchedules(notYetAired: false, airingAt_lesser: $now, sort: TIME_DESC) {
          id
          episode
          airingAt
          media { ${CARD_FIELDS} }
        }
      }
    }`,
    { perPage, now: Math.floor(Date.now() / 1000) },
  ).then((d) => {
    const seen = new Set<number>();
    const out: AiredEpisode[] = [];
    for (const row of d.Page.airingSchedules) {
      const m = row.media;
      if (!m || m.isAdult || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({
        id: row.id,
        episode: row.episode,
        airingAt: row.airingAt,
        media: m,
      });
    }
    return out;
  });
}

export function getMedia(id: number) {
  return anilist<{ Media: MediaDetail }>(
    `query Detail($id: Int) {
      Media(id: $id, type: ANIME) {
        ${CARD_FIELDS}
        duration
        season
        startDate { year month day }
        endDate { year month day }
        meanScore
        popularity
        favourites
        mainStudios: studios(isMain: true) { nodes { id name } }
        studios { nodes { id name } }
        trailer { id site }
        externalLinks { id site url type color }
        streamingEpisodes { title thumbnail url site }
        characters(sort: [ROLE, RELEVANCE], perPage: 25) {
          edges {
            id
            role
            node { id name { full } image { large } }
            voiceActors(sort: [RELEVANCE]) { id name { full } image { large } languageV2 }
          }
        }
        relations {
          edges { id relationType node { ${CARD_FIELDS} type startDate { year month day } } }
        }
        recommendations(sort: [RATING_DESC], perPage: 12) {
          nodes { id mediaRecommendation { ${CARD_FIELDS} } }
        }
      }
    }`,
    { id },
  ).then((d) => d.Media);
}

export const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

export const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
];

export const FORMATS = [
  "TV",
  "TV_SHORT",
  "MOVIE",
  "SPECIAL",
  "OVA",
  "ONA",
  "MUSIC",
];

export const STATUSES = [
  "RELEASING",
  "FINISHED",
  "NOT_YET_RELEASED",
  "CANCELLED",
  "HIATUS",
];

export const SORTS = [
  { value: "POPULARITY_DESC", label: "Most popular" },
  { value: "TRENDING_DESC", label: "Trending" },
  { value: "SCORE_DESC", label: "Highest rated" },
  { value: "START_DATE_DESC", label: "Newest" },
  { value: "TITLE_ROMAJI", label: "A - Z" },
];

export function currentSeason(date = new Date()) {
  return {
    season: SEASONS[Math.floor(date.getUTCMonth() / 3)],
    year: date.getUTCFullYear(),
  };
}

export function nextSeason(date = new Date()) {
  const i = Math.floor(date.getUTCMonth() / 3);
  return i === 3
    ? { season: SEASONS[0], year: date.getUTCFullYear() + 1 }
    : { season: SEASONS[i + 1], year: date.getUTCFullYear() };
}

export function titleOf(m: { title: MediaTitle }) {
  return m.title.english || m.title.romaji || m.title.native || "Untitled";
}

export function stripHtml(html: string | null | undefined) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ACRONYMS = new Set(["TV", "OVA", "ONA", "JP", "US"]);

export function prettyLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .split("_")
    .map((w) =>
      ACRONYMS.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.charAt(0) + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function countdown(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const LEGAL_HOSTS = [
  "Crunchyroll",
  "Netflix",
  "Hulu",
  "HIDIVE",
  "Amazon",
  "Prime Video",
  "Disney Plus",
  "Max",
  "Apple TV",
  "YouTube",
  "Bilibili TV",
  "iQIYI",
  "Muse Asia",
  "RetroCrush",
  "Tubi TV",
  "Ani-One Asia",
  "AnimeLab",
  "VRV",
];

export function legalStreamingLinks(
  links: MediaDetail["externalLinks"] | undefined,
) {
  if (!links) return [];
  return links.filter(
    (l) =>
      l.type === "STREAMING" &&
      LEGAL_HOSTS.some((h) => l.site.toLowerCase().includes(h.toLowerCase())),
  );
}

/** "2h ago", "3d ago". */
export function timeAgo(epochSeconds: number, now = Date.now()) {
  const diff = Math.max(0, Math.floor(now / 1000 - epochSeconds));
  if (diff < 60) return "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/* ------------------------------------------------------------ whole franchise */

export type FuzzyDateValue = {
  year: number | null;
  month: number | null;
  day: number | null;
} | null;

export type FranchiseNode = MediaCard & {
  type: string;
  startDate: FuzzyDateValue;
};

type ChainPage = {
  Page: {
    media: (FranchiseNode & {
      relations: {
        edges: {
          relationType: string | null;
          node: {
            id: number;
            type: string;
            format?: string | null;
            title?: { romaji: string | null; english: string | null; native: string | null };
          };
        }[];
      };
    })[];
  };
};

/** AniList sometimes files a later part or season under one of these instead of "sequel". */
const PART_LINKS = new Set(["SIDE_STORY", "ALTERNATIVE", "PARENT", "SPIN_OFF", "OTHER"]);

/**
 * Every anime connected to this one by PREQUEL / SEQUEL links, however far away
 * (Season 1 → … → the newest season or movie), including the title itself.
 * AniList only lists direct neighbours, so this walks outward a level at a time.
 */
export async function getFranchiseChain(
  rootId: number,
): Promise<FranchiseNode[]> {
  const found = new Map<number, FranchiseNode>();
  const queued = new Set<number>([rootId]);
  let frontier = [rootId];
  for (
    let depth = 0;
    depth < 12 && frontier.length && found.size < 40;
    depth++
  ) {
    const ids = frontier.slice(0, 25);
    const data = await anilist<ChainPage>(
      `query Chain($ids: [Int]) {
        Page(perPage: 25) {
          media(id_in: $ids, type: ANIME) {
            ${CARD_FIELDS}
            type
            startDate { year month day }
            relations { edges { relationType node { id type format title { romaji english native } } } }
          }
        }
      }`,
      { ids },
    );
    frontier = [];
    for (const { relations, ...node } of data.Page.media) {
      found.set(node.id, node as FranchiseNode);
      for (const edge of relations.edges) {
        const next = edge.node;
        const isSequelLink = edge.relationType === "PREQUEL" || edge.relationType === "SEQUEL";
        // A part or season filed under a side-story style link counts too, but only when its title
        // says it is a season or part of this very same series.
        const isHiddenPart =
          !isSequelLink &&
          edge.relationType !== null &&
          PART_LINKS.has(edge.relationType) &&
          next.format === "TV" &&
          !!next.title &&
          isSeasonLike(next.title) &&
          sameSeries(next.title, node.title);
        if ((isSequelLink || isHiddenPart) && next.type === "ANIME" && !queued.has(next.id)) {
          queued.add(next.id);
          frontier.push(next.id);
        }
      }
    }
  }
  return [...found.values()];
}
