import { prettyLabel, titleOf, type FranchiseNode } from "@/lib/anilist";
import { isSeasonLike, parseBestTitle, sameSeries, toNumber } from "@/lib/season-titles";

const words = (t: string) => t.split(/\s+/).filter(Boolean);

/** The words two titles start with in common ("Demon Slayer: Kimetsu no Yaiba"). */
function commonPrefix(a: string, b: string): string {
  const x = words(a);
  const y = words(b);
  const out: string[] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i].toLowerCase() !== y[i].toLowerCase()) break;
    out.push(x[i]);
  }
  return out.join(" ");
}

const clean = (t: string) => t.replace(/^[\s:–—-]+|[\s:–—-]+$/g, "");

/** A "Final Chapters Special 1 / 2" style entry keeps its own name. */
function finalChapters(title: string): string | null {
  const m = title.match(/\bfinal\s+chapters?\s+special\s*(\d+)\b/i);
  return m ? `Final Chapters Part ${Number(m[1])}` : null;
}

type Slot = { id: number; season: number; part: number | null; final: boolean };

/**
 * Names every entry of a franchise, in release order:
 *   - a season number written in the title wins ("Season 2", "3rd Season", "Final Season");
 *   - a part with no season ("Part 2", "Cour 2") stays inside the season before it, so it is
 *     "Season 1 Part 2" and never a new season;
 *   - an arc keeps its own name ("Mugen Train Arc");
 *   - other TV series are numbered in order, and movies / OVAs / specials say what they are.
 */
export function labelFranchise(entries: FranchiseNode[]): Map<number, string> {
  const labels = new Map<number, string>();
  if (!entries.length) return labels;
  const isSeries = (n: FranchiseNode) => n.format === "TV" || n.format === "TV_SHORT";
  const base = titleOf(entries.find(isSeries) ?? entries[0]);
  const slots: Slot[] = [];
  let counter = 0;
  let last = null as Slot | null;

  for (const node of entries) {
    const title = titleOf(node);
    const chapters = finalChapters(title);
    if (chapters) {
      labels.set(node.id, chapters);
      continue;
    }
    if (!isSeries(node)) {
      labels.set(node.id, prettyLabel(node.format) || "Entry");
      continue;
    }
    const parsed = parseBestTitle(node.title, title);
    let slot = null as Slot | null;

    if (parsed.season !== null) {
      slot = { id: node.id, season: parsed.season, part: parsed.part, final: parsed.finalSeason };
    } else if (parsed.finalSeason) {
      // "Final Season Part 2" stays in the final season that came right before it.
      const season = last?.final ? last.season : counter + 1;
      slot = { id: node.id, season, part: parsed.part, final: true };
    } else if (parsed.part !== null) {
      slot = { id: node.id, season: Math.max(counter, 1), part: parsed.part, final: last?.final ?? false };
    } else {
      const rest = clean(title.slice(commonPrefix(base, title).length));
      if (rest && /\barc$/i.test(rest)) {
        labels.set(node.id, rest);
        continue;
      }
      // "Mob Psycho 100 II" / "Ore Monogatari!! 2": a bare number or numeral after the shared title.
      const bare = rest && rest !== title ? toNumber(rest) : null;
      slot = { id: node.id, season: bare && bare >= 2 ? bare : counter + 1, part: null, final: false };
    }
    if (!slot) continue;
    counter = Math.max(counter, slot.season);
    slots.push(slot);
    last = slot;
  }

  // Seasons that have more than one entry are shown as parts: "Season 2 Part 1", "Season 2 Part 2".
  const bySeason = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = `${slot.final ? "final" : "s"}${slot.season}`;
    bySeason.set(key, [...(bySeason.get(key) ?? []), slot]);
  }
  for (const group of bySeason.values()) {
    const used = new Set(group.map((g) => g.part).filter((p): p is number => p !== null));
    let next = 1;
    for (const slot of group) {
      if (slot.part === null && group.length > 1) {
        while (used.has(next)) next += 1;
        slot.part = next;
        used.add(next);
      }
      const name = slot.final ? "Final Season" : `Season ${slot.season}`;
      labels.set(slot.id, slot.part !== null ? `${name} Part ${slot.part}` : name);
    }
  }
  return labels;
}

/* ------------------------------------------------------------------ the shared builder */

export type FranchiseEdge = { relationType: string | null; node: FranchiseNode };
export type FranchiseItem = {
  id: number;
  node: FranchiseNode;
  current: boolean;
  badge: "Current" | "Prequel" | "Sequel";
  label: string;
};

/** AniList sometimes files a later part or season under one of these instead of "sequel". */
const PROMOTABLE = new Set(["SIDE_STORY", "ALTERNATIVE", "PARENT", "SPIN_OFF", "OTHER"]);

const dateKey = (d: FranchiseNode["startDate"]) =>
  d && d.year ? d.year * 10000 + (d.month ?? 6) * 100 + (d.day ?? 15) : Number.MAX_SAFE_INTEGER;

/**
 * The Seasons list of one anime: every season, part, movie and OVA in release order, named.
 * `chain` is the prequel/sequel walk; `edges` are the direct neighbours of the page's anime.
 * A TV entry that AniList files as a side story or alternative, but whose title says it is a
 * season or part of this same series, is brought into the list instead of staying under Related.
 */
export function buildFranchise(
  me: FranchiseNode,
  chain: FranchiseNode[] | undefined,
  edges: FranchiseEdge[],
): FranchiseItem[] {
  const pool = new Map<number, FranchiseNode>();
  const direct = edges
    .filter((e) => e.relationType === "PREQUEL" || e.relationType === "SEQUEL")
    .map((e) => e.node);
  for (const n of chain?.length ? chain : direct) pool.set(n.id, n);
  pool.set(me.id, me);

  for (const e of edges) {
    const n = e.node;
    if (!e.relationType || !PROMOTABLE.has(e.relationType) || pool.has(n.id)) continue;
    if (n.format !== "TV" || !isSeasonLike(n.title)) continue;
    if ([...pool.values()].some((p) => sameSeries(p.title, n.title))) pool.set(n.id, n);
  }

  const sorted = [...pool.values()].sort((a, b) => {
    const byDate = dateKey(a.startDate) - dateKey(b.startDate);
    if (byDate) return byDate;
    // Same day (or both unknown): put "Part 1" before "Part 2", then keep a steady order.
    const pa = parseBestTitle(a.title, titleOf(a));
    const pb = parseBestTitle(b.title, titleOf(b));
    return (pa.season ?? 0) - (pb.season ?? 0) || (pa.part ?? 0) - (pb.part ?? 0) || a.id - b.id;
  });
  const labels = labelFranchise(sorted);
  const here = sorted.findIndex((n) => n.id === me.id);
  return sorted.map<FranchiseItem>((node, i) => ({
    id: node.id,
    node,
    current: node.id === me.id,
    badge: node.id === me.id ? "Current" : i < here ? "Prequel" : "Sequel",
    label: labels.get(node.id) ?? "Entry",
  }));
}
