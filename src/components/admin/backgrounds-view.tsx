import { useEffect, useState } from "react";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { AdminHeader, panel } from "@/components/admin/ui";
import { THEMES, type ThemeId } from "@/hooks/use-theme";
import type { DetailsBg, PlayerBg } from "@/hooks/use-appearance";
import { firebaseConfigured } from "@/lib/firebase";
import {
  BUILT_IN_APPEARANCE,
  applySiteAppearanceNow,
  readSiteAppearance,
  saveSiteAppearance,
} from "@/lib/site-appearance";
import { cn } from "@/lib/utils";

type Draft = typeof BUILT_IN_APPEARANCE;

/** A row of choices (same look as the Settings panel). */
function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      className={cn("grid gap-1 rounded-xl border border-border bg-surface/60 p-1", disabled && "pointer-events-none opacity-40")}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 rounded-lg px-1 text-sm font-semibold transition",
            o.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A tiny picture of what a choice looks like (plain shapes, no images loaded). */
function Mini({ kind }: { kind: "black" | "banner" | "poster" | "mix" }) {
  return (
    <div className="relative h-14 w-full overflow-hidden rounded-lg border border-border bg-black">
      {kind === "banner" && <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-primary/70 to-transparent" />}
      {kind === "poster" && <div className="absolute left-2 top-2 h-10 w-7 rounded bg-primary/70" />}
      {kind === "mix" && <div className="absolute inset-0 bg-primary/40 blur-md" />}
      <div className="absolute bottom-1.5 right-2 h-1.5 w-8 rounded-full bg-white/30" />
    </div>
  );
}

/** Admin > Backgrounds: the site's default look. Visitors can still change it in their own Settings. */
export function BackgroundsView() {
  const [draft, setDraft] = useState<Draft>(BUILT_IN_APPEARANCE);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);

  useEffect(() => {
    let active = true;
    void readSiteAppearance()
      .then((saved) => {
        if (!active || !saved) return;
        const { version: v, ...rest } = saved;
        setDraft(rest);
        setVersion(v);
      })
      .catch(() => active && toast.error("Couldn't load the saved look."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(value: Draft, kind: "save" | "reset") {
    setBusy(kind);
    try {
      const saved = await saveSiteAppearance(value);
      setVersion(saved.version);
      applySiteAppearanceNow(saved); // the admin sees it straight away too
      toast.success(kind === "reset" ? "Back to the built-in default (saved for everyone)." : "Saved. This is now the default look for everyone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  const off = draft.blackEverywhere;
  const disabled = !firebaseConfigured || loading || busy !== null;

  return (
    <>
      <AdminHeader
        title="Backgrounds"
        subtitle="The site's default look. Visitors can still change it in their own Settings."
      />
      <div className="space-y-4">
        <section className={panel}>
          <h2 className="mb-2 text-sm font-semibold">Theme colour</h2>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Theme colour">
            {THEMES.map((t) => {
              const on = t.id === draft.theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t.label}
                  onClick={() => set({ theme: t.id as ThemeId })}
                  className="grid min-h-12 place-items-center rounded-xl border border-border transition hover:bg-surface-2/70"
                >
                  <span
                    className={cn("grid size-7 place-items-center rounded-full", on && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
                    style={{ backgroundColor: t.color }}
                  >
                    {on && <Check className={cn("size-4", t.id === "mono" ? "text-black" : "text-white")} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={cn(panel, "space-y-4")}>
          <button
            type="button"
            role="switch"
            aria-checked={off}
            onClick={() => set({ blackEverywhere: !off })}
            className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-sm font-semibold">Full black everywhere</span>
              <span className="block text-xs text-muted-foreground">No banner or poster behind any page, including the player.</span>
            </span>
            <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition", off ? "bg-primary" : "bg-surface-2")}>
              <span className={cn("absolute top-1 size-5 rounded-full bg-white transition-all", off ? "left-6" : "left-1")} />
            </span>
          </button>

          <div className={cn("space-y-4", off && "opacity-40")}>
            <div>
              <p className="pb-1.5 text-xs text-muted-foreground">Behind the player</p>
              <Choice<PlayerBg>
                label="Behind the player"
                value={draft.playerBg}
                onChange={(v) => set({ playerBg: v })}
                disabled={off}
                options={[
                  { value: "black", label: "Black" },
                  { value: "banner", label: "Banner" },
                  { value: "poster", label: "Poster" },
                  { value: "mix", label: "Blurred" },
                ]}
              />
            </div>
            <div>
              <p className="pb-1.5 text-xs text-muted-foreground">Behind the details page</p>
              <Choice<DetailsBg>
                label="Behind the details page"
                value={draft.detailsBg}
                onChange={(v) => set({ detailsBg: v })}
                disabled={off}
                options={[
                  { value: "banner", label: "Banner" },
                  { value: "poster", label: "Poster" },
                  { value: "black", label: "Black" },
                ]}
              />
            </div>
          </div>
        </section>

        <section className={panel}>
          <h2 className="mb-2 text-sm font-semibold">Preview</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="pb-1 text-[11px] text-muted-foreground">Player page</p>
              <Mini kind={off ? "black" : draft.playerBg} />
            </div>
            <div>
              <p className="pb-1 text-[11px] text-muted-foreground">Details page</p>
              <Mini kind={off ? "black" : draft.detailsBg} />
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save(draft, "save")}
            disabled={disabled}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save for everyone
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(BUILT_IN_APPEARANCE);
              void save(BUILT_IN_APPEARANCE, "reset");
            }}
            disabled={disabled}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Back to built-in default
          </button>
        </div>
        {!firebaseConfigured && <p className="text-xs text-amber-300">Connect Firebase to save a default for all visitors.</p>}
        {version && <p className="text-xs text-muted-foreground">Last saved {new Date(version).toLocaleString()}.</p>}
      </div>
    </>
  );
}
