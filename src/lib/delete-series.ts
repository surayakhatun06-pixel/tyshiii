import { getDb } from "@/lib/firebase";
import { deleteAnime } from "@/lib/cloud-episodes";
import { parseSpotlight, saveSpotlight, SITE_CONFIG, SPOTLIGHT_DOC } from "@/lib/spotlight";
import { SERIES } from "@/lib/bulk-import";

/**
 * Remove a series and everything related to it:
 *  - its episode list and details (the player's data),
 *  - its Spotlight slide on the home page,
 *  - its bulk-import records: series/{franchise}/seasons/{id} and all of that season's episodes
 *    (a franchise record that ends up with no seasons is removed too).
 * Safe to run again if it stops part-way.
 */

export type FranchiseInfo = { id: string; title: string; seasonIds: number[] };

type Fs = typeof import("firebase/firestore");
type Db = Awaited<ReturnType<typeof getDb>>;
const CHUNK = 450;

/** Franchise records (from Bulk import) that include this title. */
export async function findFranchises(anilistId: number): Promise<FranchiseInfo[]> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const snap = await fs.getDocs(fs.query(fs.collection(db, SERIES), fs.where("seasonIds", "array-contains", anilistId)));
  return snap.docs.map((d) => ({
    id: d.id,
    title: String(d.data().title ?? d.id),
    seasonIds: ((d.data().seasonIds ?? []) as unknown[]).map(Number).filter(Number.isSafeInteger),
  }));
}

async function deleteSeasonRecords(fs: Fs, db: Db, franchiseId: string, seasonId: number) {
  const episodes = await fs.getDocs(fs.collection(db, SERIES, franchiseId, "seasons", String(seasonId), "episodes"));
  for (let i = 0; i < episodes.docs.length; i += CHUNK) {
    const batch = fs.writeBatch(db);
    for (const d of episodes.docs.slice(i, i + CHUNK)) batch.delete(d.ref);
    await batch.commit();
  }
  await fs.deleteDoc(fs.doc(db, SERIES, franchiseId, "seasons", String(seasonId)));
}

/** Delete every title in `ids` with all related data. `onStep` reports plain-language progress. */
export async function deleteSeriesEverywhere(ids: number[], onStep?: (text: string) => void): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const wanted = new Set(ids);

  // 1. Bulk-import records.
  onStep?.("Removing bulk-import records…");
  const all = await fs.getDocs(fs.collection(db, SERIES));
  for (const series of all.docs) {
    const seasonIds = ((series.data().seasonIds ?? []) as unknown[]).map(Number);
    const mine = seasonIds.filter((n) => wanted.has(n));
    if (!mine.length) continue;
    for (const seasonId of mine) await deleteSeasonRecords(fs, db, series.id, seasonId);
    const left = await fs.getDocs(fs.collection(db, SERIES, series.id, "seasons"));
    if (left.empty) await fs.deleteDoc(series.ref);
    else await fs.updateDoc(series.ref, { seasonIds: fs.arrayRemove(...mine) });
  }

  // 2. Spotlight slides.
  onStep?.("Checking the Spotlight…");
  const spot = await fs.getDoc(fs.doc(db, SITE_CONFIG, SPOTLIGHT_DOC));
  if (spot.exists()) {
    const slides = parseSpotlight(spot.data());
    const kept = slides.filter((s) => !wanted.has(s.anilistId));
    if (kept.length !== slides.length) await saveSpotlight(kept);
  }

  // 3. The titles themselves (episode lists and details).
  for (const [i, id] of ids.entries()) {
    onStep?.(`Deleting episodes and details (${i + 1}/${ids.length})…`);
    await deleteAnime(id);
  }
}
