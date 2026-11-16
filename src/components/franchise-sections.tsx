import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, Layers } from "lucide-react";

import { DragScroller } from "@/components/drag-scroller";
import { AnimeCard } from "@/components/anime-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFranchiseChain,
  isRelatedAnimeRelation,
  prettyLabel,
  titleOf,
  type FranchiseNode,
  type MediaCard,
  type MediaDetail,
} from "@/lib/anilist";
import { isCustomId, type CloudAnime } from "@/lib/cloud-episodes";
import { TMDB_ID_MIN, getSeriesSeasons, getTmdbDoc } from "@/lib/tmdb-links";
import { buildFranchise, type FranchiseEdge } from "@/lib/franchise";
import { cn } from "@/lib/utils";

type FuzzyDate =
  | { year: number | null; month: number | null; day: number | null }
  | null
  | undefined;
const sortKey = (d: FuzzyDate) =>
  (d?.year ?? 9999) * 10000 + (d?.month ?? 0) * 100 + (d?.day ?? 0);

type Entry = {
  id: number;
  node: FranchiseNode;
  badge?: string;
  label: string;
  tone: string;
  current?: boolean;
};

function Title({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  const { node } = entry;
  const cover = node.coverImage.extraLarge ?? node.coverImage.large;
  const poster = (
    <div
      className={cn(
        "group relative aspect-2/3 overflow-hidden rounded-xl bg-black transition",
        entry.current
          ? "ring-[3px] ring-primary"
          : "ring-1 ring-border group-hover:ring-primary/35",
      )}
    >
      {cover && (
        <img
          src={cover}
          alt={`${titleOf(node)} poster art`}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover transition-transform duration-300 ease-out md:group-hover:scale-105"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-3 pb-3 pt-10 text-left opacity-0 transition-[opacity,transform] duration-200 ease-out md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 motion-reduce:transition-none">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-white">
          {titleOf(node)}
        </p>
      </div>
      {!entry.current && entry.badge && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
          {entry.badge}
        </span>
      )}
    </div>
  );
  return (
    <div className="group relative z-0 w-[148px] shrink-0 transform-gpu transition-transform duration-200 ease-out md:hover:z-20 md:hover:-translate-y-2 md:hover:scale-[1.05] motion-reduce:transition-none sm:w-[168px] md:w-[184px]">
      {entry.current ? (
        poster
      ) : (
        <Link
          to="/anime/$id"
          params={{ id: String(node.id) }}
          draggable={false}
          aria-label={`Open ${titleOf(node)} details`}
          className="group block focus-visible:outline-none"
        >
          {poster}
        </Link>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {node.episodes && node.format !== "MOVIE" ? (
          <span className="rounded-md bg-surface-2/70 px-2 py-0.5">
            {node.episodes} ep
          </span>
        ) : null}
        {node.format ? (
          <span className="rounded-md bg-surface-2/70 px-2 py-0.5">
            {prettyLabel(node.format)}
          </span>
        ) : null}
        {node.seasonYear ? (
          <span className="rounded-md bg-surface-2/70 px-2 py-0.5">
            {node.seasonYear}
          </span>
        ) : null}
      </div>
      <div className="mt-2 transition-opacity duration-200 ease-out md:group-hover:opacity-0 md:group-focus-within:opacity-0 motion-reduce:transition-none">
        <p className={cn("text-sm font-bold", entry.tone)}>{entry.label}</p>
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {entry.current ? (
            titleOf(node)
          ) : (
            <Link
              to="/anime/$id"
              params={{ id: String(node.id) }}
              draggable={false}
              className="hover:text-primary max-md:pointer-events-none"
            >
              {titleOf(node)}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Shown under the player: the next season (if there is one), every season / movie / OVA of
 * the series, related stories, and similar anime. Same data as the details page.
 */
function useFranchiseData(media: MediaDetail) {
  const animeEdges = useMemo(
    () => media.relations.edges.filter((e) => e.node.type === "ANIME"),
    [media],
  );

  // AniList only lists direct neighbours, so the whole prequel/sequel chain is walked.
  const chain = useQuery({
    queryKey: ["anilist", "franchise", media.id],
    queryFn: () => getFranchiseChain(media.id),
    enabled: !isCustomId(media.id),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  const franchise = useMemo(() => {
    const me = {
      ...media,
      type: "ANIME",
      startDate: media.startDate,
    } as FranchiseNode;
    // Seasons, parts, movies and OVAs in release order. A part or season that AniList filed as a
    // "side story" or "alternative" is brought in here when its title shows it is part of this series.
    return buildFranchise(me, chain.data, animeEdges as unknown as FranchiseEdge[]).map<Entry>((item) => ({
      id: item.id,
      node: item.node,
      current: item.current,
      badge: item.current ? undefined : item.badge === "Current" ? undefined : item.badge,
      label: item.label,
      tone: "text-gold",
    }));
  }, [animeEdges, media, chain.data]);
  return { animeEdges, franchise };
}

function RelatedSection({
  items,
}: {
  items: { id: number; node: FranchiseNode; note: string }[];
}) {
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section
      aria-labelledby="related-heading"
      className="mx-1 min-w-0 sm:mx-0 lg:rounded-2xl lg:p-3 lg:glass"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1 lg:px-0">
        <h2
          id="related-heading"
          className="text-sm font-extrabold uppercase tracking-wider lg:text-base"
        >
          Related
        </h2>
        {items.length > pageSize ? (
          <div className="flex shrink-0 items-center gap-1">
            <span
              className="px-1 text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="Previous related anime page"
              title="Previous related anime page"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="grid size-11 place-items-center rounded-full border border-border text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next related anime page"
              title="Next related anime page"
              disabled={safePage >= pageCount - 1}
              onClick={() =>
                setPage((current) => Math.min(pageCount - 1, current + 1))
              }
              className="grid size-11 place-items-center rounded-full border border-border text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <ul
        aria-label={`Related anime, page ${safePage + 1} of ${pageCount}`}
        className="hidden flex-col gap-2 lg:flex"
      >
        {pageItems.map((item) => {
          const image =
            item.node.coverImage.extraLarge ?? item.node.coverImage.large;
          return (
            <li key={item.id}>
              <Link
                to="/anime/$id"
                params={{ id: String(item.node.id) }}
                draggable={false}
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-2 transition hover:border-white/25 hover:bg-surface/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-xs font-semibold leading-snug text-foreground transition-colors group-hover:text-white">
                    {titleOf(item.node)}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1 text-[10px] font-medium text-muted-foreground">
                    <span className="rounded bg-white/10 px-1.5 py-0.5">
                      {item.note}
                    </span>
                    {item.node.seasonYear ? (
                      <span className="rounded bg-white/10 px-1.5 py-0.5">
                        {item.node.seasonYear}
                      </span>
                    ) : null}
                    {item.node.episodes && item.node.format !== "MOVIE" ? (
                      <span className="rounded bg-white/10 px-1.5 py-0.5">
                        {item.node.episodes} ep
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <DragScroller
        key={safePage}
        role="region"
        aria-label={`Related anime, page ${safePage + 1} of ${pageCount}`}
        className="gap-3 px-1 py-2 touch-pan-x touch-pan-y lg:hidden"
      >
        {pageItems.map((item) => (
          <Link
            key={item.id}
            to="/anime/$id"
            params={{ id: String(item.node.id) }}
            draggable={false}
            aria-label={`Open ${titleOf(item.node)}`}
            className="group w-28 shrink-0 sm:w-32 lg:w-36"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border transition group-hover:ring-foreground/40">
              {(item.node.coverImage.extraLarge ??
              item.node.coverImage.large) ? (
                <img
                  src={
                    item.node.coverImage.extraLarge ??
                    item.node.coverImage.large ??
                    undefined
                  }
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-snug">
              {titleOf(item.node)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-medium text-white/90">
              <span className="rounded bg-white/10 px-1.5 py-0.5">
                {item.note}
              </span>
              {item.node.seasonYear ? (
                <span className="rounded bg-white/10 px-1.5 py-0.5">
                  {item.node.seasonYear}
                </span>
              ) : null}
              {item.node.episodes && item.node.format !== "MOVIE" ? (
                <span className="rounded bg-white/10 px-1.5 py-0.5">
                  {item.node.episodes} ep
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </DragScroller>
    </section>
  );
}


/* ------------------------------------------------------------ Seasons panel */

type SeasonTileData = {
  key: string | number;
  id: number;
  current: boolean;
  image: string | null;
  /** "Season 3 · Part 1": the part goes on its own line. */
  label: string;
  year: number | null;
  full: boolean;
};

/**
 * The Seasons panel (1.23): a lighter box with an icon, tiles two per row at 16:9, the artwork darkened so the
 * centred bold title and the year are always readable, a CURRENT badge on the season being watched,
 * and one full-width tile for Special / Movie / OVA entries.
 */
function SeasonsBox({ tiles }: { tiles: SeasonTileData[] }) {
  return (
    <section aria-labelledby="seasons-heading" className="section-box mx-1 p-3 sm:mx-0">
      <h2 id="seasons-heading" className="flex items-center gap-2 px-1 pb-2 text-sm font-extrabold uppercase tracking-wider">
        <Layers className="size-4" /> Seasons
      </h2>
      <ul aria-label="Seasons" className="grid grid-cols-2 gap-2 px-1 py-1">
        {tiles.map((t) => {
          const [line1, line2] = t.label.split(" · ");
          const body = (
            <>
              {t.image && (
                <img
                  src={t.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="season-art absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                />
              )}
              {/* Dark layer so the text reads on bright artwork. */}
              <span className="absolute inset-0 bg-black/60" />
              {t.current && (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-primary-foreground">
                  CURRENT
                </span>
              )}
              <span className="relative flex h-full flex-col items-center justify-center px-2 text-center text-white">
                <span className="line-clamp-2 text-[clamp(0.95rem,3.6vw,1.15rem)] font-extrabold leading-tight drop-shadow-lg">{line1}</span>
                {line2 && <span className="text-xs font-bold text-white/90">{line2}</span>}
                {t.year ? <span className="mt-0.5 text-xs font-semibold text-white/80">{t.year}</span> : null}
              </span>
            </>
          );
          const cls = cn(
            "group relative block aspect-video overflow-hidden rounded-lg border bg-black transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            t.current ? "border-primary" : "border-white/15",
          );
          return (
            <li key={t.key} className={cn("season-bubble", t.full && "col-span-2")} data-season-current={t.current ? "true" : "false"}>
              {t.current ? (
                <div className={cls} aria-current="true">
                  {body}
                </div>
              ) : (
                <Link to="/anime/$id" params={{ id: String(t.id) }} draggable={false} aria-label={`Open ${t.label}`} className={cls}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Imported TMDB series: the Seasons panel is built from the records that share the seriesKey. */
function TmdbSeasonsPanel({ media }: { media: MediaDetail }) {
  const [rows, setRows] = useState<CloudAnime[]>([]);
  useEffect(() => {
    let active = true;
    void getTmdbDoc(media.id)
      .then((doc) => (doc?.seriesKey && doc.kind !== "movie" ? getSeriesSeasons(doc.seriesKey) : []))
      .then((list) => active && setRows(list))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [media.id]);
  if (rows.length < 2) return null;
  return (
    <SeasonsBox
      tiles={rows.map((r) => ({
        key: r.anilistId,
        id: r.anilistId,
        current: r.anilistId === media.id,
        image: r.banner ?? r.poster,
        label: r.seasonNumber === 0 ? "Specials" : `Season ${r.seasonNumber ?? 1}`,
        year: r.year,
        full: r.seasonNumber === 0,
      }))}
    />
  );
}

/**
 * Under the episode tray: the main seasons as picture tiles, then everything related
 * (movies, OVAs, specials, side stories) as a tidy list.
 */
export function SeasonsRelated({
  media,
  mobileInfo,
}: {
  media: MediaDetail;
  mobileInfo?: React.ReactNode;
}) {
  const { animeEdges, franchise } = useFranchiseData(media);
  // AniList uses SPECIAL for main-story continuation episodes such as Attack on Titan's
  // Final Chapters. These are in the prequel/sequel chain, so keep them with the seasons.
  const isMain = (e: Entry) =>
    e.node.format === "TV" ||
    e.node.format === "TV_SHORT" ||
    e.node.format === "SPECIAL";
  // Specials (for example "Special 2023") are not seasons: they get one full-width tile at the bottom.
  const seasons = franchise.filter((e) => isMain(e) && e.node.format !== "SPECIAL");
  const specials = franchise.filter((e) => e.node.format === "SPECIAL");
  const others = franchise.filter(
    (e) => !isMain(e) && e.node.format !== "MUSIC",
  );
  const recommendationIds = new Set(
    media.recommendations.nodes
      .map((node) => node.mediaRecommendation?.id)
      .filter((id): id is number => typeof id === "number"),
  );
  const sideStories = animeEdges.filter(
    (e) =>
      isRelatedAnimeRelation(e.relationType) &&
      !recommendationIds.has(e.node.id) &&
      !franchise.some((f) => f.id === e.node.id),
  );
  const related = [
    ...others
      .filter((entry) => !recommendationIds.has(entry.id))
      .map((e) => ({ id: e.id, node: e.node, note: e.label })),
    ...sideStories.map((e) => ({
      id: e.node.id,
      node: e.node as FranchiseNode,
      note: prettyLabel(e.relationType),
    })),
  ];
  const art = (n: FranchiseNode) =>
    n.bannerImage ?? n.coverImage.extraLarge ?? n.coverImage.large;
  const seasonLabel = (entry: Entry, index: number) => {
    const title = titleOf(entry.node);
    const specialPart = title.match(/\bSpecial\s*(\d+)\b/i);
    if (
      entry.node.format === "SPECIAL" &&
      specialPart &&
      /final\s+chapters?/i.test(title)
    ) {
      return `Final Chapters · Part ${Number(specialPart[1])}`;
    }
    if (entry.node.format === "SPECIAL")
      return specialPart ? `Special ${Number(specialPart[1])}` : "Special";
    // The label already says "Season 2", "Season 2 Part 2" or "Final Season Part 1".
    const named = entry.label.match(/^(Season \d+|Final Season)(?: Part (\d+))?$/);
    if (named) return named[2] ? `${named[1]} · Part ${named[2]}` : named[1];
    const seasonNumber =
      entry.label.match(/\bSeason\s*(\d+)\b/i)?.[1] ??
      title.match(/\bSeason\s*(\d+)\b/i)?.[1];
    return `Season ${seasonNumber ? Number(seasonNumber) : index + 1}`;
  };
  if (seasons.length < 2 && specials.length === 0 && related.length === 0 && media.id < TMDB_ID_MIN) return mobileInfo ?? null;
  return (
    <>
      {(seasons.length > 1 || (seasons.length > 0 && specials.length > 0)) && (
        <SeasonsBox
          tiles={[
            ...seasons.map((e, index) => ({
              key: e.id,
              id: e.node.id,
              current: e.current,
              image: art(e.node),
              label: seasonLabel(e, index),
              year: e.node.seasonYear,
              full: false,
            })),
            ...specials.map((e, index) => ({
              key: e.id,
              id: e.node.id,
              current: e.current,
              image: art(e.node),
              label: seasonLabel(e, index),
              year: e.node.seasonYear,
              full: true,
            })),
          ]}
        />
      )}
      {media.id >= TMDB_ID_MIN && <TmdbSeasonsPanel media={media} />}
      {mobileInfo}
      {related.length > 0 && (
        <>
          <RelatedSection key={media.id} items={related} />
        </>
      )}
    </>
  );
}

/**
 * Shown under the player: the next season (if there is one), every season / movie / OVA of
 * the series, related stories, and similar anime. Same data as the details page.
 */
export function FranchiseSections({
  media,
  only,
}: {
  media: MediaDetail;
  only?: "recs";
}) {
  const [order, setOrder] = useState<"release" | "newest">("release");
  const { animeEdges, franchise } = useFranchiseData(media);

  const here = franchise.findIndex((e) => e.current);
  const next =
    here >= 0
      ? franchise.slice(here + 1).find((e) => e.node.format !== "MUSIC")
      : undefined;
  const shown = order === "release" ? franchise : [...franchise].reverse();
  const recs = media.recommendations.nodes
    .map((n) => n.mediaRecommendation)
    .filter((m): m is MediaCard => Boolean(m));
  const recommendationIds = new Set(
    recs.map((recommendation) => recommendation.id),
  );
  const related = animeEdges.filter(
    (e) =>
      isRelatedAnimeRelation(e.relationType) &&
      !recommendationIds.has(e.node.id) &&
      !franchise.some((f) => f.id === e.node.id),
  );
  if (only === "recs") {
    return recs.length ? (
      <div className="mt-10 min-w-0">
        <Title title="You might also like" />
        <DragScroller className="gap-4 px-1 py-5">
          {recs.map((m) => (
            <AnimeCard
              key={m.id}
              media={m}
              className="w-32 shrink-0 sm:w-36 md:w-44"
            />
          ))}
        </DragScroller>
      </div>
    ) : null;
  }
  if (!next && franchise.length < 2 && !related.length && !recs.length)
    return null;

  return (
    <div className="mt-10 flex flex-col gap-10">
      {next && (
        <section aria-labelledby="next-season-heading">
          <Title title="Next season" hint="Where the story continues" />
          <Link
            to="/anime/$id"
            params={{ id: String(next.node.id) }}
            className="group flex max-w-2xl items-stretch gap-4 overflow-hidden rounded-2xl border border-border bg-surface/60 p-3 backdrop-blur transition hover:border-foreground/40"
          >
            {(next.node.coverImage.extraLarge ??
              next.node.coverImage.large) && (
              <img
                src={
                  (next.node.coverImage.extraLarge ??
                    next.node.coverImage.large)!
                }
                alt=""
                className="h-36 w-24 shrink-0 rounded-xl object-cover ring-1 ring-border"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">
                {next.label}
              </p>
              <p className="mt-1 line-clamp-2 text-lg font-extrabold leading-snug">
                {titleOf(next.node)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  prettyLabel(next.node.format),
                  next.node.seasonYear,
                  next.node.episodes && next.node.format !== "MOVIE" ? `${next.node.episodes} episodes` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                Open{" "}
                <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </section>
      )}

      {franchise.length > 1 && (
        <section aria-labelledby="show-heading">
          <Title title="Show" hint={`${franchise.length} entries`}>
            <Select
              value={order}
              onValueChange={(v) => setOrder(v as "release" | "newest")}
            >
              <SelectTrigger
                aria-label="Order"
                className="h-10 w-40 rounded-xl bg-surface/70"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="release">Release order</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
              </SelectContent>
            </Select>
          </Title>
          <DragScroller className="gap-4 px-1 py-5">
            {shown.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </DragScroller>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-heading">
          <Title title="Related" hint="Side stories and franchise connections">
            <span className="text-xs text-muted-foreground">
              {related.length} entries
            </span>
          </Title>
          <DragScroller className="gap-4 py-5 pb-2">
            {related.map((edge) => (
              <EntryCard
                key={edge.id}
                entry={{
                  id: edge.node.id,
                  node: edge.node as FranchiseNode,
                  badge: "Related",
                  label: prettyLabel(edge.relationType),
                  tone: "text-white",
                }}
              />
            ))}
          </DragScroller>
        </section>
      )}

      {recs.length > 0 && (
        <section className="min-w-0">
          <Title title="You might also like" />
          <DragScroller className="gap-4 pb-2">
            {recs.map((m) => (
              <AnimeCard
                key={m.id}
                media={m}
                className="w-32 shrink-0 sm:w-36 md:w-44"
              />
            ))}
          </DragScroller>
        </section>
      )}
    </div>
  );
}
