import { useEffect, useState } from "react";
import { Loader2, Plus, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";

import { inputCls, panel } from "@/components/admin/ui";
import { cleanHost, readAdminHosts, saveAdminHosts, DEFAULT_NO_SANDBOX_HOSTS } from "@/lib/sandbox-hosts";

/** Admin: hosts that play without the sandbox. Their ads and pop-ups may come back; every other host stays sandboxed. */
export function SandboxHostsEditor() {
  const [hosts, setHosts] = useState<string[]>(DEFAULT_NO_SANDBOX_HOSTS);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void readAdminHosts()
      .then((saved) => saved && setHosts(saved))
      .catch(() => toast.error("Couldn't load the saved host list."));
  }, []);

  async function commit(next: string[], message: string) {
    setBusy(true);
    try {
      await saveAdminHosts(next);
      setHosts(next);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const host = cleanHost(text);
    if (!host) return toast.error("Type a website name, for example vidrift.in");
    if (hosts.includes(host)) return toast.info("Already on the list.");
    setText("");
    void commit([...hosts, host], `${host} now plays without the sandbox.`);
  }

  return (
    <section className={panel}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldOff className="size-4" /> Hosts that play without the sandbox
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Some players (for example Vidrift) refuse to play inside the Ad shield. Hosts on this list load without it, so
        their ads and pop-ups may come back. Every other host stays protected.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="vidrift.in"
          aria-label="Website name"
          className={inputCls}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {hosts.length === 0 && <li className="text-xs text-muted-foreground">No hosts. Everything stays sandboxed.</li>}
        {hosts.map((h) => (
          <li key={h} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 py-1 pl-3 pr-1 text-sm">
            {h}
            <button
              type="button"
              aria-label={`Remove ${h}`}
              disabled={busy}
              onClick={() => void commit(hosts.filter((x) => x !== h), `${h} removed.`)}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
