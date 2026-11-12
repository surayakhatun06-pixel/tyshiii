import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Info, Play, Plus } from "lucide-react";

import { useSpotlightState } from "@/hooks/use-spotlight";
import { useWatchlist } from "@/hooks/use-watchlist";
import { cn } from "@/lib/utils";
import { stripHtml, titleOf, type MediaCard } from "@/lib/anilist";
import { MAX_SPOTLIGHT, slideToCard } from "@/lib/spotlight";

/**
 * Home hero. The admin's Spotlight picks come first; any empty slot (up to 6) is
 * filled with AniList trending. Slides cross-fade with a touch of blur. Drag it with the
 * mouse or swipe it on a phone to change slide.
 */
export function Hero({ media, loading = false }: { media: MediaCard[]; loading?: boolean }) {
  const { slides: picked, ready } = useSpotlightState();
  const slides = useMemo(() => {
    // Until your own list has arrived nothing is shown, so AniList's list never flashes first.
    if (!ready) return [];
    const own = picked.map(slideToCard);
    const taken = new Set(own.map((m) => m.id));
    const fill = media.filter((m) => m.bannerImage && !taken.has(m.id));
    return [...own, ...fill].slice(0, MAX_SPOTLIGHT);
  }, [picked, media, ready]);

  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragFrame = useRef(0);
  const pendingDrag = useRef(0);
  const count = slides.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const indexRef = useRef(safeIndex);
  indexRef.current = safeIndex;

  const gesture = useRef({ down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastT: 0, velocity: 0, swallow: false });

  // Warm up only the next couple of banners (12 full-size pictures at once is too much for a phone).
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    if (!count) return;
    for (const k of [1]) {
      const src = slides[(safeIndex + k) % count]?.bannerImage;
      if (!src || warmed.current.has(src)) continue;
      warmed.current.add(src);
      const img = new Image();
      img.src = src;
      img.decode?.().catch(() => undefined);
    }
  }, [slides, safeIndex, count]);

  // Slides added later fade in; the very first ones are simply there (no fade up from black).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!count) return;
    const t = window.setTimeout(() => setMounted(true), 900);
    return () => window.clearTimeout(t);
  }, [count > 0]);

  const goTo = useCallback(
    (next: number) => {
      const from = indexRef.current;
      if (next === from || next < 0 || next >= count) return;
      // The slide that is leaving stays fully visible underneath until the new one has
      // faded in, so the art never dips to a dark gap in the middle of a change.
      setLeaving(from);
      clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => setLeaving(null), 450);
      setIndex(next);
    },
    [count],
  );

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // No point animating a banner nobody can see: pause when it's scrolled away or the tab is hidden.
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (count < 2 || paused || dragging || !onScreen) return;
    const t = setInterval(() => {
      if (!document.hidden) goTo((indexRef.current + 1) % count);
    }, 8000);
    return () => clearInterval(t);
  }, [count, paused, dragging, onScreen, goTo]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const g = gesture.current;
    g.down = true;
    g.moved = false;
    g.startX = g.lastX = e.clientX;
    g.startY = e.clientY;
    g.lastT = performance.now();
    g.velocity = 0;
  }, []);

  useEffect(() => {
    const g = gesture.current;

    const move = (e: PointerEvent) => {
      if (!g.down) return;
      const dx = e.clientX - g.startX;
      if (!g.moved) {
        // Vertical gestures belong to page scrolling.
        if (Math.abs(e.clientY - g.startY) > Math.abs(dx) && Math.abs(e.clientY - g.startY) > 8) {
          g.down = false;
          return;
        }
        if (Math.abs(dx) < 6) return;
        g.moved = true;
        setDragging(true);
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const dt = now - g.lastT;
      if (dt > 0) g.velocity = (e.clientX - g.lastX) / dt;
      g.lastX = e.clientX;
      g.lastT = now;
      pendingDrag.current = dx;
      if (!dragFrame.current) {
        dragFrame.current = requestAnimationFrame(() => {
          dragFrame.current = 0;
          setDrag(pendingDrag.current);
        });
      }
    };

    const end = () => {
      if (!g.down) return;
      g.down = false;
      if (!g.moved) return;
      g.moved = false;
      g.swallow = true;
      window.setTimeout(() => (g.swallow = false), 0);
      const width = box.current?.clientWidth ?? 800;
      const dx = g.lastX - g.startX;
      const far = Math.abs(dx) > Math.max(60, width * 0.12);
      const fast = Math.abs(g.velocity) > 0.4;
      if (dragFrame.current) cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
      setDragging(false);
      setDrag(0);
      if (far || fast) {
        const dir = (far ? dx : g.velocity) < 0 ? 1 : -1;
        goTo(Math.max(0, Math.min(count - 1, indexRef.current + dir)));
      }
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (dragFrame.current) cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
    };
  }, [count, goTo]);

  const placeholder = (
    <div className="relative h-[48vh] min-h-[320px] w-full overflow-hidden bg-background md:-ml-[60px] md:h-[64vh] md:min-h-[420px] md:w-[calc(100%+60px)]" aria-busy="true">
      <div className="absolute inset-0 animate-pulse bg-linear-to-br from-surface-2/70 via-surface/40 to-background" />
      <div className="absolute bottom-16 left-4 space-y-3 md:left-12">
        <div className="h-7 w-48 rounded bg-foreground/10" />
        <div className="h-4 w-72 max-w-[80vw] rounded bg-foreground/10" />
      </div>
    </div>
  );
  if (!ready) return placeholder;
  if (!count) return loading ? placeholder : <div className="h-14" />;

  // While dragging, only the text follows the pointer (a little), so the art never leaves a gap.
  const nudge = Math.max(-48, Math.min(48, drag * 0.3));
  const fadeOut = 1 - Math.min(0.45, Math.abs(drag) / 600);

  return (
    <section
      ref={box}
      aria-roledescription="carousel"
      aria-label="Spotlight"
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (gesture.current.swallow) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={cn(
        "relative h-[72vh] min-h-[480px] w-full touch-pan-y overflow-hidden md:-ml-[60px] md:w-[calc(100%+60px)]",
        dragging ? "cursor-grabbing select-none" : "cursor-grab",
      )}
    >
      {slides.map((s, i) =>
        i === safeIndex || i === leaving ? (
          <Slide
            key={s.id}
            media={s}
            active={i === safeIndex}
            leaving={i === leaving}
            fresh={mounted}
            nudge={i === safeIndex ? nudge : 0}
            textOpacity={i === safeIndex ? fadeOut : 1}
            dragging={dragging}
          />
        ) : null,
      )}

      <div className="absolute inset-x-0 bottom-6 z-40 flex justify-center gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Show ${titleOf(s)}`}
            aria-current={i === safeIndex}
            onClick={() => goTo(i)}
            className={cn(
              "h-1 rounded-full transition-all duration-500",
              i === safeIndex ? "w-8 bg-foreground" : "w-4 bg-foreground/30 hover:bg-foreground/60",
            )}
          />
        ))}
      </div>
    </section>
  );
}

function Slide({
  media,
  active,
  leaving,
  fresh,
  nudge,
  textOpacity,
  dragging,
}: {
  media: MediaCard;
  active: boolean;
  leaving: boolean;
  fresh: boolean;
  nudge: number;
  textOpacity: number;
  dragging: boolean;
}) {
  const { has, toggle } = useWatchlist();
  const saved = has(media.id);
  // A slide that appears after the page is up starts see-through, then fades in on the next frames.
  const [entered, setEntered] = useState(!fresh);
  useEffect(() => {
    if (entered) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [entered]);
  const chips = [
    media.episodes ? `${media.episodes} Episodes` : null,
    media.seasonYear ? String(media.seasonYear) : null,
    ...media.genres.slice(0, 3),
  ].filter(Boolean) as string[];

  return (
    <div
      aria-hidden={!active}
      inert={!active}
      className={cn(
        "absolute inset-0",
        // The new slide fades in (and un-blurs) on top; the old one waits underneath, then is dropped.
        // (The soft blur is for larger screens only; filters are what make phones stutter.)
        active && "z-20 transition-opacity duration-400 ease-out",
        active && (entered ? "opacity-100" : "opacity-0"),
        leaving && "z-10 opacity-100 transition-opacity duration-400 ease-out",
      )}
    >
      <img
        src={media.bannerImage ?? undefined}
        alt={active ? `${titleOf(media)} banner art` : ""}
        draggable={false}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Soft shading under the text only (it sits below the text and buttons, so they stay bright). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-background via-background/45 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[65%] bg-linear-to-r from-background/55 via-background/15 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-background/40 to-transparent" />

      <div
        className={cn(
          "relative flex h-full flex-col justify-end px-4 pb-16 md:pl-[calc(60px+2rem)] md:pr-8 md:pb-20",
          !dragging && "transition-[transform,opacity] duration-300 ease-out",
        )}
        style={{ transform: `translate3d(${nudge}px,0,0)`, opacity: textOpacity }}
      >
        <div className="max-w-2xl">
          <h1 className="text-balance-tight text-4xl font-extrabold leading-[1.05] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)] md:text-6xl">
            {titleOf(media)}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-black/50 px-3 py-1.5 font-medium text-white backdrop-blur">
                {c}
              </span>
            ))}
          </div>

          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgb(0_0_0/0.7)] md:text-base">
            {stripHtml(media.description)}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              to="/anime/$id/watch"
              params={{ id: String(media.id) }}
              draggable={false}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-black shadow-lg shadow-black/40 transition hover:bg-white/90"
            >
              <Play className="size-4 fill-current" />
              Watch Now
            </Link>
            <Link
              to="/anime/$id"
              params={{ id: String(media.id) }}
              draggable={false}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/30 bg-black/50 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/65"
            >
              <Info className="size-4" />
              Details
            </Link>
            <button
              type="button"
              onClick={() => toggle(media)}
              aria-label={saved ? "Remove from My list" : "Add to My list"}
              aria-pressed={saved}
              className="grid size-11 place-items-center rounded-xl border border-white/30 bg-black/50 text-white backdrop-blur transition hover:bg-black/65"
            >
              {saved ? <Check className="size-4" /> : <Plus className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
