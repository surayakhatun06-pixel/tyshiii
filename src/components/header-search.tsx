import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import { useCatalog } from "@/hooks/use-catalog";
import { prettyLabel, titleOf, type MediaCard } from "@/lib/anilist";
import { cloudToCard } from "@/lib/custom-series";
import { browseQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Search box in the top bar with live suggestions. Enter opens the full results page. */
export function HeaderSearch({
  className,
  shrink = false,
}: {
  className?: string;
  shrink?: boolean;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { catalog } = useCatalog();
  // Watch page: start full-width, then settle in one smooth step into the left-side magnifier.
  const [expanded, setExpanded] = useState(false);
  const [icon, setIcon] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedRef = useRef(false);
  const previousShrink = useRef(shrink);
  const hasMounted = useRef(false);
  // The bar turns into a small icon only after YOU scroll the page down. Scroll jumps that happen while
  // a page is loading (the position being reset, or an old page flipping to the watch page) never count.
  const collapsedRef = useRef(false);
  const bornAt = useRef(0);
  expandedRef.current = expanded;

  useBrowserLayoutEffect(() => {
    const el = box.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (!bornAt.current) bornAt.current = performance.now();
    if (!shrink) {
      el.style.width = "";
      el.style.marginLeft = "";
      el.style.transition = "";
      collapsedRef.current = false;
      setIcon(false);
      return;
    }
    const transition =
      "width 280ms cubic-bezier(.22,.8,.2,1), margin-left 280ms cubic-bezier(.22,.8,.2,1)";
    // Snap, don't animate, when the route changed or this bar was only just created. The watch
    // page renders its loading skeleton and then the page itself, each inside its own shell, so
    // the bar is rebuilt at full width and would otherwise visibly shrink into place.
    const routeChanged = previousShrink.current !== shrink;
    const snap = routeChanged || !hasMounted.current;
    previousShrink.current = shrink;
    hasMounted.current = true;
    el.style.transition = snap ? "none" : transition;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const W = parent.clientWidth;
      const phone = window.matchMedia("(max-width: 767px)").matches;
      const full = Math.min(phone ? W : 448, W);
      const open = expandedRef.current;
      // Avoid a half-collapsed resting state on either phone or desktop.
      const p = open ? 0 : collapsedRef.current ? 1 : 0;
      const width = full + (40 - full) * p;
      el.style.width = `${Math.round(width)}px`;
      el.style.marginLeft = `${Math.round(((W - width) / 2) * (1 - p))}px`;
      setIcon(!open && p > 0.82);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onScroll = () => {
      // Ignore the first moments after the bar appears: the page is still loading and moving.
      if (performance.now() - bornAt.current < 900) return;
      const next = window.scrollY > 24;
      if (next !== collapsedRef.current) {
        collapsedRef.current = next;
        schedule();
      }
    };
    apply();
    if (snap)
      requestAnimationFrame(() => {
        if (box.current) box.current.style.transition = transition;
      });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [shrink, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 160);
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !box.current?.contains(e.target))
        setExpanded(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", close);
    };
  }, [expanded]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !box.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const results = useQuery({
    ...browseQuery({
      search: debounced,
      perPage: 7,
      sort: ["SEARCH_MATCH"],
      includeAdult: true,
    }),
    enabled: debounced.length > 0,
  });

  const own = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return [];
    return catalog
      .filter((a) => a.custom && a.title.toLowerCase().includes(q))
      .slice(0, 3)
      .map(cloudToCard);
  }, [catalog, debounced]);

  const items: MediaCard[] = [...own, ...(results.data?.media ?? [])].slice(
    0,
    8,
  );

  function submit() {
    const q = term.trim();
    if (!q) return;
    setOpen(false);
    void navigate({ to: "/search", search: { q } });
  }

  return (
    <div ref={box} className={cn("relative w-full", className)}>
      <div className="flex h-9 overflow-hidden rounded-full border border-white/20 bg-black/60 shadow-none backdrop-blur-md transition duration-200 focus-within:border-white/35 focus-within:bg-black/70 md:h-[38px]">
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              submit();
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search anime…"
          aria-label="Search anime"
          autoComplete="off"
          className={cn(
            "min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
            icon && "pointer-events-none w-0 flex-none px-0 opacity-0",
          )}
        />
        <button
          type="button"
          onClick={() => (icon ? setExpanded(true) : submit())}
          aria-label={icon ? "Open search" : "Search"}
          className={cn(
            "grid place-items-center text-muted-foreground transition hover:text-foreground",
            icon
              ? "w-full flex-none border-l-0"
              : "w-11 flex-none border-l border-white/10",
          )}
        >
          <Search className="size-4" />
        </button>
      </div>

      {open && debounced.length > 0 && (
        <div className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {results.isPending && !items.length ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nothing found for “{debounced}”.
            </p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setTerm("");
                      void navigate({
                        to: "/anime/$id",
                        params: { id: String(m.id) },
                      });
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2"
                  >
                    {m.coverImage.large ? (
                      <img
                        src={m.coverImage.large}
                        alt=""
                        className="h-14 w-10 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-14 w-10 shrink-0 rounded-md bg-surface-2" />
                    )}
                    <span className="min-w-0">
                      <span className="line-clamp-1 text-sm font-semibold">
                        {titleOf(m)}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {[
                          prettyLabel(m.format),
                          m.seasonYear,
                          m.isAdult ? "18+" : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={submit}
            className="w-full border-t border-border px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            See all results for “{debounced}”
          </button>
        </div>
      )}
    </div>
  );
}
