import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownUp,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Server,
} from "lucide-react";

import { SiteShell } from "@/components/site-shell";
import { EpisodePlayer, type AnimeBrief } from "@/components/episode-player";
import { EpisodeThumb, ProgressBar } from "@/components/episode-thumb";
import { WatchSkeleton } from "@/components/skeletons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  markCompleted,
  percentOf,
  pickDefaultEpisode,
  readProgress,
  useProgress,
} from "@/hooks/use-progress";
import { usePrefs } from "@/hooks/use-prefs";
import { useEpisodeLibrary } from "@/hooks/use-cloud-episodes";
import { useMedia } from "@/hooks/use-media";
import { useAppearance } from "@/hooks/use-appearance";
import { useShield } from "@/hooks/use-shield";
import {
  FranchiseSections,
  SeasonsRelated,
} from "@/components/franchise-sections";
import { useWatchlist } from "@/hooks/use-watchlist";
import { orderedEpisodes, type SavedVideo } from "@/hooks/use-videos";
import { pickSource, type Source } from "@/lib/cloud-episodes";
import { useAllEpisodes } from "@/lib/universal-servers";
import { mediaQuery } from "@/lib/queries";
import { countdown, prettyLabel, stripHtml, titleOf } from "@/lib/anilist";
import { isDefaultEpisodeTitle } from "@/lib/format";
import {
  forceLang,
  nextPlaybackSession,
  refreshAniweebLink,
  swapAniembedHost,
} from "@/lib/track-link";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/anime/$id/watch")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { ep?: string; session?: string } => ({
    ep:
      search.ep !== undefined && search.ep !== ""
        ? String(search.ep)
        : undefined,
    session:
      typeof search.session === "string" && /^\d{1,18}$/.test(search.session)
        ? search.session
        : undefined,
  }),
  pendingMs: 650,
  pendingMinMs: 300,
  pendingComponent: WatchSkeleton,
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
    const title = `Watch ${loaderData.title} | TYSHI ZONE`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: title },
        { property: "og:type", content: "video.episode" },
      ],
    };
  },
  component: WatchAnimePage,
});

/**
 * Behind the whole watch page. "Full black" (default) is plain black; the other two put the
 * anime's art there, blurred as far as the Settings slider says.
 */
function WatchBackdrop({ art }: { art: string | null }) {
  const { playerBg, playerBlur, blackEverywhere } = useAppearance();
  const showArt = !blackEverywhere && playerBg !== "black" && Boolean(art);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-black"
    >
      {showArt && (
        <>
          <img
            src={art ?? undefined}
            alt=""
            draggable={false}
            className="absolute -inset-[8%] h-[116%] w-[116%] max-w-none object-cover"
            style={{ filter: `blur(${playerBlur}px) saturate(1.2)` }}
          />
          {playerBg === "mix" && (
            <div className="absolute inset-0 bg-black/55" />
          )}
        </>
      )}
    </div>
  );
}

const pill =
  "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground transition max-sm:gap-1 max-sm:px-2 max-sm:text-[11px] sm:gap-2 sm:px-4 sm:text-sm hover:border-foreground/40 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40";
const iconBtn =
  "grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

function WatchAnimePage() {
  const { id } = Route.useParams();
  const { ep, session } = Route.useSearch();
  const animeId = Number(id);
  const navigate = useNavigate();

  const media = useMedia(animeId);
  const animeIds = useMemo(() => [animeId], [animeId]);
  // Episodes saved by hand, plus every episode AniList says is available (played by the Universal Servers).
  const { videos: savedVideos, ready: savedReady } = useEpisodeLibrary(animeIds);
  const { videos, sourcesFor, ready } = useAllEpisodes(media, savedVideos, savedReady);
  const { records } = useProgress();
  const { prefs, set: setPrefs } = usePrefs();
  const { playerLayout, playerSide } = useAppearance();
  const { has, toggle } = useWatchlist();
  const { altHost } = useShield();

  const stageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [range, setRange] = useState(0);
  const [descending, setDescending] = useState(false);
  const [hideWatched, setHideWatched] = useState(false);
  const [grid, setGrid] = useState(true);
  // The episode tray is independently scrollable on touch and desktop so the season panels stay reachable.

  const eps = useMemo(
    () => orderedEpisodes(videos, animeId),
    [videos, animeId],
  );

  const current: SavedVideo | undefined = useMemo(() => {
    if (!ep) return undefined;
    return (
      eps.find((e) => e.id === ep) ??
      (/^\d+$/.test(ep) ? eps.find((e) => e.episode === Number(ep)) : undefined)
    );
  }, [eps, ep]);

  // Every episode can have several servers, each with SUB and/or DUB (saved links first, then the
  // Universal Servers). Use the viewer's saved choice when this episode has it, otherwise the closest match.
  const sources: Source[] = useMemo(
    () => (current ? sourcesFor(current) : []),
    [current, sourcesFor],
  );
  const active = useMemo(
    () =>
      sources.length
        ? (pickSource(sources, prefs.server, prefs.lang) ?? null)
        : null,
    [sources, prefs.server, prefs.lang],
  );
  const lang = active?.lang ?? null;
  const hasSub = sources.some((s) => s.lang === "sub");
  const hasDub = sources.some((s) => s.lang === "dub");
  const serverChoices = useMemo(() => {
    const byServer = new Map<string, Source>();
    for (const source of sources) {
      const key = source.server.toLowerCase();
      const previous = byServer.get(key);
      const isActiveServer =
        source.server.toLowerCase() === active?.server.toLowerCase();
      if (
        !previous ||
        (isActiveServer && source.lang === active?.lang) ||
        (!isActiveServer && source.lang === prefs.lang)
      )
        byServer.set(key, source);
    }
    return [...byServer.values()];
  }, [sources, active?.server, active?.lang, prefs.lang]);
  // The link that really plays: always switched to the language that was picked, so a wrongly saved link can't play the other audio.
  const playing: SavedVideo | undefined = useMemo(() => {
    if (!current || !active) return current;
    const url = forceLang(active.url, active.lang);
    const playerUrl = altHost ? swapAniembedHost(url) : url;
    const sessionNonce = Number(session) || 0;
    return {
      ...current,
      url: refreshAniweebLink(playerUrl, Math.max(sessionNonce, refreshNonce)),
    };
  }, [current, active, altHost, session, refreshNonce]);
  // SUB and DUB on the same server share one link: keep the player running and just switch the
  // audio track instead of reloading it.
  const sharedLink = Boolean(
    active &&
    sources.some(
      (s) =>
        s.server === active.server &&
        s.lang !== active.lang &&
        forceLang(s.url, s.lang) === forceLang(active.url, active.lang),
    ),
  );
  const pickSourceChoice = (source: Source) => {
    setPrefs({ server: source.server, lang: source.lang });
    // EpisodePlayer is keyed by the selected server/language, so React restarts only the player.
    // The surrounding page, scroll position, and selected episode stay in place.
  };

  const idx = current ? eps.findIndex((e) => e.id === current.id) : -1;
  const prev = idx > 0 ? eps[idx - 1] : null;
  const next = idx >= 0 && idx < eps.length - 1 ? eps[idx + 1] : null;

  const anime: AnimeBrief = useMemo(
    () => ({
      id: animeId,
      title: titleOf(media),
      cover: media.coverImage.extraLarge ?? media.coverImage.large,
      art: media.bannerImage,
    }),
    [animeId, media],
  );
  const art = anime.art ?? anime.cover;

  const goTo = (target: SavedVideo, replace = false) =>
    navigate({
      to: "/anime/$id/watch",
      params: { id },
      search: { ep: target.id, session: String(nextPlaybackSession()) },
      replace,
    });

  // No (or stale) ?ep= -> open where the viewer left off, once, and pin it in the URL.
  useEffect(() => {
    if (!ready || !eps.length || current) return;
    const pick = pickDefaultEpisode(eps, readProgress(), animeId);
    if (pick) goTo(pick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, eps, current, animeId]);

  // Direct episode URLs may not include a session token. Give the embed a fresh
  // request before mounting it, without first loading and then replacing the iframe.
  useEffect(() => {
    if (!ready || !current || session) return;
    void navigate({
      to: "/anime/$id/watch",
      params: { id },
      search: { ep: current.id, session: String(nextPlaybackSession()) },
      replace: true,
    });
  }, [ready, current?.id, session, navigate, id]);

  // Keep the episode list on the page that holds the playing episode.
  useEffect(() => {
    if (idx >= 0) setRange(Math.floor(idx / PAGE_SIZE));
  }, [idx]);

  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled);
    const onChange = () => {
      const on = Boolean(document.fullscreenElement);
      setFullscreen(on);
      // No page scrollbar or reserved gutter while fullscreen, so the video reaches every edge.
      document.documentElement.classList.toggle("is-fullscreen", on);
      // On a phone, fullscreen video should turn the screen sideways by itself (where the browser allows it).
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      if (window.matchMedia("(pointer: coarse)").matches && orientation?.lock) {
        if (on) void orientation.lock("landscape").catch(() => undefined);
        else orientation.unlock?.();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.documentElement.classList.remove("is-fullscreen");
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      /* the browser refused fullscreen */
    }
  }

  function handleNext(auto: boolean) {
    if (!next || !current) return;
    // Players we can't time never report "finished", so moving on counts as finishing.
    if (!auto) markCompleted(animeId, current.id);
    goTo(next);
  }

  const progressByEpisode = useMemo(
    () =>
      new Map(
        records
          .filter((r) => r.animeId === animeId)
          .map((r) => [r.episodeId, r]),
      ),
    [records, animeId],
  );

  // Prefer a custom episode still, then an episode-number-matched AniList streaming still,
  // then the anime artwork placeholder. Never guess from list order if AniList returns only
  // a partial sample of legal streaming episodes.
  const publicEpisodeThumbs = useMemo(() => {
    const entries = media.streamingEpisodes ?? [];
    const thumbs = new Map<number, string>();
    for (const entry of entries) {
      if (!entry.thumbnail) continue;
      const match =
        entry.title?.match(/(?:episode|ep\.?|#)\s*0*(\d+)/i) ??
        entry.title?.match(/^\s*0*(\d+)\b/);
      if (match) thumbs.set(Number(match[1]), entry.thumbnail);
    }
    if (media.episodes && entries.length === media.episodes) {
      entries.forEach((entry, index) => {
        if (entry.thumbnail && !thumbs.has(index + 1))
          thumbs.set(index + 1, entry.thumbnail);
      });
    }
    return thumbs;
  }, [media.streamingEpisodes, media.episodes]);
  const thumbnailFor = (episode: SavedVideo) =>
    episode.thumbnail ??
    (episode.episode === undefined
      ? undefined
      : publicEpisodeThumbs.get(episode.episode));

  const ordered = useMemo(
    () => (descending ? [...eps].reverse() : eps),
    [eps, descending],
  );
  const filtered = useMemo(() => {
    let list = ordered;
    if (hideWatched)
      list = list.filter(
        (e) => !progressByEpisode.get(e.id)?.completed || e.id === current?.id,
      );
    return list;
  }, [ordered, hideWatched, progressByEpisode, current]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeRange = Math.min(range, pages - 1);
  const visible = filtered.slice(
    safeRange * PAGE_SIZE,
    safeRange * PAGE_SIZE + PAGE_SIZE,
  );

  // In list view the tray scrolls on its own, so open it on the episode that is playing.
  useEffect(() => {
    if (grid) return;
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row) return;
    const top =
      row.getBoundingClientRect().top -
      box.getBoundingClientRect().top +
      box.scrollTop;
    box.scrollTop = Math.max(0, top - box.clientHeight / 2 + row.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, safeRange]);

  const shell = (children: React.ReactNode) => (
    <SiteShell>
      <WatchBackdrop art={art} />
      <div className="relative">
        <div className="mx-auto max-w-[1900px] px-0 pb-6 pt-0 sm:px-3 sm:pt-3 md:px-5">
          {children}
        </div>
      </div>
    </SiteShell>
  );

  if (!ready) return <WatchSkeleton />;

  if (!eps.length) {
    return shell(
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <Film className="size-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Nothing to watch yet</h1>
        <p className="text-sm text-muted-foreground">
          {media.nextAiringEpisode
            ? `Episode ${media.nextAiringEpisode.episode} of ${anime.title} airs in ${countdown(media.nextAiringEpisode.timeUntilAiring)}.`
            : `${anime.title} has no episodes out yet. Check back soon.`}
        </p>
        <Link
          to="/anime/$id"
          params={{ id }}
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-bold text-background transition hover:opacity-90"
        >
          Back to details
        </Link>
      </div>,
    );
  }

  if (!current || !playing) return <WatchSkeleton />;

  const customTitle = !isDefaultEpisodeTitle(current.title, current.episode);
  const heading = customTitle
    ? current.title
    : current.episode !== undefined
      ? `Episode ${current.episode}`
      : current.title;
  const subheading =
    customTitle && current.episode !== undefined
      ? `Episode ${current.episode}`
      : anime.title;
  const saved = has(media.id);
  const metaLine = [
    media.season && media.seasonYear
      ? `${prettyLabel(media.season)} ${media.seasonYear}`
      : media.seasonYear,
    `${eps.length} episode${eps.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const details: [string, string | null][] = [
    ["Format", prettyLabel(media.format) || null],
    ["Status", prettyLabel(media.status) || null],
    ["Duration", media.duration ? `${media.duration} min` : null],
    [
      "Season",
      media.season && media.seasonYear
        ? `${prettyLabel(media.season)} ${media.seasonYear}`
        : media.seasonYear
          ? String(media.seasonYear)
          : null,
    ],
    ["Rating", media.averageScore ? `${media.averageScore}/100` : null],
    ["Studio", media.studios?.nodes?.[0]?.name ?? null],
  ];
  const infoCard = (
    <section aria-labelledby="watch-about-heading" className="mx-0 sm:mx-0">
      <h2
        id="watch-about-heading"
        className="mb-3 text-lg font-bold tracking-tight md:hidden"
      >
        About Anime
      </h2>
      <div className="glass rounded-2xl p-2.5 sm:p-4 md:p-5">
        <div className="md:hidden">
          <div className="flex items-start gap-3 text-left">
            {anime.cover ? (
              <Link
                to="/anime/$id"
                params={{ id }}
                aria-label={`Open ${anime.title} details`}
                className="shrink-0"
              >
                <img
                  src={anime.cover}
                  alt={`${anime.title} poster art`}
                  className="h-36 w-24 rounded-lg object-cover ring-1 ring-border"
                />
              </Link>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold leading-tight sm:text-lg">
                <Link
                  to="/anime/$id"
                  params={{ id }}
                  draggable={false}
                  className="select-none hover:text-primary max-md:pointer-events-none max-md:select-text"
                >
                  {anime.title}
                </Link>
              </h2>
              {media.title.native && media.title.native !== anime.title ? (
                <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                  {media.title.native}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {eps.length} {eps.length === 1 ? "Episode" : "Episodes"}
                </span>
                {media.status ? (
                  <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {prettyLabel(media.status)}
                  </span>
                ) : null}
              </div>
              {stripHtml(media.description) && (
                <p className="mt-2 line-clamp-3 text-xs leading-[1.35rem] text-muted-foreground">
                  {stripHtml(media.description)}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-background/35 p-2">
            <div className="min-w-0 rounded-lg bg-surface/70 px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Studio
              </dt>
              <dd className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">
                {media.studios?.nodes?.[0]?.name ?? "—"}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg bg-surface/70 px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Aired
              </dt>
              <dd className="mt-0.5 text-xs font-medium leading-snug">
                {media.startDate?.year ?? media.seasonYear ?? "—"}
              </dd>
            </div>
            <div className="col-span-2 min-w-0 rounded-lg bg-surface/70 px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Genres
              </dt>
              <dd className="mt-0.5 line-clamp-2 text-xs font-medium leading-snug">
                {media.genres?.length ? media.genres.join(", ") : "—"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="hidden md:block">
          <div className="flex flex-col items-center gap-3 text-center md:flex-row md:items-start md:gap-4 md:text-left">
            {anime.cover ? (
              <Link
                to="/anime/$id"
                params={{ id }}
                aria-label={`Open ${anime.title} details`}
                className="shrink-0"
              >
                <img
                  src={anime.cover}
                  alt={`${anime.title} poster art`}
                  className="h-60 w-40 rounded-xl object-cover ring-1 ring-border"
                />
              </Link>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-extrabold leading-tight">
                <Link
                  to="/anime/$id"
                  params={{ id }}
                  draggable={false}
                  className="select-none hover:text-primary max-md:pointer-events-none max-md:select-text"
                >
                  {anime.title}
                </Link>
              </h2>
              {media.genres?.length ? (
                <div className="mt-2 flex flex-wrap justify-center gap-2 md:justify-start">
                  {media.genres.slice(0, 6).map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-primary/20 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}
              {stripHtml(media.description) && (
                <p className="mt-3 line-clamp-5 text-base leading-relaxed text-muted-foreground md:line-clamp-6">
                  {stripHtml(media.description)}
                </p>
              )}
            </div>
          </div>
          <dl className="mt-5 grid w-full grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-border/70 bg-background/35 p-3 text-center text-sm md:grid-cols-3 md:gap-x-6 md:gap-y-3 md:text-left">
            {details
              .filter(([, value]) => value)
              .map(([label, value], index, visibleDetails) => (
                <div
                  key={label}
                  className={cn(
                    "min-w-0",
                    index === visibleDetails.length - 1 &&
                      visibleDetails.length % 2 === 1 &&
                      "col-span-2 mx-auto w-1/2 md:col-span-1 md:mx-0 md:w-auto",
                  )}
                >
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-0.5 truncate text-base font-semibold">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    </section>
  );

  return shell(
    <>
      <div
        className={cn(
          "grid items-start gap-4 touch-pan-y",
          playerLayout === "theater"
            ? "grid-cols-1 lg:gap-5"
            : playerSide === "left"
              ? "lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"
              : "lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        {/* Player + details */}
        <div
          className={cn(
            "min-w-0",
            playerLayout !== "theater" && playerSide === "left" && "lg:order-2",
          )}
          id="watch-player-stage"
        >
          <EpisodePlayer
            sessionKey={`${current.id}:${active?.server ?? ""}:${sharedLink ? "" : (active?.lang ?? "")}:${session ?? "pending"}:${refreshNonce}`}
            ready={Boolean(session)}
            track={sharedLink ? (active?.lang ?? undefined) : undefined}
            anime={anime}
            episode={playing}
            next={next}
            autoNext={prefs.autoNext}
            onNext={handleNext}
            stageRef={stageRef}
          />

          <div className="mt-3 flex items-start justify-between gap-3 px-3 sm:mt-4 sm:px-0">
            <div className="min-w-0">
              <h1 className="line-clamp-2 text-2xl font-extrabold leading-tight md:text-3xl">
                {heading}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {subheading}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!prev}
                onClick={() => prev && goTo(prev)}
                aria-label="Previous episode"
                title="Previous episode"
                className={iconBtn}
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                disabled={!next}
                onClick={() => handleNext(false)}
                aria-label="Next episode"
                title="Next episode"
                className={iconBtn}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>

          <div className="glass mx-1 mt-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl p-3 max-sm:justify-start max-sm:gap-1.5 max-sm:p-2 sm:mx-0 md:p-4">
            <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 max-sm:gap-1.5 sm:w-auto">
              <button
                type="button"
                onClick={() => toggle(media)}
                aria-label={saved ? "Remove from My List" : "Add to My List"}
                aria-pressed={saved}
                className={pill}
              >
                {saved ? (
                  <Check className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                <span>{saved ? "In My List" : "Add to List"}</span>
              </button>

              {lang && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className={pill} aria-label="Sub or dub">
                    <Captions className="size-4" />
                    {lang === "sub" ? "Sub" : "Dub"}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-36">
                    <DropdownMenuLabel>Audio</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={lang}
                      onValueChange={(v) => {
                        const wanted = v as "sub" | "dub";
                        const target =
                          sources.find(
                            (s) =>
                              s.server.toLowerCase() ===
                                active?.server.toLowerCase() &&
                              s.lang === wanted,
                          ) ?? sources.find((s) => s.lang === wanted);
                        if (target) pickSourceChoice(target);
                      }}
                    >
                      <DropdownMenuRadioItem value="sub" disabled={!hasSub}>
                        Sub
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dub" disabled={!hasDub}>
                        Dub
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {active && serverChoices.length > 0 && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    className={pill}
                    aria-label="Choose server"
                  >
                    <Server className="size-4" />
                    <span className="max-w-[4rem] truncate sm:max-w-[9rem]">
                      {active.server}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuLabel>Server</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={active.server}
                      onValueChange={(v) => {
                        const target = serverChoices.find(
                          (s) => s.server === v,
                        );
                        if (target) pickSourceChoice(target);
                      }}
                    >
                      {serverChoices.map((s) => (
                        <DropdownMenuRadioItem key={s.server} value={s.server}>
                          {s.server}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                    {serverChoices.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">
                          Not loading? Try another server.
                        </p>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  className={cn(
                    pill,
                    "px-3 max-sm:ml-auto max-sm:px-2 sm:ml-0",
                  )}
                  aria-label="More options"
                >
                  <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuCheckboxItem
                    checked={prefs.autoNext}
                    onCheckedChange={(v) => setPrefs({ autoNext: Boolean(v) })}
                  >
                    Auto-next
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuItem
                    onSelect={() => setRefreshNonce(nextPlaybackSession())}
                  >
                    Reload player
                  </DropdownMenuItem>
                  {canFullscreen && (
                    <DropdownMenuItem onSelect={() => void toggleFullscreen()}>
                      {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {active && prefs.lang !== active.lang && (
            <p className="mt-3 text-xs text-muted-foreground">
              {prefs.lang.toUpperCase()} isn't available for this episode yet —
              playing {active.lang.toUpperCase()}.
            </p>
          )}

          <div className="mt-6 hidden lg:block">{infoCard}</div>
        </div>

        {/* Episode tray, then (phone) the anime info, then seasons and related */}
        <div
          className={cn(
            "flex min-w-0 flex-col gap-4",
            playerLayout !== "theater" && playerSide === "left" && "lg:order-1",
          )}
        >
          <aside
            aria-labelledby="episodes-heading"
            className={cn(
              "mx-1 flex min-w-0 flex-col rounded-2xl border border-white/10 bg-black/75 p-3 sm:mx-0",
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              <h2
                id="episodes-heading"
                className="min-w-0 max-w-[9rem] shrink truncate px-1 text-base font-bold"
              >
                {anime.title}
              </h2>
              {pages > 1 && (
                <div className="flex shrink-0 items-center gap-0 text-xs tabular-nums text-muted-foreground">
                  <button
                    type="button"
                    aria-label="Previous episode page"
                    disabled={safeRange === 0}
                    onClick={() => setRange(safeRange - 1)}
                    className={iconBtn}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span aria-live="polite" className="min-w-9 text-center">
                    {safeRange + 1} / {pages}
                  </span>
                  <button
                    type="button"
                    aria-label="Next episode page"
                    disabled={safeRange >= pages - 1}
                    onClick={() => setRange(safeRange + 1)}
                    className={iconBtn}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
              <button
                type="button"
                aria-label={descending ? "Oldest first" : "Newest first"}
                title={descending ? "Oldest first" : "Newest first"}
                onClick={() => setDescending((v) => !v)}
                className={cn(
                  iconBtn,
                  descending && "bg-surface-2 text-foreground",
                )}
              >
                <ArrowDownUp className="size-4" />
              </button>
              <button
                type="button"
                aria-pressed={hideWatched}
                aria-label="Hide watched episodes"
                title="Hide watched episodes"
                onClick={() => setHideWatched((v) => !v)}
                className={cn(
                  iconBtn,
                  hideWatched && "bg-surface-2 text-foreground",
                )}
              >
                {hideWatched ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
              <button
                type="button"
                aria-pressed={grid}
                aria-label={grid ? "Show as list" : "Show as grid"}
                title={grid ? "Show as list" : "Show as grid"}
                onClick={() => setGrid((v) => !v)}
                className={cn(iconBtn, grid && "bg-surface-2 text-foreground")}
              >
                {grid ? (
                  <List className="size-4" />
                ) : (
                  <LayoutGrid className="size-4" />
                )}
              </button>
            </div>

            <div
              ref={listRef}
              role="region"
              aria-label="Episode list"
              tabIndex={0}
              className={cn(
                "mt-2 min-w-0",
                // Grid view has no scroll bar: the page scrolls. List view is capped at about six
                // rows and gets its own thin, theme-coloured bar; at its ends the page scrolls on.
                !grid &&
                  "scroll-theme max-h-[26rem] overflow-y-auto overflow-x-hidden pr-2",
              )}
            >
              {visible.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No episodes to show.
                </p>
              ) : grid ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {/* Match the compact number-only episode grid from the user's reference. */}
                  {(visible.some((item) => item.episode !== undefined)
                    ? visible.filter((item) => item.episode !== undefined)
                    : visible
                  ).map((e, position) => {
                    const done = progressByEpisode.get(e.id)?.completed;
                    const number = e.episode;
                    const label = number ?? position + 1;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => goTo(e)}
                        aria-current={e.id === current.id ? "true" : undefined}
                        aria-label={
                          number === undefined
                            ? `Play ${e.title}`
                            : `Play episode ${number}`
                        }
                        title={
                          isDefaultEpisodeTitle(e.title, e.episode)
                            ? undefined
                            : e.title
                        }
                        className={cn(
                          "grid h-10 min-w-0 place-items-center rounded-lg border text-sm font-semibold tabular-nums leading-none transition hover:border-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                          e.id === current.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : done
                              ? "border-border bg-surface text-muted-foreground"
                              : "border-border bg-surface-2/80 text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((e) => {
                    const rec = progressByEpisode.get(e.id);
                    const isCurrent = e.id === current.id;
                    const title = isDefaultEpisodeTitle(e.title, e.episode)
                      ? e.episode === undefined
                        ? "Extra"
                        : `Episode ${e.episode}`
                      : e.title;
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => goTo(e)}
                          aria-current={isCurrent ? "true" : undefined}
                          className={cn(
                            "flex w-full items-stretch gap-3 overflow-hidden rounded-xl border p-0 text-left transition",
                            isCurrent
                              ? "border-white/25 bg-surface"
                              : "border-white/10 bg-surface/60 hover:border-foreground/30",
                          )}
                        >
                          <EpisodeThumb
                            src={thumbnailFor(e)}
                            fallback={art}
                            className="w-[132px] shrink-0"
                          >
                            <span
                              className={cn(
                                "absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white",
                                isCurrent &&
                                  "bg-primary text-primary-foreground",
                              )}
                            >
                              {e.episode !== undefined
                                ? `EP ${e.episode}`
                                : "EXTRA"}
                            </span>
                            {rec && !rec.completed ? (
                              <ProgressBar value={percentOf(rec) ?? 0} />
                            ) : null}
                          </EpisodeThumb>
                          <span className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3">
                            <span className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
                              {title}
                            </span>
                            <span className="mt-1 text-xs text-muted-foreground">
                              {isCurrent
                                ? "Now playing"
                                : rec?.completed
                                  ? "Watched"
                                  : rec
                                    ? "In progress"
                                    : " "}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
          <SeasonsRelated
            media={media}
            mobileInfo={<div className="lg:hidden">{infoCard}</div>}
          />
        </div>
      </div>

      <div className="px-3 sm:px-0">
        <FranchiseSections media={media} only="recs" />
      </div>
    </>,
  );
}
