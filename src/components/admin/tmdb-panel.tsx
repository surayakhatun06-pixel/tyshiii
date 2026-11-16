import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Film, Loader2, Plus, Search, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";

import { AdminLink, inputCls, panel } from "@/components/admin/ui";
import { getAnimeDoc, type TmdbLinks, type TmdbServerPattern } from "@/lib/cloud-episodes";
import {
  TMDB_PATTERN_EXAMPLES,
  fillTmdbPattern,
  getTmdbCollection,
  getTmdbMovie,
  getTmdbSeriesFull,
  searchTmdbAny,
  tmdbMovieRecordId,
  tmdbSeasonRecordId,
  type TmdbMovie,
  type TmdbMultiHit,
} from "@/lib/tmdb";
import { importTmdbMovies, importTmdbSeries, type ImportResult } from "@/lib/tmdb-import";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- the switch */

const SOURCE_KEY = "tyshi-admin-search-source";
type Source = "anilist" | "tmdb";

/**
 * "Search AniList / Search TMDB" at the top of an admin search screen (remembered on this device).
 * AniList shows the screen exactly as before; TMDB shows the TMDB search, result, links and import.
 */
export function SourceSwitch({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<Source>("anilist");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOURCE_KEY) === "tmdb") setSource("tmdb");
    } catch {
      /* default */
    }
  }, []);
  const choose = (next: Source) => {
    setSource(next);
    try {
      window.localStorage.setItem(SOURCE_KEY, next);
    } catch {
      /* not remembered */
    }
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Where to search" className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface/60 p-1">
        {(["anilist", "tmdb"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            onClick={() => choose(s)}
            className={cn(
              "h-11 rounded-lg text-sm font-semibold transition",
              source === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "anilist" ? "Search AniList" : "Search TMDB"}
          </button>
        ))}
      </div>
      {source === "tmdb" ? <TmdbPanel /> : children}
    </div>
  );
}

/* ------------------------------------------------------------------- the panel */

type Picked =
  | { kind: "tv"; id: number; data: Awaited<ReturnType<typeof getTmdbSeriesFull>> }
  | { kind: "movie"; id: number; movie: TmdbMovie; collection: TmdbMovie[] };

export function TmdbPanel() {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<TmdbMultiHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);

  async function search() {
    if (!term.trim()) return;
    setBusy(true);
    setError(null);
    setPicked(null);
    try {
      setHits(await searchTmdbAny(term));
    } catch (e) {
      setHits([]);
      setError(e instanceof Error ? e.message : "TMDB search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function open(hit: TmdbMultiHit) {
    setBusy(true);
    setError(null);
    try {
      if (hit.kind === "tv") {
        setPicked({ kind: "tv", id: hit.id, data: await getTmdbSeriesFull(hit.id) });
      } else {
        const movie = await getTmdbMovie(hit.id);
        const collection = movie.collection ? await getTmdbCollection(movie.collection.id) : [movie];
        setPicked({ kind: "movie", id: hit.id, movie, collection });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that TMDB page.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className={panel}>
        <h2 className="text-sm font-semibold">Search TMDB</h2>
        <p className="mt-1 text-xs text-muted-foreground">A title or a TMDB code. Finds series and movies. Results are only visible here in the admin panel.</p>
        <div className="mt-3 flex gap-2">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder="The Mentalist, or 5920"
              aria-label="Search TMDB"
              className={cn(inputCls, "h-11 pl-9")}
            />
          </label>
          <button
            type="button"
            onClick={() => void search()}
            disabled={busy}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <ul className="mt-3 space-y-1.5">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                type="button"
                onClick={() => void open(h)}
                className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-surface p-2 text-left transition hover:border-foreground/40"
              >
                <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {h.poster && <img src={h.poster} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {h.kind === "tv" ? "Series" : "Movie"}
                    {h.year ? ` · ${h.year}` : ""} · TMDB ID {h.id}
                  </span>
                </span>
                {h.kind === "tv" ? <Tv className="size-4 text-muted-foreground" /> : <Film className="size-4 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {picked?.kind === "tv" && <SeriesPage key={picked.id} data={picked.data} />}
      {picked?.kind === "movie" && <MoviePage key={picked.id} movie={picked.movie} collection={picked.collection} />}
    </div>
  );
}

/* ------------------------------------------------------------ TMDB Links editor */

const emptyServer = (): TmdbServerPattern => ({ name: "Server 1", langs: [{ label: "Eng", pattern: "" }] });

function LinksEditor({ links, onChange, movie }: { links: TmdbServerPattern[]; onChange: (next: TmdbServerPattern[]) => void; movie?: boolean }) {
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [open, setOpen] = useState(true);
  const set = (i: number, patch: Partial<TmdbServerPattern>) => onChange(links.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setLang = (i: number, j: number, patch: { label?: string; pattern?: string }) =>
    set(i, { langs: links[i].langs.map((l, k) => (k === j ? { ...l, ...patch } : l)) });

  return (
    <section className={panel}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between text-left">
        <span>
          <span className="block text-sm font-semibold">TMDB Links</span>
          <span className="block text-xs text-muted-foreground">
            One pattern per language. {movie ? "Use {tmdbId}." : "Use {tmdbId}, {season}, {episode} ({id}, {s}, {ep} also work)."} Nothing is saved per episode.
          </span>
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {links.map((server, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex gap-2">
                <input
                  value={server.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  aria-label="Server name"
                  placeholder="Server name"
                  className={cn(inputCls, "h-11")}
                />
                <button
                  type="button"
                  aria-label="Remove server"
                  onClick={() => onChange(links.filter((_, k) => k !== i))}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {server.langs.map((l, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      value={l.label}
                      onChange={(e) => setLang(i, j, { label: e.target.value })}
                      aria-label="Language name"
                      placeholder={j === 0 ? "Language 1 (default), e.g. Eng" : "Language 2, e.g. Hindi"}
                      className={cn(inputCls, "h-11 w-40 shrink-0")}
                    />
                    {j > 0 && (
                      <button
                        type="button"
                        aria-label="Remove language"
                        onClick={() => set(i, { langs: server.langs.filter((_, k) => k !== j) })}
                        className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <input
                    value={l.pattern}
                    onChange={(e) => setLang(i, j, { pattern: e.target.value })}
                    aria-label="Link pattern"
                    placeholder="https://host.example/embed/tv/{tmdbId}/{season}/{episode}"
                    className={cn(inputCls, "h-11 font-mono text-xs")}
                  />
                  {l.pattern && (
                    <p className="break-all text-[11px] text-muted-foreground">
                      Preview: {fillTmdbPattern(l.pattern, { tmdbId: 5920, season: movie ? undefined : season, episode: movie ? undefined : episode })}
                    </p>
                  )}
                </div>
              ))}
              {server.langs.length < 2 && (
                <button
                  type="button"
                  onClick={() => set(i, { langs: [...server.langs, { label: "", pattern: "" }] })}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  <Plus className="size-3.5" /> Add a second language
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onChange([...links, { ...emptyServer(), name: `Server ${links.length + 1}` }])}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-2"
            >
              <Plus className="size-4" /> Add server
            </button>
            {!movie && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Preview season
                <input type="number" min={1} value={season} onChange={(e) => setSeason(Math.max(1, Number(e.target.value) || 1))} className={cn(inputCls, "h-10 w-16")} />
                episode
                <input type="number" min={1} value={episode} onChange={(e) => setEpisode(Math.max(1, Number(e.target.value) || 1))} className={cn(inputCls, "h-10 w-16")} />
              </span>
            )}
          </div>
          {!movie && (
            <div className="text-[11px] text-muted-foreground">
              Examples (The Mentalist, 5920):
              {TMDB_PATTERN_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="mt-1 block w-full break-all rounded-md bg-surface-2 px-2 py-1.5 text-left font-mono hover:text-foreground"
                  onClick={() => onChange(links.length ? links.map((s, i) => (i === 0 ? { ...s, langs: s.langs.map((l, j) => (j === 0 ? { ...l, pattern: ex } : l)) } : s)) : [{ name: "Server 1", langs: [{ label: "Eng", pattern: ex }] }])}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const cleanLinks = (servers: TmdbServerPattern[]): TmdbLinks | undefined => {
  const out = servers
    .map((s) => ({
      name: s.name.trim(),
      langs: s.langs.map((l) => ({ label: l.label.trim(), pattern: l.pattern.trim() })).filter((l) => l.pattern).slice(0, 2),
    }))
    .filter((s) => s.name && s.langs.length);
  return out.length ? { servers: out } : undefined;
};

function ResultBox({ result, busy, message, watchId }: { result: ImportResult | null; busy: boolean; message: string; watchId?: number }) {
  if (busy) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {message}
      </p>
    );
  }
  if (!result) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Check className="size-4 text-green-400" />
        {result.seasons} season{result.seasons === 1 ? "" : "s"} and {result.episodes} episode{result.episodes === 1 ? "" : "s"} imported
      </p>
      {result.skipped.length > 0 && (
        <div className="mt-2 text-xs text-amber-300">
          Skipped:
          <ul className="mt-1 list-disc pl-5">
            {result.skipped.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {watchId ? (
        <a href={`/anime/${watchId}`} className="mt-2 inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline">
          Open it on the site
        </a>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- series page */

function SeriesPage({ data }: { data: Awaited<ReturnType<typeof getTmdbSeriesFull>> }) {
  const real = data.seasons.filter((s) => s.season >= 1 && s.count > 0);
  const specials = data.seasons.find((s) => s.season === 0 && s.count > 0);
  const [ticked, setTicked] = useState<Set<number>>(new Set(real.map((s) => s.season)));
  const [withSpecials, setWithSpecials] = useState(false);
  const [links, setLinks] = useState<TmdbServerPattern[]>([emptyServer()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  // Patterns saved earlier for this series are loaded back, so importing again keeps them.
  useEffect(() => {
    void getAnimeDoc(tmdbSeasonRecordId(data.id, real[0]?.season ?? 1))
      .then((doc) => doc?.tmdbLinks && setLinks(doc.tmdbLinks.servers))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id]);

  const chosen = useMemo(
    () => data.seasons.filter((s) => (s.season === 0 ? withSpecials : ticked.has(s.season))),
    [data.seasons, ticked, withSpecials],
  );

  async function run() {
    if (!chosen.length) return toast.error("Tick at least one season.");
    setBusy(true);
    setResult(null);
    try {
      const r = await importTmdbSeries(
        {
          tmdbId: data.id,
          title: data.name,
          poster: data.posterBig,
          backdrop: data.backdrop,
          overview: data.overview,
          genres: data.genres,
          year: data.year,
          status: data.status === "Ended" || data.status === "Canceled" ? "FINISHED" : "RELEASING",
          seasons: chosen,
          links: cleanLinks(links),
          includeSpecials: withSpecials,
        },
        setMessage,
      );
      setResult(r);
      toast.success(`${r.seasons} seasons and ${r.episodes} episodes imported.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className={panel}>
        <div className="flex gap-3">
          <span className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">{data.posterBig && <img src={data.posterBig} alt="" className="h-full w-full object-cover" />}</span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{data.name}</h2>
            <p className="text-xs text-muted-foreground">
              Series{data.year ? ` · ${data.year}` : ""} · TMDB ID {data.id}
              {data.status ? ` · ${data.status}` : ""}
            </p>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{data.overview}</p>
          </div>
        </div>
        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Seasons (tick what to import)</h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {real.map((s) => (
            <li key={s.season}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={ticked.has(s.season)}
                  onChange={(e) =>
                    setTicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.season);
                      else next.delete(s.season);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">Season {s.season}</span>
                <span className="text-xs text-muted-foreground">
                  {s.aired === s.count ? `${s.count} eps` : `${s.aired} of ${s.count} aired`}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {specials && (
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 px-1 text-xs text-muted-foreground">
            <input type="checkbox" className="size-4" checked={withSpecials} onChange={(e) => setWithSpecials(e.target.checked)} />
            Also import Specials ({specials.count} eps). Skipped by default.
          </label>
        )}
      </section>

      <LinksEditor links={links} onChange={setLinks} />

      <section className={panel}>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Import {chosen.length} season{chosen.length === 1 ? "" : "s"}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Importing again updates the same records. Nothing is duplicated and hand edits stay.</p>
        <div className="mt-3">
          <ResultBox result={result} busy={busy} message={message} watchId={result && real[0] ? tmdbSeasonRecordId(data.id, chosen[0]?.season ?? real[0].season) : undefined} />
        </div>
      </section>
      <p className="px-1 text-[11px] text-muted-foreground">
        Imported TMDB series show only in search, Continue watching and the Saved gallery.{" "}
        <AdminLink s={{ view: "library" }} className="underline">My anime</AdminLink> lists them for editing.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- movie page */

function MoviePage({ movie, collection }: { movie: TmdbMovie; collection: TmdbMovie[] }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set([movie.id]));
  const [links, setLinks] = useState<TmdbServerPattern[]>([{ name: "Server 1", langs: [{ label: "Eng", pattern: "" }] }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    void getAnimeDoc(tmdbMovieRecordId(movie.id))
      .then((doc) => doc?.tmdbLinks && setLinks(doc.tmdbLinks.servers))
      .catch(() => undefined);
  }, [movie.id]);

  async function run() {
    const chosen = collection.filter((m) => ticked.has(m.id));
    if (!chosen.length) return toast.error("Tick at least one movie.");
    setBusy(true);
    setResult(null);
    try {
      const r = await importTmdbMovies(chosen, cleanLinks(links), setMessage);
      setResult(r);
      toast.success(`${r.seasons} movie${r.seasons === 1 ? "" : "s"} imported.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className={panel}>
        <h2 className="text-lg font-bold">{movie.title}</h2>
        <p className="text-xs text-muted-foreground">
          Movie{movie.year ? ` · ${movie.year}` : ""} · TMDB ID {movie.id}
        </p>
        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {movie.collection ? "Movies in this collection (tick what to import)" : "This movie"}
        </h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {collection.map((m) => (
            <li key={m.id}>
              <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={ticked.has(m.id)}
                  onChange={(e) =>
                    setTicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      return next;
                    })
                  }
                />
                <span className="h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-2">{m.poster && <img src={m.poster} alt="" className="h-full w-full object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.year ?? "—"} · TMDB ID {m.id}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      <LinksEditor links={links} onChange={setLinks} movie />
      <section className={panel}>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Import {ticked.size} movie{ticked.size === 1 ? "" : "s"}
        </button>
        <div className="mt-3">
          <ResultBox result={result} busy={busy} message={message} watchId={result ? tmdbMovieRecordId([...ticked][0] ?? movie.id) : undefined} />
        </div>
      </section>
    </>
  );
}
