import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { AdminLink, Chip, inputCls, panel } from "@/components/admin/ui";
import { isCustomId, toastWriteError } from "@/lib/cloud-episodes";
import { mediaQuery } from "@/lib/queries";
import type { TmdbHit } from "@/lib/tmdb";
import {
  guessEpisodeCount,
  hasUniversalServers,
  loadTmdbMatches,
  saveTmdbMatch,
  settingsNeedTmdb,
  useUniversalSettings,
  type TmdbMatches,
} from "@/lib/universal-servers";
import { cn } from "@/lib/utils";

const tmdbUrl = (id: number) => `https://www.themoviedb.org/tv/${id}`;

/** Show the TMDB series with its year, number and a link to check it. */
function HitLine({ hit }: { hit: TmdbHit }) {
  return (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-semibold">
        {hit.name}
        {hit.year ? ` (${hit.year})` : ""}
      </span>
      <span className="block truncate text-[11px] text-muted-foreground">TMDB #{hit.id}</span>
    </span>
  );
}

/** Confirm (once) which TMDB series an anime is, so TMDB-type servers use the right one. */
function TmdbMatchBox({
  animeId,
  names,
  year,
}: {
  animeId: number;
  names: string[];
  year: number | null;
}) {
  const [matches, setMatches] = useState<TmdbMatches | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<TmdbHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadTmdbMatches(true).then((m) => alive && setMatches(m));
    return () => {
      alive = false;
    };
  }, [animeId]);

  const guess = useQuery({
    queryKey: ["tmdb-guess", animeId],
    staleTime: Infinity,
    retry: false,
    queryFn: async () => (await import("@/lib/tmdb")).autoMatch(names, year),
  });

  const choice = matches?.[String(animeId)];

  async function choose(next: { tmdbId: number; name?: string } | null, done: string) {
    setBusy(true);
    try {
      await saveTmdbMatch(animeId, next);
      setMatches(await loadTmdbMatches());
      setFound(null);
      toast.success(done);
    } catch (error) {
      await toastWriteError(error);
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setFound(await (await import("@/lib/tmdb")).lookupTmdb(query));
    } catch {
      toast.error("TMDB couldn’t be reached. Try again in a moment.");
      setFound([]);
    } finally {
      setSearching(false);
    }
  }

  const best = guess.data?.best ?? null;
  const confident = guess.data?.confident ?? false;
  const options = found ?? guess.data?.hits ?? [];

  return (
    <div className="mt-4 rounded-xl border border-border/70 bg-surface/50 p-3">
      <p className="text-sm font-semibold">TMDB match</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        TMDB servers need the right TMDB series. Confirm it once and the site remembers it for everyone.
      </p>

      {matches === null ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </p>
      ) : choice ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {choice.tmdbId === 0 ? (
            <Chip>No match: TMDB servers are hidden for this anime</Chip>
          ) : (
            <>
              <Chip tone="primary">
                <Check className="size-3" /> Confirmed
              </Chip>
              <span className="font-semibold">{choice.name ?? `TMDB #${choice.tmdbId}`}</span>
              <a
                href={tmdbUrl(choice.tmdbId)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="size-3" /> Check on TMDB
              </a>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose(null, "Back to the automatic guess.")}
            className="ml-auto rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary disabled:opacity-50"
          >
            Use the automatic guess
          </button>
        </div>
      ) : (
        <div className="mt-3">
          {guess.isLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Looking for the TMDB series…
            </p>
          ) : best ? (
            <div className="flex flex-wrap items-center gap-2">
              {best.poster && <img src={best.poster} alt="" className="h-14 w-10 rounded object-cover" />}
              <HitLine hit={best} />
              <Chip tone={confident ? "primary" : undefined}>{confident ? "good guess" : "weak guess"}</Chip>
              <button
                type="button"
                disabled={busy}
                onClick={() => void choose({ tmdbId: best.id, name: best.name }, "TMDB match confirmed.")}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Check className="size-4" /> Confirm
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No TMDB series was found by title. Search for it below.</p>
          )}
          {!confident && (
            <p className="mt-2 text-xs text-muted-foreground">
              Until you confirm, visitors don’t see TMDB servers for this anime, because a weak guess could play the wrong show.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className={cn(inputCls, "h-11")}
          value={query}
          placeholder="Search TMDB by title or TMDB code"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching || !query.trim()}
          aria-label="Search TMDB"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-border hover:border-primary disabled:opacity-50"
        >
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </div>

      {options.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {options.map((hit) => (
            <li key={hit.id} className="flex items-center gap-2 rounded-lg bg-surface-2/50 p-2">
              {hit.poster && <img src={hit.poster} alt="" className="h-12 w-8 rounded object-cover" />}
              <HitLine hit={hit} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void choose({ tmdbId: hit.id, name: hit.name }, "TMDB match confirmed.")}
                className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-50"
              >
                Use this
              </button>
            </li>
          ))}
        </ul>
      )}

      {matches !== null && choice?.tmdbId !== 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose({ tmdbId: 0 }, "Marked as no TMDB match.")}
          className="mt-3 text-xs font-semibold text-muted-foreground underline hover:text-foreground disabled:opacity-50"
        >
          This anime has no TMDB match
        </button>
      )}
    </div>
  );
}

/** One anime's admin page: how it plays through the Universal Servers. */
export function UniversalAnimePanel({ animeId }: { animeId: number }) {
  const { settings, ready } = useUniversalSettings();
  const custom = isCustomId(animeId);
  const media = useQuery({ ...mediaQuery(animeId), enabled: !custom, retry: false });

  if (custom || !ready) return null;
  const on = hasUniversalServers(settings);
  const m = media.data;
  const count = m ? guessEpisodeCount(m) : 0;
  const isMovie = m?.format === "MOVIE";

  return (
    <section className={cn(panel, "mt-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">Universal Servers</h2>
        <Chip tone={on ? "primary" : undefined}>{on ? "playing" : "off"}</Chip>
      </div>
      {!on ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No Universal Server is switched on yet, so only links saved below can play.{" "}
          <AdminLink s={{ view: "universal" }} className="font-semibold text-primary underline">
            Set them up
          </AdminLink>
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {media.isLoading
            ? "Checking AniList…"
            : isMovie
              ? "This is a movie. It plays straight from your Universal Servers, no adding needed."
              : count > 0
                ? `${count} episode${count === 1 ? "" : "s"} are available right now from AniList and play straight from your Universal Servers, no adding needed. New episodes appear on their own.`
                : "AniList has no episode number for this anime yet. Nothing shows until it does."}
        </p>
      )}
      {on && settingsNeedTmdb(settings) && m && (
        <TmdbMatchBox
          animeId={animeId}
          year={m.startDate?.year ?? null}
          names={[m.title.english, m.title.romaji, m.title.native].filter((t): t is string => !!t)}
        />
      )}
    </section>
  );
}
