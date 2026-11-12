import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useCatalog } from "@/hooks/use-catalog";
import { browseMedia, stripHtml, titleOf, type MediaCard } from "@/lib/anilist";
import { explainWriteError } from "@/lib/cloud-episodes";
import {
  MAX_SPOTLIGHT,
  parseSpotlight,
  saveSpotlight,
  watchSpotlight,
  type SpotlightSlide,
} from "@/lib/spotlight";
import { validImage } from "@/components/admin/series-fields";
import { cn } from "@/lib/utils";

const input =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary";

const same = (a: SpotlightSlide[], b: SpotlightSlide[]) => JSON.stringify(a) === JSON.stringify(b);

function fromMedia(m: MediaCard): SpotlightSlide {
  return {
    anilistId: m.id,
    title: titleOf(m),
    banner: m.bannerImage ?? "",
    poster: m.coverImage.extraLarge ?? m.coverImage.large ?? null,
    about: stripHtml(m.description) || null,
    genres: m.genres.slice(0, 6),
    year: m.seasonYear,
    format: m.format,
    episodes: m.episodes,
  };
}

/** Admin: choose which anime appear in the home-page Spotlight and the banner of each. */
export function SpotlightEditor() {
  const [saved, setSaved] = useState<SpotlightSlide[] | null>(null);
  const [slides, setSlides] = useState<SpotlightSlide[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const firstLoad = useRef(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const { catalog } = useCatalog();

  // Load what is saved now (once; the editor then keeps the admin's unsaved edits).
  useEffect(
    () =>
      watchSpotlight(
        (list) => {
          setSaved(list);
          if (firstLoad.current) {
            firstLoad.current = false;
            setSlides(list);
          }
          setLoadedOnce(true);
        },
        () => {
          setLoadError(
            "Couldn't load the saved Spotlight. If this keeps happening, publish the new firestore.rules (it adds the siteConfig collection).",
          );
          setLoadedOnce(true);
        },
      ),
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(term.trim()), 350);
    return () => window.clearTimeout(t);
  }, [term]);

  const search = useQuery({
    queryKey: ["anilist", "spotlight-search", debounced],
    queryFn: () => browseMedia({ search: debounced, perPage: 8, sort: ["SEARCH_MATCH"] }),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const mine = useMemo(() => {
    if (debounced.length < 2) return [];
    const q = debounced.toLowerCase();
    return catalog.filter((a) => a.custom && a.title.toLowerCase().includes(q)).slice(0, 4);
  }, [catalog, debounced]);

  const full = slides.length >= MAX_SPOTLIGHT;
  const dirty = saved !== null && !same(slides, saved);

  function add(slide: SpotlightSlide) {
    if (slides.some((s) => s.anilistId === slide.anilistId))
      return toast.message("That anime is already in the Spotlight.");
    if (full) return toast.error(`The Spotlight holds up to ${MAX_SPOTLIGHT} anime. Remove one first.`);
    setSlides((list) => [...list, slide]);
    setTerm("");
  }

  const patch = (i: number, p: Partial<SpotlightSlide>) =>
    setSlides((list) => list.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  const remove = (i: number) => setSlides((list) => list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setSlides((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    for (const s of slides) {
      if (!s.banner.trim() || !validImage(s.banner))
        return toast.error(`Paste a banner image link (https://…) for “${s.title}”.`);
    }
    setBusy(true);
    setProblem(null);
    try {
      await saveSpotlight(slides);
      // Re-read through the same parser so the editor shows exactly what visitors get.
      setSlides((list) => parseSpotlight({ slides: list }));
      toast.success("Spotlight saved. Every visitor sees it now.");
    } catch (error) {
      const why = await explainWriteError(error);
      setProblem(why);
      toast.error(why, { duration: 14_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 md:p-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Up to {MAX_SPOTLIGHT} anime, each with a banner image link. Empty slots fill with AniList trending.
      </p>

      {loadError && (
        <p className="mt-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {!loadedOnce ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <div className="mt-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={full ? `The Spotlight is full (${MAX_SPOTLIGHT})` : "Search an anime to add to the Spotlight"}
                aria-label="Search anime for the Spotlight"
                disabled={full}
                className={cn(input, "pl-9")}
              />
            </label>

            {debounced.length >= 2 && !full && (
              <div className="mt-3">
                {search.isLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Searching…
                  </p>
                ) : search.isError ? (
                  <p className="text-xs text-destructive">AniList search failed. Try again.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {mine.map((a) => (
                      <li key={a.anilistId}>
                        <Choice
                          title={a.title}
                          image={a.poster}
                          note="Your own series"
                          onAdd={() =>
                            add({
                              anilistId: a.anilistId,
                              title: a.title,
                              banner: a.banner ?? "",
                              poster: a.poster,
                              about: a.about,
                              genres: a.genres.slice(0, 6),
                              year: a.year,
                              format: a.format,
                              episodes: a.episodeCount || null,
                            })
                          }
                        />
                      </li>
                    ))}
                    {(search.data?.media ?? []).map((m) => (
                      <li key={m.id}>
                        <Choice
                          title={titleOf(m)}
                          image={m.coverImage.large}
                          note={`AniList ${m.id}`}
                          onAdd={() => add(fromMedia(m))}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <ol className="mt-4 space-y-3">
            {slides.map((s, i) => (
              <li key={s.anilistId} className="rounded-xl border border-border bg-surface/50 p-2.5">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-36">
                    {s.banner && validImage(s.banner) ? (
                      <img src={s.banner} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center px-2 text-center text-xs text-muted-foreground">
                        Paste a banner link →
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                      Slide {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground">AniList {s.anilistId}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={i === slides.length - 1}
                          onClick={() => move(i, 1)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${s.title}`}
                          onClick={() => remove(i)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    <label className="mt-2 block text-xs text-muted-foreground">
                      Banner image link
                      <input
                        value={s.banner}
                        onChange={(e) => patch(i, { banner: e.target.value })}
                        placeholder="https://… (a wide image)"
                        inputMode="url"
                        className={cn(input, "mt-1", s.banner && !validImage(s.banner) && "border-destructive")}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
            {slides.length === 0 && (
              <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nothing chosen yet — the hero shows AniList trending. Search below to add your own picks.
              </li>
            )}
          </ol>

          {problem && (
            <p role="alert" className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {problem}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground">
              {slides.length} of {MAX_SPOTLIGHT} chosen{dirty ? " · unsaved changes" : ""}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save Spotlight
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Choice({
  title,
  image,
  note,
  onAdd,
}: {
  title: string;
  image: string | null;
  note: string;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center gap-3 rounded-xl bg-surface/60 p-2 text-left ring-1 ring-border transition hover:ring-primary/50"
    >
      {image ? (
        <img src={image} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-14 w-10 shrink-0 rounded-md bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
      </div>
      <Plus className="size-4 shrink-0 text-primary" />
    </button>
  );
}
