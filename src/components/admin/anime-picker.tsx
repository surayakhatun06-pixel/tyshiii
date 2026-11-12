import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Sparkles } from "lucide-react";

import { inputCls } from "@/components/admin/ui";
import { useCatalog } from "@/hooks/use-catalog";
import { browseMedia, getMedia, stripHtml, titleOf, type MediaCard } from "@/lib/anilist";
import { animeToRef, getAnimeDoc, isCustomId, type AnimeRef } from "@/lib/cloud-episodes";
import { cn } from "@/lib/utils";

export const fromMedia = (m: MediaCard): AnimeRef => ({
  anilistId: m.id,
  title: titleOf(m),
  poster: m.coverImage.extraLarge ?? m.coverImage.large ?? null,
  banner: m.bannerImage,
  about: stripHtml(m.description) || null,
  genres: m.genres,
  year: m.seasonYear,
  format: m.format,
  status: m.status,
});

/** If this title is already stored in Firestore, use that (it may have hand-edited details). */
export async function withStoredDetails(base: AnimeRef): Promise<AnimeRef> {
  try {
    const stored = await getAnimeDoc(base.anilistId);
    return stored ? animeToRef(stored) : base;
  } catch {
    return base;
  }
}

/** Search results the admin just picked, so opening them needs no second AniList request. */
const picked = new Map<number, AnimeRef>();
export const rememberPick = (a: AnimeRef) => void picked.set(a.anilistId, a);

/** Open a title by id: stored details first, then what was just picked, then AniList. */
export async function loadRef(id: number): Promise<AnimeRef> {
  const stored = await getAnimeDoc(id).catch(() => null);
  if (stored) return animeToRef(stored);
  if (isCustomId(id)) throw new Error("That series doesn't exist.");
  const cached = picked.get(id);
  if (cached) return cached;
  return fromMedia(await getMedia(id));
}

/**
 * One search box for choosing a title: your own database (instant), AniList (as you type),
 * or a plain AniList ID. Picking calls `onPick` with the title.
 */
export function SeriesSearch({
  onPick,
  placeholder = "Search by name, or type an AniList ID",
  autoFocus,
}: {
  onPick: (anime: AnimeRef) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { catalog } = useCatalog();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(term.trim()), 350);
    return () => window.clearTimeout(t);
  }, [term]);

  const isId = /^\d+$/.test(term.trim());
  const search = useQuery({
    queryKey: ["anilist", "admin-search", debounced],
    queryFn: () => browseMedia({ search: debounced, perPage: 6, sort: ["SEARCH_MATCH"] }),
    enabled: debounced.length >= 2 && !/^\d+$/.test(debounced),
    staleTime: 60_000,
  });

  const mine = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (q.length < 2 || isId) return [];
    return catalog.filter((a) => a.title.toLowerCase().includes(q)).slice(0, 5);
  }, [catalog, term, isId]);

  async function pickId() {
    const id = Number(term.trim());
    setIdBusy(true);
    setIdError(null);
    try {
      onPick(await loadRef(id));
    } catch (error) {
      setIdError(
        error instanceof TypeError
          ? "Couldn't reach AniList. Check your connection."
          : "No anime found with that AniList ID.",
      );
    } finally {
      setIdBusy(false);
    }
  }

  const mineIds = new Set(mine.map((a) => a.anilistId));
  const remote = (search.data?.media ?? []).filter((m) => !mineIds.has(m.id));

  return (
    <div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && isId && pickId()}
          placeholder={placeholder}
          aria-label="Search anime"
          autoFocus={autoFocus}
          className={cn(inputCls, "pl-9")}
        />
      </label>
      {idError && <p className="mt-2 text-xs text-destructive">{idError}</p>}

      <ul className="mt-2 space-y-1.5">
        {isId && (
          <li>
            <Choice title={`Open AniList ID ${term.trim()}`} note="Press Enter or tap" busy={idBusy} onSelect={pickId} />
          </li>
        )}
        {mine.map((a) => (
          <li key={a.anilistId}>
            <Choice
              title={a.title}
              image={a.poster}
              note={`In your database · ${a.episodeCount} ep`}
              own={a.custom}
              onSelect={() => onPick(animeToRef(a))}
            />
          </li>
        ))}
        {remote.map((m) => (
          <li key={m.id}>
            <Choice
              title={titleOf(m)}
              image={m.coverImage.large}
              note={`AniList ${m.id}${m.seasonYear ? ` · ${m.seasonYear}` : ""}`}
              onSelect={() => {
                void withStoredDetails(fromMedia(m)).then((ref) => {
                  rememberPick(ref);
                  onPick(ref);
                });
              }}
            />
          </li>
        ))}
        {debounced.length >= 2 && !isId && search.isFetching && (
          <li className="flex items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Searching AniList…
          </li>
        )}
        {search.isError && <li className="px-1 text-xs text-destructive">AniList search failed. Try again.</li>}
      </ul>
    </div>
  );
}

function Choice({
  title,
  image,
  note,
  own,
  busy,
  onSelect,
}: {
  title: string;
  image?: string | null;
  note: string;
  own?: boolean;
  busy?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl bg-surface/60 p-2 text-left ring-1 ring-border transition hover:ring-primary/50"
    >
      {image ? (
        <img src={image} alt="" loading="lazy" decoding="async" className="h-12 w-8 shrink-0 rounded object-cover" />
      ) : (
        <div className="grid h-12 w-8 shrink-0 place-items-center rounded bg-surface-2">
          {busy && <Loader2 className="size-3.5 animate-spin" />}
        </div>
      )}
      <span className="min-w-0">
        <span className="line-clamp-1 text-sm font-medium">{title}</span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {own && <Sparkles className="size-3 text-primary" aria-label="Your own series" />}
          {note}
        </span>
      </span>
    </button>
  );
}
