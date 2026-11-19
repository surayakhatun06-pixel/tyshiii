import { useEffect, useState } from "react";
import { getDb } from "@/lib/firebase";
import { Boxes, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { LinkGenerator } from "@/components/admin/link-generator";
import { GlobalServerUpdate } from "@/components/admin/global-server-update";
import { AssistantPanel } from "@/components/admin/assistant-panel";
import { ServerReplace } from "@/components/admin/server-replace";
import { MAX_SERVERS, ServerList, useServers } from "@/components/admin/server-list";
import { AdminHeader, AdminLink, inputCls, panel } from "@/components/admin/ui";
import { linksOf, modeOf, type ServerTemplate } from "@/lib/bulk-import";
import { cn } from "@/lib/utils";

/**
 * Your saved links, set up once. Each one is a pattern for SUB and DUB (AniList or TMDB). Switch the ones
 * you want on, and Bulk import uses exactly those for every anime.
 */
export function ServersView({ animeId }: { animeId?: number }) {
  const { servers, save, patch, add, remove, copy, cloud } = useServers();
  const [tab, setTab] = useState<"anilist" | "tmdb">("anilist");
  // Each tab shows only its own servers; indices map back to the one saved list, so the other tab is never touched.
  const shown = servers.map((s, real) => ({ s, real })).filter((x) => modeOf(x.s) === tab);
  const [restoring, setRestoring] = useState(false);
  const [backup, setBackup] = useState("");
  // Opened from one anime: start with that anime and every season/movie/OVA connected to it.
  const [preset, setPreset] = useState<number[] | undefined>(undefined);
  useEffect(() => {
    if (!animeId) return setPreset(undefined);
    let live = true;
    void (async () => {
      let ids = [animeId];
      try {
        const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
        const snap = await fs.getDocs(fs.query(fs.collection(db, "series"), fs.where("seasonIds", "array-contains", animeId)));
        const found = snap.docs.flatMap((d) => (Array.isArray(d.data().seasonIds) ? (d.data().seasonIds as number[]) : []));
        if (found.length) ids = [...new Set(found)];
      } catch {
        /* just this anime */
      }
      if (live) setPreset(ids);
    })();
    return () => { live = false; };
  }, [animeId]);
  const on = shown.filter((x) => !x.s.off).length;

  async function copyBackup() {
    const data = servers.map((s) => ({ label: s.label, mode: modeOf(s), subLink: linksOf(s).sub, dubLink: linksOf(s).dub, ...(s.off ? { off: true } : {}) }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(data));
      toast.success(`Copied ${data.length} links. Paste them into "Restore" on another browser or site.`);
    } catch {
      toast.error("Your browser blocked copying.");
    }
  }

  function restore() {
    try {
      const raw = JSON.parse(backup) as unknown;
      if (!Array.isArray(raw)) throw new Error("not a list");
      const incoming = raw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string")
        .map((x): ServerTemplate => ({
          label: String(x.label).slice(0, 24),
          mode: x.mode === "tmdb" ? "tmdb" : "anilist",
          subLink: typeof x.subLink === "string" ? x.subLink : "",
          dubLink: typeof x.dubLink === "string" ? x.dubLink : "",
          ...(x.off === true ? { off: true } : {}),
        }));
      if (!incoming.length) throw new Error("empty");
      // Same name = updated, new name = added.
      const out = [...servers.filter((s) => s.subLink || s.dubLink || linksOf(s).sub || linksOf(s).dub)];
      for (const item of incoming) {
        const at = out.findIndex((x) => x.label.trim().toLowerCase() === item.label.trim().toLowerCase());
        if (at >= 0) out[at] = item;
        else out.push(item);
      }
      save(out.slice(0, MAX_SERVERS));
      setBackup("");
      setRestoring(false);
      toast.success(`Restored ${incoming.length} links.`);
    } catch {
      toast.error("That isn't a links backup. Use the text from \"Copy backup\".");
    }
  }

  return (
    <>
      <AdminHeader title="Saved links" subtitle="Save your link patterns once. Switch on the ones you want, and Bulk import uses them for every anime." />
      <LinkGenerator
        onSave={(made) => {
          // The empty starter link is replaced instead of left behind.
          const untouched = servers.length === 1 && !linksOf(servers[0]).sub && !linksOf(servers[0]).dub;
          if (!untouched && servers.length >= MAX_SERVERS && !servers.some((x) => x.label.trim().toLowerCase() === made.label.trim().toLowerCase()))
            return toast.error(`You can save up to ${MAX_SERVERS} links. Remove one first.`);
          const name = made.label.trim().toLowerCase();
          const clash = servers.findIndex((x) => x.label.trim().toLowerCase() === name);
          const next = untouched ? [made] : clash >= 0 ? servers.map((x, i) => (i === clash ? made : x)) : [...servers, made];
          save(next);
          setTab(made.mode);
          toast.success(clash >= 0 && !untouched ? `Updated ${made.label}.` : `Saved ${made.label}.`);
        }}
      />
      <section className={panel}>
        <div role="tablist" aria-label="Link type" className="mb-3 inline-flex rounded-full border border-border p-0.5 text-sm font-semibold">
          {(["anilist", "tmdb"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={tab === m} onClick={() => setTab(m)} className={cn("min-h-10 rounded-full px-5", tab === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {m === "anilist" ? "AniList" : "TMDB"} <span className="text-[11px] opacity-70">({servers.filter((x) => modeOf(x) === m).length})</span>
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {tab === "anilist"
            ? "AniList servers build links from the AniList ID and the episode number: {id} and {ep}."
            : "TMDB servers build links from the TMDB ID, the season and the episode inside that season: {tmdb}, {season} and {ep}."}{" "}
          Switching tabs never changes the other tab's servers, patterns or switches.{" "}
          {cloud === "saved" ? "Saved in this browser and to your admin-only Firebase settings." : cloud === "local" ? "Saved in this browser only (couldn't reach Firebase)." : "Checking Firebase…"}
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold">
            Your {tab === "anilist" ? "AniList" : "TMDB"} links <span className="text-xs font-normal text-muted-foreground">{on} of {shown.length} switched on</span>
          </p>
          <button type="button" onClick={() => save(servers.map((s) => (modeOf(s) === tab ? { ...s, off: false } : s)))} className="min-h-9 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            All on
          </button>
          <button type="button" onClick={() => save(servers.map((s) => (modeOf(s) === tab ? { ...s, off: true } : s)))} className="min-h-9 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            All off
          </button>
        </div>
        <ServerList
          servers={shown.map((x) => x.s)}
          onPatch={(i, p) => patch(shown[i].real, p)}
          onAdd={() => add(tab)}
          onRemove={(i) => remove(shown[i].real)}
          onCopy={(i) => copy(shown[i].real)}
        />
      </section>

      <AssistantPanel animeId={animeId} servers={servers} />

      <details className="mt-5 rounded-2xl border border-border bg-surface/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Advanced: delete a server’s imported links</summary>
        <p className="mt-2 text-xs text-muted-foreground">To change links, use Bulk import: it replaces the old links of the servers you leave switched on. Use this only to delete a server’s links without importing.</p>
        <ServerReplace key={(preset ?? []).join(",")} servers={servers} mode={tab} presetIds={preset} />
      </details>

      <details className="mt-5 rounded-2xl border border-border bg-surface/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Advanced: find and replace part of every link</summary>
        <GlobalServerUpdate serverNames={servers.map((server) => server.label.trim()).filter(Boolean)} />
      </details>

      <section className={cn(panel, "mt-5")}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold">
            Backup
            <span className="block text-xs font-normal text-muted-foreground">Links are saved in this browser. The localhost page and your Netlify site each have their own, so copy them across here.</span>
          </p>
          <button type="button" onClick={() => void copyBackup()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-xs font-semibold transition hover:border-primary">
            <Download className="size-3.5" /> Copy backup
          </button>
          <button type="button" onClick={() => setRestoring((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-xs font-semibold transition hover:border-primary">
            <Upload className="size-3.5" /> Restore
          </button>
        </div>
        {restoring && (
          <div className="mt-3 space-y-2">
            <textarea value={backup} onChange={(e) => setBackup(e.target.value)} rows={4} spellCheck={false} placeholder="Paste the backup text here" className={cn(inputCls, "h-auto py-2 font-mono text-xs")} />
            <button type="button" onClick={restore} disabled={!backup.trim()} className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
              Restore these links
            </button>
          </div>
        )}
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 p-4">
        <p className="text-xs text-muted-foreground">Saved automatically in this browser. Next, bring a franchise in with the links you switched on.</p>
        <AdminLink
          s={{ view: "bulk" }}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          <Boxes className="size-4" /> Bulk import
        </AdminLink>
      </div>
    </>
  );
}
