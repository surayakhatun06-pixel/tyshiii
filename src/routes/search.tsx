import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";

import { SiteShell } from "@/components/site-shell";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime-card";
import { useCatalog } from "@/hooks/use-catalog";
import { cloudToCard } from "@/lib/custom-series";
import { browseMedia } from "@/lib/anilist";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search Anime by Title — TYSHI ZONE" },
      {
        name: "description",
        content:
          "Search the AniList catalogue for any anime by title and jump straight to details.",
      },
      { property: "og:title", content: "Search Anime by Title — TYSHI ZONE" },
      {
        property: "og:description",
        content: "Find any anime by title with instant search on TYSHI ZONE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q:
      typeof search.q === "string" && search.q.trim()
        ? search.q.trim().slice(0, 200)
        : undefined,
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const debounced = (q ?? "").trim();

  // Your own (custom) series live in Firestore, not AniList, so search them there too.
  const { catalog } = useCatalog();
  const cloud = useMemo(() => catalog.filter((a) => a.custom), [catalog]);
  const needle = debounced.toLowerCase();
  const own = useMemo(
    () =>
      needle
        ? cloud.filter(
            (a) =>
              a.title.toLowerCase().includes(needle) ||
              a.genres.some((g) => g.toLowerCase().includes(needle)),
          )
        : [],
    [cloud, needle],
  );

  const results = useInfiniteQuery({
    queryKey: ["anilist", "search", debounced],
    enabled: debounced.length > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      browseMedia({
        search: debounced,
        page: pageParam,
        perPage: 30,
        sort: ["SEARCH_MATCH"],
        includeAdult: true,
      }),
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? last.pageInfo.currentPage + 1 : undefined,
    staleTime: 1000 * 60 * 30,
  });

  // The same title can show up on two pages when AniList re-ranks; keep one card each.
  const media = useMemo(() => {
    const seen = new Set<number>();
    return (results.data?.pages ?? [])
      .flatMap((p) => p.media)
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [results.data]);
  const total = results.data?.pages[0]?.pageInfo.total;
  const searching = debounced.length > 0;

  return (
    <SiteShell>
      <div className="mx-auto max-w-[1600px] px-3 py-8 md:px-8">
        <h1 className="break-words text-3xl font-bold tracking-tight md:text-4xl">
          {q ? (
            <>
              Results for <span className="text-muted-foreground">“{q}”</span>
            </>
          ) : (
            "Search"
          )}
        </h1>

        {searching ? (
          <>
            {typeof total === "number" && (
              <p className="mt-5 text-sm text-muted-foreground">
                {total.toLocaleString()} result{total === 1 ? "" : "s"} on
                AniList
                {own.length > 0 ? ` · ${own.length} of your own` : ""}
              </p>
            )}

            {results.isError && (
              <div
                role="alert"
                className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
              >
                <span>
                  Couldn't reach AniList.{" "}
                  {results.error instanceof Error ? results.error.message : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void results.refetch()}
                  className="font-semibold underline"
                >
                  Try again
                </button>
              </div>
            )}

            <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 md:gap-4 xl:grid-cols-8">
              {own.map((a) => (
                <AnimeCard key={a.anilistId} media={cloudToCard(a)} />
              ))}
              {results.isPending
                ? Array.from({ length: 12 }).map((_, i) => (
                    <AnimeCardSkeleton key={i} />
                  ))
                : media.map((m) => <AnimeCard key={m.id} media={m} />)}
            </div>

            {results.hasNextPage && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  disabled={results.isFetchingNextPage}
                  onClick={() => void results.fetchNextPage()}
                  className="h-11 rounded-xl border border-border bg-surface px-8 text-sm font-semibold transition hover:border-foreground/40 disabled:opacity-50"
                >
                  {results.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}

            {!results.isPending &&
              !results.isError &&
              media.length === 0 &&
              own.length === 0 && (
                <p className="mt-10 text-center text-sm text-muted-foreground">
                  Nothing found for “{debounced}”. Try the romaji, English or
                  Japanese title.
                </p>
              )}
          </>
        ) : (
          <>
            <p className="mt-8 text-sm text-muted-foreground">
              Type a title to search every anime on AniList.
            </p>
            {cloud.length > 0 && (
              <section className="mt-10" aria-labelledby="own-heading">
                <h2
                  id="own-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  Original series
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 md:gap-4 xl:grid-cols-8">
                  {cloud.map((a) => (
                    <AnimeCard key={a.anilistId} media={cloudToCard(a)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </SiteShell>
  );
}
