import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Plus, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Chip, inputCls, panel } from "@/components/admin/ui";
import { SANDBOX } from "@/hooks/use-shield";
import { fillTemplate, isMovieLink, linkFromPaste, suggestTemplate, trackVariants, type LinkMode } from "@/lib/bulk-import";
import { browseMedia, titleOf } from "@/lib/anilist";
import { searchTmdb, searchTmdbMovies } from "@/lib/tmdb";
import { cn } from "@/lib/utils";

const HAS_ID = /\{(id|anilist_?id|tmdb_?id|tmdb)\}/i;
const MAX_EPISODES = 2000;

export type GeneratedServer = { label: string; mode: LinkMode; subLink: string; dubLink: string };

const iframeCode = (url: string) =>
  `<iframe src="${url}" width="100%" height="100%" frameborder="0" allowfullscreen sandbox="${SANDBOX}"></iframe>`;

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}.`);
  } catch {
    toast.error("Your browser blocked copying. Select the text and copy it by hand.");
  }
}

/**
 * Paste ONE link or iframe code (episode 1 of any anime) and get every episode back, for SUB and DUB,
 * as plain links or ready-made iframe codes. Or save it as a server so Bulk import uses it.
 */
export function LinkGenerator({ onSave }: { onSave: (server: GeneratedServer) => void }) {
  const [paste, setPaste] = useState("");
  const [dubPaste, setDubPaste] = useState("");
  const [mode, setMode] = useState<LinkMode>("anilist");
  const [idText, setIdText] = useState("");
  const [seasonText, setSeasonText] = useState("1");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("12");
  const [label, setLabel] = useState("Server 1");

  const id = Number(idText) > 0 ? Number(idText) : undefined;

  // "Find the ID by name": AniList for AniList links, TMDB (series, or movies for a movie link) for TMDB links.
  const [find, setFind] = useState("");
  const [found, setFound] = useState<{ id: number; name: string; note: string }[]>([]);
  const [finding, setFinding] = useState(false);

  const result = useMemo(() => {
    const toPattern = (raw: string) => {
      const link = linkFromPaste(raw);
      if (!/^https?:\/\//i.test(link)) return null;
      if (HAS_ID.test(link)) return link;
      return suggestTemplate(link, mode, mode === "tmdb" ? { tmdb: id } : { anilist: id }) ?? link;
    };
    const main = toPattern(paste);
    if (!main) return null;
    let sub = main;
    let dub = "";
    const both = trackVariants(main);
    if (both) ({ sub, dub } = both);
    const other = dubPaste.trim() ? toPattern(dubPaste) : null;
    if (other) dub = other;
    const readable = HAS_ID.test(sub) || HAS_ID.test(dub);
    return { sub, dub, both: !!both, readable };
  }, [paste, dubPaste, mode, id]);

  const first = Math.max(1, Number(from) || 1);
  const isMovie = !!result && isMovieLink(result.sub || result.dub);
  useEffect(() => {
    const q = find.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setFinding(true);
      try {
        if (mode === "anilist") {
          const r = await browseMedia({ search: q, perPage: 6, sort: ["SEARCH_MATCH"] });
          if (!cancelled) setFound(r.media.map((m) => ({ id: m.id, name: titleOf(m), note: [m.format, m.seasonYear].filter(Boolean).join(" · ") })));
        } else if (isMovie) {
          const r = await searchTmdbMovies(q);
          if (!cancelled) setFound(r.map((m) => ({ id: m.id, name: m.name, note: ["Movie", m.year].filter(Boolean).join(" · ") })));
        } else {
          const r = await searchTmdb(q);
          if (!cancelled) setFound(r.map((m) => ({ id: m.id, name: m.name, note: ["Series", m.year].filter(Boolean).join(" · ") })));
        }
      } catch {
        if (!cancelled) setFound([]);
      } finally {
        if (!cancelled) setFinding(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [find, mode, isMovie]);
  const last = Math.min(first + MAX_EPISODES - 1, Math.max(first, Number(to) || first));
  const movie = isMovie;
  const season = Number(seasonText) >= 0 && seasonText !== "" ? Number(seasonText) : 1;

  const lists = useMemo(() => {
    if (!result || !result.readable || !id) return null;
    const ids = { anilist: id, tmdb: id, season };
    const build = (tpl: string, track: "sub" | "dub") => {
      if (!tpl) return [] as string[];
      if (isMovieLink(tpl)) return [fillTemplate(tpl, ids, 1, track)];
      const out: string[] = [];
      for (let n = first; n <= last; n++) out.push(fillTemplate(tpl, ids, mode === "tmdb" ? n : n, track));
      return out;
    };
    return { sub: build(result.sub, "sub"), dub: build(result.dub, "dub") };
  }, [result, id, season, first, last, mode]);

  const copyBtn =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-xs font-semibold transition hover:border-primary disabled:pointer-events-none disabled:opacity-40";

  return (
    <section className={cn(panel, "mb-5")}>
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Wand2 className="size-4" /> Link generator
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste one link or one iframe code (episode 1 of any anime). You get every episode link back, for SUB and DUB, as plain links or iframe codes.
      </p>

      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        spellCheck={false}
        rows={3}
        placeholder={'https://aniembed.ac/e/21/1?lang=sub   or   <iframe src="https://aniembed.ac/e/21/1?lang=sub"></iframe>'}
        aria-label="Link or iframe code"
        className={cn(inputCls, "mt-3 h-auto min-h-20 py-2 font-mono text-xs")}
      />

      {paste.trim() && !result && <p className="mt-2 text-xs text-destructive">That doesn't look like a link. It should start with https://</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Links use" className="inline-flex rounded-full border border-border p-0.5">
              {(["anilist", "tmdb"] as LinkMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("h-8 rounded-full px-3.5 text-xs font-semibold transition", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {m === "anilist" ? "AniList ID" : "TMDB ID"}
                </button>
              ))}
            </div>
            {result.both ? <Chip tone="primary">SUB and DUB found</Chip> : result.dub ? <Chip tone="primary">SUB and DUB</Chip> : <Chip tone="warn">Only one language found</Chip>}
            {movie && <Chip>Movie link</Chip>}
            {!result.readable && <Chip tone="warn">No ID found in this link</Chip>}
          </div>

          <div className="space-y-1.5 rounded-xl bg-surface-2/50 p-3 font-mono text-[11px]">
            <p className="break-all"><b className="mr-2 font-sans uppercase text-muted-foreground">sub</b>{result.sub || "—"}</p>
            <p className="break-all"><b className="mr-2 font-sans uppercase text-muted-foreground">dub</b>{result.dub || "—"}</p>
          </div>

          {!result.both && (
            <label className="block text-xs text-muted-foreground">
              The other language's link (only if it is a different link)
              <input value={dubPaste} onChange={(e) => setDubPaste(e.target.value)} spellCheck={false} placeholder="Paste the DUB link or iframe code here" className={cn(inputCls, "mt-1 font-mono text-xs")} />
            </label>
          )}

          <div className="flex flex-wrap items-end gap-3 text-xs text-muted-foreground">
            <label>
              {mode === "tmdb" ? "TMDB ID" : "AniList ID"}
              <input value={idText} onChange={(e) => setIdText(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="e.g. 21" className={cn(inputCls, "mt-1 w-28")} />
            </label>
            {mode === "tmdb" && !movie && (
              <label>
                Season
                <input value={seasonText} onChange={(e) => setSeasonText(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={cn(inputCls, "mt-1 w-20")} />
              </label>
            )}
            {!movie && (
              <>
                <label>
                  Episodes from
                  <input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className={cn(inputCls, "mt-1 w-20")} />
                </label>
                <label>
                  to
                  <input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className={cn(inputCls, "mt-1 w-20")} />
                </label>
              </>
            )}
          </div>

          <div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder={`Don't know the ID? Type the name to find it on ${mode === "tmdb" ? (isMovie ? "TMDB (movies)" : "TMDB") : "AniList"}`}
                aria-label="Find the ID by name"
                className={cn(inputCls, "pl-9 text-xs")}
              />
              {finding && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </label>
            {found.length > 0 && (
              <ul className="mt-1.5 divide-y divide-border/60 rounded-xl border border-border bg-surface-2/40">
                {found.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setIdText(String(f.id));
                        setFind("");
                        setFound([]);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-surface-2"
                    >
                      <span className="line-clamp-1 font-semibold">{f.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {f.note} · ID {f.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!id && <p className="text-xs text-muted-foreground">Type the {mode === "tmdb" ? "TMDB" : "AniList"} ID of the anime, or find it by name above, to generate its links.</p>}

          {lists && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" className={copyBtn} disabled={!lists.sub.length} onClick={() => void copy(lists.sub.join("\n"), `${lists.sub.length} SUB links`)}>
                  <Copy className="size-3.5" /> SUB links ({lists.sub.length})
                </button>
                <button type="button" className={copyBtn} disabled={!lists.dub.length} onClick={() => void copy(lists.dub.join("\n"), `${lists.dub.length} DUB links`)}>
                  <Copy className="size-3.5" /> DUB links ({lists.dub.length})
                </button>
                <button type="button" className={copyBtn} disabled={!lists.sub.length} onClick={() => void copy(lists.sub.map(iframeCode).join("\n"), `${lists.sub.length} SUB iframe codes`)}>
                  <Copy className="size-3.5" /> SUB iframes
                </button>
                <button type="button" className={copyBtn} disabled={!lists.dub.length} onClick={() => void copy(lists.dub.map(iframeCode).join("\n"), `${lists.dub.length} DUB iframe codes`)}>
                  <Copy className="size-3.5" /> DUB iframes
                </button>
              </div>
              <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                {(lists.sub.length ? lists.sub : lists.dub).slice(0, 3).map((u) => (
                  <li key={u} className="break-all">{u}</li>
                ))}
                {(lists.sub.length || lists.dub.length) > 3 && <li>…</li>}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
            <label className="text-xs text-muted-foreground">
              Save as a server (Bulk import will use it for every anime)
              <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 24))} placeholder="Server name" className={cn(inputCls, "mt-1 w-44 font-semibold")} />
            </label>
            <button
              type="button"
              disabled={!result.readable || !label.trim()}
              onClick={() => onSave({ label: label.trim(), mode, subLink: result.sub, dubLink: result.dub })}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              <Plus className="size-4" /> Save server
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
