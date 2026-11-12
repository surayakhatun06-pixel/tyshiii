import type { FieldPath } from "firebase/firestore";

import { getDb } from "@/lib/firebase";
import { DEFAULT_SERVER, EPISODE_LISTS, isDefaultServer } from "@/lib/cloud-episodes";

export type ServerLinkTrack = "sub" | "dub" | "both";
export type ServerLinkReplacementSummary = { titles: number; episodes: number; links: number };

type ReplacementOptions = {
  serverName: string;
  track: ServerLinkTrack;
  findText: string;
  replaceText: string;
  apply?: boolean;
  onProgress?: (completed: number, total: number) => void;
};

/** Replace a matching part of one named server's saved links across every anime in Firestore. */
export async function replaceServerLinkText({
  serverName,
  track,
  findText,
  replaceText,
  apply = false,
  onProgress,
}: ReplacementOptions): Promise<ServerLinkReplacementSummary> {
  const needle = findText.trim();
  const replacement = replaceText.trim();
  const name = serverName.trim();
  if (!name || !needle || !replacement) throw new Error("Choose a server, and enter both the text to find and its replacement.");
  if (needle.length > 1000 || replacement.length > 1000)
    throw new Error("The search and replacement text must be 1,000 characters or fewer.");

  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const snapshot = await fs.getDocs(fs.collection(db, EPISODE_LISTS));
  const fields = track === "both" ? (["subUrl", "dubUrl"] as const) : ([track === "sub" ? "subUrl" : "dubUrl"] as const);
  const changes: { ref: ReturnType<typeof fs.doc>; updates: [FieldPath, string][] }[] = [];
  let episodesChanged = 0;
  let linksChanged = 0;

  for (const record of snapshot.docs) {
    const rawEpisodes = record.data().episodes;
    if (!rawEpisodes || typeof rawEpisodes !== "object" || Array.isArray(rawEpisodes)) continue;
    const updates: [FieldPath, string][] = [];
    let changedEpisodes = 0;

    for (const [episodeKey, rawEpisode] of Object.entries(rawEpisodes as Record<string, unknown>)) {
      if (!rawEpisode || typeof rawEpisode !== "object" || Array.isArray(rawEpisode)) continue;
      const episode = rawEpisode as Record<string, unknown>;
      let changedThisEpisode = false;

      if (isDefaultServer(name)) {
        for (const field of fields) {
          const value = episode[field];
          if (typeof value !== "string" || !value.includes(needle)) continue;
          updates.push([new fs.FieldPath("episodes", episodeKey, field), value.split(needle).join(replacement)]);
          changedThisEpisode = true;
          linksChanged++;
        }
      } else {
        const servers = (episode.servers && typeof episode.servers === "object" ? episode.servers : {}) as Record<string, unknown>;
        const actualName = Object.keys(servers).find((key) => key.toLowerCase() === name.toLowerCase());
        const server = actualName ? servers[actualName] : undefined;
        if (actualName && server && typeof server === "object" && !Array.isArray(server)) {
          for (const field of fields) {
            const value = (server as Record<string, unknown>)[field];
            if (typeof value !== "string" || !value.includes(needle)) continue;
            updates.push([new fs.FieldPath("episodes", episodeKey, "servers", actualName, field), value.split(needle).join(replacement)]);
            changedThisEpisode = true;
            linksChanged++;
          }
        }
      }

      if (changedThisEpisode) changedEpisodes++;
    }

    if (updates.length) {
      changes.push({ ref: fs.doc(db, EPISODE_LISTS, record.id), updates });
      episodesChanged += changedEpisodes;
    }
  }

  const summary = { titles: changes.length, episodes: episodesChanged, links: linksChanged };
  if (!apply || changes.length === 0) return summary;

  // Keep batches under Firestore's 500-write limit and only update matched links, so
  // concurrent edits to other episodes and servers are preserved.
  const chunkSize = 200;
  for (let offset = 0; offset < changes.length; offset += chunkSize) {
    const batch = fs.writeBatch(db);
    const chunk = changes.slice(offset, offset + chunkSize);
    for (const change of chunk) {
      const args: unknown[] = [];
      for (const [path, value] of change.updates) args.push(path, value);
      args.push("updatedAt", fs.serverTimestamp());
      const [firstPath, firstValue, ...rest] = args as [FieldPath, unknown, ...unknown[]];
      batch.update(change.ref, firstPath, firstValue, ...rest);
    }
    await batch.commit();
    onProgress?.(Math.min(offset + chunk.length, changes.length), changes.length);
  }
  return summary;
}

export const defaultServerLabel = DEFAULT_SERVER;
