import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

import { DragScroller } from "@/components/drag-scroller";
import { EpisodeThumb, ProgressBar } from "@/components/episode-thumb";
import { useContinueWatching, type ContinueItem } from "@/hooks/use-progress";
import { formatRemaining, isDefaultEpisodeTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

function progressText(item: ContinueItem) {
  if (item.kind === "next") return "Up next";
  if (item.percent !== null && item.duration) {
    return `${item.percent}% watched · ${formatRemaining(item.duration - item.position)}`;
  }
  return "Pick up where you left off";
}

export function ContinueCard({ item, className }: { item: ContinueItem; className?: string }) {
  const hasTitle = !isDefaultEpisodeTitle(item.episodeTitle, item.episode);
  const label = item.episode !== null ? `Episode ${item.episode}` : "Extra";
  const cta = item.kind === "next" ? "Watch next" : item.percent !== null ? "Resume" : "Continue";

  return (
    <Link
      to="/anime/$id/watch"
      params={{ id: String(item.animeId) }}
      search={{ ep: item.episodeId }}
      draggable={false}
      className={cn("group block focus-visible:outline-none", className)}
    >
      <EpisodeThumb
        src={item.thumb}
        fallback={item.animeCover}
        alt={`${item.animeTitle} ${label}`}
        className="rounded-xl ring-1 ring-border transition group-hover:ring-primary/60 group-focus-visible:ring-2 group-focus-visible:ring-primary"
      >
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
            <Play className="size-5 translate-x-0.5 fill-current" />
          </span>
        </span>
        {item.percent !== null && item.kind === "resume" && <ProgressBar value={item.percent} />}
      </EpisodeThumb>

      <div className="mt-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold transition group-hover:text-primary">
            {item.animeTitle}
          </h3>
          <p className="line-clamp-1 text-xs text-foreground/80">
            {label}
            {hasTitle ? ` — ${item.episodeTitle}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{progressText(item)}</p>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
          {cta}
        </span>
      </div>
    </Link>
  );
}

/** Home page section. Renders nothing until there is viewing history. */
export function ContinueWatchingRow() {
  const { items } = useContinueWatching();
  const scroller = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <section className="py-3 md:py-6" aria-labelledby="continue-heading">
      <div className="mb-3 flex items-end justify-between gap-4 px-3 md:px-8">
        <div className="flex items-baseline gap-4">
          <h2 id="continue-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
            Continue Watching
          </h2>
          <Link
            to="/history"
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            View history
          </Link>
        </div>
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            aria-label="Scroll continue watching left"
            onClick={() => scrollBy(-1)}
            className="grid size-9 place-items-center rounded-full border border-border bg-surface transition hover:border-foreground/40 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll continue watching right"
            onClick={() => scrollBy(1)}
            className="grid size-9 place-items-center rounded-full border border-border bg-surface transition hover:border-foreground/40 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <DragScroller ref={scroller} className="gap-3 px-3 py-5 pb-2 md:gap-4 md:px-8">
        {items.map((item) => (
          <ContinueCard key={item.key} item={item} className="w-64 shrink-0 md:w-80" />
        ))}
      </DragScroller>
    </section>
  );
}
