import { useEffect, useState, type ReactNode } from "react";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 16:9 art with a fallback chain: episode thumbnail -> anime artwork -> placeholder.
 * Children render on top (badges, numbers, progress).
 */
export function EpisodeThumb({
  src,
  fallback,
  alt = "",
  className,
  children,
}: {
  src?: string | null;
  fallback?: string | null;
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  const chain = [src, fallback].filter((s): s is string => Boolean(s));
  const [stage, setStage] = useState(0);

  useEffect(() => setStage(0), [src, fallback]);

  const current = chain[stage];

  return (
    <div className={cn("relative aspect-video overflow-hidden bg-surface-2", className)}>
      {current ? (
        <img
          key={current}
          src={current}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setStage((s) => s + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-linear-to-br from-surface-2 to-surface">
          <Play className="size-8 text-muted-foreground/40" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Thin bar pinned to the bottom edge of a thumbnail. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("absolute inset-x-0 bottom-0 h-1 bg-white/25", className)}
    >
      <div
        className="h-full bg-primary"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
