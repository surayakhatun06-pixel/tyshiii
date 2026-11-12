import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Boxes, Check, CheckCircle2, Loader2, Play, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ServerList, useServers } from "@/components/admin/server-list";
import { AdminHeader, AdminLink, Chip, inputCls, panel } from "@/components/admin/ui";
import { browseMedia, prettyLabel, titleOf } from "@/lib/anilist";
import {
  appendNewEpisodes,
  buildEpisodes,
  sourceOf,
  hasMovieLink,
  hasSeriesLink,
  importFranchise,
  isMovieEntry,
  linkEpisodeCount,
  listOngoing,
  MAX_TOTAL_EPISODES,
  linksOf,
  loadImportedSeries,
  modeOf,
  planEntry,
  planProblem,
  removeServerEverywhere,
  updateServerEverywhere,
  serverReady,
  slugify,
  tracksOf,
  type ImportedSeries,
  type ImportProgress,
  type ImportSummary,
  type LinkMode,
  type OngoingSeason,
  type ServerTemplate,
} from "@/lib/bulk-import";
import { autoMatch, findTmdbMovie, getTmdbSeries, kindOf, mapEntries, type TmdbPos, type TmdbSeries } from "@/lib/tmdb";
import { parseEpisodeMap, toastWriteError } from "@/lib/cloud-episodes";
import { getDb } from "@/lib/firebase";
import { applyReplacePlan, buildReplacePlan } from "@/lib/server-replace";
import { crawlFranchise, MAX_ENTRIES, type CrawlResult } from "@/lib/franchise-crawl";
import { cn } from "@/lib/utils";

const checkbox = "size-4 shrink-0 cursor-pointer accent-[var(--primary)]";

function Step({
  n,
  title,
  children,
  note,
  done,
}: {
  n: number;
  title: string;
  note?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={`bulk-step-${n}`} className={cn(panel, "scroll-mt-20")}>
      <h2 className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums",
            done ? "bg-primary text-primary-foreground" : "bg-surface-2",
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        {title}
      </h2>
      {note && <p className="mt-1.5 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The four steps across the top: done ones are ticked, the one you are on is highlighted, tap to jump. */
function Steps({ steps }: { steps: { label: string; done: boolean }[] }) {
  const current = steps.findIndex((x) => !x.done);
  return (
    <ol className="sticky top-14 z-20 -mx-4 mb-5 flex items-center gap-1 border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur md:static md:mx-0 md:rounded-2xl md:border md:bg-surface/60 md:px-3">
      {steps.map((st, i) => (
        <li key={st.label} className="flex min-w-0 flex-1 items-center gap-1">
          <a
            href={`#bulk-step-${i + 1}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`bulk-step-${i + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-full px-2 py-1 text-xs font-medium transition",
              i === current ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                st.done ? "bg-primary text-primary-foreground" : i === current ? "bg-foreground text-background" : "bg-surface-2",
              )}
            >
              {st.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="hidden truncate sm:inline">{st.label}</span>
          </a>
          {i < steps.length - 1 && <span className={cn("h-px flex-1", st.done ? "bg-primary/60" : "bg-border")} />}
        </li>
      ))}
    </ol>
  );
}

/** Find a franchise, tick what to import, set the server templates, generate everything. */
export function BulkView({ rootId: fromAnime, embedded = false }: { rootId?: number; embedded?: boolean }) {
  /* 1 · find */
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(term.trim()), 350);
    return () => window.clearTimeout(t);
  }, [term]);
  const isId = /^\d+$/.test(term.trim());
  const search = useQuery({
    queryKey: ["anilist", "bulk-search", debounced],
    queryFn: () => browseMedia({ search: debounced, perPage: 6, sort: ["SEARCH_MATCH"] }),
    enabled: debounced.length >= 2 && !/^\d+$/.test(debounced),
    staleTime: 60_000,
  });

  const [crawl, setCrawl] = useState<CrawlResult | null>(null);
  const [crawling, setCrawling] = useState<{ found: number } | null>(null);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [manual, setManual] = useState<Record<number, string>>({});
  const [name, setName] = useState("");
  const [rootId, setRootId] = useState(0);
  /** TMDB is matched automatically behind the scenes for saved TMDB server templates. */
  const [tmdbCode, setTmdbCode] = useState("");
  const [tmdb, setTmdb] = useState<TmdbSeries | null>(null);
  const [tmdbBusy, setTmdbBusy] = useState(false);
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  /** TMDB MOVIE ids for movie entries (movie links like …/embed/movie/{tmdb}). */
  const [movieIdOf, setMovieIdOf] = useState<Record<number, string>>({});
  const movieTried = useRef(new Set<number>());
  const codeRef = useRef("");
  codeRef.current = tmdbCode;
  const loadingId = useRef(0);
  /** What this series already has saved from earlier imports (servers, TMDB ID). */
  const [imported, setImported] = useState<ImportedSeries | null>(null);

  async function loadTmdb(id: number) {
    loadingId.current = id;
    setTmdbBusy(true);
    setTmdbError(null);
    try {
      const series = await getTmdbSeries(id);
      if (loadingId.current === id) setTmdb(series);
    } catch (error) {
      if (loadingId.current !== id) return;
      setTmdb(null);
      setTmdbError(error instanceof Error ? error.message : "Couldn't read TMDB.");
    } finally {
      if (loadingId.current === id) setTmdbBusy(false);
    }
  }

  // Auto-matched or previously saved TMDB IDs load their season map.
  useEffect(() => {
    const id = Number(tmdbCode);
    if (!tmdbCode) {
      loadingId.current = 0;
      setTmdb(null);
      setTmdbError(null);
      setTmdbBusy(false);
      return;
    }
    if (!Number.isSafeInteger(id) || id < 1 || loadingId.current === id) return;
    const t = window.setTimeout(() => void loadTmdb(id), 450);
    return () => window.clearTimeout(t);
  }, [tmdbCode]);

  const chooseTmdb = (id: number) => {
    setTmdbCode(String(id));
    void loadTmdb(id);
  };

  /** Bulk opened: find the exact TMDB series for this anime by itself. */
  async function autoFill(result: CrawlResult, savedId?: number) {
    if (savedId) return chooseTmdb(savedId);
    if (codeRef.current) return; // a TMDB series was already loaded for this import
    const first = result.entries[0];
    if (!first) return;
    setTmdbBusy(true);
    setTmdbError(null);
    try {
      const names = [first.title.english, first.title.romaji, first.title.native].filter((t): t is string => !!t);
      const m = await autoMatch(names, first.year);
      if (m.best) chooseTmdb(m.best.id);
      else setTmdbError("Automatic TMDB matching found no series for this title.");
    } catch (error) {
      setTmdbError(error instanceof Error ? error.message : "Couldn't read TMDB.");
    } finally {
      setTmdbBusy(false);
    }
  }

  async function start(rootId: number) {
    setCrawl(null);
    setCrawlError(null);
    setCrawling({ found: 0 });
    setRootId(rootId);
    setSummary(null);
    setFailure(null);
    setImported(null);
    // A newly selected franchise gets a fresh automatic TMDB match.
    if (crawl || !codeRef.current) {
      setTmdbCode("");
      setTmdbError(null);
    }
    try {
      const result = await crawlFranchise(rootId, (found) => setCrawling({ found }));
      setCrawl(result);
      setManual({});
      // Start from what an earlier import saved (its TMDB series and servers), if there is anything.
      let savedId: number | undefined;
      try {
        const saved = (await loadImportedSeries(rootId))[0] ?? null;
        setImported(saved);
        savedId = saved?.tmdbId;
      } catch {
        /* nothing saved yet, or no access: start empty */
      }
      void autoFill(result, savedId);
      setName(titleOf(result.entries[0] ?? { title: { romaji: null, english: null, native: null } }));
      // Everything importable is ticked; entries that need review start unticked.
      setSelected(new Set(result.entries.filter((e) => !planEntry(e).review).map((e) => e.id)));
    } catch (error) {
      setCrawlError(error instanceof TypeError ? "Couldn't reach AniList. Check your connection." : (error as Error).message);
    } finally {
      setCrawling(null);
    }
  }

  // Opened from a series ("Bulk import" button): start crawling from that title straight away.
  useEffect(() => {
    if (fromAnime) void start(fromAnime);
  }, [fromAnime]); // eslint-disable-line react-hooks/exhaustive-deps

  const basePlans = useMemo(() => (crawl?.entries ?? []).map((e) => planEntry(e, Number(manual[e.id]) || undefined)), [crawl, manual]);
  // Where every episode of every entry sits in TMDB (season + episode inside it). All entries count, ticked or not,
  // so leaving season 1 out still keeps season 2 on the right TMDB season.
  const tmdbMaps = useMemo(
    () =>
      tmdb
        ? mapEntries(
            tmdb,
            basePlans.map((p) => ({
              id: p.entry.id,
              kind: kindOf(p.entry.format),
              count: p.count,
              startSeason: undefined,
              startEpisode: undefined,
            })),
          )
        : new Map<number, (TmdbPos | undefined)[]>(),
    [tmdb, basePlans],
  );
  const plans = useMemo(
    () =>
      basePlans.map((p) => {
        const base = tmdb ? { ...p, tmdbId: tmdb.id, tmdbMap: tmdbMaps.get(p.entry.id) } : p;
        const movieId = Number(movieIdOf[p.entry.id]);
        return movieId > 0 ? { ...base, tmdbMovieId: movieId } : base;
      }),
    [basePlans, tmdb, tmdbMaps, movieIdOf],
  );
  const chosen = plans.filter((p) => selected.has(p.entry.id) && p.count > 0);
  const allSelectable = plans.filter((p) => p.count > 0);
  const allOn = allSelectable.length > 0 && allSelectable.every((p) => selected.has(p.entry.id));
  const someOn = allSelectable.some((p) => selected.has(p.entry.id));
  const master = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (master.current) master.current.indeterminate = someOn && !allOn;
  }, [someOn, allOn]);

  const toggle = (id: number, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /* 3 · servers */
  const { servers: allServers, save: saveServers, patch: patchServer, add: addServer, remove: removeServer, copy: copyServer } = useServers();
  // Only the saved links that are switched on are used for this import.
  const servers = useMemo(() => allServers.filter((x) => !x.off), [allServers]);
  const labelClash = new Set(allServers.map((x) => x.label.trim().toLowerCase())).size !== allServers.length;
  // A TMDB series only matters for TMDB servers with episode-style links (movie links use a movie id instead).
  const tmdbServers = servers.some((x) => modeOf(x) === "tmdb" && hasSeriesLink(x));
  const serversOk = servers.length > 0 && servers.every(serverReady) && servers.every((x) => x.label.trim()) && !labelClash;
  /** A TMDB server with a movie link (no {ep}) needs each movie's TMDB movie id. */
  const needsMovieIds = servers.some((x) => modeOf(x) === "tmdb" && hasMovieLink(x));

  async function findMovie(entry: (typeof plans)[number]["entry"]) {
    try {
      const names = [entry.title.english, entry.title.romaji].filter((x): x is string => !!x);
      const hit = await findTmdbMovie(names, entry.year ?? null);
      if (hit) setMovieIdOf((m) => ({ ...m, [entry.id]: String(hit.id) }));
      else toast.error(`TMDB has no movie match for ${titleOf(entry)}. Map it in the TMDB admin tools.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't reach TMDB.");
    }
  }

  // Movies find their own TMDB movie id by themselves, once.
  useEffect(() => {
    if (!needsMovieIds) return;
    for (const p of plans) {
      if (!isMovieEntry(p) || p.count < 1 || movieIdOf[p.entry.id] || movieTried.current.has(p.entry.id)) continue;
      movieTried.current.add(p.entry.id);
      void findMovie(p.entry);
    }
  }, [needsMovieIds, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 4 · import */
  const [publish, setPublish] = useState(true);
  /** Server + track slots whose existing links should be replaced (key: server name, lower case). Default: keep all. */
  // Every server that is switched on is replaced from this import: links that differ are deleted and rewritten,
  // identical links stay as they are. Switch a server off (step 3) to leave all of its links alone.
  const replaceSel = useMemo(
    () => Object.fromEntries(servers.map((x) => [x.label.trim().toLowerCase(), { sub: !!linksOf(x).sub, dub: !!linksOf(x).dub }])),
    [servers],
  );
  const [sure, setSure] = useState(false);
  const [existing, setExisting] = useState<Map<number, ReturnType<typeof parseEpisodeMap>>>(new Map());
  const idsKey = chosen.map((p) => p.entry.id).join(",");
  useEffect(() => setSure(false), [servers, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!idsKey || !publish) return setExisting(new Map());
    let live = true;
    void (async () => {
      try {
        const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
        const next = new Map<number, ReturnType<typeof parseEpisodeMap>>();
        for (const id of idsKey.split(",").map(Number)) {
          const snap = await fs.getDoc(fs.doc(db, "episodeLists", String(id)));
          next.set(id, parseEpisodeMap(snap.data()));
        }
        if (live) setExisting(next);
      } catch {
        if (live) setExisting(new Map());
      }
    })();
    return () => { live = false; };
  }, [idsKey, publish]); // eslint-disable-line react-hooks/exhaustive-deps
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<(ImportSummary & { watchId: number }) | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const totalEpisodes = chosen.reduce((n, p) => n + p.count, 0);
  const tooMany = totalEpisodes > MAX_TOTAL_EPISODES;
  const franchiseId = slugify(name, `series-${rootId}`);
  const missing = serversOk ? chosen.filter((p) => planProblem(p, servers)) : [];
  const canImport = chosen.length > 0 && serversOk && missing.length === 0 && !tmdbBusy && !!name.trim() && !tooMany && !progress;

  async function run() {
    setSure(false);
    setFailure(null);
    setSummary(null);
    setProgress({ done: 0, total: 1, step: "Starting" });
    try {
      const result = await importFranchise(
        {
          franchiseId,
          franchiseTitle: name,
          ...(tmdb ? { tmdbId: tmdb.id } : {}),
          plans: chosen,
          servers: servers.map((s) => ({ label: s.label.trim(), mode: modeOf(s), subLink: linksOf(s).sub, dubLink: linksOf(s).dub })),
          publish,
          keepExisting: true,
          replaceSlots: replaceSel,
        },
        setProgress,
      );
      // Old links this import's patterns can't rebuild (for example no TMDB episode) are removed too, so no broken link stays behind.
      if (publish && findings.some((f) => f.cannotRebuild > 0)) {
        try {
          const rules = servers.map((x) => ({ label: x.label.trim(), mode: modeOf(x), sub: linksOf(x).sub || undefined, dub: linksOf(x).dub || undefined })).filter((r) => r.sub || r.dub);
          const cleanup = await buildReplacePlan(rules, { animeIds: chosen.map((p) => p.entry.id) });
          if (cleanup.links) await applyReplacePlan(cleanup);
        } catch {
          toast.error("Imported, but some old links that can't be rebuilt were not removed. Use Servers → Advanced → Delete links.");
        }
      }
      // "Watch now" opens the title you started from, or the first one that was imported.
      setSummary({ ...result, watchId: chosen.some((p) => p.entry.id === rootId) ? rootId : chosen[0].entry.id });
      toast.success(`Imported ${result.episodes.toLocaleString()} episodes across ${result.seasons} entries.`);
    } catch (error) {
      void toastWriteError(error);
      setFailure("The import stopped part-way. Nothing is lost: run it again and it fills in what is missing.");
    } finally {
      setProgress(null);
    }
  }

  /** For every server + track in this import: how many episodes already hold a link, and how many would change. */
  const findings = useMemo(() => {
    const out: { key: string; label: string; track: "sub" | "dub"; have: number; differ: number; same: number; cannotRebuild: number }[] = [];
    if (!publish || existing.size === 0) return out;
    for (const s of servers) {
      const l = linksOf(s);
      for (const track of ["sub", "dub"] as const) {
        if (!l[track]) continue;
        let have = 0, differ = 0, same = 0, cannotRebuild = 0;
        for (const p of chosen) {
          const eps = new Map((existing.get(p.entry.id) ?? []).map((e) => [e.number, e]));
          const made = new Map(buildEpisodes(sourceOf(p), 1, p.count, [s]).labelled.map((r) => [r.number, r.links[s.label]?.[track]]));
          for (const [n, ep] of eps) {
            const name = Object.keys(ep.servers ?? {}).find((k) => k.toLowerCase() === s.label.trim().toLowerCase());
            const old = s.label.trim().toLowerCase() === "server 1" ? (track === "sub" ? ep.subUrl : ep.dubUrl) : name ? ep.servers?.[name]?.[track === "sub" ? "subUrl" : "dubUrl"] : undefined;
            if (!old) continue;
            have++;
            const fresh = made.get(n);
            if (!fresh) cannotRebuild++;
            else if (fresh === old) same++;
            else differ++;
          }
        }
        out.push({ key: s.label.trim().toLowerCase(), label: s.label.trim(), track, have, differ, same, cannotRebuild });
      }
    }
    return out;
  }, [existing, servers, chosen, publish]);
  const willDelete = findings.reduce((n, f) => n + f.differ + f.cannotRebuild, 0);

  const sampleId = chosen[0]?.entry.id ?? rootId ?? 21;
  const samplePos = chosen.map((p) => p.tmdbMap?.find(Boolean)).find(Boolean);
  const mappedCount = (p: (typeof plans)[number]) => p.tmdbMap?.filter(Boolean).length ?? 0;
  const unmapped = tmdbServers ? chosen.reduce((n, p) => n + (p.count - mappedCount(p)), 0) : 0;
  const linkCount = chosen.reduce(
    (n, p) => n + servers.reduce((m, s) => m + linkEpisodeCount(p, s, "sub") + linkEpisodeCount(p, s, "dub"), 0),
    0,
  );
  /** A real example for the server previews: the first chosen entry, and its first TMDB episode. */
  const sampleFor = (mode: LinkMode) =>
    mode === "tmdb"
      ? tmdb && samplePos
        ? { ids: { anilist: sampleId, tmdb: tmdb.id, season: samplePos.season }, ep: samplePos.episode, label: `S${samplePos.season} E${samplePos.episode}` }
        : null
      : { ids: { anilist: sampleId }, ep: 1, label: "ep 1" };

  /** Why Import is greyed out right now, in plain words (null = ready). */
  const blocker = progress
    ? null
    : !crawl
      ? "Find a franchise first (step 1)."
      : chosen.length === 0
        ? "Tick at least one entry (step 2)."
        : tmdbServers && !tmdb
          ? tmdbBusy
            ? "Matching the TMDB series…"
            : "No automatic TMDB match. Choose an AniList server or set up the title in the TMDB admin tools."
          : !serversOk
            ? "Finish the servers (step 3)."
            : !name.trim()
              ? "Give the series a name (step 4)."
              : tooMany
                ? "Too many episodes. Untick some entries."
                : null;

  /* remove a server from every season of the series (form row, or an already-imported one) */
  const [removing, setRemoving] = useState<string | null>(null);
  async function removeEverywhere(key: string, label: string): Promise<boolean> {
    if (!imported) return false;
    const n = imported.seasons.length;
    if (!window.confirm(`Remove “${label}” from all ${n} imported ${n === 1 ? "entry" : "entries"} of ${imported.title}? Its links disappear from every episode and from the site. This can't be undone.`)) return false;
    setRemoving(key);
    try {
      const r = await removeServerEverywhere(imported.id, key, undefined);
      toast.success(`Removed ${label} from ${r.seasons} ${r.seasons === 1 ? "entry" : "entries"} (${r.episodes.toLocaleString()} episodes).`);
      setImported((cur) => (cur ? { ...cur, servers: cur.servers.filter((x) => x.key !== key) } : cur));
      return true;
    } catch (error) {
      void toastWriteError(error);
      return false;
    } finally {
      setRemoving(null);
    }
  }
  /** Change one imported server for the whole series (new links, new name, or switch AniList / TMDB). */
  const [editing, setEditing] = useState<{ key: string; draft: ServerTemplate } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  async function saveEditing() {
    if (!imported || !editing) return;
    const old = imported.servers.find((x) => x.key === editing.key);
    const n = imported.seasons.length;
    if (!window.confirm(`Change “${old?.label ?? editing.draft.label}” on all ${n} imported ${n === 1 ? "entry" : "entries"} of ${imported.title}? Every episode link of that server is rebuilt, on the site too.`)) return;
    setSaving("Starting…");
    try {
      const r = await updateServerEverywhere(imported.id, editing.key, editing.draft, setSaving);
      toast.success(`Updated ${editing.draft.label.trim()} on ${r.seasons} ${r.seasons === 1 ? "entry" : "entries"} (${r.episodes.toLocaleString()} episodes).${r.skipped ? ` ${r.skipped} had no TMDB episode and lost this server.` : ""}`);
      const links = linksOf(editing.draft);
      setImported((cur) =>
        cur
          ? {
              ...cur,
              servers: cur.servers.map((x) =>
                x.key === editing.key ? { ...x, label: editing.draft.label.trim(), mode: modeOf(editing.draft), sub: links.sub, dub: links.dub } : x,
              ),
            }
          : cur,
      );
      // Keep the saved server list in step, so the next import uses the new links too.
      const at = allServers.findIndex((x) => x.label.trim().toLowerCase() === (old?.label ?? "").trim().toLowerCase());
      if (at >= 0) patchServer(at, { label: editing.draft.label.trim(), mode: modeOf(editing.draft), subLink: links.sub, dubLink: links.dub });
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update the server.");
    } finally {
      setSaving(null);
    }
  }
  const importedKey = (label: string) => imported?.servers.find((x) => x.label.trim().toLowerCase() === label.trim().toLowerCase())?.key;

  return (
    <>
      {!embedded && <AdminHeader title="Bulk import" subtitle="Find a franchise, pick what to bring in, and generate every episode." />}

      {!embedded && (
        <Steps
          steps={[
            { label: "Find", done: !!crawl },
            { label: "Choose", done: chosen.length > 0 && (!tmdbServers || !!tmdb) },
            { label: "Servers", done: serversOk },
            { label: "Import", done: !!summary },
          ]}
        />
      )}
      <div className="space-y-5">
        {embedded && (crawling || crawlError) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            {crawling ? <Loader2 className="size-4 animate-spin" /> : null}
            {crawling ? `Following relations… ${crawling.found} found` : <span className="text-destructive">{crawlError}</span>}
          </p>
        )}
        {!embedded && (
        <Step n={1} done={!!crawl} title="Find the franchise" note="Search any title in it. Every connected season, OVA, movie and special is found for you.">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && isId && void start(Number(term.trim()))}
              placeholder="e.g. One Piece, or an AniList ID"
              aria-label="Search for a franchise"
              className={cn(inputCls, "pl-9")}
            />
          </label>
          <ul className="mt-2 space-y-1.5">
            {isId && (
              <li>
                <button
                  type="button"
                  onClick={() => void start(Number(term.trim()))}
                  className="w-full rounded-xl bg-surface/60 p-2.5 text-left text-sm ring-1 ring-border transition hover:ring-primary/50"
                >
                  Crawl from AniList ID {term.trim()}
                </button>
              </li>
            )}
            {(search.data?.media ?? []).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTerm("");
                    void start(m.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-surface/60 p-2 text-left ring-1 ring-border transition hover:ring-primary/50"
                >
                  {m.coverImage.large ? (
                    <img src={m.coverImage.large} alt="" loading="lazy" decoding="async" className="h-12 w-8 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-8 rounded bg-surface-2" />
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-sm font-medium">{titleOf(m)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {[prettyLabel(m.format), m.seasonYear, m.episodes ? `${m.episodes} ep` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {search.isFetching && (
              <li className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Searching AniList…
              </li>
            )}
          </ul>
          {crawling && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" /> Following relations… {crawling.found} found
            </p>
          )}
          {crawlError && <p className="mt-3 text-sm text-destructive">{crawlError}</p>}
        </Step>
        )}

        {crawl && (
          <>
            <Step n={2} title="Choose what to import" note={`${crawl.entries.length} entries, in watch order.`} done={chosen.length > 0 && (!tmdbServers || !!tmdb)}>
              {crawl.truncated && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  This franchise is huge, so the search stopped at {MAX_ENTRIES} entries. Import these, then search a
                  later title to continue.
                </p>
              )}
              {tmdbServers && tmdbError && (
                <p role="status" className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                  {tmdbError} Use a saved AniList server here, or map this title from the TMDB admin tools.
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5 text-sm font-semibold">
                <input
                  ref={master}
                  type="checkbox"
                  className={checkbox}
                  checked={allOn}
                  onChange={(e) => setSelected(new Set(e.target.checked ? allSelectable.map((p) => p.entry.id) : []))}
                />
                Select all
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {chosen.length} selected · {totalEpisodes.toLocaleString()} episodes
                </span>
              </label>

              <ul className="mt-2 divide-y divide-border/60">
                {plans.map((plan) => {
                  const { entry, count, review, ongoing } = plan;
                  const on = selected.has(entry.id);
                  return (
                    <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                      <input
                        id={`bulk-${entry.id}`}
                        type="checkbox"
                        className={checkbox}
                        checked={on}
                        disabled={count < 1}
                        onChange={(e) => toggle(entry.id, e.target.checked)}
                      />
                      <Link to="/anime/$id" params={{ id: String(entry.id) }} aria-label={`Open ${titleOf(entry)} details`} className="shrink-0">
                        {entry.poster ? <img src={entry.poster} alt="" loading="lazy" decoding="async" className="h-16 w-11 rounded-lg object-cover ring-1 ring-border" /> : <span aria-hidden className="block h-16 w-11 rounded-lg bg-surface-2" />}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link to="/anime/$id" params={{ id: String(entry.id) }} className="line-clamp-1 text-sm font-medium hover:text-primary">{titleOf(entry)}</Link>
                        <label htmlFor={`bulk-${entry.id}`} className="mt-1 flex cursor-pointer flex-wrap gap-1">
                          <Chip>{prettyLabel(entry.format) || "—"}</Chip>
                          {entry.year && <Chip>{entry.year}</Chip>}
                          {ongoing ? (
                            <Chip tone="primary">Airing · {count} aired{entry.episodes ? ` of ${entry.episodes}` : ""}</Chip>
                          ) : count > 0 ? (
                            <Chip>{count} ep</Chip>
                          ) : null}
                          {review && (
                            <Chip tone="warn">
                              <AlertTriangle className="size-3" /> Needs review
                            </Chip>
                          )}
                        </label>
                      </div>
                      {Number(manual[entry.id]) > (entry.airedThrough ?? 0) && entry.status !== "FINISHED" && (
                        <p className="basis-full pl-7 text-[11px] text-amber-300">
                          {entry.airedThrough
                            ? `Only ${entry.airedThrough} have aired so far. Links past that will not play (the player may show a different video).`
                            : "This has not aired yet. These links will not play until it does."}
                        </p>
                      )}
                      {(review || manual[entry.id] !== undefined) && (
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {review ?? "Episodes:"}
                          <input
                            value={manual[entry.id] ?? ""}
                            onChange={(e) => {
                              let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                              // Never more than AniList says the season has.
                              if (v && entry.episodes && Number(v) > entry.episodes) v = String(entry.episodes);
                              setManual((m) => ({ ...m, [entry.id]: v }));
                              if (Number(v) > 0) toggle(entry.id, true);
                            }}
                            inputMode="numeric"
                            placeholder="count"
                            aria-label={`Episode count for ${titleOf(entry)}`}
                            className={cn(inputCls, "h-8 w-20 text-xs")}
                          />
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
              {plans.some((p) => p.review) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Entries marked “Needs review” are left out until you type how many episodes they have.
                </p>
              )}
            </Step>

            <Step
              n={3}
              title="Servers"
              note={`Tick the saved links to use for this import (${servers.length} of ${allServers.length} on). Add or edit links here or on the Servers page; they are saved, so you only set them up once.`}
              done={serversOk}
            >
              <ServerList
                servers={allServers}
                onPatch={patchServer}
                onAdd={addServer}
                onCopy={copyServer}
                onRemove={(i) => {
                  // A server that was already imported is removed from every season (links, records and the site).
                  const key = importedKey(allServers[i].label);
                  if (key) void removeEverywhere(key, allServers[i].label).then((ok) => ok && removeServer(i));
                  else removeServer(i);
                }}
                sampleFor={sampleFor}
                anilistIds={[rootId, ...plans.map((p) => p.entry.id)].filter(Boolean)}
                tmdbId={tmdb?.id}
                busy={removing !== null}
              />
              {imported && imported.servers.length > 0 && (
                <div className="mt-4 rounded-xl border border-border bg-surface/40 p-3">
                  <p className="text-xs font-semibold">Already on the site for {imported.title}</p>
                  <ul className="mt-2 space-y-1.5">
                    {imported.servers.map((x) => (
                      <li key={x.key} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1">
                          <b className="font-semibold">{x.label}</b> <span className="text-[10px] uppercase text-muted-foreground">{x.mode === "tmdb" ? "TMDB" : "AniList"}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">{[x.sub && `SUB ${x.sub}`, x.dub && `DUB ${x.dub}`].filter(Boolean).join("  ·  ")}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing(
                              editing?.key === x.key
                                ? null
                                : { key: x.key, draft: { label: x.label, mode: x.mode, subLink: x.sub, dubLink: x.dub } },
                            )
                          }
                          disabled={removing !== null || saving !== null}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 font-semibold transition hover:border-primary disabled:opacity-40"
                        >
                          {editing?.key === x.key ? "Close" : "Edit links"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeEverywhere(x.key, x.label)}
                          disabled={removing !== null}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-destructive/90 px-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                        >
                          {removing === x.key ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                          Remove from all {imported.seasons.length}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {editing && (
                    <div className="mt-3">
                      <ServerList
                        single
                        servers={[editing.draft]}
                        onPatch={(_, p) => setEditing((cur) => (cur ? { ...cur, draft: { ...cur.draft, ...p } } : cur))}
                        onRemove={() => undefined}
                        onAdd={() => undefined}
                        sampleFor={sampleFor}
                        anilistIds={[rootId, ...plans.map((p) => p.entry.id)].filter(Boolean)}
                        tmdbId={tmdb?.id}
                      />
                      <button
                        type="button"
                        onClick={() => void saveEditing()}
                        disabled={saving !== null}
                        className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                      >
                        {saving !== null && <Loader2 className="size-4 animate-spin" />}
                        {saving ?? `Save to all ${imported.seasons.length} ${imported.seasons.length === 1 ? "entry" : "entries"}`}
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">Edit links changes that server on every season, every episode and the site at once. Remove deletes it from all of them.</p>
                </div>
              )}
            </Step>

            <Step n={4} title="Import" done={!!summary}>
              <label className="block text-xs text-muted-foreground">
                Series name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={cn(inputCls, "mt-1")} />
              </label>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Saved as <code className="rounded bg-surface-2 px-1">series/{franchiseId}</code>
              </p>

              <div className="mt-4 space-y-2 text-sm">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className={cn(checkbox, "mt-0.5")} checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                  <span>
                    Also make them playable on the site now
                    <span className="block text-xs text-muted-foreground">Adds the links to each anime’s page, with a server switch and SUB / DUB.</span>
                  </span>
                </label>
</div>
              {publish && (
                <div className="mt-3 rounded-xl border border-border p-3 text-sm" aria-live="polite">
                  <p className="font-semibold">What this import will do</p>
                  {findings.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{existing.size === 0 ? "Checking what is already on the site…" : "Nothing is saved on these entries yet, so every link is new."}</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {findings.map((f) => (
                        <li key={f.key + f.track} className="rounded-lg bg-surface-2/50 p-2 text-xs">
                          <b>{f.label} · {f.track.toUpperCase()}</b>
                          {f.have === 0 ? (
                            <span className="text-muted-foreground"> — new links will be added.</span>
                          ) : (
                            <span className="text-muted-foreground">
                              {" "}— {f.same} already the same (kept){f.differ + f.cannotRebuild > 0 ? "" : "."}
                              {f.differ + f.cannotRebuild > 0 && (
                                <b className="text-amber-300"> · {f.differ + f.cannotRebuild} old link{f.differ + f.cannotRebuild === 1 ? "" : "s"} will be deleted{f.differ ? " and replaced" : ""}.</b>
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">Servers you switched off in step 3 are not touched at all. To add one more link without changing the others, add a new server (for example Server 4) and switch the old ones off.</p>
                </div>
              )}
              

              <p className="mt-4 rounded-xl bg-surface-2/50 p-3 text-sm">
                {chosen.length} entries · {totalEpisodes.toLocaleString()} episodes · {servers.length} server{servers.length === 1 ? "" : "s"} ·{" "}
                <b>{linkCount.toLocaleString()}</b> links
              </p>
              {missing.length > 0 && (
                <p className="mt-2 text-xs text-destructive">
                  A server uses TMDB, but this title could not be matched automatically. Use an AniList server or map the title in the TMDB admin tools{tmdbBusy ? " after matching finishes" : ""}.
                </p>
              )}
              {unmapped > 0 && (
                <p className="mt-2 text-xs text-amber-300">
                  {unmapped.toLocaleString()} episode{unmapped === 1 ? "" : "s"} have no TMDB episode, so TMDB servers get no link for them (AniList servers still do).
                </p>
              )}
              {tooMany && (
                <p className="mt-2 text-xs text-destructive">
                  That is over {MAX_TOTAL_EPISODES.toLocaleString()} episodes. Untick some entries and import in two rounds.
                </p>
              )}

              {progress && (
                <div className="mt-4" role="status">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {progress.step} · {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                  </p>
                </div>
              )}
              {failure && <p className="mt-3 text-sm text-destructive">{failure}</p>}
              {summary && (
                <div className="mt-4 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="size-4 text-primary" /> Imported {summary.episodes.toLocaleString()} episodes in {summary.seasons} entries
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Written in {summary.batches} batch{summary.batches === 1 ? "" : "es"}
                    {publish ? `, ${summary.published.toLocaleString()} links published to the site` : ""}.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      to="/anime/$id"
                      params={{ id: String(summary.watchId) }}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                    >
                      <Play className="size-4 fill-current" /> Anime details
                    </Link>
                    <AdminLink s={{ view: "library" }} className="text-xs text-primary hover:underline">
                      Open My anime
                    </AdminLink>
                  </div>
                </div>
              )}

            </Step>

            <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {chosen.length} {chosen.length === 1 ? "entry" : "entries"} · {totalEpisodes.toLocaleString()} episodes · {linkCount.toLocaleString()} links
                </p>
                {blocker && <p className="text-xs text-amber-300">{blocker}</p>}
                {!blocker && willDelete > 0 && <p className="text-xs text-amber-300">{sure ? "Press again to confirm: the old links of the switched-on servers are deleted and replaced." : `${willDelete.toLocaleString()} old link${willDelete === 1 ? "" : "s"} will be deleted and replaced.`}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (willDelete > 0 && !sure) return setSure(true);
                  void run();
                }}
                disabled={!canImport}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
              >
                {progress ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}
                {progress ? "Importing…" : sure ? `Yes, delete ${willDelete.toLocaleString()} old link${willDelete === 1 ? "" : "s"} and import` : "Import"}
              </button>
            </div>
          </>
        )}

        {!embedded && <OngoingPanel />}
      </div>
    </>
  );
}

/** Seasons imported while still airing: one press adds whatever has aired since. */
function OngoingPanel() {
  const [list, setList] = useState<OngoingSeason[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setList(await listOngoing());
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setLoading(false);
    }
  }

  async function append(s: OngoingSeason) {
    const key = `${s.franchiseId}/${s.anilistId}`;
    setBusy(key);
    try {
      const added = await appendNewEpisodes(s);
      toast.success(added ? `Added ${added} new episode${added === 1 ? "" : "s"} to ${s.title}.` : `${s.title} has nothing new yet.`);
      await load();
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Still airing</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Add the newest episodes of shows you imported while they were running.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm transition hover:border-primary disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {list ? "Refresh" : "Check"}
        </button>
      </div>
      {list && (
        <ul className="mt-3 divide-y divide-border/60">
          {list.length === 0 && <li className="py-2 text-sm text-muted-foreground">No airing series were imported yet.</li>}
          {list.map((s) => (
            <li key={`${s.franchiseId}/${s.anilistId}`} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm font-medium">{s.title}</span>
                <span className="text-[11px] text-muted-foreground">Imported through episode {s.importedThrough}</span>
              </span>
              <button
                type="button"
                onClick={() => void append(s)}
                disabled={busy !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                {busy === `${s.franchiseId}/${s.anilistId}` && <Loader2 className="size-3.5 animate-spin" />}
                Add new episodes
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

