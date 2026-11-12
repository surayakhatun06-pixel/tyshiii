import { ActivityLog } from "@/components/admin/activity-log";
import { StorageReport } from "@/components/admin/storage-report";
import { useEffect, useMemo, useState } from "react";
import { Bell, Boxes, ChevronDown, ChevronRight, GalleryHorizontal, Library, Link2, ListPlus, Plus, Server, ShieldCheck } from "lucide-react";
import type { User } from "firebase/auth";

import { AccessCheck } from "@/components/admin/access-check";
import { AdminLink, Chip, lastOpened, panel, type AdminSearch, type LastOpened } from "@/components/admin/ui";
import { useCatalog } from "@/hooks/use-catalog";
import { useSpotlight } from "@/hooks/use-spotlight";
import { timeAgo } from "@/lib/anilist";
import { cn } from "@/lib/utils";
import { firebaseConfigured, getDb } from "@/lib/firebase";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2/50 px-3 py-2.5">
      <p className="text-xl font-bold tabular-nums leading-none">{value.toLocaleString()}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function VisitorTile() {
  const [stats, setStats] = useState<{ unique: number | null; total: number | null; now: number | null }>({ unique: null, total: null, now: null });
  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    const load = async () => {
      try {
        const [fs, db] = await Promise.all([import("firebase/firestore"), getDb()]);
        const unique = await fs.getCountFromServer(fs.collection(db, "siteVisits")).then((r) => r.data().count).catch(() => null);
        const total = await fs.getDoc(fs.doc(db, "siteStats", "visits")).then((d) => (typeof d.data()?.total === "number" ? (d.data()!.total as number) : null)).catch(() => null);
        const since = fs.Timestamp.fromMillis(Date.now() - 3 * 60_000);
        const now = await fs.getCountFromServer(fs.query(fs.collection(db, "presence"), fs.where("lastSeen", ">", since))).then((r) => r.data().count).catch(() => null);
        if (active) setStats({ unique, total, now });
      } catch {
        if (active) setStats({ unique: null, total: null, now: null });
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const show = (n: number | null) => (n === null ? "—" : n.toLocaleString());
  return (
    <>
      <div className="rounded-xl bg-surface-2/50 px-3 py-2.5" title="Open tabs that reported in during the last 3 minutes">
        <p className="text-xl font-bold tabular-nums leading-none">{show(stats.now)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Watching now</p>
      </div>
      <div className="rounded-xl bg-surface-2/50 px-3 py-2.5" title="Visits counted once per browser session since v17.4">
        <p className="text-xl font-bold tabular-nums leading-none">{show(stats.total)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Total visits</p>
      </div>
      <div className="rounded-xl bg-surface-2/50 px-3 py-2.5" title="Unique browsers/accounts ever seen">
        <p className="text-xl font-bold tabular-nums leading-none">{show(stats.unique)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Unique visitors</p>
      </div>
    </>
  );
}

export function Row({
  s,
  icon: Icon,
  title,
  note,
  strong,
}: {
  s: AdminSearch;
  icon: typeof Plus;
  title: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <AdminLink
      s={s}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-3.5 transition",
        strong
          ? "border-primary/50 bg-primary/10 hover:bg-primary/15"
          : "border-border bg-surface/60 hover:border-foreground/30",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          strong ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground/80",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{note}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </AdminLink>
  );
}

/** The landing page: what you do most is on top, everything else is one arrow away. */
export function AdminHub({ user }: { user: User }) {
  const { catalog, ready } = useCatalog();
  const spotlight = useSpotlight();
  const [last, setLast] = useState<LastOpened | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => setLast(lastOpened()), []);
  // The extra options stay closed until you open them; the choice is remembered on this device.
  const [extrasOpen, setExtrasOpen] = useState(false);
  useEffect(() => {
    try {
      setExtrasOpen(window.localStorage.getItem("tyshi-admin-extras") === "1");
    } catch {
      /* closed */
    }
  }, []);
  const toggleExtras = () =>
    setExtrasOpen((open) => {
      try {
        window.localStorage.setItem("tyshi-admin-extras", open ? "0" : "1");
      } catch {
        /* not remembered */
      }
      return !open;
    });

  const totals = useMemo(
    () => ({
      series: catalog.length,
      episodes: catalog.reduce((n, a) => n + a.episodeCount, 0),
      sub: catalog.reduce((n, a) => n + a.subCount, 0),
      dub: catalog.reduce((n, a) => n + a.dubCount, 0),
    }),
    [catalog],
  );
  const recent = catalog.slice(0, 5);
  const name = user.email?.split("@")[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Changes go live for every visitor straight away.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="Series" value={ready ? totals.series : 0} />
        <Tile label="Episodes" value={totals.episodes} />
        <Tile label="With SUB" value={totals.sub} />
        <Tile label="With DUB" value={totals.dub} />
        <VisitorTile />
      </div>

      <StorageReport />
      <ActivityLog />

      <section className="space-y-2.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Links</h2>
        <Row
          strong
          s={{ view: "universal" }}
          icon={Link2}
          title="Universal Servers"
          note="Paste your link patterns once. Every anime plays on them."
        />
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Import</h2>
        <Row
          strong
          s={{ view: "bulk" }}
          icon={Boxes}
          title="Bulk import"
          note="Import a whole franchise or series with all its seasons and episodes"
        />
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Site</h2>
        <Row
          s={{ view: "spotlight" }}
          icon={GalleryHorizontal}
          title="Spotlight"
          note={spotlight.length ? `${spotlight.length} slides on the home page` : "Home hero uses AniList trending"}
        />
        <Row s={{ view: "announcements" }} icon={Bell} title="Announcements" note="Dated updates shown in the notification bell" />
      </section>

      <section className="space-y-2.5">
        <button
          type="button"
          onClick={() => toggleExtras()}
          aria-expanded={extrasOpen}
          className="flex w-full items-center gap-2 px-1 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
        >
          <ChevronDown className={cn("size-4 transition", extrasOpen ? "rotate-0" : "-rotate-90")} />
          Extra options
          <span className="font-normal normal-case tracking-normal">for single episodes and older tools</span>
        </button>
        {extrasOpen && (
          <div className="space-y-2.5">
            <Row
              s={{ view: "episodes", anime: last?.id }}
              icon={ListPlus}
              title="Add episodes"
              note={last ? `Continue with ${last.title}` : "Add one episode by hand to an anime"}
            />
            <Row
              s={{ view: "library" }}
              icon={Library}
              title="My anime"
              note={`${totals.series} in your database · edit, delete`}
            />
            <Row s={{ view: "new" }} icon={Plus} title="Add anime or series" note="From AniList, or your own series" />
            <Row s={{ view: "servers" }} icon={Server} title="Servers (older tool)" note="Your older embed servers: SUB and DUB links" />
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className={panel}>
          <h2 className="mb-2 text-sm font-semibold">Recently updated</h2>
          <ul className="divide-y divide-border/60">
            {recent.map((a) => (
              <li key={a.anilistId}>
                <AdminLink
                  s={{ view: "episodes", anime: a.anilistId }}
                  className="group flex items-center gap-3 py-2"
                >
                  {a.poster ? (
                    <img src={a.poster} alt="" loading="lazy" decoding="async" className="h-11 w-8 rounded object-cover" />
                  ) : (
                    <div className="h-11 w-8 rounded bg-surface-2" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.episodeCount} ep{a.updatedAt ? ` · ${timeAgo(a.updatedAt / 1000)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" />
                </AdminLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <button
          type="button"
          onClick={() => setChecking((v) => !v)}
          aria-expanded={checking}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ShieldCheck className="size-3.5" /> Check my setup
          <Chip>{checking ? "hide" : "show"}</Chip>
        </button>
        {checking && (
          <div className="mt-3">
            <AccessCheck />
          </div>
        )}
      </div>
    </div>
  );
}
