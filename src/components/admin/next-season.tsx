import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Plus } from "lucide-react";

import { AdminLink, nextSeasonTitle } from "@/components/admin/ui";
import { useCatalog } from "@/hooks/use-catalog";
import { relatedSeasons } from "@/lib/franchise-crawl";
import type { AnimeRef } from "@/lib/cloud-episodes";

/**
 * One tap to the next (or previous) season, so you never search for it again.
 * AniList titles use AniList's own sequel links. Your own series open the "new series"
 * form already filled in with the next season's name.
 */
export function NextSeason({ anime }: { anime: AnimeRef }) {
  const { catalog } = useCatalog();
  const have = new Set(catalog.map((a) => a.anilistId));
  const related = useQuery({
    queryKey: ["anilist", "related", anime.anilistId],
    queryFn: () => relatedSeasons(anime.anilistId),
    enabled: !anime.custom,
    staleTime: 1000 * 60 * 60,
  });

  const pill =
    "group inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/60 py-1.5 pl-3 pr-2 text-xs transition hover:border-primary/60";

  if (anime.custom) {
    return (
      <AdminLink s={{ view: "new", from: anime.anilistId }} className={pill}>
        <span className="truncate">
          Next season: <b className="font-semibold">{nextSeasonTitle(anime.title)}</b>
        </span>
        <Plus className="size-3.5 shrink-0 text-primary" />
      </AdminLink>
    );
  }

  const items = related.data ?? [];
  if (!items.length) return null;
  // Sequels first, prequels after.
  const sorted = [...items].sort((a, b) => (a.relation === b.relation ? 0 : a.relation === "SEQUEL" ? -1 : 1));

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((r) => (
        <AdminLink key={r.id} s={{ view: "episodes", anime: r.id }} className={pill}>
          <span className="truncate">
            {r.relation === "SEQUEL" ? "Next" : "Previous"}: <b className="font-semibold">{r.title}</b>
          </span>
          {have.has(r.id) ? (
            <Check className="size-3.5 shrink-0 text-primary" aria-label="Already in your database" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
          )}
        </AdminLink>
      ))}
    </div>
  );
}
