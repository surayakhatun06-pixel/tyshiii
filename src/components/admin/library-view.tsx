import { useMemo, useState } from "react";
import { Boxes, ChevronRight, Plus, Search, Sparkles } from "lucide-react";

import { AdminHeader, AdminLink, Chip, inputCls } from "@/components/admin/ui";
import { useCatalog } from "@/hooks/use-catalog";
import { cn } from "@/lib/utils";

/** Every anime in your database. Arrows: add episodes, or open the edit page. */
export function LibraryView() {
  const { catalog, ready } = useCatalog();
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = q ? catalog.filter((a) => a.title.toLowerCase().includes(q)) : [...catalog];
    if (sort === "name") list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [catalog, term, sort]);

  return (
    <>
      <AdminHeader
        title="My anime"
        subtitle={ready ? `${catalog.length} in your database` : "Loading…"}
        right={
          <AdminLink
            s={{ view: "new" }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Plus className="size-4" /> Add
          </AdminLink>
        }
      />

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Filter your anime"
            aria-label="Filter your anime"
            className={cn(inputCls, "pl-9")}
          />
        </label>
        <div role="radiogroup" aria-label="Sort" className="inline-flex rounded-full border border-border p-0.5">
          {(["recent", "name"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={sort === v}
              onClick={() => setSort(v)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-semibold transition",
                sort === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "recent" ? "Recent" : "A–Z"}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((a) => (
          <li
            key={a.anilistId}
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 72px" }}
            className="flex items-center gap-1 rounded-2xl border border-border bg-surface/60 pr-1.5 transition hover:border-foreground/30"
          >
            <AdminLink s={{ view: "details", anime: a.anilistId }} className="flex min-w-0 flex-1 items-center gap-3 p-2.5">
              {a.poster ? (
                <img src={a.poster} alt="" loading="lazy" decoding="async" className="h-14 w-10 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-14 w-10 shrink-0 rounded-md bg-surface-2" />
              )}
              <span className="min-w-0">
                <span className="line-clamp-1 text-sm font-semibold">{a.title}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {a.custom && (
                    <Chip tone="primary">
                      <Sparkles className="size-3" /> Own
                    </Chip>
                  )}
                  <Chip>{a.episodeCount} ep</Chip>
                  <Chip>SUB {a.subCount}</Chip>
                  <Chip>DUB {a.dubCount}</Chip>
                </span>
              </span>
            </AdminLink>
            <AdminLink
              s={{ view: "bulk", anime: a.anilistId }}
              aria-label={`Bulk import or update ${a.title}`}
              title="Bulk import / update this anime"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              <Boxes className="size-4" />
            </AdminLink>
            <AdminLink
              s={{ view: "episodes", anime: a.anilistId }}
              aria-label={`Add episodes to ${a.title}`}
              title="Add episodes"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              <Plus className="size-4" />
            </AdminLink>
            <AdminLink
              s={{ view: "details", anime: a.anilistId }}
              aria-label={`Edit ${a.title}`}
              title="Edit details"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </AdminLink>
          </li>
        ))}
        {ready && rows.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {catalog.length ? "Nothing matches that." : "Nothing here yet. Use Add to bring in your first anime."}
          </li>
        )}
      </ul>
    </>
  );
}
