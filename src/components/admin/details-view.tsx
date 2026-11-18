import { useEffect, useState } from "react";
import { Boxes, Loader2, Plus } from "lucide-react";

import { BulkPanel } from "@/components/admin/bulk-panel";
import { loadRef } from "@/components/admin/anime-picker";
import { DangerZone } from "@/components/admin/danger-zone";
import { AnimeDetailsForm } from "@/components/admin/episode-table";
import { NextSeason } from "@/components/admin/next-season";
import { AdminHeader, AdminLink, rememberOpened, useAdminNav } from "@/components/admin/ui";
import type { AnimeRef } from "@/lib/cloud-episodes";

/** Edit one anime's name, poster, banner, about and facts, or remove it. */
export function DetailsView({ animeId }: { animeId?: number }) {
  const go = useAdminNav();
  const [anime, setAnime] = useState<AnimeRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!animeId) return;
    let cancelled = false;
    setAnime(null);
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

  return (
    <>
      <AdminHeader
        title="Edit details"
        subtitle={anime?.title}
        back={{ view: "library" }}
        right={
          anime && (
            <div className="flex items-center gap-2">
              <AdminLink
                s={{ view: "bulk", anime: anime.anilistId }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold transition hover:border-foreground/40"
              >
                <Boxes className="size-4" /> Bulk
              </AdminLink>
              <AdminLink
                s={{ view: "episodes", anime: anime.anilistId }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
              >
                <Plus className="size-4" /> Episodes
              </AdminLink>
            </div>
          )
        }
      />
      {error ? (
        <p className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : !anime ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening…
        </p>
      ) : (
        <div className="space-y-4">
          <NextSeason anime={anime} />
          <BulkPanel animeId={anime.anilistId} />
          <AnimeDetailsForm
            key={anime.anilistId}
            anime={anime}
            onSaved={(a) => setAnime(a)}
            onDeleted={() => go({ view: "library" })}
          />
          <DangerZone anime={anime} onDeleted={() => go({ view: "library" })} />
        </div>
      )}
    </>
  );
}
