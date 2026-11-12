import { useEffect, useState } from "react";
import { ArrowRightLeft, Search, Wrench } from "lucide-react";
import { toast } from "sonner";

import { inputCls, panel } from "@/components/admin/ui";
import { defaultServerLabel, replaceServerLinkText, type ServerLinkReplacementSummary, type ServerLinkTrack } from "@/lib/server-link-migration";

export function GlobalServerUpdate({ serverNames }: { serverNames: string[] }) {
  const [serverName, setServerName] = useState(serverNames[0] ?? defaultServerLabel);
  const [track, setTrack] = useState<ServerLinkTrack>("both");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [preview, setPreview] = useState<ServerLinkReplacementSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!serverNames.some((name) => name.toLowerCase() === serverName.toLowerCase()))
      setServerName(serverNames[0] ?? defaultServerLabel);
  }, [serverNames, serverName]);

  async function scan() {
    setBusy(true);
    try {
      const result = await replaceServerLinkText({ serverName, track, findText, replaceText });
      setPreview(result);
      if (!result.links) toast.info("No saved links for that server contain the text you entered.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't scan saved links.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview?.links) return;
    const scope = track === "both" ? "SUB and DUB" : track.toUpperCase();
    const confirmed = window.confirm(
      `Replace this text in ${preview.links} ${scope} links across ${preview.episodes} episodes in ${preview.titles} titles? This updates the saved player links on your site.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setProgress("Updating links…");
    try {
      const result = await replaceServerLinkText({
        serverName,
        track,
        findText,
        replaceText,
        apply: true,
        onProgress: (done, total) => setProgress(`Updated ${done} of ${total} titles…`),
      });
      toast.success(`Updated ${result.links} links across ${result.episodes} episodes in ${result.titles} titles.`);
      setPreview(null);
      setFindText("");
      setReplaceText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update every title. Check the server and try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <section className={`${panel} mt-5`} aria-labelledby="global-server-update-title">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Wrench className="size-4" /></span>
        <div>
          <h2 id="global-server-update-title" className="font-semibold">Fix a server across all titles</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Change part of a saved server link everywhere it is used. For example, replace an old host name with the new host name. Other servers and titles are left alone.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium">
          <span>Server</span>
          <select value={serverName} onChange={(event) => { setServerName(event.target.value); setPreview(null); }} className={inputCls}>
            {[...new Set([defaultServerLabel, ...serverNames])].map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium">
          <span>Apply to</span>
          <select value={track} onChange={(event) => { setTrack(event.target.value as ServerLinkTrack); setPreview(null); }} className={inputCls}>
            <option value="both">SUB and DUB</option>
            <option value="sub">SUB only</option>
            <option value="dub">DUB only</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium">
          <span>Find this exact text</span>
          <input value={findText} onChange={(event) => { setFindText(event.target.value); setPreview(null); }} className={`${inputCls} font-mono text-xs`} placeholder="https://old-player.example" spellCheck={false} />
        </label>
        <label className="space-y-1.5 text-xs font-medium">
          <span>Replace it with</span>
          <input value={replaceText} onChange={(event) => { setReplaceText(event.target.value); setPreview(null); }} className={`${inputCls} font-mono text-xs`} placeholder="https://new-player.example" spellCheck={false} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !findText.trim() || !replaceText.trim()} onClick={() => void scan()} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary/60 disabled:opacity-40">
          <Search className="size-4" /> Preview matches
        </button>
        {preview ? (
          <>
            <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">
              {preview.links ? `${preview.links} links · ${preview.episodes} episodes · ${preview.titles} titles` : "No matches found."}
            </p>
            <button type="button" disabled={busy || !preview.links} onClick={() => void apply()} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              <ArrowRightLeft className="size-4" /> Replace across all titles
            </button>
          </>
        ) : null}
      </div>
      {progress ? <p className="mt-3 text-xs text-muted-foreground" role="status">{progress}</p> : null}
    </section>
  );
}
