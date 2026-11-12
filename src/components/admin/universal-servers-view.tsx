import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminHeader, Chip, inputCls, panel } from "@/components/admin/ui";
import { toastWriteError } from "@/lib/cloud-episodes";
import {
  blankServer,
  loadUniversalSettings,
  MAX_UNIVERSAL_SERVERS,
  parseSettings,
  previewLinks,
  saveUniversalSettings,
  serverLabels,
  settingWarnings,
  type UniversalServer,
  type UniversalSettings,
} from "@/lib/universal-servers";
import { cn } from "@/lib/utils";

/** One generated link with Copy and Open buttons. */
export function LinkLine({ label, url }: { label: string; url: string | null }) {
  if (!url)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-9 shrink-0 font-semibold">{label}</span> no link
      </p>
    );
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-9 shrink-0 font-semibold">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1.5" title={url}>
        {url}
      </code>
      <button
        type="button"
        aria-label={`Copy ${label} link`}
        onClick={() =>
          navigator.clipboard
            .writeText(url)
            .then(() => toast.success(`Copied the ${label} link.`))
            .catch(() => toast.error("Your browser blocked copying."))
        }
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
      >
        <Copy className="size-4" />
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`Open ${label} link`}
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="size-4" />
      </a>
    </div>
  );
}

const label = "block text-xs font-semibold text-muted-foreground";

/** Admin: the Universal Servers. Link patterns saved once, used for every anime. */
export function UniversalServersView() {
  const [saved, setSaved] = useState<UniversalSettings | null>(null);
  const [draft, setDraft] = useState<UniversalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [test, setTest] = useState({ anilistId: "21", episode: "1", tmdbId: "", season: "1" });

  useEffect(() => {
    let alive = true;
    void loadUniversalSettings(true).then((s) => {
      if (!alive) return;
      setSaved(s);
      setDraft(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const dirty = useMemo(
    () => (saved && draft ? JSON.stringify(parseSettings(saved)) !== JSON.stringify(parseSettings(draft)) : false),
    [saved, draft],
  );

  const patch = (i: number, p: Partial<UniversalServer>) =>
    setDraft((d) => (d ? { servers: d.servers.map((s, k) => (k === i ? { ...s, ...p } : s)) } : d));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const clean = parseSettings(draft);
      await saveUniversalSettings(clean);
      setSaved(clean);
      setDraft(clean);
      const found = settingWarnings(clean);
      setWarnings(found);
      toast.success(found.length ? "Saved, but please check the warnings." : "Universal Servers saved.");
    } catch (error) {
      await toastWriteError(error);
    } finally {
      setSaving(false);
    }
  }

  const rows = useMemo(() => {
    if (!draft) return [];
    const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
    return previewLinks(parseSettings(draft), {
      anilistId: num(test.anilistId),
      episode: num(test.episode),
      tmdbId: num(test.tmdbId),
      season: num(test.season),
    });
  }, [draft, test]);

  if (!draft)
    return (
      <>
        <AdminHeader title="Universal Servers" />
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      </>
    );

  const labels = serverLabels(draft);

  return (
    <>
      <AdminHeader
        title="Universal Servers"
        subtitle="Paste your link patterns once. Any anime plays on them, even ones you never added. Nothing is saved per episode."
      />

      <section className={cn(panel, "mb-4")}>
        <p className="text-sm">
          Use these placeholders inside a link. The site fills them in when someone clicks:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-foreground">{"{id}"}</code> the anime’s ID (the AniList
            ID, or the TMDB ID on a TMDB server)
          </li>
          <li>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-foreground">{"{ep}"}</code> the episode number
          </li>
          <li>
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-foreground">{"{season}"}</code> the TMDB season (TMDB
            servers)
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Example: <code>https://player.example.net/embed/{"{id}"}/{"{ep}"}</code>. The older names{" "}
          <code>{"{anilistId}"}</code>, <code>{"{tmdbId}"}</code> and <code>{"{episode}"}</code> work too. Any link the player
          can open works: a normal link, a link without https://, or a whole pasted <code>&lt;iframe&gt;</code> code. A TMDB
          server uses TMDB’s season and the episode inside that season. If an anime has no TMDB match, that server is hidden
          for it.
        </p>
      </section>

      <div className="space-y-4">
        {draft.servers.map((s, i) => (
          <section key={i} className={cn(panel, !s.enabled && "opacity-80")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold">{labels[i]}</h2>
              <Chip tone={s.enabled ? "primary" : undefined}>{s.enabled ? "on" : "off"}</Chip>
              <button
                type="button"
                aria-label={`Remove ${labels[i]}`}
                onClick={() =>
                  setDraft((d) => (d ? { servers: d.servers.filter((_, k) => k !== i) } : d))
                }
                disabled={draft.servers.length <= 1}
                className="ml-auto grid size-10 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
              <label className={label}>
                Button name
                <input
                  className={cn(inputCls, "mt-1 h-11")}
                  value={s.name}
                  maxLength={24}
                  placeholder={`Server ${i + 1}`}
                  onChange={(e) => patch(i, { name: e.target.value })}
                />
              </label>
              <label className={label}>
                Uses the
                <select
                  className={cn(inputCls, "mt-1 h-11")}
                  value={s.idType}
                  onChange={(e) => patch(i, { idType: e.target.value === "tmdb" ? "tmdb" : "anilist" })}
                >
                  <option value="anilist">AniList ID</option>
                  <option value="tmdb">TMDB ID</option>
                </select>
              </label>
              <label className="flex h-11 items-center gap-2 self-end text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--primary)]"
                  checked={s.enabled}
                  onChange={(e) => patch(i, { enabled: e.target.checked })}
                />
                Switched on
              </label>
            </div>

            <label className={cn(label, "mt-3")}>
              SUB link
              <input
                className={cn(inputCls, "mt-1 h-11 font-mono text-xs")}
                value={s.subPattern}
                spellCheck={false}
                placeholder="https://player.example.net/embed/{id}/{ep}"
                onChange={(e) => patch(i, { subPattern: e.target.value })}
              />
            </label>
            <label className={cn(label, "mt-3")}>
              DUB link
              <input
                className={cn(inputCls, "mt-1 h-11 font-mono text-xs")}
                value={s.dubPattern}
                spellCheck={false}
                placeholder="https://player.example.net/embed/{id}/{ep}?dub=1"
                onChange={(e) => patch(i, { dubPattern: e.target.value })}
              />
            </label>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setDraft((d) =>
              d && d.servers.length < MAX_UNIVERSAL_SERVERS
                ? { servers: [...d.servers, blankServer(d.servers.length + 1)] }
                : d,
            )
          }
          disabled={draft.servers.length >= MAX_UNIVERSAL_SERVERS}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary disabled:opacity-40"
        >
          <Plus className="size-4" /> Add server
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </button>
        {dirty && <span className="text-xs text-muted-foreground">You have changes that are not saved yet.</span>}
      </div>

      {warnings.length > 0 && (
        <div role="status" className="mt-3 rounded-xl border border-border bg-surface-2/60 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5" /> Saved, but please check:
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section className={cn(panel, "mt-6")}>
        <h2 className="text-base font-bold">Test</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Type an anime and an episode to see the links your servers would make. This uses what is on the screen, saved or not.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["anilistId", "AniList ID", "21"],
              ["episode", "Episode", "1"],
              ["tmdbId", "TMDB ID", "37854"],
              ["season", "TMDB season", "1"],
            ] as const
          ).map(([key, name, hint]) => (
            <label key={key} className={label}>
              {name}
              <input
                inputMode="numeric"
                className={cn(inputCls, "mt-1 h-11")}
                value={test[key]}
                placeholder={hint}
                onChange={(e) => setTest((t) => ({ ...t, [key]: e.target.value.replace(/[^\d]/g, "") }))}
              />
            </label>
          ))}
        </div>
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.name} className="rounded-xl border border-border/70 bg-surface/50 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                {r.name} {!r.enabled && <Chip>off</Chip>}
              </p>
              {r.note ? (
                <p className="text-xs text-muted-foreground">{r.note}</p>
              ) : (
                <div className="space-y-2">
                  <LinkLine label="SUB" url={r.sub} />
                  <LinkLine label="DUB" url={r.dub} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          A server’s DUB link is offered for every episode. It plays only if that server really has the DUB.
        </p>
      </section>
    </>
  );
}
