import type { FieldPath } from "firebase/firestore";

import { fillTemplate, isMovieLink, SERIES, templateProblem, type LinkMode } from "@/lib/bulk-import";
import { DEFAULT_SERVER, EPISODE_LISTS, isDefaultServer } from "@/lib/cloud-episodes";
import { getAuthClient, getDb } from "@/lib/firebase";

/**
 * Safe bulk replacement of saved server links.
 *
 * Only the selected server + track slots that already hold a link are touched. Everything else
 * (other servers, unchecked tracks, titles outside the scope, unrelated episodes) is left alone.
 * If a new pattern cannot produce a link for an episode, the old link is removed and the slot is
 * left empty, and the episode is listed as skipped. Nothing is written until apply() is called.
 *
 * Two copies are kept consistent:
 *   episodeLists/{anilistId}                              what the player reads (subUrl / dubUrl)
 *   series/{fid}/seasons/{anilistId}/episodes/{n}         the admin record (servers.<key>.sub / .dub)
 */

export type ReplaceRule = {
  /** Display name of the server, as saved on the episodes ("Server 1", "Server 2"…). */
  label: string;
  mode: LinkMode;
  /** New SUB pattern. Leave undefined to leave the SUB track untouched. */
  sub?: string;
  /** New DUB pattern. Leave undefined to leave the DUB track untouched. */
  dub?: string;
  /** Delete this server's links for the ticked tracks instead of replacing them. */
  remove?: boolean;
};

export type ReplaceRow = {
  episode: number;
  server: string;
  track: "sub" | "dub";
  oldUrl: string;
  /** null = the pattern cannot make a link for this episode, so the slot will be emptied. */
  newUrl: string | null;
  reason?: string;
};

export type ReplaceTitle = {
  animeId: number;
  title: string;
  episodes: number;
  rows: ReplaceRow[];
};

export type ReplacePlan = {
  rules: ReplaceRule[];
  titles: ReplaceTitle[];
  /** Titles in scope that have none of the selected server links. */
  untouchedTitles: number;
  links: number;
  replaced: number;
  emptied: number;
  episodes: number;
};

type Doc = Record<string, unknown>;
const isObj = (v: unknown): v is Doc => !!v && typeof v === "object" && !Array.isArray(v);
const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A message when a rule can't be used, or null. */
export function ruleProblems(rules: ReplaceRule[]): string | null {
  if (!rules.length) return "Choose at least one server.";
  for (const r of rules) {
    if (r.sub === undefined && r.dub === undefined) return `${r.label}: tick SUB, DUB or both.`;
    if (r.remove) continue;
    for (const [track, tpl] of [["SUB", r.sub], ["DUB", r.dub]] as const) {
      if (tpl === undefined) continue;
      const p = templateProblem(tpl, r.mode);
      if (p) return `${r.label} ${track}: ${p}`;
    }
  }
  return null;
}

type SeriesInfo = {
  franchiseId: string;
  tmdbMovieId?: number;
  /** Per-episode TMDB position, from the admin record. */
  tmdb: Map<number, { id: number; season: number; episode: number }>;
  existing: Set<number>;
  /** Server keys found in this season's episode docs. */
  keys: Map<number, Doc>;
};

/** Build the preview. Reads only; never writes. */
export async function buildReplacePlan(
  rules: ReplaceRule[],
  scope: { animeIds: number[] | "all" },
  onProgress?: (msg: string) => void,
): Promise<ReplacePlan> {
  const bad = ruleProblems(rules);
  if (bad) throw new Error(bad);
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);

  onProgress?.("Reading the live episode lists…");
  const wanted = scope.animeIds === "all" ? null : new Set(scope.animeIds);
  const lists = await fs.getDocs(fs.collection(db, EPISODE_LISTS));
  const animeSnap = await fs.getDocs(fs.collection(db, "anime"));
  const meta = new Map<number, { title: string; format: string | null }>();
  for (const d of animeSnap.docs) {
    const x = d.data();
    meta.set(Number(d.id), { title: typeof x.title === "string" ? x.title : `Anime ${d.id}`, format: typeof x.format === "string" ? x.format : null });
  }

  // The admin record is only needed to find TMDB positions.
  const series = new Map<number, SeriesInfo>();
  if (rules.some((r) => r.mode === "tmdb")) {
    onProgress?.("Reading TMDB season mapping…");
    const all = await fs.getDocs(fs.collection(db, SERIES));
    for (const s of all.docs) {
      const ids = Array.isArray(s.data().seasonIds) ? (s.data().seasonIds as number[]) : [];
      for (const id of ids) {
        if (wanted && !wanted.has(id)) continue;
        const season = await fs.getDoc(fs.doc(db, SERIES, s.id, "seasons", String(id)));
        const eps = await fs.getDocs(fs.collection(db, SERIES, s.id, "seasons", String(id), "episodes"));
        const info: SeriesInfo = {
          franchiseId: s.id,
          tmdbMovieId: typeof season.data()?.tmdbMovieId === "number" ? (season.data()!.tmdbMovieId as number) : undefined,
          tmdb: new Map(),
          existing: new Set(),
          keys: new Map(),
        };
        for (const e of eps.docs) {
          const n = Number(e.id);
          const d = e.data();
          info.existing.add(n);
          info.keys.set(n, d);
          if (typeof d.tmdbId === "number" && typeof d.tmdbSeason === "number" && typeof d.tmdbEpisode === "number")
            info.tmdb.set(n, { id: d.tmdbId, season: d.tmdbSeason, episode: d.tmdbEpisode });
        }
        series.set(id, info);
      }
    }
  }

  const titles: ReplaceTitle[] = [];
  let untouchedTitles = 0;
  for (const rec of lists.docs) {
    const animeId = Number(rec.id);
    if (wanted && !wanted.has(animeId)) continue;
    const eps = rec.data().episodes;
    if (!isObj(eps)) continue;
    const rows: ReplaceRow[] = [];
    const touched = new Set<number>();
    const m = meta.get(animeId);
    const isMovie = m?.format === "MOVIE";

    for (const [numKey, raw] of Object.entries(eps)) {
      if (!isObj(raw)) continue;
      const n = Number(numKey);
      for (const rule of rules) {
        const slots: Doc | undefined = isDefaultServer(rule.label)
          ? raw
          : isObj(raw.servers)
            ? (raw.servers as Doc)[Object.keys(raw.servers as Doc).find((k) => k.toLowerCase() === rule.label.toLowerCase()) ?? "\u0000"] as Doc | undefined
            : undefined;
        if (!isObj(slots)) continue;
        for (const track of ["sub", "dub"] as const) {
          const tpl = track === "sub" ? rule.sub : rule.dub;
          if (tpl === undefined) continue;
          const old = slots[track === "sub" ? "subUrl" : "dubUrl"];
          if (typeof old !== "string" || !old.trim()) continue;

          let next: string | null = null;
          let reason: string | undefined;
          if (rule.remove) reason = "deleted at your request";
          else if (isMovieLink(tpl)) {
            if (!isMovie || n !== 1) reason = "movie link, but this is not a movie";
            else if (rule.mode === "tmdb") {
              const id = series.get(animeId)?.tmdbMovieId;
              if (id) next = fillTemplate(tpl, { anilist: animeId, tmdb: id, season: 1 }, 1, track);
              else reason = "no TMDB movie ID saved";
            } else next = fillTemplate(tpl, { anilist: animeId }, 1, track);
          } else if (rule.mode === "tmdb") {
            const pos = series.get(animeId)?.tmdb.get(n);
            if (pos) next = fillTemplate(tpl, { anilist: animeId, tmdb: pos.id, season: pos.season }, pos.episode, track);
            else reason = "no TMDB season/episode mapping";
          } else next = fillTemplate(tpl, { anilist: animeId }, n, track);

          if (rule.remove) next = null;
          if (next && /\{[a-z_]+\}/i.test(next)) {
            next = null;
            reason = "pattern still has an unfilled placeholder";
          }
          if (next === old) continue; // nothing changes
          rows.push({ episode: n, server: rule.label, track, oldUrl: old, newUrl: next, ...(reason ? { reason } : {}) });
          touched.add(n);
        }
      }
    }
    if (!rows.length) {
      untouchedTitles++;
      continue;
    }
    rows.sort((a, b) => a.episode - b.episode || a.server.localeCompare(b.server) || a.track.localeCompare(b.track));
    titles.push({ animeId, title: m?.title ?? `Anime ${animeId}`, episodes: touched.size, rows });
  }
  titles.sort((a, b) => a.title.localeCompare(b.title));

  const links = titles.reduce((n, t) => n + t.rows.length, 0);
  const emptied = titles.reduce((n, t) => n + t.rows.filter((r) => r.newUrl === null).length, 0);
  return {
    rules,
    titles,
    untouchedTitles,
    links,
    replaced: links - emptied,
    emptied,
    episodes: titles.reduce((n, t) => n + t.episodes, 0),
  };
}

export type ReplaceResult = { titles: number; replaced: number; emptied: number; errors: string[] };

/** Write the plan: live lists first, then the admin record, then an activity-log entry. */
export async function applyReplacePlan(plan: ReplacePlan, onProgress?: (done: number, total: number) => void): Promise<ReplaceResult> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const result: ReplaceResult = { titles: 0, replaced: 0, emptied: 0, errors: [] };

  // The admin record is found by scanning series -> seasonIds, so titles without one are simply live-only.
  const owner = new Map<number, string>();
  const all = await fs.getDocs(fs.collection(db, SERIES));
  for (const s of all.docs) for (const id of Array.isArray(s.data().seasonIds) ? (s.data().seasonIds as number[]) : []) owner.set(id, s.id);

  let done = 0;
  for (const title of plan.titles) {
    try {
      const live = await fs.getDoc(fs.doc(db, EPISODE_LISTS, String(title.animeId)));
      const eps = live.data()?.episodes;
      if (!live.exists() || !isObj(eps)) throw new Error("The live episode list changed or was removed. Run the preview again.");

      // Group per episode + server so a server left with no links is removed whole (no empty leftovers).
      const group = new Map<string, ReplaceRow[]>();
      for (const row of title.rows) {
        const k = `${row.episode}\u0000${row.server}`;
        group.set(k, [...(group.get(k) ?? []), row]);
      }
      const live_updates: (FieldPath | unknown)[] = [];
      const mirror: { path: string[]; args: unknown[] }[] = [];
      const fid = owner.get(title.animeId);

      for (const [k, rows] of group) {
        const [numKey, server] = k.split("\u0000");
        const ep = eps[numKey];
        if (!isObj(ep)) continue;
        const def = isDefaultServer(server);
        const container: Doc | undefined = def
          ? ep
          : isObj(ep.servers)
            ? ((ep.servers as Doc)[Object.keys(ep.servers as Doc).find((x) => x.toLowerCase() === server.toLowerCase()) ?? "\u0000"] as Doc | undefined)
            : undefined;
        if (!isObj(container)) continue;
        const actual = def ? DEFAULT_SERVER : Object.keys(ep.servers as Doc).find((x) => x.toLowerCase() === server.toLowerCase())!;
        const left = { sub: typeof container.subUrl === "string" && !!container.subUrl, dub: typeof container.dubUrl === "string" && !!container.dubUrl };
        for (const r of rows) {
          // Only apply when the slot still holds exactly the link that was previewed.
          if (container[r.track === "sub" ? "subUrl" : "dubUrl"] !== r.oldUrl) continue;
          left[r.track] = r.newUrl !== null;
        }
        const wholeServerGone = !def && !left.sub && !left.dub && rows.length > 0;
        for (const r of rows) {
          if (container[r.track === "sub" ? "subUrl" : "dubUrl"] !== r.oldUrl) continue;
          const field = r.track === "sub" ? "subUrl" : "dubUrl";
          if (r.newUrl === null) result.emptied++;
          else result.replaced++;
          if (wholeServerGone) continue;
          const path = def ? new fs.FieldPath("episodes", numKey, field) : new fs.FieldPath("episodes", numKey, "servers", actual, field);
          live_updates.push(path, r.newUrl === null ? fs.deleteField() : r.newUrl);
        }
        if (wholeServerGone) live_updates.push(new fs.FieldPath("episodes", numKey, "servers", actual), fs.deleteField());

        if (fid) {
          const key = keyOf(server);
          const margs: unknown[] = [];
          const sdoc = ["seasons", String(title.animeId), "episodes", numKey];
          if (wholeServerGone) margs.push(new fs.FieldPath("servers", key), fs.deleteField());
          else
            for (const r of rows) margs.push(new fs.FieldPath("servers", key, r.track), r.newUrl === null ? fs.deleteField() : r.newUrl);
          mirror.push({ path: [SERIES, fid, ...sdoc], args: margs });
        }
      }

      if (live_updates.length) {
        const args = [...live_updates, "updatedAt", fs.serverTimestamp()] as unknown as [FieldPath, unknown, ...unknown[]];
        await fs.updateDoc(fs.doc(db, EPISODE_LISTS, String(title.animeId)), ...args);
      }
      // Admin record: update only documents that exist so nothing orphaned is created.
      for (let i = 0; i < mirror.length; i += 200) {
        const batch = fs.writeBatch(db);
        let n = 0;
        for (const m of mirror.slice(i, i + 200)) {
          const [first, ...rest] = m.path;
          const ref = fs.doc(db, first, ...rest);
          const snap = await fs.getDoc(ref);
          if (!snap.exists() || !m.args.length) continue;
          const [p, v, ...more] = m.args as [FieldPath, unknown, ...unknown[]];
          batch.update(ref, p, v, ...more);
          n++;
        }
        if (n) await batch.commit();
      }
      // Counts shown in the library follow the live list.
      const after = await fs.getDoc(fs.doc(db, EPISODE_LISTS, String(title.animeId)));
      const left = isObj(after.data()?.episodes) ? Object.values(after.data()!.episodes as Doc).filter(isObj) : [];
      const has = (e: Doc, f: "subUrl" | "dubUrl") =>
        (typeof e[f] === "string" && !!e[f]) || (isObj(e.servers) && Object.values(e.servers as Doc).some((v) => isObj(v) && typeof v[f] === "string" && !!v[f]));
      await fs.setDoc(
        fs.doc(db, "anime", String(title.animeId)),
        { episodeCount: left.filter((e) => has(e, "subUrl") || has(e, "dubUrl")).length, subCount: left.filter((e) => has(e, "subUrl")).length, dubCount: left.filter((e) => has(e, "dubUrl")).length, updatedAt: fs.serverTimestamp() },
        { merge: true },
      );
      result.titles++;
    } catch (error) {
      result.errors.push(`${title.title}: ${error instanceof Error ? error.message : "write failed"}`);
    }
    done++;
    onProgress?.(done, plan.titles.length);
  }

  // Keep the saved patterns on the series record in step with what was just applied.
  try {
    const fids = new Set(plan.titles.map((t) => owner.get(t.animeId)).filter(Boolean) as string[]);
    for (const fid of fids)
      for (const r of plan.rules) {
        const k = keyOf(r.label);
        const args: unknown[] = [];
        if (r.sub !== undefined) args.push(new fs.FieldPath("servers", k, "subLink"), r.sub);
        if (r.dub !== undefined) args.push(new fs.FieldPath("servers", k, "dubLink"), r.dub);
        const ref = fs.doc(db, SERIES, fid);
        const snap = await fs.getDoc(ref);
        if (snap.exists() && isObj(snap.data()?.servers) && isObj((snap.data()!.servers as Doc)[k]) && args.length) {
          const [p, v, ...more] = args as [FieldPath, unknown, ...unknown[]];
          await fs.updateDoc(ref, p, v, ...more);
        }
      }
  } catch {
    /* the links themselves are already consistent */
  }

  await logAdminAction("replace-links", `Replaced ${result.replaced} links, emptied ${result.emptied} across ${result.titles} titles (${plan.rules.map((r) => r.label).join(", ")}).`, {
    titles: result.titles,
    replaced: result.replaced,
    emptied: result.emptied,
  });
  return result;
}

/** Admin activity log: adminLog/{auto id}. Admin-only in the rules. Never throws. */
export async function logAdminAction(action: string, summary: string, details: Record<string, unknown> = {}, source: "admin" | "assistant" = "admin") {
  try {
    const [db, fs, auth] = await Promise.all([getDb(), import("firebase/firestore"), getAuthClient()]);
    await fs.addDoc(fs.collection(db, "adminLog"), {
      action: action.slice(0, 60),
      summary: summary.slice(0, 500),
      details,
      source,
      uid: auth.currentUser?.uid ?? null,
      at: fs.serverTimestamp(),
    });
  } catch {
    /* logging must never block the change itself */
  }
}

/** The title plus every season/movie/OVA connected to it in a saved series. Falls back to just the title. */
export async function connectedIds(animeId: number): Promise<number[]> {
  try {
    const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
    const snap = await fs.getDocs(fs.query(fs.collection(db, SERIES), fs.where("seasonIds", "array-contains", animeId)));
    const ids = snap.docs.flatMap((d) => (Array.isArray(d.data().seasonIds) ? (d.data().seasonIds as number[]) : []));
    return ids.length ? [...new Set(ids)] : [animeId];
  } catch {
    return [animeId];
  }
}

/**
 * Add a new server to the episodes a title already has (AniList-style patterns only). Existing links are
 * never replaced. Returns how many episodes got the new server and how many were skipped.
 */
export async function addServerToTitle(animeId: number, label: string, sub: string, dub: string): Promise<{ added: number; skipped: number }> {
  const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
  const live = await fs.getDoc(fs.doc(db, EPISODE_LISTS, String(animeId)));
  const eps = live.data()?.episodes;
  if (!isObj(eps)) return { added: 0, skipped: 0 };
  const { publishGenerated } = await import("@/lib/cloud-episodes");
  const am = await fs.getDoc(fs.doc(db, "anime", String(animeId)));
  const labelled = Object.keys(eps)
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .map((n) => {
      const links: Record<string, { sub?: string; dub?: string }> = {};
      const pair: { sub?: string; dub?: string } = {};
      if (sub) pair.sub = fillTemplate(sub, { anilist: animeId }, n, "sub");
      if (dub) pair.dub = fillTemplate(dub, { anilist: animeId }, n, "dub");
      links[label] = pair;
      return { number: n, links };
    });
  const ref = { anilistId: animeId, title: typeof am.data()?.title === "string" ? (am.data()!.title as string) : `Anime ${animeId}`, poster: typeof am.data()?.poster === "string" ? (am.data()!.poster as string) : null };
  const r = await publishGenerated(ref as never, labelled as never, true);
  return { added: r.added, skipped: r.skipped };
}
