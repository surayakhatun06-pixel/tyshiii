import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { inputCls, panel } from "@/components/admin/ui";
import { linksOf, modeOf, type ServerTemplate } from "@/lib/bulk-import";
import { applyReplacePlan, buildReplacePlan, type ReplacePlan, type ReplaceRule } from "@/lib/server-replace";
import { getDb } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type Pick = { sub: boolean; dub: boolean };
type Title = { id: number; title: string };

/**
 * Replace (or delete) the links of chosen servers and tracks, for chosen titles only.
 * Nothing is written until the preview has been read and confirmed.
 */
export function ServerReplace({ servers, mode, presetIds }: { servers: ServerTemplate[]; mode: "anilist" | "tmdb"; presetIds?: number[] }) {
  const list = useMemo(() => servers.filter((s) => modeOf(s) === mode && s.label.trim()), [servers, mode]);
  const [action, setAction] = useState<"replace" | "delete">("replace");
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [scopeAll, setScopeAll] = useState(!presetIds?.length);
  const [titles, setTitles] = useState<Title[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set(presetIds ?? []));
  const [filter, setFilter] = useState("");
  const [plan, setPlan] = useState<ReplacePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Selections belong to one mode; switching modes starts clean without touching saved settings.
  useEffect(() => {
    setPicked({});
    setPlan(null);
    setConfirming(false);
  }, [mode]);

  useEffect(() => {
    if (scopeAll || titles.length) return;
    void (async () => {
      try {
        const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
        const snap = await fs.getDocs(fs.collection(db, "anime"));
        setTitles(
          snap.docs
            .map((d) => ({ id: Number(d.id), title: typeof d.data().title === "string" ? (d.data().title as string) : `Anime ${d.id}` }))
            .sort((a, b) => a.title.localeCompare(b.title)),
        );
      } catch {
        toast.error("Couldn't load the title list.");
      }
    })();
  }, [scopeAll, titles.length]);

  const invalidate = () => {
    setPlan(null);
    setConfirming(false);
    setTyped("");
  };

  const rules: ReplaceRule[] = list.flatMap((s) => {
    const p = picked[s.label];
    if (!p || (!p.sub && !p.dub)) return [];
    const l = linksOf(s);
    const rule: ReplaceRule = { label: s.label.trim(), mode };
    if (action === "delete") {
      if (p.sub) rule.sub = "";
      if (p.dub) rule.dub = "";
      rule.remove = true;
    } else {
      if (p.sub) rule.sub = l.sub;
      if (p.dub) rule.dub = l.dub;
    }
    return [rule];
  });

  const scope = { animeIds: scopeAll ? ("all" as const) : [...chosen] };
  const ready = rules.length > 0 && (scopeAll || chosen.size > 0);

  async function preview() {
    setBusy(true);
    setErrors([]);
    try {
      const made = await buildReplacePlan(rules, scope, setProgress);
      setPlan(made);
      setConfirming(false);
      if (!made.links) toast.info("No saved links match this selection. Nothing would change.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the preview.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setErrors([]);
    try {
      const r = await applyReplacePlan(plan, (d, t) => setProgress(`Updated ${d} of ${t} titles…`));
      setErrors(r.errors);
      if (r.errors.length) toast.error(`${r.errors.length} title(s) failed. The others were updated.`);
      else toast.success(`Done: ${r.replaced} links replaced, ${r.emptied} emptied, ${r.titles} titles.`);
      setPlan(null);
      setConfirming(false);
      setTyped("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The update failed.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const visible = titles.filter((t) => t.title.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 80);
  const word = action === "delete" ? "DELETE" : "REPLACE";

  return (
    <section className={cn(panel, "mt-5")} aria-labelledby="server-replace-title">
      <h2 id="server-replace-title" className="font-semibold">
        {action === "replace" ? "Replace links for chosen servers" : "Delete imported server links"} <span className="text-xs font-normal text-muted-foreground">({mode === "tmdb" ? "TMDB" : "AniList"} servers)</span>
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {action === "replace"
          ? "Tick the servers and tracks to rebuild from the saved patterns above. Only those slots change. Old links in them are removed first; if a new link can't be made for an episode, that slot is left empty and listed."
          : "This deletes the chosen servers' links from the episodes on your site and in Firebase, for the titles you pick. It does NOT remove your saved patterns."}
      </p>

      <div className="mt-3 inline-flex rounded-full border border-border p-0.5 text-xs font-semibold">
        {(["replace", "delete"] as const).map((a) => (
          <button key={a} type="button" onClick={() => { setAction(a); invalidate(); }} className={cn("rounded-full px-4 py-1.5", action === a ? (a === "delete" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground") : "text-muted-foreground")}>
            {a === "replace" ? "Replace links" : "Delete links"}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {list.length === 0 && <li className="text-xs text-muted-foreground">No {mode === "tmdb" ? "TMDB" : "AniList"} servers are saved yet.</li>}
        {list.map((s) => {
          const l = linksOf(s);
          const p = picked[s.label] ?? { sub: false, dub: false };
          const set = (patch: Partial<Pick>) => { setPicked((cur) => ({ ...cur, [s.label]: { ...p, ...patch } })); invalidate(); };
          return (
            <li key={s.label} className="rounded-xl border border-border bg-surface/40 p-3 text-sm">
              <p className="font-semibold">{s.label}</p>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                <label className={cn("flex min-h-9 items-center gap-2", !l.sub && action === "replace" && "opacity-40")}>
                  <input type="checkbox" checked={p.sub} disabled={!l.sub && action === "replace"} onChange={(e) => set({ sub: e.target.checked })} className="size-4 accent-[var(--primary)]" /> SUB
                </label>
                <label className={cn("flex min-h-9 items-center gap-2", !l.dub && action === "replace" && "opacity-40")}>
                  <input type="checkbox" checked={p.dub} disabled={!l.dub && action === "replace"} onChange={(e) => set({ dub: e.target.checked })} className="size-4 accent-[var(--primary)]" /> DUB
                </label>
              </div>
              {action === "replace" && <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{p.sub && l.sub ? `SUB ${l.sub}` : ""}{p.sub && p.dub ? " · " : ""}{p.dub && l.dub ? `DUB ${l.dub}` : ""}</p>}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 text-sm">
        <p className="mb-1 text-xs font-medium">Which titles</p>
        <label className="mr-4 inline-flex min-h-9 items-center gap-2"><input type="radio" checked={scopeAll} onChange={() => { setScopeAll(true); invalidate(); }} className="accent-[var(--primary)]" /> Every title</label>
        <label className="inline-flex min-h-9 items-center gap-2"><input type="radio" checked={!scopeAll} onChange={() => { setScopeAll(false); invalidate(); }} className="accent-[var(--primary)]" /> Only the ones I pick{chosen.size ? ` (${chosen.size})` : ""}</label>
        {!scopeAll && (
          <div className="mt-2 rounded-xl border border-border p-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search your titles" className={inputCls} />
            <ul className="mt-2 max-h-56 overflow-y-auto">
              {visible.map((t) => (
                <li key={t.id}>
                  <label className="flex min-h-10 items-center gap-2 px-1 text-sm">
                    <input type="checkbox" checked={chosen.has(t.id)} onChange={(e) => { setChosen((cur) => { const n = new Set(cur); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; }); invalidate(); }} className="size-4 accent-[var(--primary)]" />
                    <span className="line-clamp-1">{t.title}</span>
                  </label>
                </li>
              ))}
              {!visible.length && <li className="px-1 py-2 text-xs text-muted-foreground">No titles found.</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !ready} onClick={() => void preview()} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-semibold hover:border-primary/60 disabled:opacity-40">
          {busy && !plan ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Preview changes
        </button>
        {progress && <span className="text-xs text-muted-foreground" role="status">{progress}</span>}
      </div>

      {plan && (
        <div className="mt-4 rounded-xl border border-border p-3" aria-live="polite">
          <p className="text-sm font-semibold">
            {plan.links} link{plan.links === 1 ? "" : "s"} in {plan.episodes} episodes across {plan.titles.length} title{plan.titles.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">
            {action === "replace" ? `${plan.replaced} will get a new link. ` : ""}
            {plan.emptied ? `${plan.emptied} ${action === "replace" ? "cannot be made and will be left empty (old link removed)" : "will be deleted"}. ` : ""}
            {plan.untouchedTitles} other title(s) in scope have none of these links and stay untouched. Other servers, tracks and titles are not changed.
          </p>
          <div className="mt-2 max-h-80 overflow-y-auto">
            {plan.titles.map((t) => (
              <details key={t.animeId} className="border-b border-border/60 py-1.5">
                <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
                  <span className="line-clamp-1 flex-1">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.episodes} ep · {t.rows.length} link{t.rows.length === 1 ? "" : "s"}{t.rows.some((r) => r.newUrl === null) ? " · ⚠" : ""}</span>
                </summary>
                <ul className="mt-1 space-y-1 pb-2 text-[11px]">
                  {t.rows.slice(0, 40).map((r, i) => (
                    <li key={i} className="break-all rounded-lg bg-surface-2/50 p-2">
                      <b>Ep {r.episode} · {r.server} · {r.track.toUpperCase()}</b>
                      <div className="text-muted-foreground">old: {r.oldUrl}</div>
                      {r.newUrl ? <div>new: {r.newUrl}</div> : <div className="text-amber-300">{action === "delete" ? "will be deleted" : `unavailable (${r.reason ?? "no link"}): slot left empty`}</div>}
                    </li>
                  ))}
                  {t.rows.length > 40 && <li className="text-muted-foreground">…and {t.rows.length - 40} more links in this title.</li>}
                </ul>
              </details>
            ))}
          </div>

          {plan.links > 0 && !confirming && (
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={cn("mt-3 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold", action === "delete" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}>
              {action === "delete" ? <Trash2 className="size-4" /> : <ArrowRightLeft className="size-4" />} {action === "delete" ? "Delete these links…" : "Replace these links…"}
            </button>
          )}
          {confirming && (
            <div className="mt-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs">
              <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> This changes your live website and Firebase. Old links in the selected slots are removed and can't be undone. Type {word} to continue.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} className={cn(inputCls, "w-40")} />
                <button type="button" disabled={busy || typed.trim().toUpperCase() !== word} onClick={() => void apply()} className="inline-flex h-10 items-center gap-2 rounded-full bg-destructive px-5 text-sm font-semibold text-destructive-foreground disabled:opacity-40">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} Confirm
                </button>
                <button type="button" disabled={busy} onClick={() => { setConfirming(false); setTyped(""); }} className="h-10 rounded-full border border-border px-4 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-destructive" role="alert">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </section>
  );
}
