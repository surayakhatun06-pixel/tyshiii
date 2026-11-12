import { useCallback, useEffect, useState } from "react";

import type { MediaCard } from "@/lib/anilist";

export type WatchStatus = "WATCHING" | "PLANNED" | "COMPLETED";

export type WatchlistEntry = {
  id: number;
  status: WatchStatus;
  addedAt: number;
  title: string;
  cover: string | null;
  format: string | null;
  episodes: number | null;
  averageScore: number | null;
  seasonYear: number | null;
};

const KEY = "kuro-watchlist-v1";
const EVENT = "kuro-watchlist-change";

function read(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: WatchlistEntry[]) {
  window.localStorage.setItem(KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(EVENT));
}

export const WATCH_STATUS_LABEL: Record<WatchStatus, string> = {
  WATCHING: "Watching",
  PLANNED: "Plan to watch",
  COMPLETED: "Completed",
};

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  useEffect(() => {
    const sync = () => setEntries(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = useCallback((id: number) => entries.some((e) => e.id === id), [entries]);

  const statusOf = useCallback(
    (id: number) => entries.find((e) => e.id === id)?.status ?? null,
    [entries],
  );

  const add = useCallback((media: MediaCard, status: WatchStatus = "PLANNED") => {
    const rest = read().filter((e) => e.id !== media.id);
    write([
      {
        id: media.id,
        status,
        addedAt: Date.now(),
        title: media.title.english || media.title.romaji || "Untitled",
        cover: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
        format: media.format,
        episodes: media.episodes,
        averageScore: media.averageScore,
        seasonYear: media.seasonYear,
      },
      ...rest,
    ]);
  }, []);

  const remove = useCallback((id: number) => {
    write(read().filter((e) => e.id !== id));
  }, []);

  const toggle = useCallback(
    (media: MediaCard) => {
      if (read().some((e) => e.id === media.id)) {
        remove(media.id);
        return false;
      }
      add(media);
      return true;
    },
    [add, remove],
  );

  const setStatus = useCallback((id: number, status: WatchStatus) => {
    write(read().map((e) => (e.id === id ? { ...e, status } : e)));
  }, []);

  return { entries, has, statusOf, add, remove, toggle, setStatus };
}
