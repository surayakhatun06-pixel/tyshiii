import { useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { inputCls, panel } from "@/components/admin/ui";
import { linksOf, modeOf, type LinkMode, type ServerTemplate } from "@/lib/bulk-import";
import { getAuthClient } from "@/lib/firebase";
import {
  addServerToTitle,
  applyReplacePlan,
  buildReplacePlan,
  connectedIds,
  logAdminAction,
  ruleProblems,
  type ReplacePlan,
  type ReplaceRule,
} from "@/lib/server-replace";
import { cn } from "@/lib/utils";

const ON_KEY = "tyshi-assistant-on";
const ENDPOINT = "/api/admin-assistant";

type Proposed = {
  kind: "replace_links" | "delete_links" | "add_server";
  summary: string;
  scope: "current" | "series" | "all";
  server: string;
  mode: LinkMode;
  tracks: ("sub" | "dub")[];
  sub_pattern?: string;
  dub_pattern?: string;
};

/** Accept only the approved shape. Anything else from the server is ignored. */
function parseAction(raw: unknown): Proposed | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const kind = a.kind;
  if (kind !== "replace_links" && kind !== "delete_links" && kind !== "add_server") return null;
  const scope = a.scope === "series" || a.scope === "all" ? a.scope : "current";
  const tracks = Array.isArray(a.tracks) ? a.tracks.filter((t): t is "sub" | "dub" => t === "sub" || t === "dub") : [];
  if (typeof a.server !== "string" || !a.server.trim() || !tracks.length) return null;
  return {
    kind,
    summary: typeof a.summary === "string" ? a.summary.slice(0, 300) : "",
    scope,
    server: a.server.trim().slice(0, 24),
    mode: a.mode === "tmdb" ? "tmdb" : "anilist",
    tracks,
    sub_pattern: typeof a.sub_pattern === "string" ? a.sub_pattern.trim().slice(0, 1000) : undefined,
    dub_pattern: typeof a.dub_pattern === "string" ? a.dub_pattern.trim().slice(0, 1000) : undefined,
  };
}

/**
 * Optional admin assistant. It turns a sentence into ONE proposed change; this panel then builds the same
 * preview as the manual tools and asks for confirmation before anything is written.
 */
export function AssistantPanel({ animeId, servers }: { animeId?: number; servers: ServerTemplate[] }) {
  const [enabled, setEnabled] = useState(() => {
    try { return window.localStorage.getItem(ON_KEY) === "1"; } catch { return false; }
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [action, setAction] = useState<Proposed | null>(null);
  const [plan, setPlan] = useState<ReplacePlan | null>(null);
  const [addInfo, setAddInfo] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [ids, setIds] = useState<number[] | "all">([]);

  const setOn = (v: boolean) => {
    setEnabled(v);
    try { window.localStorage.setItem(ON_KEY, v ? "1" : "0"); } catch { /* kept for this visit */ }
  };

  async function ask() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setReply(""); setAction(null); setPlan(null); setAddInfo(null); setTyped("");
    try {
      const auth = await getAuthClient();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in as admin first.");
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          context: {
            selectedAnimeId: animeId ?? null,
            savedServers: servers.map((s) => ({ name: s.label, mode: modeOf(s), sub: linksOf(s).sub, dub: linksOf(s).dub })).slice(0, 20),
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; action?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? `The assistant returned ${res.status}.`);
      setReply(data.reply ?? "");
      const act = parseAction(data.action);
      if (!act) return;
      if (act.scope !== "all" && !animeId) {
        setReply((r) => `${r}\n\nOpen an anime first (Episodes tab), or say "for all titles".`.trim());
        return;
      }
      setAction(act);
      const scopeIds = act.scope === "all" ? ("all" as const) : act.scope === "series" ? await connectedIds(animeId!) : [animeId!];
      setIds(scopeIds);
      if (act.kind === "add_server") {
        const pattern = act.sub_pattern || act.dub_pattern || "";
        if (act.mode === "tmdb") setAddInfo("TMDB servers need season mapping. Use Bulk import for this one; the assistant only adds AniList-style servers.");
        else if (scopeIds === "all") setAddInfo("Adding a server to every title is too large for the assistant. Pick one anime or a series.");
        else if (!pattern) setAddInfo("I need a SUB or DUB pattern to add a server.");
        else setAddInfo(`Will add “${act.server}” (${act.tracks.map((t) => t.toUpperCase()).join(" + ")}) to the episodes already on ${scopeIds.length} title(s). Existing links are kept.`);
        return;
      }
      const rule: ReplaceRule = { label: act.server, mode: act.mode, remove: act.kind === "delete_links" };
      for (const t of act.tracks) {
        if (act.kind === "delete_links") rule[t] = "";
        else rule[t] = (t === "sub" ? act.sub_pattern : act.dub_pattern) ?? "";
      }
      const bad = act.kind === "replace_links" ? ruleProblems([rule]) : null;
      if (bad) { setReply((r) => `${r}\n\n${bad}`.trim()); setAction(null); return; }
      setPlan(await buildReplacePlan([rule], { animeIds: scopeIds }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The assistant isn't available.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "add_server" && Array.isArray(ids)) {
        let added = 0;
        for (const id of ids) {
          const r = await addServerToTitle(id, action.server, action.tracks.includes("sub") ? (action.sub_pattern ?? "") : "", action.tracks.includes("dub") ? (action.dub_pattern ?? "") : "");
          added += r.added;
        }
        await logAdminAction("assistant-add-server", `Assistant added ${action.server}: ${added} links on ${ids.length} title(s).`, { server: action.server, added }, "assistant");
        toast.success(`Added ${added} links.`);
      } else if (plan) {
        const r = await applyReplacePlan(plan);
        await logAdminAction("assistant-" + action.kind, `Assistant request: ${action.summary}`, { replaced: r.replaced, emptied: r.emptied }, "assistant");
        if (r.errors.length) toast.error(`${r.errors.length} title(s) failed.`);
        else toast.success(`Done: ${r.replaced} replaced, ${r.emptied} emptied.`);
      }
      setAction(null); setPlan(null); setAddInfo(null); setTyped(""); setReply("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The change failed.");
    } finally {
      setBusy(false);
    }
  }

  const word = action?.kind === "delete_links" ? "DELETE" : "CONFIRM";
  const canRun = !!action && (action.kind === "add_server" ? !!addInfo?.startsWith("Will add") : !!plan?.links);

  return (
    <section className={cn(panel, "mt-5")} aria-labelledby="assistant-title">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-primary" />
        <h2 id="assistant-title" className="mr-auto font-semibold">Admin assistant <span className="text-xs font-normal text-muted-foreground">optional</span></h2>
        <label className="flex min-h-9 items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Use it
        </label>
      </div>
      {!enabled ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Type a request like “Add Server 2 to this anime with this SUB and DUB pattern” and it prepares the change for you to preview. Before you switch it on: every request is one paid AI call. A short request is roughly 1–2 thousand tokens in and a few hundred out, billed by Anthropic at your model's per-token price (check their pricing page for the exact amount), and you pay only when you press Send. It needs the Netlify settings from the v17.4 notes (ASSISTANT_ENABLED and ANTHROPIC_API_KEY); the key is never in the browser. It can only propose replace, delete or add-server changes, and nothing is saved until you confirm.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {animeId ? `Working on the anime you opened (ID ${animeId}).` : "No anime is open. Open one from Episodes, or ask about all titles."} Each Send is one paid AI call.
          </p>
          <div className="mt-2 flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void ask()} placeholder="e.g. Replace Server 2 SUB with https://host/anime/{id}/{ep} for all seasons" className={inputCls} maxLength={1500} />
            <button type="button" onClick={() => void ask()} disabled={busy || !text.trim()} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          {reply && <p className="mt-3 whitespace-pre-wrap text-sm">{reply}</p>}
          {action && (
            <div className="mt-3 rounded-xl border border-border p-3 text-xs">
              <p className="font-semibold">{action.summary || action.kind}</p>
              {addInfo && <p className="mt-1 text-muted-foreground">{addInfo}</p>}
              {plan && (
                <p className="mt-1 text-muted-foreground">
                  {plan.links} link(s) in {plan.episodes} episode(s) across {plan.titles.length} title(s). {plan.emptied ? `${plan.emptied} cannot be made and will be left empty (old link removed). ` : ""}Other servers, tracks and titles stay as they are.
                  {plan.titles.slice(0, 5).map((t) => <span key={t.animeId} className="block">• {t.title}: {t.rows.length} link(s)</span>)}
                </p>
              )}
              {canRun && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {action.kind !== "add_server" && <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${word}`} className={cn(inputCls, "w-36")} />}
                  <button type="button" disabled={busy || (action.kind !== "add_server" && typed.trim().toUpperCase() !== word)} onClick={() => void confirm()} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null} Confirm and save
                  </button>
                  <button type="button" disabled={busy} onClick={() => { setAction(null); setPlan(null); setAddInfo(null); }} className="h-10 rounded-full border border-border px-4 text-sm">Cancel</button>
                </div>
              )}
              {action && !canRun && <button type="button" onClick={() => { setAction(null); setPlan(null); setAddInfo(null); }} className="mt-2 h-9 rounded-full border border-border px-4 text-xs">Dismiss</button>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
