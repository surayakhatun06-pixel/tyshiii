import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { panel } from "@/components/admin/ui";
import { getDb } from "@/lib/firebase";

type Entry = { id: string; summary: string; source: string; at: Date | null };

/** The last admin changes made through bulk replace / delete and the assistant. Read-only. */
export function ActivityLog() {
  const [items, setItems] = useState<Entry[] | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
        const snap = await fs.getDocs(fs.query(fs.collection(db, "adminLog"), fs.orderBy("at", "desc"), fs.limit(10)));
        if (live) setItems(snap.docs.map((d) => ({ id: d.id, summary: String(d.data().summary ?? ""), source: String(d.data().source ?? "admin"), at: d.data().at?.toDate?.() ?? null })));
      } catch {
        if (live) setItems([]);
      }
    })();
    return () => { live = false; };
  }, []);
  return (
    <section className={`${panel} mt-5`}>
      <h2 className="flex items-center gap-2 font-semibold"><History className="size-4 text-primary" /> Admin activity</h2>
      {items === null ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : items.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No logged changes yet.</p> : (
        <ul className="mt-2 space-y-1 text-xs">
          {items.map((i) => <li key={i.id} className="flex gap-2"><span className="shrink-0 text-muted-foreground tabular-nums">{i.at ? i.at.toLocaleString() : ""}</span><span>{i.source === "assistant" ? "🤖 " : ""}{i.summary}</span></li>)}
        </ul>
      )}
    </section>
  );
}
