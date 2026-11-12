import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Megaphone, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { firebaseConfigured } from "@/lib/firebase";
import {
  createAnnouncementId,
  MAX_ANNOUNCEMENTS,
  saveAnnouncements,
  subscribeAnnouncements,
  type SiteAnnouncement,
} from "@/lib/site-announcements";
import { cn } from "@/lib/utils";
import { inputCls, panel } from "@/components/admin/ui";
import { SiteFooterEditor } from "@/components/admin/site-footer-editor";

const dateLabel = (value: number) => new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(value);

export function SiteAnnouncementsEditor() {
  const [items, setItems] = useState<SiteAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  useEffect(() => subscribeAnnouncements(
    (next) => {
      setItems(next);
      setLoading(false);
    },
    () => {
      setLoading(false);
      toast.error("Couldn’t load announcements.");
    },
  ), []);

  async function persist(next: SiteAnnouncement[], success: string) {
    setSaving(true);
    try {
      await saveAnnouncements(next);
      setItems(next);
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t save announcements.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (cleanTitle.length < 2 || !cleanBody) {
      toast.error("Add a title and announcement text first.");
      return;
    }
    if (items.length >= MAX_ANNOUNCEMENTS) {
      toast.error(`Keep the public announcement list under ${MAX_ANNOUNCEMENTS} items.`);
      return;
    }
    const next = [{ id: createAnnouncementId(), title: cleanTitle, body: cleanBody, createdAt: Date.now() }, ...items];
    if (await persist(next, "Announcement published.")) {
      setTitle("");
      setBody("");
    }
  }

  function beginEdit(item: SiteAnnouncement) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditBody(item.body);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    const cleanTitle = editTitle.trim();
    const cleanBody = editBody.trim();
    if (cleanTitle.length < 2 || !cleanBody) {
      toast.error("Keep a title and announcement text.");
      return;
    }
    const now = Date.now();
    const next = items.map((item) => item.id === editingId ? { ...item, title: cleanTitle, body: cleanBody, updatedAt: now } : item);
    if (await persist(next, "Announcement updated.")) setEditingId(null);
  }

  async function remove(item: SiteAnnouncement) {
    if (!window.confirm(`Delete “${item.title}” from the public announcements?`)) return;
    const next = items.filter((entry) => entry.id !== item.id);
    if (await persist(next, "Announcement removed.")) setEditingId((id) => id === item.id ? null : id);
  }

  return (
    <div className="space-y-4">
    <section className={panel} aria-labelledby="announcements-admin-heading">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Megaphone className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="announcements-admin-heading" className="text-sm font-semibold">Announcements</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Publish dated updates in the bell menu at the top of every page. Edit or remove them here.</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">{items.length}/{MAX_ANNOUNCEMENTS}</span>
      </div>

      <form onSubmit={(event) => void add(event)} className="space-y-2.5 rounded-xl border border-border bg-background/60 p-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className={inputCls} placeholder="A short update title" disabled={!firebaseConfigured || saving} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">Message</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={3} className={cn(inputCls, "h-auto min-h-20 resize-y py-2.5 leading-relaxed")} placeholder="Write the update visitors will see…" disabled={!firebaseConfigured || saving} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground">The date is added automatically.</p>
          <button type="submit" disabled={!firebaseConfigured || saving || loading || !title.trim() || !body.trim() || items.length >= MAX_ANNOUNCEMENTS} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-45">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Publish
          </button>
        </div>
      </form>

      {!firebaseConfigured ? <p className="mt-3 text-xs text-amber-300">Connect Firebase to publish announcements for everyone.</p> : null}
      {loading ? <p className="py-5 text-center text-xs text-muted-foreground">Loading announcements…</p> : null}
      {!loading && items.length === 0 ? <p className="py-5 text-center text-xs text-muted-foreground">Nothing published yet.</p> : null}

      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-border/70">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-1 last:pb-1">
              {editingId === item.id ? (
                <form onSubmit={(event) => void saveEdit(event)} className="space-y-2">
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={120} aria-label="Edit announcement title" className={inputCls} disabled={saving} />
                  <textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={2000} rows={3} aria-label="Edit announcement message" className={cn(inputCls, "h-auto min-h-20 resize-y py-2.5 leading-relaxed")} disabled={saving} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground" disabled={saving}><X className="size-3.5" /> Cancel</button>
                    <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50" disabled={saving || !editTitle.trim() || !editBody.trim()}><Save className="size-3.5" /> Save</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <time dateTime={new Date(item.createdAt).toISOString()} className="text-[10px] text-muted-foreground">{dateLabel(item.createdAt)}{item.updatedAt ? " · edited" : ""}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Edit ${item.title}`} title="Edit" onClick={() => beginEdit(item)} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"><Pencil className="size-4" /></button>
                    <button type="button" aria-label={`Delete ${item.title}`} title="Delete" onClick={() => void remove(item)} disabled={saving} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
    <SiteFooterEditor />
    </div>
  );
}
