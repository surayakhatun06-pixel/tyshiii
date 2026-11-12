import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Captions, ChevronLeft, ChevronRight, Mic } from "lucide-react";

import { DragScroller } from "@/components/drag-scroller";
import { useCatalog } from "@/hooks/use-catalog";
import { prettyLabel, timeAgo, titleOf } from "@/lib/anilist";
import { episodeSources, readEpisodeLists } from "@/lib/cloud-episodes";
import { firebaseConfigured } from "@/lib/firebase";
import { recentlyAiredQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Lang = "sub" | "dub";
type Item = {
  key: string;
  animeId: number;
  title: string;
  image: string | null;
  ep: number | null;
  at: number | null;
  subs: number | null;
  dubs: number | null;
  format: string | null;
  year: number | null;
  episodes: number | null;
  onSite: boolean;
};

const pill =
  "inline-flex items-center gap-1 rounded-full bg-surface-2/70 px-2 py-0.5 text-[11px] font-medium text-foreground/80";

/** Popular shows only: a title needs this many AniList followers to count as "famous". */
const POPULAR = 15000;

/**
 * "Latest Episodes": tall posters, four across.
 *  - Sub: the popular shows whose newest episode just aired (from AniList), newest first.
 *    Titles you have episodes for get an "On site" tag.
 *  - Dub: actual dub release dates, independent of when an admin added the link.
 */
export function LatestEpisodes() {
  const [lang, setLang] = useState<Lang>("sub");
  const { catalog, ready } = useCatalog();
  const aired = useQuery(recentlyAiredQuery());

  const catalogById = useMemo(
    () => new Map(catalog.map((anime) => [anime.anilistId, anime])),
    [catalog],
  );
  const onSite = useMemo(
    () =>
      new Set(
        catalog
          .filter((a) => a.subCount + a.dubCount > 0)
          .map((a) => a.anilistId),
      ),
    [catalog],
  );

  const dubCandidates = useMemo(
    () => catalog.filter((anime) => anime.dubCount > 0).slice(0, 32),
    [catalog],
  );
  const dubIds = useMemo(
    () => dubCandidates.map((anime) => anime.anilistId),
    [dubCandidates],
  );
  const dubEpisodes = useQuery({
    queryKey: ["cloud", "recent-dub-episodes", dubIds],
    queryFn: () => readEpisodeLists(dubIds),
    enabled: lang === "dub" && firebaseConfigured && ready && dubIds.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const items: Item[] = useMemo(() => {
    if (lang === "sub") {
      const rows = aired.data ?? [];
      const popular = rows.filter((r) => (r.media.popularity ?? 0) >= POPULAR);
      // If it's a quiet day, fall back to the most popular of what did air.
      const chosen =
        popular.length >= 8
          ? popular
          : [...rows]
              .sort(
                (a, b) => (b.media.popularity ?? 0) - (a.media.popularity ?? 0),
              )
              .slice(0, 12);
      return chosen
        .sort((a, b) => b.airingAt - a.airingAt)
        .slice(0, 24)
        .map((r) => {
          const anime = catalogById.get(r.media.id);
          const useEditedDetails = Boolean(anime?.edited);
          return {
            key: `${r.media.id}-${r.episode}`,
            animeId: r.media.id,
            title: useEditedDetails && anime ? anime.title : titleOf(r.media),
            image:
              (useEditedDetails ? anime?.poster : null) ??
              r.media.coverImage.extraLarge ??
              r.media.coverImage.large,
            ep: r.episode,
            at: r.airingAt * 1000,
            subs: null,
            dubs: null,
            format: r.media.format,
            year: r.media.seasonYear,
            episodes: r.media.episodes,
            onSite: onSite.has(r.media.id),
          };
        });
    }
    const now = Date.now();
    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    return dubCandidates
      .flatMap((anime) =>
        (dubEpisodes.data?.[anime.anilistId] ?? [])
          .filter(
            (episode) =>
              episode.dubReleasedAt !== undefined &&
              episode.dubReleasedAt >= cutoff &&
              episode.dubReleasedAt <= now &&
              episodeSources(episode).some((source) => source.lang === "dub"),
          )
          .map((episode) => ({
            key: `dub-${anime.anilistId}-${episode.number}`,
            animeId: anime.anilistId,
            title: anime.title,
            image: anime.poster,
            ep: episode.number,
            at: episode.dubReleasedAt ?? null,
            subs: null,
            dubs: anime.dubCount,
            format: anime.format,
            year: anime.year,
            episodes: anime.episodeCount,
            onSite: false,
          })),
      )
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, 24);
  }, [lang, aired.data, onSite, dubCandidates, catalogById, dubEpisodes.data]);

  const scroller = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState({ current: 1, total: 1 });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const w = Math.max(1, el.clientWidth);
        const total = Math.max(1, Math.ceil(el.scrollWidth / w - 0.05));
        const current = Math.min(total, Math.round(el.scrollLeft / w) + 1);
        setPage((previous) =>
          previous.current === current && previous.total === total
            ? previous
            : { current, total },
        );
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items.length]);

  // One press moves exactly one page (a page plus the gap between cards).
  const go = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el)
      el.scrollBy({ left: dir * (el.clientWidth + 12), behavior: "smooth" });
  };

  const loading =
    items.length === 0 &&
    (lang === "sub"
      ? aired.isPending
      : (firebaseConfigured && !ready) ||
        (dubIds.length > 0 && dubEpisodes.isPending));

  return (
    <section aria-labelledby="latest-heading" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 px-3 md:px-0">
        <h2
          id="latest-heading"
          className="text-lg font-bold tracking-tight md:text-xl"
        >
          New Releases
        </h2>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Audio"
            className="inline-flex rounded-full border border-border bg-surface/60 p-0.5 backdrop-blur"
          >
            {(["sub", "dub"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  "h-8 rounded-full px-4 text-xs font-semibold transition",
                  lang === l
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l === "sub" ? "Sub" : "Dub"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface/60 p-0.5 backdrop-blur">
            <button
              type="button"
              aria-label="Previous"
              disabled={page.current <= 1}
              onClick={() => go(-1)}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">
              {page.current}/{page.total}
            </span>
            <button
              type="button"
              aria-label="Next"
              disabled={page.current >= page.total}
              onClick={() => go(1)}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <DragScroller
        ref={scroller}
        className="new-releases-scroller gap-3 px-3 py-5 touch-pan-x touch-pan-y overscroll-x-contain md:px-0"
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] w-36 shrink-0 basis-36 animate-pulse rounded-2xl bg-surface-2 md:w-auto md:basis-[calc((100%-3rem)/5)]"
            />
          ))
        ) : items.length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">
            {lang === "dub"
              ? "No recently released dubbed episodes were found."
              : "Couldn't load the latest episodes right now."}
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.key}
              className="group relative z-0 w-36 shrink-0 basis-36 transform-gpu transition-transform duration-200 ease-out hover:z-20 hover:-translate-y-2 hover:scale-[1.05] motion-reduce:transition-none md:w-auto md:basis-[calc((100%-3rem)/5)]"
            >
              <Link
                to="/anime/$id"
                params={{ id: String(it.animeId) }}
                aria-label={`Open ${it.title} details`}
                draggable={false}
                className="block"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border transition-[box-shadow,ring-color] group-hover:ring-primary/55 group-hover:shadow-[0_8px_28px_var(--theme-wash)]">
                  {it.image && (
                    <img
                      src={it.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                    {[
                      it.ep ? `EP ${it.ep}` : null,
                      lang === "sub" ? "Sub" : "Dub",
                      it.at ? timeAgo(it.at / 1000) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-3 pt-10 text-sm font-bold leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 md:block">
                    <span className="line-clamp-2">{it.title}</span>
                  </span>
                </div>
              </Link>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {it.subs ? (
                  <span className={pill}>
                    <Captions className="size-3" aria-label="Sub episodes" />
                    {it.subs}
                  </span>
                ) : null}
                {it.dubs ? (
                  <span className={pill}>
                    <Mic className="size-3" aria-label="Dub episodes" />
                    {it.dubs}
                  </span>
                ) : null}
                {!it.subs && !it.dubs && it.episodes ? (
                  <span className={pill}>
                    <Captions className="size-3" aria-label="Episodes" />
                    {it.episodes}
                  </span>
                ) : null}
                {it.onSite ? (
                  <span className={cn(pill, "bg-primary/20 text-primary")}>
                    On site
                  </span>
                ) : null}
                {it.format ? (
                  <span className={pill}>{prettyLabel(it.format)}</span>
                ) : null}
                {it.year ? <span className={pill}>{it.year}</span> : null}
              </div>
              <div className="mt-2 max-h-10 overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out group-hover:mt-0 group-hover:max-h-0 group-hover:-translate-y-1 group-hover:opacity-0 group-focus-within:mt-0 group-focus-within:max-h-0 group-focus-within:-translate-y-1 group-focus-within:opacity-0">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                  <Link
                    to="/anime/$id"
                    params={{ id: String(it.animeId) }}
                    draggable={false}
                    className="hover:text-primary"
                  >
                    {it.title}
                  </Link>
                </h3>
              </div>
            </div>
          ))
        )}
      </DragScroller>
    </section>
  );
}
