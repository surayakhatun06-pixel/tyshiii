import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { panel } from "@/components/admin/ui";
import { getDb } from "@/lib/firebase";

type Row = { name: string; docs: number; bytes: number; note?: string };

const bytesOf = (v: unknown) => new Blob([JSON.stringify(v ?? null)]).size;
const fmt = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : `${(n / 1024).toFixed(1)} KiB`);
/** Count indexed leaf fields: Firestore keeps ~2 automatic index entries per leaf (asc + desc). */
function leaves(v: unknown): number {
  if (v && typeof v === "object" && !Array.isArray(v)) return Object.values(v as Record<string, unknown>).reduce<number>((n, x) => n + leaves(x), 0);
  return 1;
}

/**
 * Read-only. Estimates where Firestore storage goes. "Full" also reads every per-episode record
 * (one read each), so it is optional. Nothing is changed or deleted.
 */
export function StorageReport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [indexEntries, setIndexEntries] = useState(0);

  async function run(full: boolean) {
    if (full && !window.confirm("The full report reads every episode record once (one Firestore read each, maybe several thousand). Continue?")) return;
    setBusy(true);
    try {
      const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
      const out: Row[] = [];
      let idx = 0;
      const scan = async (name: string, path: string[], note?: string) => {
        const snap = await fs.getDocs(fs.collection(db, path[0], ...path.slice(1)));
        let b = 0;
        for (const d of snap.docs) {
          const data = d.data();
          b += bytesOf(data) + d.id.length + 32;
          idx += leaves(data) * 2;
        }
        out.push({ name, docs: snap.size, bytes: b, note });
        return snap;
      };
      await scan("anime (library cards)", ["anime"]);
      await scan("episodeLists (what the player reads)", ["episodeLists"], "One big document per anime; every episode and every server link is a field inside it.");
      const series = await scan("series (franchise records)", ["series"]);
      let seasons = 0;
      let seasonBytes = 0;
      let eps = 0;
      let epBytes = 0;
      for (const s of series.docs) {
        const ss = await fs.getDocs(fs.collection(db, "series", s.id, "seasons"));
        seasons += ss.size;
        for (const x of ss.docs) {
          seasonBytes += bytesOf(x.data()) + 40;
          idx += leaves(x.data()) * 2;
          if (full) {
            const es = await fs.getDocs(fs.collection(db, "series", s.id, "seasons", x.id, "episodes"));
            eps += es.size;
            for (const e of es.docs) {
              epBytes += bytesOf(e.data()) + 48;
              idx += leaves(e.data()) * 2;
            }
          } else eps += Number(x.data().importedThrough ?? x.data().episodeCount ?? 0);
        }
      }
      out.push({ name: "series seasons", docs: seasons, bytes: seasonBytes });
      out.push({ name: full ? "series episodes (admin copy)" : "series episodes (admin copy, estimated count; run Full for size)", docs: eps, bytes: epBytes, note: "A second copy of the same episodes that episodeLists already holds." });
      for (const c of ["animeRequests", "siteVisits", "presence"]) {
        try { await scan(c, [c]); } catch { /* collection may not exist yet */ }
      }
      setRows(out);
      setIndexEntries(idx);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the report.");
    } finally {
      setBusy(false);
    }
  }

  const total = rows?.reduce((n, r) => n + r.bytes, 0) ?? 0;
  return (
    <section className={`${panel} mt-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <Database className="size-4 text-primary" />
        <h2 className="mr-auto font-semibold">Storage report <span className="text-xs font-normal text-muted-foreground">read-only</span></h2>
        <button type="button" disabled={busy} onClick={() => void run(false)} className="h-10 rounded-full border border-border px-4 text-xs font-semibold hover:border-primary/60 disabled:opacity-40">{busy ? <Loader2 className="inline size-3.5 animate-spin" /> : null} Quick report</button>
        <button type="button" disabled={busy} onClick={() => void run(true)} className="h-10 rounded-full border border-border px-4 text-xs font-semibold hover:border-primary/60 disabled:opacity-40">Full report</button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Estimates where the Firestore storage goes. It changes and deletes nothing.</p>
      {rows && (
        <div className="mt-3 text-xs">
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.name} className="rounded-lg bg-surface-2/50 p-2">
                <div className="flex justify-between gap-2"><b>{r.name}</b><span className="shrink-0 tabular-nums">{r.docs.toLocaleString()} docs · {r.bytes ? fmt(r.bytes) : "—"}</span></div>
                {r.note && <p className="mt-0.5 text-muted-foreground">{r.note}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-semibold">Data ≈ {fmt(total)} · automatic index entries ≈ {indexEntries.toLocaleString()} (Firestore adds about 2 per field, and they count toward storage on top of the data). Firestore's own Usage page shows the exact total.</p>
        </div>
      )}
    </section>
  );
}
