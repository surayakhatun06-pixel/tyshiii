import { useEffect, useState } from "react";
import { Boxes, ChevronRight, Loader2 } from "lucide-react";

import { SeriesSearch } from "@/components/admin/anime-picker";
import { CustomSeriesForm } from "@/components/admin/custom-series-form";
import { draftFromRef, type SeriesDraft } from "@/components/admin/series-fields";
import { AdminHeader, AdminLink, nextSeasonTitle, panel, useAdminNav } from "@/components/admin/ui";
import { getAnimeDoc, animeToRef } from "@/lib/cloud-episodes";
import { cn } from "@/lib/utils";

/** Add anime: from AniList (search or ID), or a series of your own. */
export function NewView({ from }: { from?: number }) {
  const go = useAdminNav();
  const [tab, setTab] = useState<"anilist" | "own">(from ? "own" : "anilist");
  const [initial, setInitial] = useState<SeriesDraft | undefined>();
  const [loading, setLoading] = useState(!!from);

  // "Next season" of your own series: start from its details with the name moved on one season.
  useEffect(() => {
    if (!from) return;
    let cancelled = false;
    getAnimeDoc(from)
      .then((doc) => {
        if (cancelled || !doc) return;
        const draft = draftFromRef(animeToRef(doc));
        setInitial({ ...draft, title: nextSeasonTitle(doc.title) });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from]);

  return (
    <>
      <AdminHeader title="Add anime or series" back={from ? { view: "episodes", anime: from } : {}} />

      <div role="tablist" className="mb-4 inline-flex rounded-full border border-border p-0.5">
        {(
          [
            ["anilist", "From AniList"],
            ["own", "My own series"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold transition",
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "anilist" ? (
        <div className="space-y-4">
          <section className={panel}>
            <p className="mb-3 text-sm text-muted-foreground">
              Pick one title to add its episodes. Its details come from AniList.
            </p>
            <SeriesSearch autoFocus onPick={(a) => go({ view: "episodes", anime: a.anilistId })} />
          </section>
          <AdminLink
            s={{ view: "bulk" }}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-surface/60 p-3.5 transition hover:border-foreground/30"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2">
              <Boxes className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Add a whole franchise instead</span>
              <span className="block text-xs text-muted-foreground">All seasons, OVAs and movies in one import</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" />
          </AdminLink>
        </div>
      ) : loading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : (
        <CustomSeriesForm
          key={from ?? "blank"}
          initial={initial}
          onCreated={(a) => go({ view: "episodes", anime: a.anilistId })}
        />
      )}
    </>
  );
}
