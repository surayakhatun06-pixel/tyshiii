import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { DEFAULT_FOOTER_TEXT, publishFooterText, readFooterText, saveFooterText } from "@/lib/site-footer";
import { firebaseConfigured } from "@/lib/firebase";

export function SiteFooterEditor() {
  const [text, setText] = useState(DEFAULT_FOOTER_TEXT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void readFooterText()
      .then((saved) => { if (active && saved !== null) setText(saved); })
      .catch(() => { if (active) toast.error("Couldn't load the saved footer text."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      await saveFooterText(text);
      publishFooterText(text);
      toast.success("Footer text saved for the whole site.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the footer text.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Website footer</h2>
          <p className="mt-1 text-xs text-muted-foreground">Edit the public footer. New lines stay on separate lines.</p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading || !firebaseConfigured}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? "Saving…" : "Save footer"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={loading || !firebaseConfigured}
        maxLength={4000}
        aria-label="Website footer text"
        rows={4}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-primary disabled:opacity-60"
      />
      {!firebaseConfigured ? <p className="mt-2 text-xs text-amber-300">Connect Firebase to save footer changes for all visitors.</p> : null}
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{text.length}/4000</p>
    </section>
  );
}
