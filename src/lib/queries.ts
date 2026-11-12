import { queryOptions } from "@tanstack/react-query";

import {
  browseMedia,
  currentSeason,
  getMedia,
  nextSeason,
  recentlyAired,
  type BrowseVars,
  type MediaCard,
} from "./anilist";
import { isCustomId } from "./cloud-episodes";
import { getCustomMedia } from "./custom-series";

const HOUR = 1000 * 60 * 60;

export function browseQuery(vars: BrowseVars) {
  return queryOptions({
    queryKey: ["anilist", "browse", vars],
    queryFn: () => browseMedia(vars),
    staleTime: HOUR,
  });
}

export function mediaQuery(id: number) {
  const custom = isCustomId(id);
  return queryOptions({
    queryKey: ["anilist", "media", id],
    queryFn: () => (custom ? getCustomMedia(id) : getMedia(id)),
    // Custom series come from Firestore, so always re-check them when a page opens.
    staleTime: custom ? 0 : HOUR,
  });
}

export const trendingQuery = () => browseQuery({ sort: ["TRENDING_DESC"], perPage: 20 });

export const thisSeasonQuery = () => {
  const { season, year } = currentSeason();
  return browseQuery({ season, seasonYear: year, sort: ["POPULARITY_DESC"], perPage: 20 });
};

/**
 * "Coming next season": the titles AniList files under the next season, plus (when that
 * list is still thin because studios haven't announced everything) the most anticipated
 * not-yet-released titles. Music videos and one-off specials are left out, and anything
 * that is already finished or cancelled never shows.
 */
export const nextSeasonQuery = () => {
  const { season, year } = nextSeason();
  return queryOptions({
    queryKey: ["anilist", "next-season", season, year],
    queryFn: async () => {
      const [bySeason, soon] = await Promise.all([
        browseMedia({ season, seasonYear: year, sort: ["POPULARITY_DESC"], perPage: 30 }),
        browseMedia({ status: "NOT_YET_RELEASED", sort: ["POPULARITY_DESC"], perPage: 30 }),
      ]);
      const keep = (m: MediaCard) =>
        m.format !== "MUSIC" && m.format !== "SPECIAL" && m.status !== "FINISHED" && m.status !== "CANCELLED";
      const seen = new Set<number>();
      const merged: MediaCard[] = [];
      for (const m of bySeason.media.filter(keep)) {
        seen.add(m.id);
        merged.push(m);
      }
      if (merged.length < 14) {
        for (const m of soon.media.filter(keep)) {
          if (seen.has(m.id) || merged.length >= 20) continue;
          seen.add(m.id);
          merged.push(m);
        }
      }
      return { ...bySeason, media: merged.slice(0, 20) };
    },
    staleTime: HOUR,
  });
};

export const allTimePopularQuery = () => browseQuery({ sort: ["POPULARITY_DESC"], perPage: 20 });

export const topRatedQuery = () => browseQuery({ sort: ["SCORE_DESC"], perPage: 20 });

export const topAiringQuery = () =>
  browseQuery({ status: "RELEASING", sort: ["TRENDING_DESC"], perPage: 10 });

export const recentlyAiredQuery = () =>
  queryOptions({
    queryKey: ["anilist", "recently-aired"],
    queryFn: () => recentlyAired(100),
    staleTime: 1000 * 60 * 10,
  });
