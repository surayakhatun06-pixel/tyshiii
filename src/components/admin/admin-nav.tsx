import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Boxes,
  ChevronLeft,
  ChevronRight,
  GalleryHorizontal,
  LayoutDashboard,
  Link2,
  MoreHorizontal,
} from "lucide-react";

import { AdminLink, type AdminSearch, type AdminView } from "@/components/admin/ui";
import { DragScroller } from "@/components/drag-scroller";
import { cn } from "@/lib/utils";

// The main tools come first. Single episodes and older tools live under "Extra options".
const TABS: { label: string; icon: typeof Boxes; s: AdminSearch; views: (AdminView | undefined)[] }[] = [
  { label: "Overview", icon: LayoutDashboard, s: {}, views: [undefined] },
  { label: "Universal Servers", icon: Link2, s: { view: "universal" }, views: ["universal"] },
  { label: "Bulk import", icon: Boxes, s: { view: "bulk" }, views: ["bulk"] },
  { label: "Spotlight", icon: GalleryHorizontal, s: { view: "spotlight" }, views: ["spotlight"] },
  { label: "Announcements", icon: Bell, s: { view: "announcements" }, views: ["announcements"] },
  {
    label: "Extra options",
    icon: MoreHorizontal,
    s: { view: "more" },
    views: ["more", "episodes", "library", "details", "new", "servers"],
  },
];

/** The same sections on every admin page. It scrolls by mouse drag, wheel, touch and the side arrows. */
export function AdminNav({ view }: { view?: AdminView }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  // Show an arrow only on a side that still has tabs hidden behind it.
  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    setEdge({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const watcher = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    watcher?.observe(el);

    // The mouse wheel moves the row sideways while it still can, so the page scrolls normally at the ends.
    const wheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return; // already sideways
      const max = el.scrollWidth - el.clientWidth;
      const canMove =
        (event.deltaY > 0 && el.scrollLeft < max - 1) || (event.deltaY < 0 && el.scrollLeft > 1);
      if (!canMove) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      el.removeEventListener("wheel", wheel);
      watcher?.disconnect();
    };
  }, [measure]);

  // Bring the open tab into view (for example "Bulk import" when it starts off screen).
  useEffect(() => {
    const el = row.current;
    const open = el?.querySelector<HTMLElement>("[data-tab-open]");
    if (!el || !open) return;
    const offset = open.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    el.scrollTo({ left: Math.max(0, offset - (el.clientWidth - open.offsetWidth) / 2), behavior: "smooth" });
  }, [view]);

  const slide = (direction: -1 | 1) =>
    row.current?.scrollBy({
      left: direction * Math.max(160, (row.current?.clientWidth ?? 0) * 0.7),
      behavior: "smooth",
    });

  const arrow = (side: "left" | "right") => (
    <button
      type="button"
      aria-label={side === "left" ? "Show earlier tabs" : "Show more tabs"}
      onClick={() => slide(side === "left" ? -1 : 1)}
      className={cn(
        "absolute inset-y-0 z-10 flex w-11 items-center",
        side === "left" ? "left-0 justify-start pl-1" : "right-0 justify-end pr-1",
      )}
      style={{
        background: `linear-gradient(to ${side === "left" ? "right" : "left"}, var(--background) 55%, transparent)`,
      }}
    >
      <span className="grid size-8 place-items-center rounded-full border border-border bg-surface-2 text-foreground shadow">
        {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </span>
    </button>
  );

  return (
    <nav aria-label="Admin sections" className="relative -mx-4 mb-6 md:mx-0">
      <DragScroller ref={row} className="gap-1.5 px-4 py-0 md:px-0">
        {TABS.map((t) => {
          const on = t.views.includes(view);
          return (
            <span key={t.label} data-tab-open={on ? "" : undefined} className="shrink-0">
              <AdminLink
                s={t.s}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <t.icon className="size-4" />
                {t.label}
              </AdminLink>
            </span>
          );
        })}
      </DragScroller>
      {edge.left && arrow("left")}
      {edge.right && arrow("right")}
    </nav>
  );
}
