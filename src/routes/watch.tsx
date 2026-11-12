import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  Link2,
  Pencil,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Tv,
} from "lucide-react";
import { toast } from "sonner";

import { SiteShell } from "@/components/site-shell";
import { ContinueWatchingRow } from "@/components/continue-watching";
import { VideoPlayer } from "@/components/video-player";
import { useVideos } from "@/hooks/use-videos";
import { toEmbed } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { CustomLinkForm } from "@/components/custom-link-form";
import { EpisodeThumb } from "@/components/episode-thumb";
import { downloadEpisodes, parsePersonalLibrary } from "@/lib/episode-import";
import { type SavedVideo } from "@/hooks/use-videos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Watch — TYSHI ZONE" },
      {
        name: "description",
        content:
          "Pick up where you left off, or paste any video link and play it instantly.",
      },
      { property: "og:title", content: "Watch — TYSHI ZONE" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { videos, ready, save, saveMany, remove } = useVideos();
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [editing, setEditing] = useState<SavedVideo | null>(null);
  const [deleting, setDeleting] = useState<SavedVideo | null>(null);
  const [filter, setFilter] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [theater, setTheater] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [pendingImport, setPendingImport] = useState<ReturnType<
    typeof parsePersonalLibrary
  > | null>(null);

  useEffect(() => {
    if (window.location.hash === "#my-links") setCustomOpen(true);
  }, []);

  // Links saved from this page. Anime episodes are managed per anime.
  const loose = useMemo(
    () =>
      videos
        .filter((v) => v.animeId === undefined)
        .sort((a, b) => b.addedAt - a.addedAt),
    [videos],
  );
  const current = loose.find((v) => v.id === currentId) ?? null;
  const embed = useMemo(
    () => (current ? toEmbed(current.url) : null),
    [current],
  );
  const seriesNames = [
    ...new Set(
      loose.flatMap((video) => (video.seriesName ? [video.seriesName] : [])),
    ),
  ].sort();
  const filtered = loose.filter(
    (video) =>
      (!seriesFilter || video.seriesName === seriesFilter) &&
      `${video.title} ${video.seriesName ?? ""}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase()),
  );
  const playlist = loose
    .filter((video) =>
      current?.seriesName
        ? video.seriesName === current.seriesName
        : !video.seriesName,
    )
    .sort((first, second) => first.addedAt - second.addedAt);
  const currentIndex = playlist.findIndex((video) => video.id === currentId);
  const previous = playlist[currentIndex - 1];
  const next = currentIndex >= 0 ? playlist[currentIndex + 1] : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const em = toEmbed(link);
    if (!em)
      return setError(
        "That link didn't parse. Copy the full link (or embed code) and paste it again.",
      );
    try {
      const saved = save({ url: em.src, title: name.trim() || em.host });
      setCurrentId(saved.id);
      setLink("");
      setName("");
    } catch {
      setError("Couldn't save this link. Check browser storage permissions.");
    }
  }

  return (
    <SiteShell>
      <div className="mx-auto max-w-[1600px] py-8">
        <h1 className="px-4 text-3xl font-bold tracking-tight md:px-8 md:text-4xl">
          Watch
        </h1>

        <ContinueWatchingRow />

        <section
          className={cn(
            "mx-auto mt-6 px-4 md:px-8",
            theater ? "max-w-[1400px]" : "max-w-4xl",
          )}
          aria-labelledby="quick-heading"
        >
          <div id="my-links" className="mb-5 scroll-mt-20">
            {!customOpen && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setCustomOpen(true);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 text-sm font-semibold text-primary hover:bg-primary/20"
              >
                <Plus className="size-4" />
                Add my own link & series
              </button>
            )}
            {customOpen && (
              <CustomLinkForm
                key={editing?.id ?? "new"}
                editing={editing}
                onClose={() => {
                  setCustomOpen(false);
                  setEditing(null);
                }}
                onSaved={(id) => {
                  setCurrentId(id);
                  setCustomOpen(false);
                  setEditing(null);
                }}
              />
            )}
          </div>
          <h2
            id="quick-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Play a link
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Paste any video link or embed code to watch it right away. It's
            saved to your list in this browser.
          </p>

          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              aria-label="Name"
              className="h-11 rounded-full border border-border bg-surface px-4 text-sm outline-none transition focus:border-primary sm:w-52"
            />
            <label className="relative flex-1">
              <span className="sr-only">Video link</span>
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Paste link or iframe code"
                className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-sm outline-none transition focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={!link.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              <Plus className="size-4" /> Play
            </button>
          </form>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

          <div className="relative mt-5 aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
            {current && embed ? (
              <VideoPlayer
                key={`${current.id}:${current.url}`}
                embed={embed}
                title={current.title}
                poster={current.seriesLogo}
                onEnded={() => {
                  if (autoNext && next) setCurrentId(next.id);
                }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center px-4 text-center text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-3">
                  <Tv className="size-10" />
                  Paste a link above, or pick one from your list.
                </div>
              </div>
            )}
          </div>

          {current && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="mr-auto min-w-0">
                <p className="text-xs text-primary">
                  {current.seriesName || "Personal video"}
                </p>
                <p className="text-sm font-semibold">{current.title}</p>
              </div>
              <button
                type="button"
                disabled={!previous}
                onClick={() => previous && setCurrentId(previous.id)}
                aria-label="Previous video"
                className="grid size-9 place-items-center rounded-full border border-border disabled:opacity-30"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                type="button"
                disabled={!next}
                onClick={() => next && setCurrentId(next.id)}
                aria-label="Next video"
                className="grid size-9 place-items-center rounded-full border border-border disabled:opacity-30"
              >
                <SkipForward className="size-4" />
              </button>
              <button
                type="button"
                aria-pressed={theater}
                onClick={() => setTheater(!theater)}
                className="rounded-full border border-border px-3 py-2 text-xs"
              >
                {theater ? "Compact view" : "Theater view"}
              </button>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(event) => setAutoNext(event.target.checked)}
                  className="accent-primary"
                />
                Auto-next
              </label>
            </div>
          )}
          {current && (
            <p className="mt-2 text-xs text-muted-foreground">
              Auto-next works for direct files, YouTube and Vimeo when the
              source reports playback completion. Open player tools for more
              controls.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-lg font-semibold">
              My watch library{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({loose.length})
              </span>
            </h2>
            <button
              type="button"
              disabled={!loose.length}
              onClick={() => downloadEpisodes("my-watch-library.json", loose)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs disabled:opacity-40"
            >
              <Download className="size-3.5" />
              Export
            </button>
            <label className="cursor-pointer rounded-full border border-border px-3 py-2 text-xs hover:border-primary">
              Import backup
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > 5_000_000)
                    return toast.error("Choose a backup smaller than 5 MB.");
                  try {
                    const entries = parsePersonalLibrary(await file.text()).map(
                      (entry) => {
                        const parsed = toEmbed(entry.url);
                        if (!parsed)
                          throw new Error(
                            `Invalid link for ${entry.title || "a video"}.`,
                          );
                        return { ...entry, url: parsed.src };
                      },
                    );
                    if (
                      new Set(entries.map((entry) => entry.url)).size !==
                      entries.length
                    )
                      throw new Error(
                        "This backup contains duplicate video links. Remove duplicates before importing.",
                      );
                    setPendingImport(entries);
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Couldn't read the backup.",
                    );
                  }
                }}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                aria-label="Search my watch library"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find a video or series"
                className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <select
              aria-label="Filter by series"
              value={seriesFilter}
              onChange={(event) => setSeriesFilter(event.target.value)}
              className="h-10 max-w-full rounded-xl border border-border bg-surface px-3 text-sm"
            >
              <option value="">All series</option>
              {seriesNames.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>
          </div>

          {filtered.length > 0 && (
            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {filtered.map((v) => (
                <li
                  key={v.id}
                  className={cn(
                    "flex items-center gap-1 rounded-xl border bg-surface/60 p-1.5",
                    v.id === currentId ? "border-primary" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCurrentId(v.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:text-primary"
                  >
                    {v.seriesLogo && (
                      <EpisodeThumb
                        src={v.seriesLogo}
                        className="w-16 shrink-0 rounded-lg"
                      />
                    )}
                    <Play className="size-3.5 shrink-0 fill-current" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {v.title}
                      </span>
                      {v.seriesName && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {v.seriesName}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${v.title}`}
                    onClick={() => {
                      setEditing(v);
                      setCustomOpen(true);
                      document
                        .getElementById("my-links")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="grid size-8 place-items-center text-muted-foreground transition hover:text-primary"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${v.title}`}
                    onClick={() => {
                      setDeleting(v);
                    }}
                    className="grid size-8 place-items-center text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!ready ? (
            <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            filtered.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {loose.length
                  ? "No videos match your search or series filter."
                  : "Your library is empty. Add your own link and series, or play a quick link above."}
              </p>
            )
          )}
          <AlertDialog
            open={!!deleting}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this video?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleting?.title} will be removed from this browser's watch
                  library.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!deleting) return;
                    try {
                      remove(deleting.id);
                      if (currentId === deleting.id) setCurrentId(null);
                      toast.success("Video removed.");
                    } catch {
                      toast.error(
                        "Couldn't remove the video. Check browser storage permissions.",
                      );
                    }
                  }}
                >
                  Remove video
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog
            open={!!pendingImport}
            onOpenChange={(open) => {
              if (!open) setPendingImport(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Import {pendingImport?.length} videos?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Videos will be added to this browser's watch library.{" "}
                  {pendingImport?.filter((entry) =>
                    loose.some((video) => video.url === entry.url),
                  ).length ?? 0}{" "}
                  matching links will be updated with the imported names and
                  logos. Other videos stay unchanged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!pendingImport) return;
                    try {
                      saveMany(pendingImport);
                      toast.success("Watch library imported.");
                    } catch {
                      toast.error(
                        "Couldn't import. Check browser storage or try a smaller backup.",
                      );
                    }
                  }}
                >
                  Import videos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>
    </SiteShell>
  );
}
