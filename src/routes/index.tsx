import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SiteShell } from "@/components/site-shell";
import { LatestEpisodes } from "@/components/latest-episodes";
import { TopAiring } from "@/components/top-airing";
import { Hero } from "@/components/hero";
import { AnimeRow } from "@/components/anime-row";
import { ContinueWatchingRow } from "@/components/continue-watching";
import { browseMedia, nextSeason, prettyLabel } from "@/lib/anilist";
import {
  allTimePopularQuery,
  nextSeasonQuery,
  topRatedQuery,
  trendingQuery,
} from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TYSHI ZONE — Stream, Save & Discover" },
      {
        name: "description",
        content:
          "Paste any video link to watch it instantly, save your links, and browse trending and seasonal anime.",
      },
      { property: "og:title", content: "TYSHI ZONE — Stream, Save & Discover" },
      {
        property: "og:description",
        content:
          "Watch and save video links, plus trending, seasonal and top-rated anime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.prefetchQuery(trendingQuery());
  },
  component: HomePage,
});

function HomePage() {
  const trending = useQuery(trendingQuery());

  const next = nextSeason();
  const trendingMedia = trending.data?.media ?? [];

  return (
    <SiteShell overlay>
      <Hero media={trendingMedia} loading={trending.isPending} />
      <ContinueWatchingRow />
      <div className="mx-auto max-w-[1600px]">
        <div className="grid gap-4 px-3 pt-3 md:gap-6 md:px-8 md:pt-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="order-3 min-w-0 lg:order-1">
            <NearViewport placeholderHeight={360} bleed>
              <LatestEpisodes />
            </NearViewport>
          </div>
          <div className="order-2 lg:order-2">
            <NearViewport placeholderHeight={360}>
              <TopAiring />
            </NearViewport>
          </div>
          <div className="order-1 min-w-0 lg:col-span-2 lg:order-3">
            <NearViewport placeholderHeight={360} bleed>
              <AnimeRow
                eyebrow="Right now"
                title="Trending"
                media={trendingMedia}
                loading={trending.isPending}
                bleedOnPhone
              />
            </NearViewport>
          </div>
        </div>
        <DeferredAnimeRow
          query={nextSeasonQuery()}
          eyebrow={prettyLabel(next.season) + " " + next.year}
          title="Coming next season"
        />
        <DeferredAnimeRow
          query={allTimePopularQuery()}
          eyebrow="Hall of fame"
          title="All-time popular"
        />
        <DeferredAnimeRow
          query={topRatedQuery()}
          eyebrow="Critically loved"
          title="Top rated"
        />
      </div>
    </SiteShell>
  );
}

function NearViewport({
  children,
  placeholderHeight = 360,
  bleed = false,
}: {
  children: ReactNode;
  placeholderHeight?: number;
  /** On phones, extend past the page's 12px side gutter so the rail reaches both screen edges. */
  bleed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={
        (bleed
          ? "-mx-3 max-w-none md:mx-0 md:max-w-full"
          : "max-w-full") +
        " min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_360px]"
      }
      style={near ? undefined : { minHeight: placeholderHeight }}
    >
      {near ? children : null}
    </div>
  );
}

type HomeAnimeQuery =
  | ReturnType<typeof nextSeasonQuery>
  | ReturnType<typeof allTimePopularQuery>
  | ReturnType<typeof topRatedQuery>;

function DeferredAnimeRow({
  query,
  title,
  eyebrow,
}: {
  query: HomeAnimeQuery;
  title: string;
  eyebrow?: string;
}) {
  return (
    <NearViewport placeholderHeight={340}>
      <QueriedAnimeRow query={query} title={title} eyebrow={eyebrow} />
    </NearViewport>
  );
}

function QueriedAnimeRow({
  query,
  title,
  eyebrow,
}: {
  query: HomeAnimeQuery;
  title: string;
  eyebrow?: string;
}) {
  // These home rows share one result shape, while their query keys intentionally
  // use different key parts. Keep the public data type and allow that key union.
  const { data, isPending } = useQuery<Awaited<ReturnType<typeof browseMedia>>>(
    query as never,
  );
  return (
    <AnimeRow
      title={title}
      eyebrow={eyebrow}
      media={data?.media}
      loading={isPending}
    />
  );
}
