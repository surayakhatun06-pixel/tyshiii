import { useMemo, useState } from "react";
import {
  FileUp,
  HardDriveDownload,
  Loader2,
  Monitor,
  Play,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { VideoPlayer } from "@/components/video-player";
import { readVideos } from "@/hooks/use-videos";
import {
  cleanServerName,
  DEFAULT_SERVER,
  getLink,
  importLinks,
  isDefaultServer,
  langLabel,
  serverNames,
  type AnimeRef,
  type CloudEpisode,
  type Lang,
} from "@/lib/cloud-episodes";
import { describeFirebaseError } from "@/lib/firebase";
import {
  extractLinks,
  fileHasEpisodeNumbers,
  mapLinksToEpisodes,
  type NumberingMode,
} from "@/lib/link-import";
import { cn } from "@/lib/utils";

const input =
  "h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary";

type Status = "new" | "replace" | "keep" | "same" | "duplicate";

const STATUS_TEXT: Record<Status, string> = {
  new: "New",
  replace: "Replaces current link",
  keep: "Skipped (already has a link)",
  same: "Unchanged",
  duplicate: "Duplicate episode number",
};

/**
 * Import one language (SUB or DUB) from a TXT file or pasted text. Links keep their
 * order and are numbered sequentially, or by the numbers written in the file.
 * Saving only writes this language's field, so the other language is never touched.
 */
export function LinkImporter({
  anime,
  lang,
  existing,
}: {
  anime: AnimeRef;
  lang: Lang;
  existing: CloudEpisode[];
}) {
  const label = langLabel(lang);
  const otherLang: Lang = lang === "sub" ? "dub" : "sub";
  const otherLabel = langLabel(otherLang);

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [start, setStart] = useState("1");
  const [modeChoice, setModeChoice] = useState<"auto" | NumberingMode>("auto");
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverText, setServerText] = useState(DEFAULT_SERVER);

  const knownServers = useMemo(
    () => [...new Set([DEFAULT_SERVER, ...serverNames(existing)])],
    [existing],
  );
  const serverName = cleanServerName(serverText) || DEFAULT_SERVER;
  // Same server typed with different capitals is the same server.
  const server =
    knownServers.find((s) => s.toLowerCase() === serverName.toLowerCase()) ?? serverName;
  const newServer = !knownServers.some((s) => s.toLowerCase() === server.toLowerCase());

  const existingByNumber = useMemo(
    () => new Map(existing.map((e) => [e.number, e])),
    [existing],
  );
  const { links, skipped } = useMemo(() => extractLinks(text), [text]);
  const hasNumbers = useMemo(() => fileHasEpisodeNumbers(links), [links]);
  const mode: NumberingMode =
    modeChoice === "auto" ? (hasNumbers ? "file" : "sequential") : modeChoice;
  const startNumber = Number(start);
  const startValid = Number.isSafeInteger(startNumber) && startNumber >= 1;

  const rows = useMemo(() => {
    if (!startValid) return [];
    const mapped = mapLinksToEpisodes(links, mode, startNumber);
    const counts = new Map<number, number>();
    const urlCounts = new Map<string, number>();
    for (const m of mapped) {
      counts.set(m.number, (counts.get(m.number) ?? 0) + 1);
      urlCounts.set(m.url, (urlCounts.get(m.url) ?? 0) + 1);
    }
    return mapped.map((m) => {
      const current = existingByNumber.get(m.number);
      let status: Status;
      if ((counts.get(m.number) ?? 0) > 1) status = "duplicate";
      else if (!getLink(current, server, lang)) status = "new";
      else if (getLink(current, server, lang) === m.url) status = "same";
      else status = replace ? "replace" : "keep";
      return {
        ...m,
        status,
        repeatedUrl: (urlCounts.get(m.url) ?? 0) > 1,
        otherKept: Boolean(getLink(current, server, otherLang)),
      };
    });
  }, [
    links,
    mode,
    startNumber,
    startValid,
    existingByNumber,
    server,
    lang,
    otherLang,
    replace,
  ]);

  const blocking = rows.some((r) => r.status === "duplicate");
  const toWrite = rows.filter(
    (r) => r.status === "new" || r.status === "replace",
  );
  const replacing = rows.filter(
    (r) => r.status === "replace" || r.status === "keep",
  ).length;
  const previewRow = preview !== null ? rows[preview] : undefined;

  function reset() {
    setText("");
    setFileName(null);
    setPreview(null);
    setReplace(false);
  }

  function loadFromBrowser() {
    const local = readVideos()
      .filter((v) => v.animeId === anime.anilistId && v.episode !== undefined)
      .sort((a, b) => a.episode! - b.episode!);
    if (!local.length)
      return toast.error("This browser has no saved episodes for this anime.");
    setText(local.map((v) => `Episode ${v.episode} | ${v.url}`).join("\n"));
    setFileName("Episodes saved in this browser");
    setModeChoice("auto");
    setPreview(null);
  }

  async function save() {
    if (!toWrite.length) return;
    setSaving(true);
    try {
      const result = await importLinks(
        anime,
        lang,
        toWrite.map((r) => ({ number: r.number, url: r.url })),
        replace,
        server,
      );
      toast.success(
        `${server} ${label}: ${result.added} added, ${result.replaced} replaced${result.skipped ? `, ${result.skipped} skipped` : ""}. Live on the site now.`,
      );
      reset();
    } catch (error) {
      toast.error(describeFirebaseError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-base font-semibold tracking-tight">
          <span className={cn("rounded-md px-1.5 py-0.5 text-sm", lang === "sub" ? "bg-primary/15 text-primary" : "bg-gold/15 text-gold")}>{label}</span> links
        </h3>
        <input
          value={serverText}
          onChange={(e) => setServerText(e.target.value)}
          list={`servers-${lang}`}
          maxLength={24}
          placeholder={DEFAULT_SERVER}
          aria-label={`${label} server name`}
          title={newServer ? `“${server}” is a new server: viewers will be able to pick it.` : isDefaultServer(server) ? "The main server. Type another name (like VidPlay) to add an extra one." : `Adding to the existing “${server}” server.`}
          className={cn(input, "h-9 w-32")}
        />
        <datalist id={`servers-${lang}`}>
          {knownServers.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <label
          title={`Add ${label} links from a .txt file saved on my PC`}
          className="grid size-9 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2"
        >
          <Monitor className="size-4" />
          <span className="sr-only">Add {label} links from a text file on my PC</span>
          <input
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 2_000_000) return toast.error("Choose a file smaller than 2 MB.");
              try {
                setText(await file.text());
                setFileName(file.name);
                setPreview(null);
              } catch {
                toast.error("Couldn't read that file.");
              }
            }}
          />
        </label>
        <button
          type="button"
          onClick={loadFromBrowser}
          title="Use episodes saved in this browser"
          aria-label="Use episodes saved in this browser"
          className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        >
          <HardDriveDownload className="size-4" />
        </button>
        {text && (
          <button type="button" onClick={reset} title="Clear" aria-label="Clear" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {fileName ? `Loaded ${fileName}. ` : `Tap the PC icon to pick a .txt file. `}
        One link per line, in episode order. Only {label} links on “{server}” are written; {otherLabel} links and other servers stay untouched.
      </p>
      <details className="mt-2" open={!!text.trim() && !fileName}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Paste links instead</summary>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          rows={4}
          aria-label={`${label} links`}
          placeholder={`https://player.example/embed/ep1\nhttps://player.example/embed/ep2\n<iframe src="https://player.example/embed/ep3"></iframe>`}
          className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs outline-none transition focus:border-primary"
        />
      </details>

      {text.trim() && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 text-xs">
            <label className="flex items-center gap-2 text-muted-foreground">
              Numbering
              <select
                value={modeChoice}
                onChange={(e) =>
                  setModeChoice(e.target.value as typeof modeChoice)
                }
                className={input}
              >
                <option value="auto">
                  Automatic ({hasNumbers ? "numbers in file" : "in order"})
                </option>
                <option value="sequential">In order from a start number</option>
                <option value="file" disabled={!hasNumbers}>
                  Use numbers written in the file
                </option>
              </select>
            </label>
            {mode === "sequential" && (
              <label className="flex items-center gap-2 text-muted-foreground">
                First link is episode
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={cn(
                    input,
                    "w-20",
                    !startValid && "border-destructive",
                  )}
                />
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                className="size-4 accent-primary"
              />
              Replace existing {server} {label} links ({replacing})
            </label>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Found <strong className="text-foreground">{links.length}</strong>{" "}
            link
            {links.length === 1 ? "" : "s"}
            {rows.length > 0 &&
              ` → episodes ${Math.min(...rows.map((r) => r.number))}–${Math.max(...rows.map((r) => r.number))}`}
            . {toWrite.length} will be saved.
            {skipped.length > 0 && ` ${skipped.length} line(s) ignored.`}
          </p>

          {rows.length > 0 && (
            <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Episode</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">{otherLabel}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={`${r.line}-${i}`}
                      className={cn(
                        "border-t border-border/60",
                        preview === i && "bg-primary/10",
                      )}
                    >
                      <td className="px-3 py-2 font-semibold tabular-nums">
                        {r.number}
                      </td>
                      <td className="max-w-[18rem] px-3 py-2">
                        <p className="truncate" title={r.url}>
                          {r.embed.host} ·{" "}
                          {r.embed.kind === "video" ? "Video file" : "Embed"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          line {r.line}
                          {r.repeatedUrl && (
                            <span className="text-gold">
                              {" "}
                              · same link used twice
                            </span>
                          )}
                        </p>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2",
                          r.status === "duplicate" && "text-destructive",
                          r.status === "replace" && "text-gold",
                          (r.status === "keep" || r.status === "same") &&
                            "text-muted-foreground",
                          r.status === "new" && "text-primary",
                        )}
                      >
                        {STATUS_TEXT[r.status]}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.otherKept ? "Kept" : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setPreview(preview === i ? null : i)}
                          aria-label={`Preview episode ${r.number}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:border-primary"
                        >
                          <Play className="size-3" />{" "}
                          {preview === i ? "Close" : "Preview"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {skipped.length > 0 && (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                Ignored lines ({skipped.length})
              </summary>
              <ul className="mt-1 space-y-0.5">
                {skipped.slice(0, 50).map((s) => (
                  <li key={`${s.line}-${s.text}`}>
                    line {s.line}: {s.reason} —{" "}
                    <span className="font-mono">{s.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {previewRow && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Preview · {label} episode {previewRow.number}
              </p>
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                <VideoPlayer
                  key={previewRow.url}
                  embed={previewRow.embed}
                  title={`${anime.title} episode ${previewRow.number}`}
                  autoPlay={false}
                />
              </div>
            </div>
          )}

          {blocking && (
            <p className="mt-3 text-xs text-destructive">
              Two links point to the same episode number. Fix the numbers in the
              file or switch numbering to “In order”.
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving || blocking || !toWrite.length}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save {toWrite.length} {server} {label} link
              {toWrite.length === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
