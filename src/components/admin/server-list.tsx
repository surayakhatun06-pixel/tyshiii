import { useEffect, useState } from "react";
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { inputCls } from "@/components/admin/ui";
import { getDb } from "@/lib/firebase";
import {
  fillTemplate,
  hasMovieLink,
  isMovieLink,
  linkFromPaste,
  linksOf,
  modeOf,
  serverProblems,
  suggestTemplate,
  trackVariants,
  type Ids,
  type LinkMode,
  type ServerTemplate,
} from "@/lib/bulk-import";
import { cn } from "@/lib/utils";

/** The servers are kept in this browser, so they are set up once and reused for every anime. */
const SERVERS_KEY = "tyshi-bulk-servers-v1";
/** Saved links. Plenty of room: only the ones switched on are used by Bulk import. */
export const MAX_SERVERS = 40;

/** "Link 7" style numbering that never repeats a name already in use. */
function nextNumber(servers: ServerTemplate[]) {
  const names = new Set(servers.map((x) => x.label.trim().toLowerCase()));
  let n = servers.length + 1;
  while (names.has(`server ${n}`)) n++;
  return n;
}

const blank = (n: number, mode: LinkMode = "tmdb"): ServerTemplate => ({ label: `Server ${n}`, mode, subLink: "", dubLink: "" });

/** Read the saved servers; older saves (one link with {track}) are turned into a SUB and a DUB link. */
export function loadServers(): ServerTemplate[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SERVERS_KEY) ?? "null") as ServerTemplate[] | null;
    if (Array.isArray(v) && v.length) {
      const ok = v
        .filter((s) => s && typeof s.label === "string")
        .map((s): ServerTemplate => {
          const l = linksOf(s);
          return { label: s.label, mode: modeOf(s), subLink: l.sub, dubLink: l.dub, ...(s.off ? { off: true } : {}) };
        });
      if (ok.length) return ok;
    }
  } catch {
    /* start fresh */
  }
  return [blank(1)];
}

const SERVERS_AT_KEY = "tyshi-bulk-servers-v1-at";
/** Admin-only Firestore copy (adminConfig/servers) so the setup survives other browsers and cleared site data. */
const CLOUD_COLLECTION = "adminConfig";
const CLOUD_DOC = "servers";

async function pushCloud(next: ServerTemplate[], at: number) {
  try {
    const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
    await fs.setDoc(fs.doc(db, CLOUD_COLLECTION, CLOUD_DOC), { servers: next, clientAt: at, updatedAt: fs.serverTimestamp() });
    return true;
  } catch {
    return false;
  }
}

/**
 * The server list with saving built in. It keeps both modes (AniList and TMDB) in ONE saved list, and each
 * server remembers its own mode, so working in one mode never edits the other. Saved in this browser and
 * copied to an admin-only Firestore document.
 */
export function useServers() {
  const [servers, setServers] = useState<ServerTemplate[]>([blank(1)]);
  const [cloud, setCloud] = useState<"idle" | "saved" | "local">("idle");
  useEffect(() => {
    const local = loadServers();
    setServers(local);
    const localAt = Number(window.localStorage.getItem(SERVERS_AT_KEY) ?? 0);
    void (async () => {
      try {
        const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
        const snap = await fs.getDoc(fs.doc(db, CLOUD_COLLECTION, CLOUD_DOC));
        const data = snap.data();
        const remote = Array.isArray(data?.servers) ? (data!.servers as ServerTemplate[]) : null;
        const remoteAt = typeof data?.clientAt === "number" ? data.clientAt : 0;
        if (remote?.length && remoteAt > localAt) {
          const clean = remote
            .filter((x) => x && typeof x.label === "string")
            .map((x): ServerTemplate => {
              const l = linksOf(x);
              return { label: x.label, mode: modeOf(x), subLink: l.sub, dubLink: l.dub, ...(x.off ? { off: true } : {}) };
            });
          if (clean.length) {
            setServers(clean);
            window.localStorage.setItem(SERVERS_KEY, JSON.stringify(clean));
            window.localStorage.setItem(SERVERS_AT_KEY, String(remoteAt));
          }
          setCloud("saved");
        } else if (localAt > remoteAt || !remote) {
          const at = localAt || Date.now();
          setCloud((await pushCloud(local, at)) ? "saved" : "local");
        } else setCloud("saved");
      } catch {
        setCloud("local");
      }
    })();
  }, []);
  const save = (next: ServerTemplate[]) => {
    setServers(next);
    const at = Date.now();
    try {
      window.localStorage.setItem(SERVERS_KEY, JSON.stringify(next));
      window.localStorage.setItem(SERVERS_AT_KEY, String(at));
    } catch {
      /* private mode: kept for this visit only */
    }
    void pushCloud(next, at).then((ok) => setCloud(ok ? "saved" : "local"));
  };
  return {
    servers,
    cloud,
    save,
    patch: (i: number, p: Partial<ServerTemplate>) => save(servers.map((s, idx) => (idx === i ? { ...s, ...p } : s))),
    add: (mode?: LinkMode) => save([...servers, blank(nextNumber(servers), mode === "tmdb" || mode === "anilist" ? mode : modeOf(servers[servers.length - 1] ?? {}))]),
    remove: (i: number) => save(servers.filter((_, idx) => idx !== i)),
    copy: (i: number) => {
      const src = servers[i];
      if (!src) return;
      const names = new Set(servers.map((x) => x.label.trim().toLowerCase()));
      let label = `${src.label} copy`.slice(0, 24);
      for (let n = 2; names.has(label.toLowerCase()); n++) label = `${src.label.slice(0, 18)} copy ${n}`;
      save([...servers.slice(0, i + 1), { ...src, label }, ...servers.slice(i + 1)]);
    },
  };
}

type Sample = { ids: Ids; ep: number; label: string };

const defaultSample = (mode: LinkMode): Sample =>
  mode === "tmdb"
    ? { ids: { anilist: 21, tmdb: 1399, season: 1 }, ep: 1, label: "S1 E1" }
    : { ids: { anilist: 21 }, ep: 1, label: "ep 1" };

const PLACEHOLDER: Record<LinkMode, Record<"sub" | "dub", string>> = {
  anilist: {
    sub: "https://player.example.com/anime/{id}/{ep}",
    dub: "https://player.example.com/anime/{id}/{ep}?dub=1",
  },
  tmdb: {
    sub: "https://host.example.com/embed/tv/{tmdb}/{season}/{ep}",
    dub: "https://host.example.com/embed/tv/{tmdb}/{season}/{ep}?dub=1",
  },
};

/**
 * Every server: a name, what its links use (AniList ID or TMDB ID), and its SUB link and DUB link.
 * Paste a real link (episode 1 of any anime) and the numbers turn into {id} / {ep} by themselves.
 */
export function ServerList({
  servers,
  onPatch,
  onRemove,
  onAdd,
  onCopy,
  sampleFor,
  anilistIds = [],
  tmdbId,
  busy = false,
  single = false,
}: {
  servers: ServerTemplate[];
  onPatch: (i: number, p: Partial<ServerTemplate>) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  onCopy?: (i: number) => void;
  /** A real example for the preview line. null = can't show one yet. Defaults to a made-up example. */
  sampleFor?: (mode: LinkMode) => Sample | null;
  /** IDs that may appear in a pasted link, so the right number is picked even if the link is unusual. */
  anilistIds?: number[];
  tmdbId?: number;
  busy?: boolean;
  /** Editing one server: no remove / add buttons. */
  single?: boolean;
}) {
  const labelClash = new Set(servers.map((s) => s.label.trim().toLowerCase())).size !== servers.length;
  /** Which saved links are opened for editing. Empty ones (just added) open by themselves. */
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggleOpen = (i: number) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const convert = (link: string, mode: LinkMode): string | null => {
    if (mode === "tmdb") return suggestTemplate(link, mode, { tmdb: tmdbId });
    for (const id of anilistIds) {
      const r = suggestTemplate(link, mode, { anilist: id });
      if (r) return r;
    }
    return suggestTemplate(link, mode, {});
  };

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Paste a real link or an <code className="rounded bg-surface-2 px-1">{"<iframe>"}</code> code (episode 1 of any anime) into the SUB or DUB box. The ID
        and episode number turn into <code className="rounded bg-surface-2 px-1">{"{id}"}</code> and{" "}
        <code className="rounded bg-surface-2 px-1">{"{ep}"}</code> by themselves, and if the link has a <code className="rounded bg-surface-2 px-1">lang=sub</code>{" "}
        or <code className="rounded bg-surface-2 px-1">dub=1</code> switch, the SUB and DUB boxes both fill in from that one paste. A movie link has no episode
        number, so it has no <code className="rounded bg-surface-2 px-1">{"{ep}"}</code>. Leave a box empty if the server doesn't have that track.
      </p>
      <ul className="space-y-3">
        {servers.map((s, i) => {
          const mode = modeOf(s);
          const problems = serverProblems(s);
          const links = linksOf(s);
          const sample = sampleFor ? sampleFor(mode) : defaultSample(mode);
          const isOpen = single || open.has(i) || (!links.sub && !links.dub);
          return (
            <li key={i} className={cn("rounded-2xl border bg-surface/40 p-3 md:p-4", s.off ? "border-border/50 opacity-60" : "border-border")}>
              <div className="flex flex-wrap items-center gap-2">
                {!single && (
                  <input
                    type="checkbox"
                    checked={!s.off}
                    onChange={(e) => onPatch(i, { off: !e.target.checked })}
                    aria-label={`Use ${s.label || "this link"} when importing`}
                    title={s.off ? "Switched off: Bulk import skips it" : "Switched on: Bulk import uses it"}
                    className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                  />
                )}
                <input
                  value={s.label}
                  onChange={(e) => onPatch(i, { label: e.target.value.slice(0, 24) })}
                  aria-label={`Link ${i + 1} name`}
                  placeholder="Link name"
                  className={cn(inputCls, "w-40 font-semibold")}
                />
                <span className="flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5">{mode === "tmdb" ? "TMDB" : "AniList"}</span>
                  {links.sub && <span className="rounded-full bg-surface-2 px-2 py-0.5">Sub</span>}
                  {links.dub && <span className="rounded-full bg-surface-2 px-2 py-0.5">Dub</span>}
                  {hasMovieLink(s) && <span className="rounded-full bg-surface-2 px-2 py-0.5">Movie</span>}
                  {(problems.sub || problems.dub) && links.sub + links.dub !== "" && <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-destructive">Fix</span>}
                </span>
                {!single && (
                  <span className="ml-auto flex items-center gap-1">
                    {onCopy && (
                      <button
                        type="button"
                        aria-label={`Duplicate ${s.label || "link"}`}
                        title="Duplicate"
                        disabled={servers.length >= MAX_SERVERS || busy}
                        onClick={() => onCopy(i)}
                        className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30"
                      >
                        <Copy className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${s.label || "link"}`}
                      title="Remove"
                      disabled={servers.length === 1 || busy}
                      onClick={() => {
                          if (window.confirm(`Remove the saved pattern "${s.label || "this link"}"?\n\nThis only removes the saved pattern from this list. Links already imported onto episodes are NOT deleted. To delete imported server links, use "Delete imported server links" below.`)) onRemove(i);
                        }}
                      className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={isOpen ? "Close" : "Edit"}
                      aria-expanded={isOpen}
                      title={isOpen ? "Close" : "Edit the links"}
                      onClick={() => toggleOpen(i)}
                      className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                    >
                      <ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} />
                    </button>
                  </span>
                )}
              </div>
              {!isOpen && (
                <p className="mt-1.5 truncate pl-1 font-mono text-[11px] text-muted-foreground">{links.sub || links.dub || "No link yet. Open it to add one."}</p>
              )}
              {isOpen && (
              <>
              <div role="radiogroup" aria-label="Links use" className="mt-2 inline-flex rounded-full border border-border p-0.5">
                {(["anilist", "tmdb"] as LinkMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => onPatch(i, { mode: m })}
                    className={cn(
                      "h-8 rounded-full px-3.5 text-xs font-semibold transition",
                      mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "anilist" ? "AniList ID" : "TMDB ID"}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {mode === "tmdb" ? <>Placeholders: <code>{"{tmdb}"}</code> <code>{"{season}"}</code> <code>{"{ep}"}</code></> : <>Placeholders: <code>{"{id}"}</code> <code>{"{ep}"}</code></>}. Paste a normal link and it is converted for you.
              </p>

              <div className="mt-3 space-y-3">
                {(["sub", "dub"] as const).map((track) => {
                  const key = track === "sub" ? "subLink" : "dubLink";
                  const value = links[track];
                  const problem = problems[track];
                  const fix = value && problem ? convert(value, mode) : null;
                  const other = links[track === "sub" ? "dub" : "sub"];
                  return (
                    <div key={track}>
                      <div className="flex items-center gap-2">
                        <span className="w-10 shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{track}</span>
                        <input
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            // The placeholders decide the mode, so there is nothing to switch by hand.
                            const auto: LinkMode | null = /\{(tmdb|season)\}/.test(v) ? "tmdb" : /\{id\}/.test(v) ? "anilist" : null;
                            onPatch(i, auto && auto !== mode ? { [key]: v, mode: auto } : { [key]: v });
                          }}
                          onPaste={(e) => {
                            // A raw link or iframe code pasted in: turn its numbers into {id} / {ep} straight away,
                            // and fill SUB and DUB together when the link has a language switch.
                            const text = e.clipboardData.getData("text").trim();
                            const link = text ? linkFromPaste(text) : "";
                            const pattern = link ? (convert(link, mode) ?? link) : null;
                            const both = pattern ? trackVariants(pattern) : null;
                            if (pattern && (pattern !== text || both)) {
                              e.preventDefault();
                              if (both) {
                                onPatch(i, { subLink: both.sub, dubLink: both.dub });
                                toast.success("Made the SUB and DUB links from that one link. Check them below.");
                              } else {
                                onPatch(i, { [key]: pattern });
                                toast.success("Turned the link into a pattern. Check it below.");
                              }
                            }
                          }}
                          spellCheck={false}
                          autoComplete="off"
                          aria-label={`${s.label || "Server"} ${track.toUpperCase()} link`}
                          placeholder={PLACEHOLDER[mode][track]}
                          className={cn(inputCls, "font-mono text-xs", problem && value && "border-destructive/70")}
                        />
                      </div>
                      <div className="mt-1 pl-12 text-[11px]">
                        {value && problem ? (
                          <div className="space-y-1">
                            <p className="text-destructive">{problem}</p>
                            {fix && (
                              <button
                                type="button"
                                onClick={() => onPatch(i, { [key]: fix })}
                                className="block max-w-full rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-left transition hover:bg-primary/20"
                              >
                                <span className="font-semibold">Fix it for me:</span> <span className="break-all font-mono">{fix}</span>
                              </button>
                            )}
                          </div>
                        ) : value && isMovieLink(value) ? (
                          <div className="space-y-0.5">
                            <p className="break-all font-mono text-muted-foreground">
                              movie → {fillTemplate(value, { anilist: sample?.ids.anilist ?? 21, tmdb: 1440098, season: 1 }, 1, track)}
                            </p>
                            <p className="text-muted-foreground">No episode number here, so this is a movie link. It is used for movies only.</p>
                          </div>
                        ) : value ? (
                          <p className="break-all font-mono text-muted-foreground">
                            {sample ? `${sample.label} → ${fillTemplate(value, sample.ids, sample.ep, track)}` : "Choose the TMDB series above to see the real link."}
                          </p>
                        ) : track === "dub" && other ? (
                          <button
                            type="button"
                            onClick={() => onPatch(i, { dubLink: other })}
                            className="text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
                          >
                            Copy the SUB link here
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {problems.both && <p className="mt-2 text-[11px] text-amber-300">{problems.both}</p>}
              </>
              )}
            </li>
          );
        })}
      </ul>
      {labelClash && <p className="mt-2 text-xs text-destructive">Give each link a different name.</p>}
      {!single && (
      <button
        type="button"
        onClick={() => onAdd()}
        disabled={servers.length >= MAX_SERVERS}
        className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary disabled:opacity-50"
      >
        <Plus className="size-4" /> Add a link
      </button>
      )}
    </div>
  );
}
