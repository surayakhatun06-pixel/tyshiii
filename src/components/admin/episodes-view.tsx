import { useEffect, useState } from "react";
import { Boxes, ChevronDown, ExternalLink, Loader2, Pencil, Repeat } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { loadRef, SeriesSearch } from "@/components/admin/anime-picker";
import { EpisodeTable } from "@/components/admin/episode-table";
import { LinkImporter } from "@/components/admin/link-importer";
import { NextSeason } from "@/components/admin/next-season";
import { UniversalAnimePanel } from "@/components/admin/universal-anime-panel";
import { AdminHeader, AdminLink, Chip, panel, rememberOpened, useAdminNav } from "@/components/admin/ui";
import { useCatalog } from "@/hooks/use-catalog";
import { deleteEpisodes, toastWriteError, watchEpisodeList, type AnimeRef, type CloudEpisode } from "@/lib/cloud-episodes";
import { describeFirebaseError } from "@/lib/firebase";
import { cn } from "@/lib/utils";

/**
 * Add episodes. Choosing a title comes first; the SUB / DUB importers are the first thing
 * under it. Editing or removing existing episodes is tucked into its own fold below.
 */
export function EpisodesView({ animeId }: { animeId?: number }) {
  const go = useAdminNav();
  const { catalog } = useCatalog();
  const [anime, setAnime] = useState<AnimeRef | null>(null);
  const [episodes, setEpisodes] = useState<CloudEpisode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [keepUpTo, setKeepUpTo] = useState("");
  const [trimming, setTrimming] = useState(false);

  /** Remove every episode numbered above the limit (for example, links generated past what has aired). */
  async function trim() {
    if (!anime || !episodes) return;
    const limit = Number(keepUpTo);
    const numbers = episodes.filter((e) => e.number > limit).map((e) => e.number);
    if (!Number.isSafeInteger(limit) || limit < 0 || !numbers.length) return;
    if (!window.confirm(`Remove ${numbers.length} episodes above episode ${limit} from ${anime.title}? This cannot be undone.`)) return;
    setTrimming(true);
    try {
      await deleteEpisodes(anime, numbers);
      toast.success(`Removed ${numbers.length} episodes.`);
      setKeepUpTo("");
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setTrimming(false);
    }
  }

  // Open the title named in the address (?anime=ID).
  useEffect(() => {
    if (!animeId) return setAnime(null);
    let cancelled = false;
    setError(null);
    loadRef(animeId)
      .then((ref) => {
        if (cancelled) return;
        setAnime(ref);
        rememberOpened({ id: ref.anilistId, title: ref.title, poster: ref.poster });
      })
      .catch(() => !cancelled && setError("Couldn't open that title."));
    return () => {
      cancelled = true;
    };
  }, [animeId]);

  useEffect(() => {
    if (!anime) return;
    setEpisodes(null);
    return watchEpisodeList(
      anime.anilistId,
      (eps) => {
        setEpisodes(eps);
        setError(null);
      },
      (err) => setError(describeFirebaseError(err)),
    );
  }, [anime?.anilistId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!animeId) {
    const recent = catalog.slice(0, 6);
    return (
      <>
        <AdminHeader title="Add episodes" subtitle="Choose the anime these episodes belong to." />
        <section className={panel}>
          <SeriesSearch autoFocus onPick={(a) => go({ view: "episodes", anime: a.anilistId })} />
        </section>
        {recent.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Recent</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((a) => (
                <AdminLink
                  key={a.anilistId}
                  s={{ view: "episodes", anime: a.anilistId }}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/60 py-1 pl-1 pr-3 text-xs transition hover:border-primary/60"
                >
                  {a.poster ? (
                    <img src={a.poster} alt="" loading="lazy" decoding="async" className="size-6 rounded-full object-cover" />
                  ) : (
                    <span className="size-6 rounded-full bg-surface-2" />
                  )}
                  <span className="truncate">{a.title}</span>
                </AdminLink>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  if (!anime) {
    return (
      <>
        <AdminHeader title="Add episodes" />
        {error ? (
          <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Opening…
          </p>
        )}
      </>
    );
  }

  const withSub = episodes?.filter((e) => e.subUrl || Object.values(e.servers ?? {}).some((s) => s.subUrl)).length ?? 0;
  const withDub = episodes?.filter((e) => e.dubUrl || Object.values(e.servers ?? {}).some((s) => s.dubUrl)).length ?? 0;

  return (
    <>
      <AdminHeader title="Add episodes" />

      <section className={cn(panel, "flex items-center gap-3")}>
        {anime.poster ? (
          <img src={anime.poster} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-20 w-14 shrink-0 rounded-lg bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-base font-semibold leading-snug">{anime.title}</h2>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip>{episodes ? episodes.length : "…"} ep</Chip>
            <Chip>SUB {withSub}</Chip>
            <Chip>DUB {withDub}</Chip>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <AdminLink s={{ view: "details", anime: anime.anilistId }} className="inline-flex items-center gap-1 hover:text-primary">
              <Pencil className="size-3" /> Edit details
            </AdminLink>
            <Link
              to="/anime/$id/watch"
              params={{ id: String(anime.anilistId) }}
              target="_blank"
              className="inline-flex items-center gap-1 hover:text-primary"
            >
              <ExternalLink className="size-3" /> Watch page
            </Link>
            <AdminLink s={{ view: "bulk", anime: anime.anilistId }} className="inline-flex items-center gap-1 hover:text-primary">
              <Boxes className="size-3" /> Bulk import / update
            </AdminLink>
            <AdminLink s={{ view: "bulk", anime: anime.anilistId }} className="inline-flex items-center gap-1 hover:text-primary" title="Change a server's link pattern, then import: old links are replaced">
              <Repeat className="size-3" /> Replace links
            </AdminLink>
            <AdminLink s={{ view: "episodes" }} className="inline-flex items-center gap-1 hover:text-primary">
              <Repeat className="size-3" /> Change anime
            </AdminLink>
          </div>
        </div>
      </section>

      <UniversalAnimePanel animeId={anime.anilistId} />

      <div className="mt-3">
        <NextSeason anime={anime} />
      </div>

      {error ? (
        <p className="mt-5 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : episodes === null ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading episodes…
        </p>
      ) : (
        <>
          <div className="mt-5">
            <h2 className="text-base font-bold">Add new episodes to this anime</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Paste links for new episodes below. Episodes and links already saved are kept as they are; an existing link is only replaced if you switch on “replace” in the importer. To create a brand-new anime, use New under the Anime tab instead.
            </p>
          </div>
          <div className="mt-3 grid gap-5 lg:grid-cols-2">
            <LinkImporter key={`sub-${anime.anilistId}`} anime={anime} lang="sub" existing={episodes} />
            <LinkImporter key={`dub-${anime.anilistId}`} anime={anime} lang="dub" existing={episodes} />
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => setManage((v) => !v)}
              aria-expanded={manage}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface/60 px-4 py-3 text-left transition hover:border-foreground/30"
            >
              <span>
                <span className="block text-sm font-semibold">Edit or remove episodes</span>
                <span className="block text-xs text-muted-foreground">{episodes.length} episodes · servers, titles, deleting</span>
              </span>
              <ChevronDown className={cn("size-4 text-muted-foreground transition", manage && "rotate-180")} />
            </button>
            {manage && (
              <div className="mt-3">
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/50 p-3 text-xs text-muted-foreground">
                  Keep episodes up to
                  <input
                    value={keepUpTo}
                    onChange={(e) => setKeepUpTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    placeholder="12"
                    aria-label="Keep episodes up to"
                    className="h-8 w-20 rounded-lg border border-border bg-surface px-2 text-xs text-foreground outline-none focus:border-primary"
                  />
                  and remove the rest
                  <button
                    type="button"
                    onClick={() => void trim()}
                    disabled={trimming || !keepUpTo || !episodes.some((e) => e.number > Number(keepUpTo))}
                    className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive/90 px-4 font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    {trimming && <Loader2 className="size-3.5 animate-spin" />}
                    Remove
                  </button>
                </div>
                <EpisodeTable anime={anime} episodes={episodes} />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
