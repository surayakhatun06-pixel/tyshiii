import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EpisodeThumb } from "@/components/episode-thumb";
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
import { removeEpisodeProgress } from "@/hooks/use-progress";
import {
  orderedEpisodes,
  useVideos,
  type SavedVideo,
  type SavedVideoInput,
} from "@/hooks/use-videos";
import { episodeNumberLabel, isDefaultEpisodeTitle } from "@/lib/format";
import { toEmbed } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import {
  downloadEpisodes,
  missingEpisodes,
  parseEpisodeList,
} from "@/lib/episode-import";
import { VideoPlayer } from "@/components/video-player";

const PAGE_SIZE = 50;

const input =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary";
const inputError = "border-destructive focus:border-destructive";

type Row = {
  key: string;
  episode: string;
  title: string;
  thumbnail: string;
  url: string;
};
type RowErrors = { episode?: string; thumbnail?: string; url?: string };

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

function smallestFree(taken: Set<number>) {
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

function isBlank(r: Row) {
  return !r.title.trim() && !r.thumbnail.trim() && !r.url.trim();
}

function validThumb(v: string) {
  if (!v.trim()) return true;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function BulkAdder({
  animeId,
  existing,
  fallbackArt,
}: {
  animeId: number;
  existing: SavedVideo[];
  fallbackArt: string | null;
}) {
  const { saveMany } = useVideos();
  const existingNumbers = useMemo(
    () =>
      new Set(
        existing
          .map((e) => e.episode)
          .filter((n): n is number => n !== undefined),
      ),
    [existing],
  );
  const existingSources = useMemo(
    () =>
      existing.map((entry) => ({
        episode: entry.episode,
        src: toEmbed(entry.url)?.src,
      })),
    [existing],
  );

  // BulkAdder only mounts once episodes are loaded, so the first free number is accurate.
  const [rows, setRows] = useState<Row[]>(() => [
    {
      key: newKey(),
      episode: String(smallestFree(existingNumbers)),
      title: "",
      thumbnail: "",
      url: "",
    },
  ]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [startNumber, setStartNumber] = useState("1");
  const [overwrite, setOverwrite] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  // First row defaults to the first free number; the rest continue from the row above.
  const takenNow = () => {
    const t = new Set(existingNumbers);
    for (const r of rows) {
      const n = parseInt(r.episode, 10);
      if (n) t.add(n);
    }
    return t;
  };

  function patch(key: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
    setOverwrite(false);
  }

  function addRows(count: number) {
    if (rows.length + count > 1000)
      return toast.error("Add up to 1,000 rows at a time.");
    setRows((rs) => {
      const taken = new Set(existingNumbers);
      for (const r of rs) {
        const n = parseInt(r.episode, 10);
        if (n) taken.add(n);
      }
      const added: Row[] = [];
      for (let i = 0; i < count; i++) {
        const n = smallestFree(taken);
        taken.add(n);
        added.push({
          key: newKey(),
          episode: String(n),
          title: "",
          thumbnail: "",
          url: "",
        });
      }
      return [...rs, ...added];
    });
  }

  function importPaste(text = pasteText) {
    let parsed;
    try {
      parsed = parseEpisodeList(text);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read this file.",
      );
      return;
    }
    if (parsed.length + rows.filter((row) => !isBlank(row)).length > 1000)
      return toast.error("Add up to 1,000 episodes at a time.");
    const taken = new Set(existingNumbers);
    rows
      .filter((row) => !isBlank(row))
      .forEach((row) => taken.add(Number(row.episode)));
    const added: Row[] = [];
    let next = Number(startNumber);
    if (!Number.isSafeInteger(next) || next < 1)
      return toast.error("Enter a positive starting number.");
    for (const p of parsed) {
      if (!p.episode) {
        while (taken.has(next)) next++;
      }
      const n = p.episode ? Number(p.episode) : next++;
      taken.add(n);
      added.push({ key: newKey(), ...p, episode: p.episode || String(n) });
    }
    if (!added.length) {
      toast.error(
        "No usable lines. Put one episode per line, ending with the video link.",
      );
      return;
    }
    setRows((rs) => [...rs.filter((r) => !isBlank(r)), ...added]);
    setPasteText("");
    setPasteOpen(false);
    setShowErrors(true);
    setOverwrite(false);
    toast.success(
      `Imported ${added.length} rows for review. Nothing is saved yet.`,
    );
  }

  const active = rows.filter((r) => !isBlank(r));
  const sources = new Map(rows.map((row) => [row.key, toEmbed(row.url)]));
  const linkCounts = new Map<string, number>();
  const counts = new Map<number, number>();
  for (const r of active) {
    const n = parseInt(r.episode, 10);
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    const src = sources.get(r.key)?.src;
    if (src) linkCounts.set(src, (linkCounts.get(src) ?? 0) + 1);
  }

  function errorsFor(r: Row): RowErrors {
    const e: RowErrors = {};
    const n = Number(r.episode);
    if (!Number.isSafeInteger(n) || n < 1)
      e.episode = "Use a positive whole number";
    else if ((counts.get(n) ?? 0) > 1) e.episode = "Duplicate";
    if (!r.url.trim()) e.url = "Add a link or embed code";
    else if (!sources.get(r.key)) e.url = "That link didn't parse";
    else if ((linkCounts.get(sources.get(r.key)!.src) ?? 0) > 1)
      e.url = "Duplicate link in this batch";
    if (!validThumb(r.thumbnail)) e.thumbnail = "Use an https:// image link";
    return e;
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!active.length) {
      setShowErrors(true);
      toast.error("Add at least one episode link first.");
      return;
    }
    const bad = active.some((r) => Object.keys(errorsFor(r)).length > 0);
    if (bad) {
      setShowErrors(true);
      toast.error("Fix the highlighted rows, then save again.");
      return;
    }
    const items: SavedVideoInput[] = active.map((r) => {
      const n = parseInt(r.episode, 10);
      return {
        url: toEmbed(r.url)!.src,
        title: r.title.trim() || `Episode ${n}`,
        animeId,
        episode: n,
        thumbnail: r.thumbnail.trim() || undefined,
      };
    });
    const replaced = items.filter((i) =>
      existingNumbers.has(i.episode!),
    ).length;
    if (replaced && !overwrite) {
      setConfirmReplace(true);
      return;
    }
    try {
      saveMany(items);
    } catch {
      toast.error(
        "Couldn't save in this browser. Check available storage and try again.",
      );
      return;
    }
    toast.success(
      `Saved ${items.length} episode${items.length === 1 ? "" : "s"}${replaced ? ` (${replaced} replaced)` : ""}.`,
    );
    const taken = new Set([
      ...existingNumbers,
      ...items.map((i) => i.episode!),
    ]);
    setRows([
      {
        key: newKey(),
        episode: String(smallestFree(taken)),
        title: "",
        thumbnail: "",
        url: "",
      },
    ]);
    setShowErrors(false);
    setOverwrite(false);
    setPreviewKey(null);
  }

  return (
    <form
      onSubmit={save}
      className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Add episodes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fill in as many rows as you like, then save them all at once.
            Thumbnails are optional; the anime artwork is used when empty.
            Review previews before saving. Existing episodes are only replaced
            after confirmation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          aria-expanded={pasteOpen}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs transition hover:border-primary/60"
        >
          <ClipboardPaste className="size-3.5" />
          Paste a list
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Start numbering at
          <input
            type="number"
            min="1"
            step="1"
            value={startNumber}
            onChange={(event) => setStartNumber(event.target.value)}
            className={cn(input, "w-20")}
          />
        </label>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-2 text-xs hover:border-primary"
          onClick={() => {
            const start = Number(startNumber);
            if (
              !Number.isSafeInteger(start) ||
              start < 1 ||
              !Number.isSafeInteger(start + rows.length)
            )
              return toast.error("Enter a valid starting number.");
            setRows((current) =>
              current.map((row, index) => ({
                ...row,
                episode: String(start + index),
              })),
            );
            setOverwrite(false);
          }}
        >
          Renumber rows
        </button>
        <label className="cursor-pointer rounded-full border border-border px-3 py-2 text-xs hover:border-primary">
          Import TXT / JSON
          <input
            type="file"
            accept=".txt,.json,text/plain,application/json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 2_000_000)
                return toast.error("Choose a file smaller than 2 MB.");
              try {
                importPaste(await file.text());
              } catch {
                toast.error("Couldn't read that file.");
              }
            }}
          />
        </label>
        <span className="text-xs text-muted-foreground">
          {active.length} ready to review · blank rows are ignored
        </span>
      </div>

      {pasteOpen && (
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">
            One episode per line, separated by{" "}
            <code className="rounded bg-surface-2 px-1">|</code>. The link goes
            last. Number, title and thumbnail are optional.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            aria-label="Pasted episode list"
            placeholder={
              "1 | The Beginning | https://img.example/1.jpg | https://player.example/embed/abc\n2 | The Test | https://player.example/embed/def\nhttps://player.example/embed/ghi"
            }
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen(false)}
              className="h-9 rounded-full px-4 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => importPaste()}
              className="h-9 rounded-full bg-secondary px-4 text-sm font-medium transition hover:brightness-125 disabled:opacity-50"
            >
              Add to table
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 hidden gap-2 px-1 text-xs text-muted-foreground md:grid md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_2.5rem]">
        <span>Episode</span>
        <span>Title</span>
        <span>Thumbnail link</span>
        <span>Video link or embed code</span>
        <span />
      </div>

      <ul className="mt-2 space-y-3 md:space-y-2">
        {rows.map((r, i) => {
          const err =
            (showErrors || r.url.trim()) && !isBlank(r) ? errorsFor(r) : {};
          const replaces =
            r.episode && existingNumbers.has(parseInt(r.episode, 10));
          const source = sources.get(r.key);
          return (
            <li
              key={r.key}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-start gap-2 rounded-xl border border-border/60 p-2 md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_2.5rem] md:border-0 md:p-0"
            >
              <div>
                <input
                  value={r.episode}
                  onChange={(e) =>
                    patch(r.key, { episode: e.target.value.replace(/\D/g, "") })
                  }
                  onFocus={() => {
                    if (!r.episode)
                      patch(r.key, {
                        episode: String(smallestFree(takenNow())),
                      });
                  }}
                  inputMode="numeric"
                  aria-label={`Row ${i + 1} episode number`}
                  placeholder="#"
                  className={cn(
                    input,
                    "text-center tabular-nums",
                    err.episode && inputError,
                  )}
                />
                {err.episode && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {err.episode}
                  </p>
                )}
                {!err.episode && replaces ? (
                  <p className="mt-1 text-[11px] text-gold">Replaces</p>
                ) : null}
              </div>
              <input
                value={r.title}
                onChange={(e) => patch(r.key, { title: e.target.value })}
                aria-label={`Row ${i + 1} title`}
                placeholder="Title (optional)"
                className={input}
              />
              <button
                type="button"
                onClick={() =>
                  setRows((rs) =>
                    rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs,
                  )
                }
                disabled={rows.length === 1}
                aria-label={`Remove row ${i + 1}`}
                className="order-last grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:text-destructive disabled:opacity-30 md:order-none"
              >
                <X className="size-4" />
              </button>
              <div className="col-span-3 md:col-span-1">
                <input
                  value={r.thumbnail}
                  onChange={(e) => patch(r.key, { thumbnail: e.target.value })}
                  aria-label={`Row ${i + 1} thumbnail link`}
                  placeholder="Thumbnail link (optional)"
                  className={cn(input, err.thumbnail && inputError)}
                />
                {err.thumbnail && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {err.thumbnail}
                  </p>
                )}
              </div>
              <div className="col-span-3 md:col-span-1">
                <input
                  value={r.url}
                  onChange={(e) => patch(r.key, { url: e.target.value })}
                  aria-label={`Row ${i + 1} video link`}
                  placeholder="https://… or <iframe …>"
                  className={cn(input, err.url && inputError)}
                />
                {err.url && (
                  <p className="mt-1 text-[11px] text-destructive">{err.url}</p>
                )}
                {source && !err.url && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {source.host} ·{" "}
                      {source.kind === "video" ? "Video file" : "Embed"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewKey(previewKey === r.key ? null : r.key)
                      }
                      className="text-primary"
                    >
                      {previewKey === r.key ? "Close preview" : "Preview"}
                    </button>
                    {existingSources.some(
                      (entry) =>
                        entry.episode !== Number(r.episode) &&
                        entry.src === source.src,
                    ) && (
                      <span className="text-gold">
                        Link already saved to another episode
                      </span>
                    )}
                  </div>
                )}
                {previewKey === r.key && source && (
                  <div className="mt-2 space-y-2">
                    <EpisodeThumb
                      src={r.thumbnail}
                      fallback={fallbackArt}
                      className="w-28 rounded-lg"
                    />
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2">
                      <VideoPlayer
                        key={source.src}
                        embed={source}
                        title={r.title || `Episode ${r.episode}`}
                        autoPlay={false}
                      />
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addRows(1)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm transition hover:border-primary/60"
        >
          <Plus className="size-4" /> Add row
        </button>
        <button
          type="button"
          onClick={() => addRows(5)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm transition hover:border-primary/60"
        >
          <Plus className="size-4" /> Add 5 rows
        </button>
        <button
          type="submit"
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          <Save className="size-4" />
          Save Episodes{active.length > 1 ? ` (${active.length})` : ""}
        </button>
      </div>
      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing episodes?</AlertDialogTitle>
            <AlertDialogDescription>
              This batch contains{" "}
              {
                active.filter((row) => existingNumbers.has(Number(row.episode)))
                  .length
              }{" "}
              existing episode numbers. Their titles and links will be replaced.
              Other episodes stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOverwrite(true);
                toast.message(
                  "Replacement approved. Press Save Episodes to finish.",
                );
              }}
            >
              Approve replacement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function ManagedEpisode({
  episode,
  animeId,
  fallbackArt,
  others,
  selected,
  onSelect,
}: {
  episode: SavedVideo;
  animeId: number;
  fallbackArt: string | null;
  others: SavedVideo[];
  selected: boolean;
  onSelect: () => void;
}) {
  const { update, remove } = useVideos();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [num, setNum] = useState(
    episode.episode !== undefined ? String(episode.episode) : "",
  );
  const [title, setTitle] = useState(episode.title);
  const [thumb, setThumb] = useState(episode.thumbnail ?? "");
  const [url, setUrl] = useState(episode.url);
  const [errors, setErrors] = useState<RowErrors>({});

  const embed = useMemo(() => toEmbed(episode.url), [episode.url]);
  const label =
    episode.episode !== undefined ? `Episode ${episode.episode}` : "Extra";

  function open() {
    setNum(episode.episode !== undefined ? String(episode.episode) : "");
    setTitle(episode.title);
    setThumb(episode.thumbnail ?? "");
    setUrl(episode.url);
    setErrors({});
    setEditing(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: RowErrors = {};
    const n = num ? Number(num) : undefined;
    if (
      (num || episode.episode !== undefined) &&
      (!Number.isSafeInteger(n) || !n || n < 1)
    )
      err.episode = "Use a positive whole number";
    if (n && others.some((o) => o.id !== episode.id && o.episode === n))
      err.episode = `Episode ${n} already exists`;
    const em = toEmbed(url);
    if (!em) err.url = "That link didn't parse";
    if (!validThumb(thumb)) err.thumbnail = "Use an https:// image link";
    setErrors(err);
    if (Object.keys(err).length) return;

    update(episode.id, {
      episode: n || undefined,
      title: title.trim() || (n ? `Episode ${n}` : "Untitled"),
      thumbnail: thumb.trim(),
      url: em!.src,
    });
    setEditing(false);
    toast.success(`${n ? `Episode ${n}` : "Episode"} updated.`);
  }

  return (
    <li className="rounded-2xl border border-border bg-surface/50 p-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${label}`}
          className="size-4 shrink-0 accent-primary"
        />
        <EpisodeThumb
          src={episode.thumbnail}
          fallback={fallbackArt}
          className="w-28 shrink-0 rounded-lg sm:w-36"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="line-clamp-1 text-sm font-medium">
            {isDefaultEpisodeTitle(episode.title, episode.episode)
              ? label
              : episode.title}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {embed ? `Source: ${embed.host}` : "Source link is invalid"}
          </p>
        </div>
        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
          <button
            type="button"
            aria-label={`Copy link for ${label}`}
            title="Copy link"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(episode.url);
                toast.success("Link copied.");
              } catch {
                toast.error("Clipboard isn't available in this browser.");
              }
            }}
          >
            <Copy className="size-4" />
          </button>
          <Link
            to="/anime/$id/watch"
            params={{ id: String(animeId) }}
            search={{ ep: episode.id }}
            aria-label={`Preview ${label}`}
            title="Preview"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:text-primary"
          >
            <ExternalLink className="size-4" />
          </Link>
          <button
            type="button"
            onClick={editing ? () => setEditing(false) : open}
            aria-label={`Edit ${label}`}
            title="Edit"
            className={cn(
              "grid size-9 place-items-center rounded-lg transition hover:text-primary",
              editing ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${label}`}
            title="Delete"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {editing && (
        <form
          onSubmit={submit}
          className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-[5rem_1fr]"
        >
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Number
            </span>
            <input
              value={num}
              onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className={cn(
                input,
                "text-center tabular-nums",
                errors.episode && inputError,
              )}
            />
            {errors.episode && (
              <span className="mt-1 block text-[11px] text-destructive">
                {errors.episode}
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={input}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-muted-foreground">
              Thumbnail link (optional)
            </span>
            <input
              value={thumb}
              onChange={(e) => setThumb(e.target.value)}
              placeholder="https://…"
              className={cn(input, errors.thumbnail && inputError)}
            />
            {errors.thumbnail && (
              <span className="mt-1 block text-[11px] text-destructive">
                {errors.thumbnail}
              </span>
            )}
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-muted-foreground">
              Video link or embed code
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={cn(input, errors.url && inputError)}
            />
            {errors.url && (
              <span className="mt-1 block text-[11px] text-destructive">
                {errors.url}
              </span>
            )}
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-10 rounded-full px-4 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              <Save className="size-4" /> Save changes
            </button>
          </div>
        </form>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the episode and its saved watch progress. You can add
              it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                remove(episode.id);
                removeEpisodeProgress(episode.id);
                toast.success(`${label} deleted.`);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Owner-only screen: add, edit and delete episodes. All the technical fields live here. */
export function EpisodeManager({
  animeId,
  fallbackArt,
}: {
  animeId: number;
  fallbackArt: string | null;
}) {
  const { videos, ready, removeMany } = useVideos();
  const eps = useMemo(
    () => orderedEpisodes(videos, animeId),
    [videos, animeId],
  );
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("episode");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const selectedEpisodes = eps.filter((episode) =>
    selected.includes(episode.id),
  );
  const gaps = useMemo(
    () =>
      missingEpisodes(
        eps.flatMap((episode) =>
          episode.episode === undefined ? [] : [episode.episode],
        ),
      ),
    [eps],
  );

  const q = filter.trim().toLowerCase();
  const pages = Math.ceil(eps.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, pages - 1));
  const filtered = eps.filter(
    (episode) =>
      !q ||
      episode.title.toLowerCase().includes(q) ||
      String(episode.episode ?? "").includes(q),
  );
  const sorted = [...filtered].sort((first, second) =>
    sort === "newest"
      ? second.addedAt - first.addedAt
      : sort === "title"
        ? first.title.localeCompare(second.title)
        : (first.episode ?? Infinity) - (second.episode ?? Infinity),
  );
  const filteredPages = Math.ceil(sorted.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, filteredPages - 1));
  const visible = sorted.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <div className="space-y-8">
      {ready && (
        <BulkAdder animeId={animeId} existing={eps} fallbackArt={fallbackArt} />
      )}

      {ready && eps.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-5 py-4">
          <div>
            <p className="text-sm font-semibold">
              {eps.length} episodes in your library
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {gaps.count
                ? `Missing numbers: ${gaps.first.join(", ")}${gaps.count > gaps.first.length ? ` and ${gaps.count - gaps.first.length} more` : ""}`
                : "No gaps in your episode numbering"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadEpisodes(`episodes-${animeId}.json`, eps)}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs hover:border-primary"
          >
            <Download className="size-4" />
            Export backup
          </button>
        </div>
      )}

      <section aria-labelledby="saved-heading">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="saved-heading"
            className="mr-auto text-lg font-semibold tracking-tight"
          >
            Saved episodes{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({eps.length})
            </span>
          </h2>
          {pages > 1 && !q && sort === "episode" && (
            <select
              value={safePage}
              onChange={(e) => setPage(Number(e.target.value))}
              aria-label="Episode range"
              className="h-10 rounded-full border border-border bg-surface px-3 text-sm outline-none"
            >
              {Array.from({ length: pages }, (_, i) => (
                <option key={i} value={i}>
                  {episodeNumberLabel(eps[i * PAGE_SIZE]?.episode)} –{" "}
                  {episodeNumberLabel(
                    eps[Math.min(eps.length, (i + 1) * PAGE_SIZE) - 1]?.episode,
                  )}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Sort episodes"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(0);
            }}
            className="h-10 rounded-full border border-border bg-surface px-3 text-sm"
          >
            <option value="episode">Episode order</option>
            <option value="newest">Newest first</option>
            <option value="title">Title A–Z</option>
          </select>
          {eps.length > 0 && (
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
                placeholder="Find an episode"
                aria-label="Find an episode"
                className="h-10 w-44 rounded-full border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
          )}
        </div>

        {eps.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  visible.length > 0 &&
                  visible.every((episode) => selected.includes(episode.id))
                }
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [
                          ...new Set([
                            ...current,
                            ...visible.map((episode) => episode.id),
                          ]),
                        ]
                      : current.filter(
                          (id) => !visible.some((episode) => episode.id === id),
                        ),
                  )
                }
                className="size-4 accent-primary"
              />
              Select this page
            </label>
            <span className="text-muted-foreground">
              {selectedEpisodes.length} selected
            </span>
            {selectedEpisodes.length > 0 && (
              <>
                <button
                  type="button"
                  className="text-primary"
                  onClick={() =>
                    downloadEpisodes(
                      `selected-episodes-${animeId}.json`,
                      selectedEpisodes,
                    )
                  }
                >
                  Export selected
                </button>
                <button
                  type="button"
                  className="text-destructive"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  Delete selected
                </button>
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}

        {!ready ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-surface-2"
              />
            ))}
          </div>
        ) : eps.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No episodes yet. Add your first one above.
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No episodes match “{filter}”.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {visible.map((e) => (
              <ManagedEpisode
                key={e.id}
                episode={e}
                animeId={animeId}
                fallbackArt={fallbackArt}
                others={eps}
                selected={selected.includes(e.id)}
                onSelect={() =>
                  setSelected((current) =>
                    current.includes(e.id)
                      ? current.filter((id) => id !== e.id)
                      : [...current, e.id],
                  )
                }
              />
            ))}
          </ul>
        )}
        {filteredPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-4 text-sm">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-full border border-border px-4 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-muted-foreground">
              Page {currentPage + 1} of {filteredPages}
            </span>
            <button
              type="button"
              disabled={currentPage + 1 >= filteredPages}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-full border border-border px-4 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedEpisodes.length} episodes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The selected links and their watch progress will be removed from
              this browser. Export a backup first if you need to restore them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                try {
                  removeMany(selectedEpisodes.map((episode) => episode.id));
                  selectedEpisodes.forEach((episode) =>
                    removeEpisodeProgress(episode.id),
                  );
                  setSelected([]);
                  toast.success("Selected episodes deleted.");
                } catch {
                  toast.error(
                    "Couldn't delete episodes. Check browser storage permissions.",
                  );
                }
              }}
            >
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
