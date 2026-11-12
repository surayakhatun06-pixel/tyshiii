import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Trash2 } from "lucide-react";

import { SiteShell } from "@/components/site-shell";
import { useWatchlist, WATCH_STATUS_LABEL, type WatchStatus } from "@/hooks/use-watchlist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "My Anime Watchlist — TYSHI ZONE" },
      {
        name: "description",
        content:
          "Keep track of the anime you're watching, planning to watch and have completed. Saved right in your browser, no account needed.",
      },
      { property: "og:title", content: "My Anime Watchlist — TYSHI ZONE" },
      {
        property: "og:description",
        content: "Track watching, planned and completed anime in one list.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchlistPage,
});

const ORDER: WatchStatus[] = ["WATCHING", "PLANNED", "COMPLETED"];

function WatchlistPage() {
  const { entries, remove, setStatus } = useWatchlist();

  return (
    <SiteShell>
      <div className="mx-auto max-w-[1600px] px-3 py-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">My watchlist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Saved in this browser. {entries.length} title{entries.length === 1 ? "" : "s"}.
        </p>

        {entries.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <Bookmark className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. Tap the bookmark on any poster to add it.
            </p>
            <Link
              to="/browse"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              Browse anime
            </Link>
          </div>
        ) : (
          ORDER.map((status) => {
            const group = entries.filter((e) => e.status === status);
            if (!group.length) return null;
            return (
              <section key={status} className="mt-10">
                <h2 className="text-lg font-semibold tracking-tight">
                  {WATCH_STATUS_LABEL[status]}{" "}
                  <span className="text-sm font-normal text-muted-foreground">({group.length})</span>
                </h2>
                <ul className="mt-4 space-y-3">
                  {group.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-4 rounded-2xl border border-border bg-surface/60 p-3"
                    >
                      <Link to="/anime/$id" params={{ id: String(entry.id) }} className="shrink-0">
                        <img
                          src={entry.cover ?? undefined}
                          alt={`${entry.title} poster art`}
                          loading="lazy"
                          className="h-24 w-16 rounded-lg object-cover"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 font-medium">{entry.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[entry.format, entry.episodes ? `${entry.episodes} ep` : null, entry.seasonYear]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {ORDER.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setStatus(entry.id, s)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] transition",
                                entry.status === s
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {WATCH_STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.title} from watchlist`}
                        onClick={() => remove(entry.id)}
                        className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </SiteShell>
  );
}
