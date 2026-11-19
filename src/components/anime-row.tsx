import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AnimeCard, AnimeCardSkeleton } from "@/components/anime-card";
import { DragScroller } from "@/components/drag-scroller";
import type { MediaCard } from "@/lib/anilist";

export function AnimeRow({
  title,
  eyebrow,
  media,
  loading,
  bleedOnPhone = false,
}: {
  title: string;
  eyebrow?: string;
  media?: MediaCard[];
  loading?: boolean;
  bleedOnPhone?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.round(el.clientWidth * 0.85),
      behavior: "smooth",
    });
  };

  return (
    <section
      className="py-6 [contain-intrinsic-size:auto_420px] [content-visibility:auto]"
    >
      <div className="mb-3 flex items-end justify-between gap-4 px-3 md:px-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">
            {title}
          </h2>
          {eyebrow && (
            <p className="mt-0.5 text-xs text-muted-foreground">{eyebrow}</p>
          )}
        </div>
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            onClick={() => scrollBy(-1)}
            className="grid size-9 place-items-center rounded-full border border-border bg-surface transition hover:border-foreground/40 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            onClick={() => scrollBy(1)}
            className="grid size-9 place-items-center rounded-full border border-border bg-surface transition hover:border-foreground/40 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <DragScroller ref={scroller} className="gap-3 px-0 py-5 md:gap-4 md:px-8">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`${bleedOnPhone ? "w-36" : "w-32"} shrink-0 md:w-44`}
              >
                <AnimeCardSkeleton />
              </div>
            ))
          : media?.map((m) => (
              <AnimeCard
                key={m.id}
                media={m}
                className={`${bleedOnPhone ? "w-36" : "w-32"} shrink-0 md:w-44`}
              />
            ))}
      </DragScroller>
    </section>
  );
}
