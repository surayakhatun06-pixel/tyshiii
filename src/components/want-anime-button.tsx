import type { MouseEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";

import { nextPlaybackSession } from "@/lib/track-link";

type Props = { animeId: number; title?: string; poster?: string | null };

/**
 * Watch Now always opens the player straight away. Every anime plays through the Universal
 * Servers, so there is nothing to request and no "not added yet" step.
 */
export function WatchNowAction({ animeId }: Props) {
  const navigate = useNavigate();
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let "open in new tab" clicks behave normally; the player adds its own session token.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void navigate({
      to: "/anime/$id/watch",
      params: { id: String(animeId) },
      search: { session: String(nextPlaybackSession()) },
    });
  };
  return (
    <Link
      to="/anime/$id/watch"
      params={{ id: String(animeId) }}
      onClick={open}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-6 text-sm font-bold text-background hover:opacity-90"
    >
      <Play className="size-4 fill-current" />
      Watch Now
    </Link>
  );
}
