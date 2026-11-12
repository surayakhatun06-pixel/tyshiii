import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Tv } from "lucide-react";

import { VideoPlayer } from "@/components/video-player";
import { useAppearance } from "@/hooks/use-appearance";
import { cn } from "@/lib/utils";
import {
  getProgress,
  MIN_RESUME,
  resumePosition,
  upsertProgress,
} from "@/hooks/use-progress";
import type { SavedVideo } from "@/hooks/use-videos";
import { isDefaultEpisodeTitle } from "@/lib/format";
import { canSeekEmbed, toEmbed } from "@/lib/video-embed";

export type AnimeBrief = {
  id: number;
  title: string;
  cover: string | null;
  /** Wide art preferred for 16:9 fallbacks. */
  art: string | null;
};

const SAVE_EVERY_MS = 5000;
const COUNTDOWN_SECONDS = 6;

/**
 * The player stage. It holds only the video: server, SUB/DUB and fullscreen belong to
 * the player and page controls. Keeping the iframe untouched preserves provider-native fullscreen.
 */
export function EpisodePlayer({
  anime,
  episode,
  next,
  autoNext,
  onNext,
  stageRef,
  sessionKey,
  track,
  ready = true,
}: {
  anime: AnimeBrief;
  episode: SavedVideo;
  next: SavedVideo | null;
  autoNext: boolean;
  onNext: (auto: boolean) => void;
  stageRef: RefObject<HTMLDivElement | null>;
  /** Changes whenever the episode, server, language or a reload needs a fresh player. */
  sessionKey: string;
  /** Set when SUB and DUB share one link: the player keeps running and just switches audio. */
  track?: "sub" | "dub";
  /** Keep a stable poster frame until a direct URL receives its fresh session token. */
  ready?: boolean;
}) {
  // Just the video on plain black. The background choice in Settings applies to the page around it.
  // Corners and glow follow the player options in Settings (rounded, no glow is the default).
  const { playerCorners, playerGlow, phoneStyle, phoneSticky } =
    useAppearance();
  return (
    <div
      ref={stageRef}
      className={cn(
        "episode-player-stage relative aspect-video w-full overflow-hidden bg-black max-sm:rounded-none fullscreen:flex fullscreen:aspect-auto fullscreen:h-screen fullscreen:rounded-none fullscreen:max-sm:rounded-none",
        playerCorners === "square" ? "sm:rounded-none" : "sm:rounded-xl",
        playerGlow &&
          "shadow-[0_0_90px_-12px_rgba(255,255,255,0.22)] fullscreen:shadow-none",
        // Phone options (the default, "full", is exactly how the player has always looked on a phone).
        phoneStyle === "card" &&
          "max-sm:mx-1 max-sm:mt-3 max-sm:w-[calc(100%-0.5rem)] max-sm:rounded-none fullscreen:max-sm:m-0 fullscreen:max-sm:w-full fullscreen:max-sm:rounded-none",
        phoneSticky && "max-sm:sticky max-sm:top-0 max-sm:z-30",
      )}
    >
      {ready ? (
        <EpisodeSession
          key={sessionKey}
          anime={anime}
          episode={episode}
          next={next}
          autoNext={autoNext}
          onNext={onNext}
          track={track}
        />
      ) : (
        <div className="absolute inset-0 bg-black">
          {(episode.thumbnail ?? anime.art ?? anime.cover) && (
            <img
              src={episode.thumbnail ?? anime.art ?? anime.cover ?? undefined}
              alt=""
              className="h-full w-full object-cover opacity-55"
            />
          )}
          <div className="absolute inset-0 bg-black/35" />
        </div>
      )}
      {/* Phone only: wide edge gutters let page scrolling start outside provider-owned iframe controls. */}
      <div
        aria-hidden
        className="player-scroll-gutter absolute bottom-16 left-0 top-0 z-10 w-11 touch-pan-y fullscreen:hidden"
      />
      <div
        aria-hidden
        className="player-scroll-gutter absolute bottom-16 right-0 top-0 z-10 w-11 touch-pan-y fullscreen:hidden"
      />
    </div>
  );
}

/**
 * One playback session: video, resume, progress saving and the end-of-episode
 * "up next" prompt. Mounted with a key, so it restarts per episode / server.
 */
function EpisodeSession({
  anime,
  episode,
  next,
  autoNext,
  onNext,
  track,
}: {
  anime: AnimeBrief;
  episode: SavedVideo;
  next: SavedVideo | null;
  autoNext: boolean;
  onNext: (auto: boolean) => void;
  track?: "sub" | "dub";
}) {
  const embed = useMemo(() => toEmbed(episode.url), [episode.url]);
  const art = anime.art ?? anime.cover;

  const meta = useMemo(
    () => ({
      animeId: anime.id,
      animeTitle: anime.title,
      animeCover: anime.cover ?? anime.art,
      episodeId: episode.id,
      episode: episode.episode ?? null,
      episodeTitle: isDefaultEpisodeTitle(episode.title, episode.episode)
        ? ""
        : episode.title,
      episodeThumb: episode.thumbnail ?? art,
    }),
    [anime, episode, art],
  );
  const metaRef = useRef(meta);
  metaRef.current = meta;

  // Read the saved position once, when the episode opens.
  const [startAt] = useState(() =>
    embed && canSeekEmbed(embed)
      ? resumePosition(getProgress(anime.id, episode.id))
      : 0,
  );

  const latest = useRef<{
    position: number;
    duration: number | null;
    dirty: boolean;
  }>({
    position: startAt,
    duration: null,
    dirty: false,
  });

  const flush = useCallback(() => {
    const l = latest.current;
    if (!l.dirty) return;
    l.dirty = false;
    // A quick look at an already-finished episode shouldn't undo its "completed" state.
    if (
      l.position < MIN_RESUME &&
      getProgress(metaRef.current.animeId, metaRef.current.episodeId)?.completed
    )
      return;
    upsertProgress({
      ...metaRef.current,
      position: l.position,
      duration: l.duration,
      tracked: true,
    });
  }, []);

  // Opening an episode puts it in history, even for players that can't report time.
  useEffect(() => {
    const t = window.setTimeout(() => upsertProgress(metaRef.current), 3000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const id = window.setInterval(flush, SAVE_EVERY_MS);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const handleTime = useCallback(
    (position: number, duration: number | null) => {
      latest.current = {
        position,
        duration: duration ?? latest.current.duration,
        dirty: true,
      };
    },
    [],
  );

  const autoNextRef = useRef(autoNext);
  const nextRef = useRef(next);
  const onNextRef = useRef(onNext);
  autoNextRef.current = autoNext;
  nextRef.current = next;
  onNextRef.current = onNext;

  const handleEnded = useCallback(() => {
    const l = latest.current;
    const duration = l.duration ?? (l.position > 0 ? l.position : null);
    l.dirty = false;
    upsertProgress({
      ...metaRef.current,
      position: duration ?? 0,
      duration,
      tracked: true,
      completed: true,
    });
    // Moving on happens right away; there is no overlay on top of the video.
    if (autoNextRef.current && nextRef.current) onNextRef.current(true);
  }, []);

  return (
    <div className="max-sm:absolute max-sm:inset-0 sm:relative sm:h-full">
      {embed ? (
        <VideoPlayer
          embed={embed}
          title={`${anime.title} ${episode.title}`}
          poster={episode.thumbnail ?? art}
          startAt={startAt}
          track={track}
          onTime={handleTime}
          onPause={flush}
          onEnded={handleEnded}
        />
      ) : (
        <div className="grid h-full w-full place-items-center px-6 text-center text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <Tv className="size-10" />
            This episode's video source isn't valid. Fix it from Manage
            episodes.
          </div>
        </div>
      )}
    </div>
  );
}
