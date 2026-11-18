import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";

import { SiteShell } from "@/components/site-shell";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime-card";
import {
  browseMedia,
  currentSeason,
  FORMATS,
  GENRES,
  prettyLabel,
  SEASONS,
  SORTS,
  STATUSES,
} from "@/lib/anilist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse Anime by Genre, Season & Rating — TYSHI ZONE" },
      {
        name: "description",
        content:
          "Filter thousands of anime by genre, year, season, format and status, sorted by popularity, score or release date.",
      },
      {
        property: "og:title",
        content: "Browse Anime by Genre, Season & Rating — TYSHI ZONE",
      },
      {
        property: "og:description",
        content:
          "Filter anime by genre, year, season, format and status on TYSHI ZONE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { sort?: string; status?: string } => ({
    sort:
      typeof search.sort === "string" &&
      SORTS.some((o) => o.value === search.sort)
        ? search.sort
        : undefined,
    status:
      typeof search.status === "string" &&
      STATUSES.includes(search.status as (typeof STATUSES)[number])
        ? search.status
        : undefined,
  }),
  component: BrowsePage,
});

const YEARS = Array.from(
  { length: 30 },
  (_, i) => currentSeason().year + 1 - i,
);

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  "h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary/60";

function BrowsePage() {
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [season, setSeason] = useState("");
  const [format, setFormat] = useState("");
  const { sort: sortParam, status: statusParam } = Route.useSearch();
  const [status, setStatus] = useState(statusParam ?? "");
  // The sort order lives in the address (?sort=...), so the sidebar's Trending button,
  // this dropdown and the back button always agree with each other.
  const navigate = useNavigate();
  const sort = sortParam ?? "POPULARITY_DESC";
  const setSort = (value: string) =>
    void navigate({
      to: "/browse",
      search: {
        sort: value === "POPULARITY_DESC" ? undefined : value,
        status: status || undefined,
      },
      replace: true,
    });

  const filters = { genre, year, season, format, status, sort };

  const query = useInfiniteQuery({
    queryKey: ["anilist", "browse-infinite", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      browseMedia({
        page: pageParam,
        perPage: 24,
        sort: [sort],
        genre: genre || undefined,
        seasonYear: year ? Number(year) : undefined,
        season: season || undefined,
        format: format || undefined,
        status: status || undefined,
      }),
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? last.pageInfo.currentPage + 1 : undefined,
    staleTime: 1000 * 60 * 30,
  });

  const items = query.data?.pages.flatMap((p) => p.media) ?? [];

  return (
    <SiteShell>
      <div className="mx-auto max-w-[1600px] px-3 py-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Browse anime
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {query.data?.pages[0]?.pageInfo.total?.toLocaleString() ?? "—"} titles
          match your filters.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface/60 p-4 md:grid-cols-6">
          <Field label="Genre">
            <select
              className={selectClass}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              <option value="">Any</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <select
              className={selectClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">Any</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Season">
            <select
              className={selectClass}
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              <option value="">Any</option>
              {SEASONS.map((s) => (
                <option key={s} value={s}>
                  {prettyLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format">
            <select
              className={selectClass}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="">Any</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {prettyLabel(f)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {prettyLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort by">
            <select
              className={selectClass}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {query.isError && (
          <p className="mt-8 text-sm text-destructive">
            Couldn't load titles right now. Try again in a moment.
          </p>
        )}

        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 md:gap-4 xl:grid-cols-8">
          {query.isPending
            ? Array.from({ length: 24 }).map((_, i) => (
                <AnimeCardSkeleton key={i} />
              ))
            : items.map((m) => <AnimeCard key={m.id} media={m} />)}
        </div>

        {!query.isPending && items.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No titles match those filters.
          </p>
        )}

        {query.hasNextPage && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className={cn(
                "rounded-full border border-border bg-surface px-6 py-2.5 text-sm font-semibold transition hover:border-primary/60 hover:text-primary",
                query.isFetchingNextPage && "opacity-60",
              )}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
