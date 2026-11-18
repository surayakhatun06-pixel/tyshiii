import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { inputCls } from "@/components/admin/ui";
import { toastWriteError, type AnimeRef } from "@/lib/cloud-episodes";
import { deleteSeriesEverywhere, findFranchises, type FranchiseInfo } from "@/lib/delete-series";

type Target = { ids: number[]; label: string; detail: string };

/**
 * Delete a series with everything related to it (episodes, details, Spotlight slide, bulk-import
 * records). If the title belongs to an imported franchise, the whole franchise can be deleted too.
 * Typing DELETE is required, so it can't happen by a stray tap.
 */
export function DangerZone({ anime, onDeleted }: { anime: AnimeRef; onDeleted: () => void }) {
  const [franchises, setFranchises] = useState<FranchiseInfo[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    findFranchises(anime.anilistId)
      .then((f) => !cancelled && setFranchises(f))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [anime.anilistId]);

  async function run() {
    if (!target || typed.trim().toUpperCase() !== "DELETE") return;
    setStep("Starting…");
    try {
      await deleteSeriesEverywhere(target.ids, setStep);
      toast.success(`Deleted ${target.label} and everything related.`);
      setTarget(null);
      onDeleted();
    } catch (error) {
      void toastWriteError(error);
    } finally {
      setStep(null);
    }
  }

  const open = (t: Target) => {
    setTyped("");
    setTarget(t);
  };

  const row = "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3";
  const btn =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-destructive/90 px-4 text-sm font-semibold text-white transition hover:brightness-110";

  return (
    <section className="rounded-2xl border border-destructive/40 p-4 md:p-5">
      <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
      <div className="mt-3 space-y-2.5">
        <div className={row}>
          <p className="min-w-0 flex-1 text-sm">
            <b>Delete this series</b>
            <span className="block text-xs text-muted-foreground">
              Its episodes, details, Spotlight slide and bulk-import records. The AniList page itself stays.
            </span>
          </p>
          <button
            type="button"
            className={btn}
            onClick={() =>
              open({
                ids: [anime.anilistId],
                label: anime.title,
                detail: "its episodes, SUB/DUB links, edited details, Spotlight slide and bulk-import records",
              })
            }
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>

        {franchises.map((f) => (
          <div key={f.id} className={row}>
            <p className="min-w-0 flex-1 text-sm">
              <b>Delete the whole franchise “{f.title}”</b>
              <span className="block text-xs text-muted-foreground">
                All {f.seasonIds.length} imported entries and everything related to each.
              </span>
            </p>
            <button
              type="button"
              className={btn}
              onClick={() =>
                open({
                  ids: f.seasonIds,
                  label: `“${f.title}” (${f.seasonIds.length} entries)`,
                  detail: `all ${f.seasonIds.length} entries of this franchise: episodes, links, details, Spotlight slides and import records`,
                })
              }
            >
              <Trash2 className="size-4" /> Delete all
            </button>
          </div>
        ))}
      </div>

      <AlertDialog open={target !== null} onOpenChange={(v) => !v && !step && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {target?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {target?.detail}, for every visitor. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block text-xs text-muted-foreground">
            Type <b>DELETE</b> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className={`${inputCls} mt-1`}
            />
          </label>
          {step && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" /> {step}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={step !== null}>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={() => void run()}
              disabled={typed.trim().toUpperCase() !== "DELETE" || step !== null}
              className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Delete everything
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
