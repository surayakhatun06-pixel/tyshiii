import { useEffect, useMemo, useState } from "react";

import { useVideos, type SavedVideo } from "@/hooks/use-videos";
import {
  episodeSources,
  watchEpisodeList,
  type CloudEpisode,
} from "@/lib/cloud-episodes";
import { describeFirebaseError, firebaseConfigured } from "@/lib/firebase";

export function cloudEpisodeId(number: number) {
  return `ep-${number}`;
}

function toSaved(animeId: number, ep: CloudEpisode): SavedVideo {
  return {
    id: cloudEpisodeId(ep.number),
    url: episodeSources(ep)[0].url,
    title: ep.title || `Episode ${ep.number}`,
    addedAt: 0,
    animeId,
    episode: ep.number,
    thumbnail: ep.thumbnail,
    subUrl: ep.subUrl,
    dubUrl: ep.dubUrl,
    servers: ep.servers,
    cloud: true,
  };
}

/** Live Firestore episodes for the given titles. */
export function useCloudEpisodes(animeIds: number[]) {
  const key = [
    ...new Set(animeIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ]
    .sort((a, b) => a - b)
    .join(",");
  const [byAnime, setByAnime] = useState<Map<number, SavedVideo[]>>(new Map());
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Map<number, string>>(new Map());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured || !key) return;
    const ids = key.split(",").map(Number);
    setLoaded(new Set());
    setErrors(new Map());
    const stops = ids.map((id) =>
      watchEpisodeList(
        id,
        (episodes, offline) => {
          setByAnime((m) =>
            new Map(m).set(
              id,
              episodes.map((e) => toSaved(id, e)),
            ),
          );
          setLoaded((s) => new Set(s).add(id));
          setErrors((m) => {
            const next = new Map(m);
            if (offline)
              next.set(
                id,
                "Couldn't load the saved episodes. Check your connection.",
              );
            else next.delete(id);
            return next;
          });
        },
        (error) => {
          console.error(error);
          setLoaded((s) => new Set(s).add(id));
          setErrors((m) => new Map(m).set(id, describeFirebaseError(error)));
        },
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [key, attempt]);

  const ids = useMemo(() => (key ? key.split(",").map(Number) : []), [key]);
  const current = useMemo(
    () =>
      new Map(
        ids.flatMap((id) => {
          const eps = byAnime.get(id);
          return eps ? [[id, eps] as const] : [];
        }),
      ),
    [ids, byAnime],
  );
  const ready = !firebaseConfigured || ids.every((id) => loaded.has(id));
  const error = ids.map((id) => errors.get(id)).find(Boolean) ?? null;
  return {
    byAnime: current,
    ready,
    error,
    retry: () => setAttempt((a) => a + 1),
  };
}

/**
 * Browser-saved episodes plus Firestore episodes for the given titles. When both
 * have the same episode number, the Firestore one wins (it's what every visitor sees).
 */
export function useEpisodeLibrary(animeIds: number[]) {
  const { videos: local, ready: localReady } = useVideos();
  const cloud = useCloudEpisodes(animeIds);

  const videos = useMemo(() => {
    if (!cloud.byAnime.size) return local;
    const taken = new Map<number, Set<number>>();
    const cloudVideos: SavedVideo[] = [];
    for (const [animeId, eps] of cloud.byAnime) {
      taken.set(animeId, new Set(eps.map((e) => e.episode!)));
      cloudVideos.push(...eps);
    }
    const kept = local.filter(
      (v) =>
        v.animeId === undefined ||
        v.episode === undefined ||
        !taken.get(v.animeId)?.has(v.episode),
    );
    return [...kept, ...cloudVideos];
  }, [local, cloud.byAnime]);

  return {
    videos,
    ready: localReady && cloud.ready,
    error: cloud.error,
    retry: cloud.retry,
  };
}
