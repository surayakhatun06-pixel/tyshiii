import { useState, type FormEvent } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  draftError,
  draftToDetails,
  emptyDraft,
  SeriesFields,
  validImage,
  type SeriesDraft,
} from "@/components/admin/series-fields";
import { createCustomSeries, explainWriteError, type AnimeRef } from "@/lib/cloud-episodes";

/** Create a series that isn't on AniList: your own name, logo and About text. */
export function CustomSeriesForm({
  onCreated,
  onCancel,
  initial,
}: {
  onCreated: (anime: AnimeRef) => void;
  onCancel?: () => void;
  /** Start from these details (used for "Next season" of your own series). */
  initial?: SeriesDraft;
}) {
  const [draft, setDraft] = useState<SeriesDraft>(initial ?? emptyDraft);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = draftError(draft);
    if (invalid) return toast.error(invalid);
    setBusy(true);
    setProblem(null);
    try {
      const created = await createCustomSeries(draftToDetails(draft));
      toast.success("Series created. You can find it with the normal search bar.");
      onCreated(created);
    } catch (error) {
      const why = await explainWriteError(error);
      setProblem(why);
      toast.error(why, { duration: 14_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-primary/40 bg-primary/5 p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Sparkles className="size-4 text-primary" /> Create your own series
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            For something that isn't on AniList. It gets its own page and shows up in the normal
            search bar. Add SUB / DUB links to it afterwards like any other anime.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 md:flex-row">
        {draft.poster && validImage(draft.poster) ? (
          <img src={draft.poster} alt="" className="h-40 w-28 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="grid h-40 w-28 shrink-0 place-items-center rounded-lg bg-surface-2 text-3xl font-black text-muted-foreground">
            {draft.title.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <SeriesFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      </div>

      {problem && (
        <p role="alert" className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {problem}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-full px-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Create series
        </button>
      </div>
    </form>
  );
}
