import { useEffect, useState } from "react";
import { Bell, CalendarDays, Megaphone } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { firebaseConfigured } from "@/lib/firebase";
import { subscribeAnnouncements, type SiteAnnouncement } from "@/lib/site-announcements";
import { cn } from "@/lib/utils";

const LAST_SEEN_KEY = "tyshi-announcements-seen-v1";

function announcementDate(value: number) {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(value);
}

export function AnnouncementsPopover() {
  const [items, setItems] = useState<SiteAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const newestAt = items[0]?.createdAt ?? 0;
  const unread = newestAt > seenAt;

  useEffect(() => {
    try {
      setSeenAt(Number(window.localStorage.getItem(LAST_SEEN_KEY)) || 0);
    } catch {
      setSeenAt(0);
    }
    return subscribeAnnouncements(
      (next) => {
        setItems(next);
        setLoading(false);
      },
      () => {
        setError(true);
        setLoading(false);
      },
    );
  }, []);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    const timestamp = Math.max(Date.now(), newestAt);
    setSeenAt(timestamp);
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, String(timestamp));
    } catch {
      // The panel still works when local storage is disabled.
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? "Announcements, new updates" : "Announcements"}
          title="Announcements"
          className={cn(
            "relative grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-surface-2/70 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:absolute md:right-8 md:size-10",
            open && "bg-surface-2/70 text-foreground",
          )}
        >
          <Bell className="size-4" />
          {unread && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={10}
        className="scroll-slim max-h-[min(72vh,36rem)] w-[calc(100vw-1.5rem)] max-w-96 overflow-y-auto p-0"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-popover/95 px-4 py-3 backdrop-blur">
          <span className="grid size-8 place-items-center rounded-xl bg-primary/12 text-primary">
            <Megaphone className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Announcements</span>
            <span className="block text-[11px] text-muted-foreground">Updates from TYSHI ZONE</span>
          </span>
          {items.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">{items.length}</span>}
        </div>

        {loading ? (
          <div className="space-y-2 p-4" aria-label="Loading announcements">
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="h-12 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : error ? (
          <p role="status" className="p-5 text-sm text-muted-foreground">Announcements couldn’t load right now.</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
            <Bell className="size-5 text-muted-foreground/70" />
            <p className="text-sm font-semibold">No announcements yet</p>
            <p className="text-xs text-muted-foreground">New site updates will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {items.map((item) => (
              <li key={item.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-semibold leading-snug">{item.title}</h3>
                  <time dateTime={new Date(item.createdAt).toISOString()} className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <CalendarDays className="size-3" /> {announcementDate(item.createdAt)}
                  </time>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        )}

        {!firebaseConfigured && !error ? <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">Announcements are not connected for this install.</p> : null}
      </PopoverContent>
    </Popover>
  );
}
