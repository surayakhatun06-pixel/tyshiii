import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, Check, Plus, Star } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";
import {
  prettyLabel,
  titleOf,
  type MediaCard as MediaCardType,
} from "@/lib/anilist";
import {
  WATCH_STATUS_LABEL,
  useWatchlist,
  type WatchStatus,
} from "@/hooks/use-watchlist";
import { isCustomId } from "@/lib/cloud-episodes";
import { useCatalog } from "@/hooks/use-catalog";

export function AnimeCard({
  media,
  className,
}: {
  media: MediaCardType;
  className?: string;
}) {
  const { statusOf, add, remove, setStatus } = useWatchlist();
  const { catalog } = useCatalog();
  const [bookmarkMenuOpen, setBookmarkMenuOpen] = useState(false);
  const touchGesture = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );
  const touchPointerActive = useRef(false);
  const suppressTouchClick = useRef(false);
  const suppressTimer = useRef<number | undefined>(undefined);
  const status = statusOf(media.id);
  const saved = status !== null;
  const edited = catalog.find(
    (anime) => anime.anilistId === media.id && anime.edited,
  );
  const displayTitle = edited?.title ?? titleOf(media);
  const cover =
    edited?.poster ??
    media.coverImage?.extraLarge ??
    media.coverImage?.large ??
    undefined;

  const onBookmarkPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerType !== "touch") return;
    if (suppressTimer.current !== undefined) {
      window.clearTimeout(suppressTimer.current);
      suppressTimer.current = undefined;
    }
    suppressTouchClick.current = false;
    touchPointerActive.current = true;
    touchGesture.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onBookmarkPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const gesture = touchGesture.current;
    if (!gesture) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      gesture.moved = true;
    }
  };
  const onBookmarkPointerUp = () => {
    const gesture = touchGesture.current;
    if (!gesture) return;
    touchPointerActive.current = false;
    touchGesture.current = null;
    if (gesture.moved) {
      suppressTouchClick.current = true;
      suppressTimer.current = window.setTimeout(() => {
        suppressTouchClick.current = false;
        suppressTimer.current = undefined;
      }, 500);
      return;
    }
    // Radix receives the touch pointer-down before we know whether it is a tap
    // or a scroll. Open on pointer-up only after confirming a deliberate tap.
    setBookmarkMenuOpen((isOpen) => !isOpen);
  };
  const onBookmarkPointerCancel = () => {
    if (!touchGesture.current) return;
    touchPointerActive.current = false;
    touchGesture.current = null;
    suppressTouchClick.current = true;
    suppressTimer.current = window.setTimeout(() => {
      suppressTouchClick.current = false;
      suppressTimer.current = undefined;
    }, 500);
  };
  const onBookmarkClickCapture = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (!suppressTouchClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressTouchClick.current = false;
    if (suppressTimer.current !== undefined) {
      window.clearTimeout(suppressTimer.current);
      suppressTimer.current = undefined;
    }
  };

  return (
    <div
      className={cn(
        "group relative z-0 transition-transform duration-200 ease-out hover:z-20 hover:-translate-y-2 hover:scale-[1.05] motion-reduce:transition-none",
        className,
      )}
    >
      <Link
        to="/anime/$id"
        params={{ id: String(media.id) }}
        draggable={false}
        className="block focus-visible:outline-none"
      >
        <div className="relative aspect-2/3 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border transition-[box-shadow,ring-color] duration-150 group-hover:ring-primary/70 group-hover:shadow-[0_8px_28px_var(--theme-wash)] group-focus-visible:ring-primary">
          {cover ? (
            <img
              src={cover}
              alt={`${displayTitle} poster art`}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No art
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-background via-background/70 to-transparent p-2 pt-8 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white drop-shadow-md">
              {displayTitle}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {media.format && <span>{prettyLabel(media.format)}</span>}
              {media.episodes && media.format !== "MOVIE" ? <span>· {media.episodes} ep</span> : null}
              {media.seasonYear ? <span>· {media.seasonYear}</span> : null}
            </div>
          </div>

          {media.isAdult ? (
            <div className="absolute bottom-2 left-2 rounded-md bg-destructive/90 px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
              18+
            </div>
          ) : null}

          {isCustomId(media.id) && !media.averageScore ? (
            <div className="absolute left-2 top-2 rounded-md bg-primary/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
              Original
            </div>
          ) : null}

          {media.averageScore ? (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur">
              <Star className="size-3 fill-gold text-gold" />
              {(media.averageScore / 10).toFixed(1)}
            </div>
          ) : null}
        </div>
      </Link>

      <div className="mt-2 max-h-10 overflow-hidden transition-[max-height,opacity,transform,margin] duration-200 ease-out group-hover:mt-0 group-hover:max-h-0 group-hover:-translate-y-1 group-hover:opacity-0 group-focus-within:mt-0 group-focus-within:max-h-0 group-focus-within:-translate-y-1 group-focus-within:opacity-0">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors duration-150 group-hover:text-white">
          <Link
            to="/anime/$id"
            params={{ id: String(media.id) }}
            draggable={false}
            className="hover:text-primary"
          >
            {displayTitle}
          </Link>
        </h3>
      </div>

      <DropdownMenu
        open={bookmarkMenuOpen}
        onOpenChange={(open) => {
          if (touchPointerActive.current) return;
          setBookmarkMenuOpen(open);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              status
                ? `Watch status: ${WATCH_STATUS_LABEL[status]}`
                : "Add to watchlist"
            }
            title={status ? WATCH_STATUS_LABEL[status] : "Add to watchlist"}
            onPointerDownCapture={onBookmarkPointerDown}
            onPointerMoveCapture={onBookmarkPointerMove}
            onPointerUpCapture={onBookmarkPointerUp}
            onPointerCancelCapture={onBookmarkPointerCancel}
            onClickCapture={onBookmarkClickCapture}
            className={cn(
              "absolute right-0 top-0 z-10 grid size-7 place-items-center rounded-full before:absolute before:-inset-2 md:before:hidden border-0 bg-transparent text-white opacity-0 shadow-none backdrop-blur-none transition-[color,opacity,transform] duration-150 drop-shadow-md hover:bg-transparent group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 md:right-2 md:top-2 md:size-9 md:border md:border-white/25 md:bg-black/75 md:shadow-lg md:backdrop-blur-sm md:hover:scale-105 md:hover:bg-white md:hover:text-black",
              saved &&
                "text-primary opacity-100 md:border-white/60 md:bg-white md:text-black",
            )}
          >
            {saved ? (
              <>
                <Check className="hidden size-4 md:block" />
                <Bookmark className="size-4 fill-current md:hidden" />
              </>
            ) : (
              <>
                <Plus className="hidden size-4 md:block" />
                <Bookmark className="size-4 md:hidden" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuRadioGroup
            value={status ?? ""}
            onValueChange={(value) => {
              const next = value as WatchStatus;
              if (saved) setStatus(media.id, next);
              else add(media, next);
            }}
          >
            <DropdownMenuRadioItem value="PLANNED">
              Plan to watch
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="WATCHING">
              Watching
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="COMPLETED">
              Completed
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {saved && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => remove(media.id)}
                className="text-muted-foreground"
              >
                Remove from list
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AnimeCardSkeleton() {
  return (
    <div>
      <div className="aspect-2/3 animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-surface-2" />
    </div>
  );
}
