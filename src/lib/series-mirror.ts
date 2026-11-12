import { getDb } from "@/lib/firebase";

/**
 * Keeps the admin record (series/{franchise}/seasons/{anilistId}/episodes/{n}) in step with the live
 * episode list when something is deleted, so no stale or orphaned copies are left behind.
 * Best effort: the live list (what the player reads) is always changed first by the caller.
 */
const SERIES = "series";
const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "");

async function ownersOf(anilistId: number) {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const snap = await fs.getDocs(fs.query(fs.collection(db, SERIES), fs.where("seasonIds", "array-contains", anilistId)));
  return { db, fs, owners: snap.docs.map((d) => d.id) };
}

/** Mirror deleteEpisodes(): whole episodes, one language, or one server. */
export async function mirrorEpisodeDelete(anilistId: number, numbers: number[], lang?: "sub" | "dub", server?: string) {
  try {
    const { db, fs, owners } = await ownersOf(anilistId);
    for (const fid of owners)
      for (const n of numbers) {
        const ref = fs.doc(db, SERIES, fid, "seasons", String(anilistId), "episodes", String(n));
        if (!lang && !server) {
          await fs.deleteDoc(ref);
          continue;
        }
        const snap = await fs.getDoc(ref);
        const servers = snap.data()?.servers;
        if (!snap.exists() || !servers || typeof servers !== "object") continue;
        const args: unknown[] = [];
        for (const [k, v] of Object.entries(servers as Record<string, Record<string, unknown>>)) {
          if (server && k !== keyOf(server)) continue;
          const langs = lang ? [lang] : (["sub", "dub"] as const);
          const remaining = (["sub", "dub"] as const).filter((l) => !langs.includes(l as never) && typeof v?.[l] === "string" && v[l]);
          if (!remaining.length) args.push(new fs.FieldPath("servers", k), fs.deleteField());
          else for (const l of langs) args.push(new fs.FieldPath("servers", k, l), fs.deleteField());
        }
        if (args.length) {
          const [p, val, ...rest] = args as [import("firebase/firestore").FieldPath, unknown, ...unknown[]];
          await fs.updateDoc(ref, p, val, ...rest);
        }
      }
  } catch {
    /* the live list is already correct */
  }
}

/** Mirror deleteAnime(): remove this title's season + episode records and detach it from its series. */
export async function mirrorAnimeDelete(anilistId: number) {
  try {
    const { db, fs, owners } = await ownersOf(anilistId);
    for (const fid of owners) {
      const eps = await fs.getDocs(fs.collection(db, SERIES, fid, "seasons", String(anilistId), "episodes"));
      for (let i = 0; i < eps.docs.length; i += 400) {
        const batch = fs.writeBatch(db);
        for (const d of eps.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
      await fs.deleteDoc(fs.doc(db, SERIES, fid, "seasons", String(anilistId)));
      const parent = fs.doc(db, SERIES, fid);
      await fs.updateDoc(parent, { seasonIds: fs.arrayRemove(anilistId), updatedAt: fs.serverTimestamp() });
      const left = await fs.getDoc(parent);
      if (!(Array.isArray(left.data()?.seasonIds) && (left.data()!.seasonIds as unknown[]).length)) await fs.deleteDoc(parent);
    }
  } catch {
    /* nothing more to clean */
  }
}
