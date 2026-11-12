import { useCallback, useEffect, useState } from "react";

export type SavedVideo = {
  id: string;
  /** Internal playback URL. Never shown in the watch UI. */
  url: string;
  title: string;
  addedAt: number;
  /** Set when the link was saved from an anime page. */
  animeId?: number;
  /** Episode number (1, 2, 3...). */
  episode?: number;
  /** Optional episode art. Falls back to the anime artwork when empty. */
  thumbnail?: string;
  seriesName?: string;
  seriesLogo?: string;
  /** Firestore episodes only: SUB and DUB links of the default server. `url` is the default one. */
  subUrl?: string;
  dubUrl?: string;
  /** Firestore episodes only: extra named servers, each with its own SUB / DUB link. */
  servers?: Record<string, { subUrl?: string; dubUrl?: string }>;
  /** True for episodes loaded from Firestore (shared with every visitor). */
  cloud?: boolean;
};

export type SavedVideoInput = Omit<SavedVideo, "id" | "addedAt">;

const KEY = "tyshi-videos-v1";
const EVENT = "tyshi-videos-change";

/** crypto.randomUUID() throws outside secure contexts (plain http on a LAN IP, not localhost). */
function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Migration/defaulting: records saved by earlier versions have no thumbnail and may
 * have odd titles. Fill in sensible defaults on read so nothing becomes unusable.
 */
function normalize(raw: unknown): SavedVideo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== "string" || !r.url.trim()) return null;

  const episodeNum =
    typeof r.episode === "string" ? parseInt(r.episode, 10) : r.episode;
  const episode =
    typeof episodeNum === "number" && Number.isFinite(episodeNum)
      ? episodeNum
      : undefined;
  const animeNum =
    typeof r.animeId === "string" ? parseInt(r.animeId, 10) : r.animeId;
  const animeId =
    typeof animeNum === "number" && Number.isFinite(animeNum)
      ? animeNum
      : undefined;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const thumbnail =
    typeof r.thumbnail === "string" && r.thumbnail.trim()
      ? r.thumbnail.trim()
      : undefined;

  return {
    id: typeof r.id === "string" && r.id ? r.id : makeId(),
    url: r.url.trim(),
    title: title || (episode !== undefined ? `Episode ${episode}` : "Untitled"),
    addedAt: typeof r.addedAt === "number" ? r.addedAt : 0,
    animeId,
    episode,
    thumbnail,
    seriesName:
      typeof r.seriesName === "string" ? r.seriesName.trim() : undefined,
    seriesLogo:
      typeof r.seriesLogo === "string" ? r.seriesLogo.trim() : undefined,
  };
}

export function readVideos(): SavedVideo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((v): v is SavedVideo => v !== null);
  } catch {
    return [];
  }
}

function write(items: SavedVideo[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

/** Drops undefined keys so a bulk save without a thumbnail doesn't wipe an existing one. */
function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Episodes of one anime in watch order: numbered ones first, then un-numbered extras. */
export function orderedEpisodes(
  videos: SavedVideo[],
  animeId: number,
): SavedVideo[] {
  return videos
    .filter((v) => v.animeId === animeId)
    .sort((a, b) => {
      if (a.episode !== undefined && b.episode !== undefined)
        return a.episode - b.episode;
      if (a.episode !== undefined) return -1;
      if (b.episode !== undefined) return 1;
      return a.addedAt - b.addedAt;
    });
}

export function useVideos() {
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setVideos(readVideos());
      setReady(true);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** Save one episode. Saving an episode number that already exists replaces its link/name. */
  const save = useCallback((v: SavedVideoInput) => {
    const current = readVideos();
    const i = current.findIndex(
      (e) =>
        e.animeId === v.animeId &&
        (v.episode !== undefined ? e.episode === v.episode : e.url === v.url),
    );
    if (i >= 0) {
      const updated = { ...current[i], ...definedOnly(v) };
      current[i] = updated;
      write(current);
      return updated;
    }
    const entry: SavedVideo = { ...v, id: makeId(), addedAt: Date.now() };
    write([...current, entry]);
    return entry;
  }, []);

  /** Save many at once (same replace-by-episode rule). Returns the saved entries in order. */
  const saveMany = useCallback((items: SavedVideoInput[]) => {
    const current = readVideos();
    const out: SavedVideo[] = [];
    for (const v of items) {
      const i = current.findIndex(
        (e) =>
          e.animeId === v.animeId &&
          (v.episode !== undefined ? e.episode === v.episode : e.url === v.url),
      );
      if (i >= 0) {
        current[i] = { ...current[i], ...definedOnly(v) };
        out.push(current[i]);
      } else {
        const entry: SavedVideo = { ...v, id: makeId(), addedAt: Date.now() };
        current.push(entry);
        out.push(entry);
      }
    }
    write(current);
    return out;
  }, []);

  /** Edit one episode by id. Pass an empty string to clear the thumbnail. */
  const update = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          SavedVideo,
          | "url"
          | "title"
          | "episode"
          | "thumbnail"
          | "seriesName"
          | "seriesLogo"
        >
      >,
    ) => {
      write(
        readVideos().map((e) => {
          if (e.id !== id) return e;
          const merged = { ...e, ...patch };
          return normalize(merged) ?? e;
        }),
      );
    },
    [],
  );

  const remove = useCallback(
    (id: string) => write(readVideos().filter((e) => e.id !== id)),
    [],
  );
  const removeMany = useCallback((ids: string[]) => {
    const selected = new Set(ids);
    write(readVideos().filter((entry) => !selected.has(entry.id)));
  }, []);

  const rename = useCallback(
    (id: string, title: string) =>
      write(readVideos().map((e) => (e.id === id ? { ...e, title } : e))),
    [],
  );

  return { videos, ready, save, saveMany, update, remove, removeMany, rename };
}
