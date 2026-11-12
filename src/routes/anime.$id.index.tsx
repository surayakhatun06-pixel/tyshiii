import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Play,
  Plus,
  Settings,
} from "lucide-react";

import { DragScroller } from "@/components/drag-scroller";
import { SiteShell } from "@/components/site-shell";
import { AnimeCard } from "@/components/anime-card";
import { AnimeDetailSkeleton } from "@/components/skeletons";
import { EpisodeThumb, ProgressBar } from "@/components/episode-thumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mediaQuery } from "@/lib/queries";
import {
  countdown,
  getFranchiseChain,
  isRelatedAnimeRelation,
  type FranchiseNode,
  legalStreamingLinks,
  prettyLabel,
  stripHtml,
  titleOf,
  type MediaCard,
  type MediaDetail,
} from "@/lib/anilist";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useMedia } from "@/hooks/use-media";
import { useDetailsBackdrop } from "@/hooks/use-appearance";
import { WatchNowAction } from "@/components/want-anime-button";
import { isCustomId } from "@/lib/cloud-episodes";
import { percentOf, resumePosition, useProgress } from "@/hooks/use-progress";
import { useEpisodeLibrary } from "@/hooks/use-cloud-episodes";
import { useAllEpisodes } from "@/lib/universal-servers";
import { orderedEpisodes } from "@/hooks/use-videos";
import {
  episodeNumberLabel,
  formatClock,
  isDefaultEpisodeTitle,
} from "@/lib/format";
import { buildFranchise, type FranchiseEdge } from "@/lib/franchise";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/anime/$id/")({
  pendingMs: 150,
  pendingMinMs: 300,
  pendingComponent: AnimeDetailSkeleton,
  loader: async ({ context, params }) => {
    const media = await context.queryClient.ensureQueryData(
      mediaQuery(Number(params.id)),
    );
    return {
      title: titleOf(media),
      description: stripHtml(media.description).slice(0, 155),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Anime unavailable — TYSHI ZONE" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${loaderData.title} — watch & details | TYSHI ZONE`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.description },
        { property: "og:type", content: "video.tv_show" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: AnimeDetailPage,
});

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type FuzzyDate =
  | { year: number | null; month: number | null; day: number | null }
  | null
  | undefined;

const isoDate = (d: FuzzyDate) =>
  d?.year
    ? [
        d.year,
        d.month ? String(d.month).padStart(2, "0") : null,
        d.day ? String(d.day).padStart(2, "0") : null,
      ]
        .filter(Boolean)
        .join("-")
    : "—";

const sortKey = (d: FuzzyDate) =>
  (d?.year ?? 9999) * 10000 + (d?.month ?? 0) * 100 + (d?.day ?? 0);

function seasonLabel(m: Pick<MediaDetail, "season" | "seasonYear">) {
  if (m.season && m.seasonYear)
    return `${prettyLabel(m.season)} ${m.seasonYear}`;
  return m.seasonYear ? String(m.seasonYear) : "";
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function Chip({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border border-border px-3 py-1 text-xs",
        strong ? "bg-surface-2 font-bold" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({
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

function Trailer({
  trailer,
}: {
  trailer: NonNullable<MediaDetail["trailer"]>;
}) {
  const [playing, setPlaying] = useState(false);
  if (!trailer.id || trailer.site?.toLowerCase() !== "youtube") return null;
  return (
    <section aria-labelledby="trailer-heading">
      <h2
        id="trailer-heading"
        className="mb-3 text-xl font-bold tracking-tight"
      >
        Trailer
      </h2>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-border">
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${trailer.id}?autoplay=1&rel=0`}
            title="Trailer"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play trailer"
            className="group absolute inset-0"
          >
            <img
              src={`https://img.youtube.com/vi/${trailer.id}/hqdefault.jpg`}
              alt=""
              className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-16 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition group-hover:scale-105">
                <Play className="size-7 translate-x-0.5 fill-current" />
              </span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

type Franchise = {
  id: number;
  node: MediaDetail["relations"]["edges"][number]["node"];
  badge: string;
  label: string;
  tone: string;
  current?: boolean;
};

function FranchiseCard({ entry }: { entry: Franchise }) {
  const { node } = entry;
  const cover = node.coverImage.extraLarge ?? node.coverImage.large;
  const poster = (
    <div className="relative aspect-2/3 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border transition-[box-shadow,ring-color] duration-150 group-hover:ring-primary/70 group-hover:shadow-[0_8px_28px_var(--theme-wash)] group-focus-within:ring-primary">
      {cover && (
        <img
          src={cover}
          alt={`${titleOf(node)} poster art`}
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      )}
      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
        {entry.current && <Check className="size-3" />}
        {entry.badge}
      </span>
      <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-background via-background/80 to-transparent px-3 pb-3 pt-10 opacity-0 transition-[opacity,transform] duration-200 ease-out md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 motion-reduce:transition-none">
        <p className="line-clamp-1 text-xs font-bold text-primary">
          {entry.label}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-foreground">
          {titleOf(node)}
        </h3>
        <p className="mt-1 text-[10px] font-medium text-muted-foreground">
          {[
            node.format ? prettyLabel(node.format) : null,
            node.episodes && node.format !== "MOVIE" ? `${node.episodes} episodes` : null,
            node.seasonYear,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
  return (
    <div className="group relative z-0 w-[168px] shrink-0 transform-gpu transition-transform duration-200 ease-out md:hover:z-20 md:hover:-translate-y-2 md:hover:scale-[1.05] motion-reduce:transition-none md:w-[192px]">
      {entry.current ? (
        poster
      ) : (
        <Link
          to="/anime/$id"
          params={{ id: String(node.id) }}
          draggable={false}
          aria-label={`Open ${titleOf(node)} details`}
          className="block focus-visible:outline-none"
        >
          {poster}
        </Link>
      )}
      <div className="mt-2 max-h-24 overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out md:group-hover:mt-0 md:group-hover:max-h-0 md:group-hover:-translate-y-1 md:group-hover:opacity-0 md:group-focus-within:mt-0 md:group-focus-within:max-h-0 md:group-focus-within:-translate-y-1 md:group-focus-within:opacity-0 motion-reduce:transition-none">
        <p className="text-sm font-bold text-primary">{entry.label}</p>
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {titleOf(node)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted-foreground">
          {node.episodes && node.format !== "MOVIE" ? (
            <span className="rounded-md bg-surface-2 px-2 py-0.5">
              {node.episodes} ep
            </span>
          ) : null}
          {node.format ? (
            <span className="rounded-md bg-surface-2 px-2 py-0.5">
              {prettyLabel(node.format)}
            </span>
          ) : null}
          {node.seasonYear ? (
            <span className="rounded-md bg-surface-2 px-2 py-0.5">
              {node.seasonYear}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CharacterSection({ media }: { media: MediaDetail }) {
  const edges = media.characters.edges;
  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges)
      for (const v of e.voiceActors)
        if (v.languageV2)
          counts.set(v.languageV2, (counts.get(v.languageV2) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) =>
        a[0] === "Japanese" ? -1 : b[0] === "Japanese" ? 1 : b[1] - a[1],
      )
      .map(([l]) => l);
  }, [edges]);
  const [lang, setLang] = useState<string | null>(null);
  const active = lang ?? languages[0] ?? "Japanese";

  if (!edges.length) return null;
  return (
    <section aria-labelledby="characters-heading">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2
          id="characters-heading"
          className="text-xl font-bold tracking-tight"
        >
          Characters
        </h2>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{edges.length}</span>
          {languages.length > 0 && (
            <Select value={active} onValueChange={setLang}>
              <SelectTrigger
                aria-label="Voice language"
                className="h-10 w-36 rounded-xl bg-surface"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {edges.map((edge) => {
          const va = edge.voiceActors.find((v) => v.languageV2 === active);
          return (
            <div
              key={edge.id}
              className="flex h-[72px] items-stretch overflow-hidden rounded-xl border border-border bg-surface/70"
            >
              {edge.node.image.large && (
                <img
                  src={edge.node.image.large}
                  alt=""
                  loading="lazy"
                  className="w-12 shrink-0 object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col justify-center px-3">
                <p className="truncate text-sm font-bold">
                  {edge.node.name.full}
                </p>
                <p className="text-xs text-muted-foreground">
                  {prettyLabel(edge.role)}
                </p>
              </div>
              {va && (
                <>
                  <div className="flex min-w-0 max-w-[45%] flex-col items-end justify-center px-3 text-right">
                    <p className="w-full truncate text-xs font-semibold">
                      {va.name.full}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {va.languageV2}
                    </p>
                  </div>
                  {va.image.large && (
                    <img
                      src={va.image.large}
                      alt=""
                      loading="lazy"
                      className="w-12 shrink-0 object-cover"
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnimeDetailPage() {
  const { id } = Route.useParams();
  const media = useMedia(Number(id));
  useDetailsBackdrop(media);
  const custom = isCustomId(media.id);
  const isAdmin = useIsAdmin();
  const { has, toggle } = useWatchlist();
  const saved = has(media.id);
  const detailIds = useMemo(() => [media.id], [media.id]);
  // Episodes saved by hand, plus every episode AniList says is available (played by the Universal Servers).
  const { videos: savedVideos, ready: savedReady } = useEpisodeLibrary(detailIds);
  const {
    videos,
    ready: episodesReady,
    count: airedCount,
  } = useAllEpisodes(media, savedVideos, savedReady);
  const { records } = useProgress();
  const episodes = orderedEpisodes(videos, media.id);
  const last = records.find(
    (r) => r.animeId === media.id && episodes.some((e) => e.id === r.episodeId),
  );
  const resumeAt = resumePosition(last);
  const progressById = new Map(
    records.filter((r) => r.animeId === media.id).map((r) => [r.episodeId, r]),
  );
  const [expanded, setExpanded] = useState(false);
  const [showOrder, setShowOrder] = useState<"release" | "newest">("release");
  const [episodeLimit, setEpisodeLimit] = useState(40);

  // The number comes from AniList: the full total for finished shows, what has aired for running ones.
  // Movies say "Movie" instead of a number, and an unknown number is simply not shown.
  const isMovie = media.format === "MOVIE";
  const episodeCount = custom ? episodes.length : airedCount;
  const countText = isMovie
    ? "Movie"
    : episodeCount > 0
      ? `${episodeCount} episode${episodeCount === 1 ? "" : "s"} available`
      : "";
  const watchCaption = !episodesReady
    ? "Loading episodes…"
    : last && !last.completed
      ? `Continue Episode ${last.episode ?? ""}`.trim() +
        (resumeAt > 0 ? ` at ${formatClock(resumeAt)}` : "")
      : countText;

  const streaming = legalStreamingLinks(media.externalLinks);
  const recs = media.recommendations.nodes
    .map((n) => n.mediaRecommendation)
    .filter((m): m is MediaCard => Boolean(m));

  const animeEdges = media.relations.edges.filter(
    (e) => e.node.type === "ANIME",
  );
  // Every season, movie and OVA connected by prequel/sequel links (AniList only lists the
  // direct neighbours, so the whole chain is walked and loaded after the page opens).
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
    return buildFranchise(me, chain.data, animeEdges as unknown as FranchiseEdge[]).map<Franchise>((item) => ({
      id: item.id,
      node: item.node as Franchise["node"],
      current: item.current,
      badge: item.badge,
      label: item.label,
      tone: "text-gold",
    }));
  }, [animeEdges, media, chain.data]);
  const shown = showOrder === "release" ? franchise : [...franchise].reverse();
  const recommendationIds = new Set(
    recs.map((recommendation) => recommendation.id),
  );
  const related = animeEdges.filter(
    (edge) =>
      isRelatedAnimeRelation(edge.relationType) &&
      !recommendationIds.has(edge.node.id) &&
      !franchise.some((f) => f.id === edge.node.id),
  );
  const tones = ["text-gold", "text-accent", "text-primary"];

  const studios = media.studios.nodes;
  const mainIds = new Set((media.mainStudios?.nodes ?? []).map((s) => s.id));
  const description = stripHtml(media.description) || "No synopsis available.";
  const statusText = prettyLabel(media.status) || "—";
  return (
    <SiteShell overlay>
      <div className="mx-auto max-w-[1400px] px-3 pb-8 pt-24 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {(media.coverImage.extraLarge ?? media.coverImage.large) ? (
            <img
              src={(media.coverImage.extraLarge ?? media.coverImage.large)!}
              alt={`${titleOf(media)} poster art`}
              className="w-40 shrink-0 self-start rounded-2xl border border-border object-cover shadow-2xl md:w-48"
            />
          ) : (
            <div className="grid aspect-2/3 w-40 shrink-0 place-items-center rounded-2xl border border-border bg-surface-2 text-4xl font-black text-muted-foreground shadow-2xl md:w-48">
              {titleOf(media).charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-balance-tight text-3xl font-extrabold leading-tight md:text-5xl">
              {titleOf(media)}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              {seasonLabel(media) && <span>{seasonLabel(media)}</span>}
              {media.averageScore ? (
                <span>★ {(media.averageScore / 10).toFixed(1)}</span>
              ) : null}
              {media.format && <span>{prettyLabel(media.format)}</span>}
              {media.duration ? <span>{media.duration} min</span> : null}
            </div>

            {media.nextAiringEpisode && (
              <p className="mt-3 inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                Episode {media.nextAiringEpisode.episode} in{" "}
                {countdown(media.nextAiringEpisode.timeUntilAiring)}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <WatchNowAction
                animeId={media.id}
                title={titleOf(media)}
                poster={
                  media.coverImage.extraLarge ?? media.coverImage.large ?? null
                }
              />
              <button
                type="button"
                onClick={() => toggle(media)}
                aria-pressed={saved}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-semibold transition",
                  saved
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface-2/80 hover:border-foreground/40",
                )}
              >
                {saved ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {saved ? "In My List" : "Add to List"}
              </button>
              {isAdmin && (
                <>
                  <Link
                    to="/admin"
                    search={{ anime: media.id }}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    <Settings className="size-3.5" />
                    Admin
                  </Link>
                </>
              )}
            </div>
            {watchCaption && <p className="mt-2 text-xs text-muted-foreground">{watchCaption}</p>}

            <div className="glass mt-5 max-w-3xl rounded-2xl p-4">
              <p
                className={cn(
                  "text-sm leading-relaxed text-foreground/85",
                  !expanded && "line-clamp-7 sm:line-clamp-4 md:line-clamp-6",
                )}
              >
                {description}
              </p>
              {description.length > 280 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary transition hover:bg-primary/10"
                >
                  {expanded ? "Show less" : "Read more"}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* About + trailer */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <section aria-labelledby="about-heading">
            <h2
              id="about-heading"
              className="mb-2 text-xl font-bold tracking-tight"
            >
              About this anime
            </h2>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              <div className="divide-y divide-border/50">
                <Row label="Status">
                  <span
                    className={cn(
                      media.status === "RELEASING" && "text-primary",
                    )}
                  >
                    {media.status === "RELEASING" ? "Airing" : statusText}
                  </span>
                </Row>
                <Row label="AniList score">
                  {media.averageScore
                    ? (media.averageScore / 10).toFixed(1)
                    : "—"}
                </Row>
                <Row label="Aired">{isoDate(media.startDate)}</Row>
                <Row label="Native">{media.title.native ?? "—"}</Row>
              </div>
              <div className="divide-y divide-border/50">
                <Row label="Episodes">
                  {isMovie ? "Movie" : episodeCount > 0 ? episodeCount : "—"}
                </Row>
                <Row label="Mean score">
                  {media.meanScore ? (media.meanScore / 10).toFixed(2) : "—"}
                </Row>
                <Row label="Popularity">
                  {media.popularity ? media.popularity.toLocaleString() : "—"}
                </Row>
                <Row label="Favourites">
                  {media.favourites ? media.favourites.toLocaleString() : "—"}
                </Row>
              </div>
            </dl>

            {media.genres.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm text-muted-foreground">Genres</p>
                <div className="flex flex-wrap gap-2">
                  {media.genres.map((g) => (
                    <Chip key={g} strong>
                      {g}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {studios.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm text-muted-foreground">Studios</p>
                <div className="flex flex-wrap gap-2">
                  {studios.map((s) => (
                    <Chip key={s.id} strong={mainIds.has(s.id)}>
                      {s.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {!custom && streaming.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-sm text-muted-foreground">Also on</p>
                <div className="flex flex-wrap gap-2">
                  {streaming.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold transition hover:border-foreground/40"
                    >
                      {link.site}
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
              TYSHI ZONE does not host video. Playback comes from the sources
              added to this title.
            </p>
          </section>

          {media.trailer ? <Trailer trailer={media.trailer} /> : null}
        </div>

        {/* Episodes */}
        {episodes.length > 0 && (
          <section className="mt-12" aria-labelledby="episodes-heading">
            <SectionTitle
              title="Episodes"
              hint={isMovie ? "Movie" : `${episodes.length} available`}
            />
            <DragScroller className="gap-4 px-3 py-5 md:px-0">
              {episodes.slice(0, episodeLimit).map((e) => {
                const done = progressById.get(e.id);
                const heading = isDefaultEpisodeTitle(e.title, e.episode)
                  ? episodeNumberLabel(e.episode)
                  : e.title;
                return (
                  <Link
                    key={e.id}
                    to="/anime/$id/watch"
                    params={{ id: String(media.id) }}
                    search={{ ep: e.id }}
                    draggable={false}
                    className="group w-[250px] shrink-0 md:w-[270px]"
                  >
                    <EpisodeThumb
                      src={e.thumbnail}
                      fallback={
                        media.bannerImage ?? media.coverImage.extraLarge
                      }
                      className="rounded-xl ring-1 ring-border transition group-hover:ring-foreground/40"
                    >
                      <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-bold text-white">
                        {e.episode !== undefined ? `EP ${e.episode}` : "EXTRA"}
                      </span>
                      {media.duration ? (
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-bold text-white">
                          {media.duration}m
                        </span>
                      ) : null}
                      {done && !done.completed ? (
                        <ProgressBar value={percentOf(done) ?? 0} />
                      ) : null}
                    </EpisodeThumb>
                    <p className="mt-2 line-clamp-1 text-sm font-bold">
                      {heading}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {done?.completed
                        ? "Watched"
                        : done
                          ? "In progress"
                          : seasonLabel(media) || " "}
                    </p>
                  </Link>
                );
              })}
            </DragScroller>
            {episodes.length > episodeLimit && (
              <button
                type="button"
                onClick={() => setEpisodeLimit((n) => n + 60)}
                className="mx-3 mt-1 inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-foreground/40 md:mx-0"
              >
                Show {Math.min(60, episodes.length - episodeLimit)} more episodes
              </button>
            )}
          </section>
        )}

        {/* Seasons */}
        {franchise.length > 1 && (
          <section className="mt-12" aria-labelledby="show-heading">
            <SectionTitle title="Show" hint={`${franchise.length} entries`}>
              <Select
                value={showOrder}
                onValueChange={(v) => setShowOrder(v as "release" | "newest")}
              >
                <SelectTrigger
                  aria-label="Order"
                  className="h-10 w-40 rounded-xl bg-surface"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Release order</SelectItem>
                  <SelectItem value="newest">Newest first</SelectItem>
                </SelectContent>
              </Select>
            </SectionTitle>
            <DragScroller className="gap-4 px-3 py-5 md:px-0">
              {shown.map((entry) => (
                <FranchiseCard key={entry.id} entry={entry} />
              ))}
            </DragScroller>
          </section>
        )}

        {/* Related */}
        {related.length > 0 && (
          <section
            className="mt-12 min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300"
            aria-labelledby="related-heading"
          >
            <SectionTitle
              title="Related"
              hint="Side stories and franchise connections"
            >
              <span className="text-xs text-muted-foreground">
                {related.length} entries
              </span>
            </SectionTitle>
            <DragScroller className="gap-4 px-3 py-5 md:px-0">
              {related.map((edge, i) => (
                <FranchiseCard
                  key={edge.id}
                  entry={{
                    id: edge.node.id,
                    node: edge.node,
                    badge: "Related",
                    label: prettyLabel(edge.relationType),
                    tone: tones[i % tones.length],
                  }}
                />
              ))}
            </DragScroller>
          </section>
        )}

        <div className="mt-12">
          <CharacterSection media={media} />
        </div>

        {recs.length > 0 && (
          <section className="mt-12 min-w-0">
            <SectionTitle title="You might also like" />
            <DragScroller className="gap-4 px-3 py-5 md:px-0">
              {recs.map((m) => (
                <AnimeCard
                  key={m.id}
                  media={m}
                  className="w-36 shrink-0 md:w-44"
                />
              ))}
            </DragScroller>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
