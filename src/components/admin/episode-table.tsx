import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Server, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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
import {
  draftError,
  draftFromRef,
  draftToDetails,
  SeriesFields,
  validImage,
  type SeriesDraft,
} from "@/components/admin/series-fields";
import {
  cleanServerName,
  deleteAnime,
  deleteEpisodes,
  DEFAULT_SERVER,
  episodeServers,
  episodeSources,
  isDefaultServer,
  renameServer,
  saveAnimeDetails,
  saveEpisode,
  serverNames,
  type AnimeRef,
  type CloudEpisode,
  type Lang,
  type ServerLinks,
  toastWriteError,
} from "@/lib/cloud-episodes";
import { toEmbed } from "@/lib/video-embed";
import { cn } from "@/lib/utils";

const input =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary";

/** Name, logo, About and facts of the selected series, plus removing it entirely. */
export function AnimeDetailsForm({
  anime,
  onSaved,
  onDeleted,
}: {
  anime: AnimeRef;
  onSaved: (anime: AnimeRef) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<SeriesDraft>(() => draftFromRef(anime));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = draftError(draft);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const next: AnimeRef = {
        ...anime,
        ...draftToDetails(draft),
        ...(anime.custom ? {} : { edited: true }),
      };
      await saveAnimeDetails(next);
      onSaved(next);
      toast.success("Details saved. They're live on the series page.");
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await deleteAnime(anime.anilistId);
      toast.success("Removed from the database.");
      onDeleted();
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row">
        {draft.poster && validImage(draft.poster) ? (
          <img
            src={draft.poster}
            alt=""
            className="h-40 w-28 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-40 w-28 shrink-0 rounded-lg bg-surface-2" />
        )}
        <div className="flex-1">
          <SeriesFields
            draft={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          />
          <p className="mt-3 text-[11px] text-muted-foreground">
            {anime.custom
              ? "Your own series — it has no AniList page, so everything shown on its page comes from here."
              : `AniList ID ${anime.anilistId}. Saving replaces the name, poster, banner, About and genres on this title's page for every visitor.`}{" "}
            Search results and the series page use these details.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:border-destructive hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
          {anime.custom ? "Delete series" : "Remove from database"}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm transition hover:border-primary disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save details
        </button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {anime.custom ? "Delete" : "Remove"} “{anime.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {anime.custom
                ? "The series and every episode link are deleted for every visitor. This can't be undone."
                : "All SUB/DUB links and edited details for this title are deleted from Firestore. The AniList page itself stays. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

type ServerRow = { name: string; subUrl: string; dubUrl: string };

type Draft = {
  number: string;
  title: string;
  thumbnail: string;
  dubReleaseDate: string;
  servers: ServerRow[];
};

function dateFieldValue(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateFieldTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function initialRows(initial?: CloudEpisode): ServerRow[] {
  const rows = initial
    ? episodeServers(initial).map((s) => ({
        name: s.name,
        subUrl: s.subUrl ?? "",
        dubUrl: s.dubUrl ?? "",
      }))
    : [];
  if (!rows.some((r) => isDefaultServer(r.name)))
    rows.unshift({ name: DEFAULT_SERVER, subUrl: "", dubUrl: "" });
  return rows;
}

function EpisodeForm({
  anime,
  initial,
  taken,
  onDone,
}: {
  anime: AnimeRef;
  initial?: CloudEpisode;
  taken: Set<number>;
  onDone: () => void;
}) {
  const [d, setD] = useState<Draft>({
    number: initial
      ? String(initial.number)
      : String(Math.max(0, ...taken) + 1),
    title: initial?.title ?? "",
    thumbnail: initial?.thumbnail ?? "",
    dubReleaseDate: dateFieldValue(initial?.dubReleasedAt),
    servers: initialRows(initial),
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setRow = (i: number, p: Partial<ServerRow>) =>
    setD((x) => ({
      ...x,
      servers: x.servers.map((r, j) => (j === i ? { ...r, ...p } : r)),
    }));

  const n = Number(d.number);
  const numberError =
    !Number.isSafeInteger(n) || n < 1
      ? "Positive whole number"
      : taken.has(n) && n !== initial?.number
        ? "Already exists"
        : null;

  const rows = d.servers.map((r, i) => {
    const name = i === 0 ? DEFAULT_SERVER : cleanServerName(r.name);
    const sub = r.subUrl.trim() ? toEmbed(r.subUrl) : null;
    const dub = r.dubUrl.trim() ? toEmbed(r.dubUrl) : null;
    const clash = d.servers.some(
      (o, j) =>
        j < i &&
        (j === 0 ? DEFAULT_SERVER : cleanServerName(o.name)).toLowerCase() ===
          name.toLowerCase(),
    );
    return {
      name,
      sub,
      dub,
      nameError: !name
        ? "Name this server"
        : clash
          ? "Name already used"
          : null,
      subError: r.subUrl.trim() && !sub ? "That link didn't parse" : null,
      dubError: r.dubUrl.trim() && !dub ? "That link didn't parse" : null,
    };
  });
  const hasErrors = rows.some((r) => r.nameError || r.subError || r.dubError);
  const hasLink = rows.some((r) => r.sub || r.dub);
  const hasDub = rows.some((r) => r.dub);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (numberError || hasErrors)
      return toast.error("Fix the highlighted fields.");
    if (!hasLink) return toast.error("Add at least one SUB or DUB link.");
    if (!validImage(d.thumbnail))
      return toast.error("Thumbnail must be an https:// image link.");

    const servers: Record<string, ServerLinks> = {};
    let main: ServerLinks = {};
    for (const r of rows) {
      if (!r.sub && !r.dub) continue;
      const links = { subUrl: r.sub?.src, dubUrl: r.dub?.src };
      if (isDefaultServer(r.name)) main = links;
      else servers[r.name] = links;
    }
    setBusy(true);
    try {
      await saveEpisode(
        anime,
        {
          number: n,
          title: d.title.trim().slice(0, 200) || undefined,
          thumbnail: d.thumbnail.trim() || undefined,
          subUrl: main.subUrl,
          dubUrl: main.dubUrl,
          dubReleasedAt: hasDub
            ? dateFieldTimestamp(d.dubReleaseDate)
            : undefined,
          servers: Object.keys(servers).length ? servers : undefined,
        },
        initial?.number,
      );
      toast.success(`Episode ${n} saved.`);
      onDone();
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 rounded-xl bg-surface p-3 md:grid-cols-6"
    >
      <label className="text-[11px] text-muted-foreground">
        Episode
        <input
          value={d.number}
          onChange={(e) => set({ number: e.target.value.replace(/\D/g, "") })}
          inputMode="numeric"
          className={cn(
            input,
            "mt-1 tabular-nums",
            numberError && "border-destructive",
          )}
        />
        {numberError && <span className="text-destructive">{numberError}</span>}
      </label>
      <label className="text-[11px] text-muted-foreground md:col-span-2">
        Title (optional)
        <input
          value={d.title}
          onChange={(e) => set({ title: e.target.value })}
          className={cn(input, "mt-1")}
        />
      </label>
      <label className="text-[11px] text-muted-foreground md:col-span-3">
        Thumbnail link (optional)
        <input
          value={d.thumbnail}
          onChange={(e) => set({ thumbnail: e.target.value })}
          className={cn(
            input,
            "mt-1",
            !validImage(d.thumbnail) && "border-destructive",
          )}
        />
      </label>

      {d.servers.map((row, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-xl border border-border/60 p-2 md:col-span-6 md:grid-cols-6"
        >
          <label className="text-[11px] text-muted-foreground">
            Server
            <input
              value={i === 0 ? DEFAULT_SERVER : row.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              readOnly={i === 0}
              maxLength={24}
              placeholder="e.g. VidPlay"
              className={cn(
                input,
                "mt-1",
                i === 0 && "opacity-70",
                rows[i].nameError && "border-destructive",
              )}
            />
            {rows[i].nameError && (
              <span className="text-destructive">{rows[i].nameError}</span>
            )}
          </label>
          <label className="text-[11px] text-muted-foreground md:col-span-2">
            SUB link or iframe code
            <input
              value={row.subUrl}
              onChange={(e) => setRow(i, { subUrl: e.target.value })}
              placeholder="https://… or <iframe …>"
              className={cn(
                input,
                "mt-1",
                rows[i].subError && "border-destructive",
              )}
            />
            {rows[i].subError && (
              <span className="text-destructive">{rows[i].subError}</span>
            )}
          </label>
          <label className="text-[11px] text-muted-foreground md:col-span-2">
            DUB link or iframe code
            <input
              value={row.dubUrl}
              onChange={(e) => setRow(i, { dubUrl: e.target.value })}
              placeholder="https://… or <iframe …>"
              className={cn(
                input,
                "mt-1",
                rows[i].dubError && "border-destructive",
              )}
            />
            {rows[i].dubError && (
              <span className="text-destructive">{rows[i].dubError}</span>
            )}
          </label>
          <div className="flex items-end justify-end">
            {i > 0 && (
              <button
                type="button"
                onClick={() =>
                  set({ servers: d.servers.filter((_, j) => j !== i) })
                }
                aria-label={`Remove server ${row.name || i + 1}`}
                className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      ))}

      {hasDub && (
        <label className="text-[11px] text-muted-foreground md:col-span-6">
          Dub release date (optional)
          <input
            type="date"
            value={d.dubReleaseDate}
            onChange={(event) => set({ dubReleaseDate: event.target.value })}
            className={cn(input, "mt-1 w-full sm:max-w-xs")}
          />
          <span className="mt-1 block text-[10px] leading-relaxed">
            Used to order recent dubbed episodes. Saving or uploading a link
            does not count as a release date.
          </span>
        </label>
      )}

      <div className="flex flex-wrap justify-between gap-2 md:col-span-6">
        <button
          type="button"
          onClick={() =>
            set({
              servers: [...d.servers, { name: "", subUrl: "", dubUrl: "" }],
            })
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm transition hover:border-primary"
        >
          <Plus className="size-4" /> Add another server
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDone}
            className="h-9 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save episode
          </button>
        </div>
      </div>
    </form>
  );
}

type PendingDelete = { numbers: number[]; lang?: Lang; server?: string };

const toolButton =
  "inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs transition hover:border-destructive hover:text-destructive disabled:opacity-50";

function describeNumbers(numbers: number[]) {
  return numbers.length === 1
    ? `episode ${numbers[0]}`
    : `${numbers.length} episodes`;
}

function SelectAllBox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label="Select all episodes"
      className="size-4 accent-primary"
    />
  );
}

/** Every episode in Firestore for this title, with SUB/DUB status, edit and delete. */
export function EpisodeTable({
  anime,
  episodes,
}: {
  anime: AnimeRef;
  episodes: CloudEpisode[];
}) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const lastClicked = useRef<number | null>(null);
  const taken = new Set(episodes.map((e) => e.number));
  const q = filter.trim().toLowerCase();
  const visible = q
    ? episodes.filter(
        (e) =>
          String(e.number).includes(q) || e.title?.toLowerCase().includes(q),
      )
    : episodes;

  const chosen = episodes.filter((e) => selected.has(e.number));
  const chosenNumbers = chosen.map((e) => e.number);
  const hasLang = (e: CloudEpisode, lang: Lang) =>
    episodeSources(e).some((src) => src.lang === lang);
  const chosenWithSub = chosen
    .filter((e) => hasLang(e, "sub"))
    .map((e) => e.number);
  const chosenWithDub = chosen
    .filter((e) => hasLang(e, "dub"))
    .map((e) => e.number);
  const servers = serverNames(episodes);
  const visibleSelected = visible.filter((e) => selected.has(e.number)).length;
  const allVisibleSelected =
    visible.length > 0 && visibleSelected === visible.length;

  function toggleAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of visible) {
        if (on) next.add(e.number);
        else next.delete(e.number);
      }
      return next;
    });
    lastClicked.current = null;
  }

  function toggleOne(number: number, on: boolean, range: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const from = visible.findIndex((e) => e.number === lastClicked.current);
      const to = visible.findIndex((e) => e.number === number);
      const span =
        range && from !== -1 && to !== -1
          ? visible.slice(Math.min(from, to), Math.max(from, to) + 1)
          : [{ number }];
      for (const e of span) {
        if (on) next.add(e.number);
        else next.delete(e.number);
      }
      return next;
    });
    lastClicked.current = number;
  }

  async function confirmDelete() {
    if (!pending) return;
    const { numbers, lang, server } = pending;
    setPending(null);
    setDeleting(true);
    try {
      await deleteEpisodes(anime, numbers, lang, server);
      setSelected((prev) => {
        if (lang || server) return prev;
        const next = new Set(prev);
        for (const n of numbers) next.delete(n);
        return next;
      });
      const what = describeNumbers(numbers);
      toast.success(
        server
          ? `Removed ${server}${lang ? ` ${lang.toUpperCase()}` : ""} from ${what}.`
          : lang
            ? `Removed ${lang.toUpperCase()} from ${what}.`
            : `Deleted ${what}.`,
      );
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setDeleting(false);
    }
  }

  const badge = (on: boolean, text: string) => (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        on
          ? "bg-primary/15 text-primary"
          : "bg-surface-2 text-muted-foreground/60 line-through",
      )}
    >
      {text}
    </span>
  );

  return (
    <section className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold tracking-tight">
          Episodes in Firestore{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({episodes.length})
          </span>
        </h2>
        {episodes.length > 12 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find episode"
            aria-label="Find episode"
            className={cn(input, "w-40")}
          />
        )}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm transition hover:border-primary"
        >
          <Plus className="size-4" /> Add one episode
        </button>
      </div>

      {editing === "new" && (
        <div className="mt-3">
          <EpisodeForm
            anime={anime}
            taken={taken}
            onDone={() => setEditing(null)}
          />
        </div>
      )}

      {episodes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No episodes yet. Import SUB or DUB links above.
        </p>
      ) : (
        <>
          <ServerManager
            anime={anime}
            servers={servers}
            episodes={episodes}
            onRemove={(server) =>
              setPending({
                numbers: episodes
                  .filter((e) =>
                    episodeServers(e).some((x) => x.name === server),
                  )
                  .map((e) => e.number),
                server,
              })
            }
          />

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-muted-foreground">
              <SelectAllBox
                checked={allVisibleSelected}
                indeterminate={visibleSelected > 0 && !allVisibleSelected}
                onChange={toggleAllVisible}
              />
              {chosen.length > 0 ? (
                <span>
                  <strong className="text-foreground">{chosen.length}</strong>{" "}
                  selected
                </span>
              ) : (
                <span>
                  Select all{q ? " shown" : ""}
                  <span className="hidden sm:inline">
                    {" "}
                    · Shift+click to select a range
                  </span>
                </span>
              )}
            </label>
            {deleting && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            {chosen.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={deleting || chosenWithSub.length === 0}
                  onClick={() =>
                    setPending({ numbers: chosenWithSub, lang: "sub" })
                  }
                  className={toolButton}
                >
                  <X className="size-3" /> Remove SUB ({chosenWithSub.length})
                </button>
                <button
                  type="button"
                  disabled={deleting || chosenWithDub.length === 0}
                  onClick={() =>
                    setPending({ numbers: chosenWithDub, lang: "dub" })
                  }
                  className={toolButton}
                >
                  <X className="size-3" /> Remove DUB ({chosenWithDub.length})
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setPending({ numbers: chosenNumbers })}
                  className={cn(
                    toolButton,
                    "border-destructive/60 text-destructive",
                  )}
                >
                  <Trash2 className="size-3" /> Delete selected ({chosen.length}
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          <ul className="mt-2 max-h-[36rem] space-y-2 overflow-y-auto">
            {visible.map((e) => (
              <li
                key={e.number}
                className={cn(
                  "rounded-xl border border-border/60 p-2",
                  selected.has(e.number) && "border-primary/60 bg-primary/5",
                )}
              >
                {editing === e.number ? (
                  <EpisodeForm
                    anime={anime}
                    initial={e}
                    taken={taken}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(e.number)}
                      onClick={(ev) =>
                        toggleOne(
                          e.number,
                          ev.currentTarget.checked,
                          ev.shiftKey,
                        )
                      }
                      onChange={() => {}}
                      aria-label={`Select episode ${e.number}`}
                      className="size-4 accent-primary"
                    />
                    <span className="w-12 font-semibold tabular-nums">
                      {e.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {e.title || `Episode ${e.number}`}
                    </span>
                    {episodeServers(e).map((sv) => (
                      <span
                        key={sv.name}
                        className="inline-flex items-center gap-1 rounded-lg bg-surface px-1.5 py-0.5"
                        title={`${sv.name}: ${sv.subUrl ? "SUB" : ""}${sv.subUrl && sv.dubUrl ? " + " : ""}${sv.dubUrl ? "DUB" : ""}`}
                      >
                        {servers.length > 1 && (
                          <span className="max-w-[6rem] truncate text-[11px] text-muted-foreground">
                            {sv.name}
                          </span>
                        )}
                        {badge(Boolean(sv.subUrl), "SUB")}
                        {badge(Boolean(sv.dubUrl), "DUB")}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditing(e.number)}
                      aria-label={`Edit episode ${e.number}`}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    {hasLang(e, "sub") && hasLang(e, "dub") && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setPending({ numbers: [e.number], lang: "sub" })
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3" /> SUB
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPending({ numbers: [e.number], lang: "dub" })
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3" /> DUB
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setPending({ numbers: [e.number] })}
                      aria-label={`Delete episode ${e.number}`}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending &&
                (pending.server
                  ? `Remove server “${pending.server}” from ${describeNumbers(pending.numbers)}?`
                  : pending.lang
                    ? `Remove the ${pending.lang.toUpperCase()} link from ${describeNumbers(pending.numbers)}?`
                    : `Delete ${describeNumbers(pending.numbers)}?`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.server
                ? "Both its SUB and DUB links are removed. Other servers keep working; episodes left with no links are removed."
                : pending?.lang
                  ? "The other language stays available (on every server). Episodes left with no links are removed."
                  : "All SUB and DUB links on every server are removed for every visitor. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Lists every server used by this title; rename one everywhere or remove it everywhere. */
function ServerManager({
  anime,
  servers,
  episodes,
  onRemove,
}: {
  anime: AnimeRef;
  servers: string[];
  episodes: CloudEpisode[];
  onRemove: (server: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (servers.length === 0) return null;

  const counts = (server: string) => {
    const withServer = episodes.filter((e) =>
      episodeServers(e).some((x) => x.name === server),
    );
    return withServer.length;
  };

  async function rename() {
    if (!renaming) return;
    setBusy(true);
    try {
      await renameServer(anime, renaming, name);
      toast.success(`Renamed “${renaming}” to “${cleanServerName(name)}”.`);
      setRenaming(null);
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-surface px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Server className="size-3.5" /> Servers
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {servers.map((server) => (
          <li
            key={server}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
          >
            {renaming === server ? (
              <>
                <input
                  value={name}
                  autoFocus
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  aria-label={`New name for ${server}`}
                  className="h-7 w-28 rounded-md border border-border bg-background px-2 outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void rename()}
                  className="font-semibold text-primary disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="font-medium">{server}</span>
                <span className="text-muted-foreground">
                  · {counts(server)} ep
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(server);
                    setName(server);
                  }}
                  aria-label={`Rename ${server}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(server)}
                  aria-label={`Remove ${server} from every episode`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
