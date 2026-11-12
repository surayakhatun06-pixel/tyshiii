import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, ChevronDown, History as HistoryIcon, Pause, Play, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { SiteShell } from "@/components/site-shell";
import { EpisodeThumb, ProgressBar } from "@/components/episode-thumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  percentOf,
  setHistoryPaused,
  useHistoryPaused,
  useProgress,
  type ProgressRecord,
} from "@/hooks/use-progress";
import { formatClock, isDefaultEpisodeTitle } from "@/lib/format";
import { timeAgo } from "@/lib/anilist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — TYSHI ZONE" },
      { name: "description", content: "Everything you've watched recently, with one tap to resume." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

type Status = "all" | "watching" | "completed";
type Sort = "recent" | "title" | "progress";

const field =
  "h-11 w-full rounded-2xl border border-border bg-surface/60 px-3 text-sm outline-none backdrop-blur transition focus:border-primary";

function HistoryCard({ r, onRemove }: { r: ProgressRecord; onRemove: () => void }) {
  const pct = percentOf(r);
  const hasTitle = !isDefaultEpisodeTitle(r.episodeTitle, r.episode);
  const epLabel = r.episode !== null ? `Episode ${r.episode}` : "Extra";
  const sub = hasTitle ? `${epLabel}: ${r.episodeTitle}` : epLabel;
  const cta = r.completed ? "Watch again" : "Continue";

  return (
    <li className="group relative flex overflow-hidden rounded-2xl border border-border bg-surface/50 backdrop-blur transition hover:border-foreground/30">
      <Link
        to="/anime/$id/watch"
        params={{ id: String(r.animeId) }}
        search={{ ep: r.episodeId }}
        className="shrink-0"
        aria-label={`${cta} ${r.animeTitle} ${epLabel}`}
      >
        <EpisodeThumb src={r.episodeThumb} fallback={r.animeCover} className="h-full min-h-[96px] w-36 sm:w-52">
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
            {r.episode !== null ? `EP ${r.episode}` : "EXTRA"}
          </span>
          {r.completed ? (
            <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/60 text-white">
              <Check className="size-3" />
            </span>
          ) : (
            pct !== null && <ProgressBar value={pct} />
          )}
        </EpisodeThumb>
      </Link>

      <div className="min-w-0 flex-1 p-3 pr-10">
        <h2 className="line-clamp-1 text-base font-bold">{r.animeTitle}</h2>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{sub}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-md bg-surface-2/70 px-1.5 py-0.5">{timeAgo(r.updatedAt / 1000)}</span>
          {r.completed && <span className="rounded-md bg-surface-2/70 px-1.5 py-0.5">Completed</span>}
        </div>
        {r.tracked && r.duration ? (
          <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
            {formatClock(r.completed ? r.duration : r.position)} / {formatClock(r.duration)}
            {pct !== null ? ` · ${pct}%` : ""}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${r.animeTitle} ${epLabel} from history`}
        title="Remove from history"
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-surface-2/70 text-muted-foreground transition hover:text-destructive"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

function HistoryPage() {
  const { records, ready, remove, clear } = useProgress();
  const paused = useHistoryPaused();
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [asc, setAsc] = useState(false);
  const [term, setTerm] = useState("");

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    // One card per anime: its most recently watched episode.
    const seen = new Set<number>();
    const latest = records.filter((r) => (seen.has(r.animeId) ? false : (seen.add(r.animeId), true)));
    const list = latest.filter(
      (r) =>
        (status === "all" || (status === "completed" ? r.completed : !r.completed)) &&
        (!q || r.animeTitle.toLowerCase().includes(q)),
    );
    const dir = asc ? 1 : -1;
    list.sort((a, b) =>
      sort === "title"
        ? -dir * a.animeTitle.localeCompare(b.animeTitle)
        : sort === "progress"
          ? dir * ((percentOf(a) ?? 0) - (percentOf(b) ?? 0))
          : dir * (a.updatedAt - b.updatedAt),
    );
    return list;
  }, [records, status, sort, asc, term]);

  const titles = new Set(records.map((r) => r.animeId)).size;

  return (
    <SiteShell>
      <div className="mx-auto max-w-[1400px] px-3 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">History</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {titles} title{titles === 1 ? "" : "s"} · continue where you left off
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setHistoryPaused(!paused);
                toast.message(paused ? "History is recording again." : "History paused. New watching won't be saved.");
              }}
              aria-pressed={paused}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/60 px-4 text-sm backdrop-blur transition hover:border-foreground/40",
                paused && "border-primary text-primary",
              )}
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {paused ? "Resume history" : "Pause history"}
            </button>

            {records.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/60 px-4 text-sm backdrop-blur transition hover:border-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Clear all
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear your entire watch history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes all {records.length} entries and your saved resume positions,
                      including everything under Continue Watching. It can't be undone. Your episodes and My
                      List are not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep history</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        clear();
                        toast.success("Watch history cleared.");
                      }}
                    >
                      Clear history
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="glass flex h-fit flex-col gap-3 rounded-3xl p-3 lg:sticky lg:top-20">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search history"
                aria-label="Search history"
                className={cn(field, "pl-9")}
              />
            </label>

            <label className="relative block">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                aria-label="Show"
                className={cn(field, "appearance-none pr-9")}
              >
                <option value="all">All</option>
                <option value="watching">Watching</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </label>

            <div className="flex gap-2">
              <label className="relative block min-w-0 flex-1">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  aria-label="Sort by"
                  className={cn(field, "appearance-none pr-9")}
                >
                  <option value="recent">Last watched</option>
                  <option value="title">Title</option>
                  <option value="progress">Progress</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </label>
              <button
                type="button"
                onClick={() => setAsc((v) => !v)}
                aria-label={asc ? "Ascending" : "Descending"}
                className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-surface/60 backdrop-blur transition hover:border-foreground/40"
              >
                {asc ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
              </button>
            </div>

            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Saved in this browser only. Pausing stops new episodes from being recorded.
            </p>
          </aside>

          <div className="min-w-0">
            {!ready ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="mt-10 flex flex-col items-center gap-4 text-center">
                <HistoryIcon className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nothing watched yet. Episodes you start will show up here.</p>
                <Link
                  to="/browse"
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                >
                  Browse anime
                </Link>
              </div>
            ) : shown.length === 0 ? (
              <p className="mt-10 text-center text-sm text-muted-foreground">Nothing matches that search.</p>
            ) : (
              <ul className="grid gap-3 xl:grid-cols-2">
                {shown.map((r) => (
                  <HistoryCard key={r.key} r={r} onRemove={() => remove(r.key)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
