import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { diagnoseAccess, type AccessReport } from "@/lib/cloud-episodes";
import { cn } from "@/lib/utils";

/**
 * "Check my setup": tells the admin whether a refused save is caused by the missing
 * admins document or by old Firestore rules.
 */
export function AccessCheck() {
  const [report, setReport] = useState<AccessReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setReport(await diagnoseAccess());
    } finally {
      setBusy(false);
    }
  }

  const ok = report?.problem === "ok";

  return (
    <section className="glass rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <ShieldCheck className="size-4 text-primary" /> Check my setup
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            If saving ever says “Firestore refused this change”, press this. It
            tells you whether the problem is your{" "}
            <code className="rounded bg-surface-2 px-1">admins</code> document
            or the published rules.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Run check
        </button>
      </div>

      {report && (
        <div
          role="status"
          className={cn(
            "mt-4 rounded-xl border p-3 text-sm",
            ok
              ? "border-primary/40 bg-primary/10"
              : "border-destructive/50 bg-destructive/10",
          )}
        >
          <p className="flex items-start gap-2">
            {ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <span>{report.message}</span>
          </p>
          {report.uid && report.problem === "admins-doc" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface/70 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">
                {report.uid}
              </code>
              <button
                type="button"
                aria-label="Copy user ID"
                onClick={() =>
                  navigator.clipboard
                    .writeText(report.uid as string)
                    .then(() => toast.success("User ID copied."))
                    .catch(() =>
                      toast.error(
                        "Couldn't copy. Select the ID and copy it by hand.",
                      ),
                    )
                }
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
