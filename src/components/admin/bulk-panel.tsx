import { useState } from "react";
import { Boxes, ChevronDown } from "lucide-react";

import { BulkView } from "@/components/admin/bulk-view";
import { cn } from "@/lib/utils";

/**
 * The bulk importer as a fold-out section, for the admin page of any one anime. It opens already
 * following that anime's franchise, so there is nothing to search for.
 */
export function BulkPanel({ animeId }: { animeId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface/60 px-4 py-3 text-left transition hover:border-foreground/30"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-surface-2">
            <Boxes className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Bulk import</span>
            <span className="block text-xs text-muted-foreground">Every season and episode, on all servers, with TMDB IDs and seasons</span>
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3">
          <BulkView key={animeId} rootId={animeId} embedded />
        </div>
      )}
    </div>
  );
}
