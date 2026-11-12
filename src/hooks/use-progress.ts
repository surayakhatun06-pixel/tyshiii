import { useCallback, useEffect, useMemo, useState } from "react";

import { useEpisodeLibrary } from "@/hooks/use-cloud-episodes";
import { orderedEpisodes, type SavedVideo } from "@/hooks/use-videos";
import { isCustomId } from "@/lib/cloud-episodes";
import { hasUniversalServers, useUniversalSettings } from "@/lib/universal-servers";

/** One record per (anime, episode). Drives Continue Watching, History and resume. */
export type ProgressRecord = {
  key: string;
  animeId: number;
  animeTitle: string;
  animeCover: string | null;
  episodeId: string;
  episode: number | null;
  episodeTitle: string;
  episodeThumb: string | null;
  /** Seconds. Only meaningful when `tracked` is true. */
  position: number;
  /** Seconds, when the player reported it. */
  duration: number | null;
  /** True once the player has reported real playback time (direct video, YouTube, Vimeo). */
  tracked: boolean;
  completed: boolean;
  updatedAt: number;
};

export type ProgressInput = Omit<
  ProgressRecord,
  "key" | "position" | "duration" | "tracked" | "completed" | "updatedAt"
> &
  Partial<Pick<ProgressRecord, "position" | "duration" | "tracked" | "completed">>;

const KEY = "tyshi-progress-v1";
const EVENT = "tyshi-progress-change";
const MAX_RECORDS = 300;
const PAUSE_KEY = "tyshi-history-paused";
const PAUSE_EVENT = "tyshi-history-pause-change";

/** While paused, nothing new is recorded (what is already saved stays). */
export function isHistoryPaused() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHistoryPaused(paused: boolean) {
  try {
    if (paused) window.localStorage.setItem(PAUSE_KEY, "1");
    else window.localStorage.removeItem(PAUSE_KEY);
    window.dispatchEvent(new Event(PAUSE_EVENT));
  } catch {
    /* ignore: a blocked store just means the switch won't stick */
  }
}

export function useHistoryPaused() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const sync = () => setPaused(isHistoryPaused());
    sync();
    window.addEventListener(PAUSE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PAUSE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return paused;
}

/** Below this many seconds we just start from the beginning. */
export const MIN_RESUME = 10;

export const progressKey = (animeId: number, episodeId: string) => `${animeId}:${episodeId}`;

/** Essentially finished: past 92% or within 20 seconds of the end. */
export function isFinished(position: number, duration: number | null | undefined) {
  if (!duration || duration <= 0) return false;
  return position >= duration * 0.92 || duration - position < 20;
}

export function percentOf(
  r: Pick<ProgressRecord, "position" | "duration" | "tracked" | "completed">,
) {
  if (r.completed) return 100;
  if (!r.tracked || !r.duration) return null;
  return Math.min(100, Math.max(0, Math.round((r.position / r.duration) * 100)));
}

/** Where playback should start for this record. 0 when finished, untracked or barely started. */
export function resumePosition(r: ProgressRecord | null | undefined) {
  if (!r || r.completed || !r.tracked) return 0;
  if (isFinished(r.position, r.duration)) return 0;
  return r.position >= MIN_RESUME ? Math.floor(r.position) : 0;
}

function normalize(raw: unknown): ProgressRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.animeId !== "number" || typeof r.episodeId !== "string") return null;
  const position = typeof r.position === "number" && r.position >= 0 ? r.position : 0;
  const duration = typeof r.duration === "number" && r.duration > 0 ? r.duration : null;
  return {
    key: progressKey(r.animeId, r.episodeId),
    animeId: r.animeId,
    animeTitle: typeof r.animeTitle === "string" && r.animeTitle ? r.animeTitle : "Untitled",
    animeCover: typeof r.animeCover === "string" ? r.animeCover : null,
    episodeId: r.episodeId,
    episode: typeof r.episode === "number" ? r.episode : null,
    episodeTitle: typeof r.episodeTitle === "string" ? r.episodeTitle : "",
    episodeThumb: typeof r.episodeThumb === "string" && r.episodeThumb ? r.episodeThumb : null,
    position,
    duration,
    tracked: r.tracked === true,
    completed: r.completed === true,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
  };
}

/** Newest first. */
export function readProgress(): ProgressRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((r): r is ProgressRecord => r !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function write(list: ProgressRecord[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full or blocked: progress is a nicety, never break playback */
  }
}

export function getProgress(animeId: number, episodeId: string) {
  const key = progressKey(animeId, episodeId);
  return readProgress().find((r) => r.key === key) ?? null;
}

/**
 * Create or update a record. With no `position` it only refreshes metadata and the
 * "last watched" time, keeping any saved position (so merely re-opening an episode
 * never loses your place).
 */
export function upsertProgress(input: ProgressInput) {
  const key = progressKey(input.animeId, input.episodeId);
  const all = readProgress();
  const prev = all.find((r) => r.key === key);
  const rest = all.filter((r) => r.key !== key);

  const hasPosition = input.position !== undefined;
  const position = hasPosition ? Math.max(0, input.position!) : (prev?.position ?? 0);
  const duration = input.duration ?? prev?.duration ?? null;
  const tracked = input.tracked ?? prev?.tracked ?? false;
  const completed = hasPosition
    ? (input.completed ?? (tracked && isFinished(position, duration)))
    : (input.completed ?? prev?.completed ?? false);

  const next: ProgressRecord = {
    key,
    animeId: input.animeId,
    animeTitle: input.animeTitle,
    animeCover: input.animeCover,
    episodeId: input.episodeId,
    episode: input.episode,
    episodeTitle: input.episodeTitle,
    episodeThumb: input.episodeThumb,
    position,
    duration,
    tracked,
    completed,
    updatedAt: Date.now(),
  };
  if (!isHistoryPaused()) write([next, ...rest]);
  return next;
}

/** Used when the viewer moves on to the next episode of a player we can't time. */
export function markCompleted(animeId: number, episodeId: string) {
  const prev = getProgress(animeId, episodeId);
  if (!prev || prev.completed || isHistoryPaused()) return;
  write([
    { ...prev, completed: true, position: prev.duration ?? prev.position },
    ...readProgress().filter((r) => r.key !== prev.key),
  ]);
}

export function removeProgress(key: string) {
  write(readProgress().filter((r) => r.key !== key));
}

export function removeEpisodeProgress(episodeId: string) {
  write(readProgress().filter((r) => r.episodeId !== episodeId));
}

export function clearProgress() {
  write([]);
}

/** Which episode to open when the viewer hits Watch Now without picking one. */
export function pickDefaultEpisode(
  eps: SavedVideo[],
  records: ProgressRecord[],
  animeId: number,
): SavedVideo | null {
  if (!eps.length) return null;
  for (const r of records) {
    if (r.animeId !== animeId) continue;
    const i = eps.findIndex((e) => e.id === r.episodeId);
    if (i < 0) continue;
    return r.completed ? (eps[i + 1] ?? eps[i]) : eps[i];
  }
  return eps[0];
}

export function useProgress() {
  const [records, setRecords] = useState<ProgressRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setRecords(readProgress());
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

  const remove = useCallback((key: string) => removeProgress(key), []);
  const clear = useCallback(() => clearProgress(), []);

  return { records, ready, remove, clear };
}

export type ContinueItem = {
  key: string;
  animeId: number;
  animeTitle: string;
  animeCover: string | null;
  episodeId: string;
  episode: number | null;
  episodeTitle: string;
  thumb: string | null;
  position: number;
  duration: number | null;
  percent: number | null;
  tracked: boolean;
  /** "resume" = unfinished episode, "next" = last one was finished so this is up next. */
  kind: "resume" | "next";
  updatedAt: number;
};

/** Most recent unfinished episode per anime, or the next episode if the last one was finished. */
export function useContinueWatching(limit = 20) {
  const { records, ready: progressReady } = useProgress();
  const recentAnimeIds = useMemo(
    () => [...new Set(records.map((r) => r.animeId))].slice(0, limit),
    [records, limit],
  );
  const { videos, ready: videosReady } = useEpisodeLibrary(recentAnimeIds);
  const universal = useUniversalSettings();
  const universalOn = hasUniversalServers(universal.settings);

  const items = useMemo(() => {
    const out: ContinueItem[] = [];
    const seen = new Set<number>();
    for (const r of records) {
      if (seen.has(r.animeId)) continue;
      seen.add(r.animeId);

      const eps = orderedEpisodes(videos, r.animeId);
      const i = eps.findIndex((e) => e.id === r.episodeId);
      if (i < 0) {
        // Not saved in Firebase. If it was played through a Universal Server, keep offering to resume it.
        if (
          universalOn &&
          !r.completed &&
          r.episode !== null &&
          /^ep-\d+$/.test(r.episodeId) &&
          !isCustomId(r.animeId)
        ) {
          out.push({
            key: r.key,
            animeId: r.animeId,
            animeTitle: r.animeTitle,
            animeCover: r.animeCover,
            episodeId: r.episodeId,
            episode: r.episode,
            episodeTitle: r.episodeTitle,
            thumb: r.episodeThumb,
            position: resumePosition(r),
            duration: r.duration,
            percent: percentOf(r),
            tracked: r.tracked,
            kind: "resume",
            updatedAt: r.updatedAt,
          });
          if (out.length >= limit) break;
        }
        continue; // otherwise the episode was deleted
      }

      if (!r.completed) {
        const ep = eps[i];
        out.push({
          key: r.key,
          animeId: r.animeId,
          animeTitle: r.animeTitle,
          animeCover: r.animeCover,
          episodeId: ep.id,
          episode: ep.episode ?? null,
          episodeTitle: ep.title,
          thumb: ep.thumbnail ?? r.episodeThumb,
          position: resumePosition(r),
          duration: r.duration,
          percent: percentOf(r),
          tracked: r.tracked,
          kind: "resume",
          updatedAt: r.updatedAt,
        });
      } else if (eps[i + 1]) {
        const ep = eps[i + 1];
        out.push({
          key: `${r.animeId}:${ep.id}:next`,
          animeId: r.animeId,
          animeTitle: r.animeTitle,
          animeCover: r.animeCover,
          episodeId: ep.id,
          episode: ep.episode ?? null,
          episodeTitle: ep.title,
          thumb: ep.thumbnail ?? r.episodeThumb,
          position: 0,
          duration: null,
          percent: null,
          tracked: false,
          kind: "next",
          updatedAt: r.updatedAt,
        });
      }
      if (out.length >= limit) break;
    }
    return out;
  }, [records, videos, limit, universalOn]);

  return { items, ready: progressReady && videosReady };
}
