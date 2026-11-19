import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Info } from "lucide-react";

import { EpisodeThumb } from "@/components/episode-thumb";
import { percentOf, type ProgressRecord } from "@/hooks/use-progress";
import type { SavedVideo } from "@/hooks/use-videos";
import { isDefaultEpisodeTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

const PER_PAGE = 12; // three cards per row, four rows (doc 2.1)

/** Page numbers like: ‹ 1 … 92 93 94 95 › (always the first page, the pages around the current one, and the last). */
function pageList(current: number, total: number): (number | "gap")[] {
  const keep = new Set<number>([0, total - 1, current - 1, current, current + 1]);
  const out: (number | "gap")[] = [];
  let last = -1;
  [...keep]
    .filter((n) => n >= 0 && n < total)
    .sort((a, b) => a - b)
    .forEach((n) => {
      if (n - last > 1) out.push("gap");
      out.push(n);
      last = n;
    });
  return out;
}

/**
 * Theater mode (PC only): the episodes as a card grid under the big player, like the reference picture.
 * Each card: wide thumbnail on the left; "Episode N  25m", the real title and a short synopsis on the right.
 * The playing episode uses the theme colour. Nothing is invented: no synopsis means no synopsis line.
 */
export function TheaterEpisodes({
  episodes,
  currentId,
  progress,
  thumbnailFor,
  fallbackArt,
  minutes,
  onPick,
}: {
  episodes: SavedVideo[];
  currentId: string | undefined;
  progress: Map<string, ProgressRecord>;
  thumbnailFor: (e: SavedVideo) => string | undefined;
  fallbackArt: string | null;
  /** Episode length in minutes when AniList knows it. */
  minutes: number | null;
  onPick: (e: SavedVideo) => void;
}) {
  const pages = Math.max(1, Math.ceil(episodes.length / PER_PAGE));
  const [page, setPage] = useState(0);
  // Open on the page that holds the playing episode.
  useEffect(() => {
    const at = episodes.findIndex((e) => e.id === currentId);
    if (at >= 0) setPage(Math.floor(at / PER_PAGE));
  }, [currentId, episodes]);
  const safe = Math.min(page, pages - 1);
  const slice = episodes.slice(safe * PER_PAGE, safe * PER_PAGE + PER_PAGE);

  return (
    <section aria-label="Episodes" className="section-box p-4">
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {slice.map((e) => {
          const playing = e.id === currentId;
          const rec = progress.get(e.id);
          const real = !isDefaultEpisodeTitle(e.title, e.episode);
          const percent = rec && !rec.completed ? (percentOf(rec) ?? 0) : 0;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onPick(e)}
                aria-current={playing ? "true" : undefined}
                className={cn(
                  "group flex h-full w-full items-stretch gap-3 overflow-hidden rounded-xl border p-2 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40",
                  playing ? "border-primary bg-primary/20 ring-1 ring-primary" : "border-white/10 bg-white/[0.04] hover:border-white/25",
                )}
              >
                <EpisodeThumb src={thumbnailFor(e)} fallback={fallbackArt} className="w-[42%] shrink-0 self-start rounded-lg">
                  {percent > 0 && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                      <span className="block h-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
                    </span>
                  )}
                </EpisodeThumb>
                <span className="relative flex min-w-0 flex-1 flex-col gap-0.5 pr-5">
                  <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span className={cn(playing && "text-primary")}>{e.episode !== undefined ? `Episode ${e.episode}` : "Extra"}</span>
                    {minutes ? <span>{minutes}m</span> : null}
                    {rec?.completed && <Check className="size-3.5" aria-label="Watched" />}
                  </span>
                  <span className="line-clamp-2 text-sm font-bold leading-snug">{real ? e.title : e.episode !== undefined ? `Episode ${e.episode}` : "Extra"}</span>
                  {(e as SavedVideo & { synopsis?: string }).synopsis ? (
                    <span className="line-clamp-3 text-[11px] leading-snug text-muted-foreground">{(e as SavedVideo & { synopsis?: string }).synopsis}</span>
                  ) : null}
                  <Info className="absolute right-0 top-0 size-3.5 text-muted-foreground/70" aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <nav aria-label="Episode pages" className="mt-4 flex items-center justify-center gap-1.5">
          <button type="button" aria-label="Previous page" disabled={safe === 0} onClick={() => setPage(safe - 1)} className="grid size-9 place-items-center rounded-lg border border-white/10 disabled:opacity-40">
            <ChevronLeft className="size-4" />
          </button>
          {pageList(safe, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`g${i}`} className="px-1 text-muted-foreground">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === safe ? "page" : undefined}
                className={cn("h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold", p === safe ? "border-primary bg-primary text-primary-foreground" : "border-white/10 hover:bg-white/10")}
              >
                {p + 1}
              </button>
            ),
          )}
          <button type="button" aria-label="Next page" disabled={safe >= pages - 1} onClick={() => setPage(safe + 1)} className="grid size-9 place-items-center rounded-lg border border-white/10 disabled:opacity-40">
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </section>
  );
}
