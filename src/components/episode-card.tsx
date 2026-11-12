import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Play } from "lucide-react";

import { EpisodeThumb, ProgressBar } from "@/components/episode-thumb";
import { formatClock, isDefaultEpisodeTitle, episodeNumberLabel } from "@/lib/format";
import { percentOf, resumePosition, type ProgressRecord } from "@/hooks/use-progress";
import type { SavedVideo } from "@/hooks/use-videos";
import { cn } from "@/lib/utils";

/**
 * Streaming-style episode card. Horizontal on phones, stacked from `sm` up.
 * Deliberately shows no URL: that lives only in the Manage episodes screen.
 */
export const EpisodeCard = memo(function EpisodeCard({
  animeId,
  episode,
  fallbackArt,
  current,
  progress,
}: {
  animeId: number;
  episode: SavedVideo;
  fallbackArt?: string | null;
  current?: boolean;
  progress?: ProgressRecord | null;
}) {
  const hasCustomTitle = !isDefaultEpisodeTitle(episode.title, episode.episode);
  const heading = hasCustomTitle
    ? episode.title
    : episode.episode !== undefined
      ? `Episode ${episode.episode}`
      : episode.title;
  const percent = progress ? percentOf(progress) : null;
  const done = Boolean(progress?.completed);
  const resumeAt = resumePosition(progress);

  let action = "Watch";
  if (current) action = "Now playing";
  else if (done) action = "Watch again";
  else if (resumeAt > 0) action = `Resume ${formatClock(resumeAt)}`;
  else if (progress) action = "Continue";

  return (
    <Link
      to="/anime/$id/watch"
      params={{ id: String(animeId) }}
      search={{ ep: episode.id }}
      className={cn(
        "group flex gap-3 rounded-2xl p-2 ring-1 transition-colors sm:flex-col sm:gap-0 sm:p-1.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        current
          ? "bg-primary/10 ring-primary/70"
          : "bg-surface/50 ring-border hover:bg-surface hover:ring-primary/40",
      )}
    >
      <EpisodeThumb
        src={episode.thumbnail}
        fallback={fallbackArt}
        className="w-36 shrink-0 rounded-xl sm:w-full"
      >
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" />
        <span className="absolute bottom-1.5 left-2.5 text-2xl font-bold leading-none text-white tabular-nums drop-shadow">
          {episodeNumberLabel(episode.episode)}
        </span>
        {!current && (
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </span>
        )}
        {done && !current && (
          <span
            className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/60 text-white"
            title="Watched"
          >
            <Check className="size-3" />
          </span>
        )}
        {!done && percent !== null && percent > 0 && <ProgressBar value={percent} />}
      </EpisodeThumb>

      <div className="flex min-w-0 flex-1 flex-col justify-center sm:px-2 sm:pb-2 sm:pt-2">
        {hasCustomTitle && episode.episode !== undefined && (
          <p className="text-xs text-muted-foreground">Episode {episode.episode}</p>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{heading}</h3>
        <span
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-xs font-medium",
            current ? "text-primary" : "text-muted-foreground group-hover:text-primary",
          )}
        >
          <Play className="size-3 fill-current" />
          {action}
        </span>
      </div>
    </Link>
  );
});

export function EpisodeCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface/50 p-2 ring-1 ring-border sm:flex-col sm:gap-0 sm:p-1.5">
      <div className="aspect-video w-36 shrink-0 animate-pulse rounded-xl bg-surface-2 sm:w-full" />
      <div className="flex-1 space-y-2 sm:p-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}
