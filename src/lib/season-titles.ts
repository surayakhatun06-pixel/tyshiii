/**
 * Reads season and part numbers out of anime titles, for example:
 *   "SAKAMOTO DAYS Part 2"                      -> part 2
 *   "Re:ZERO 2nd Season Part 2"                 -> season 2, part 2
 *   "Attack on Titan: The Final Season Part 2"  -> final season, part 2
 * Pure text work: no network, so it is easy to test.
 */

export type TitleLike = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

export type ParsedTitle = {
  /** The title with the season / part words removed ("Attack on Titan"). */
  base: string;
  season: number | null;
  part: number | null;
  finalSeason: boolean;
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

/** "2", "II", "two" or "second" as a number. */
export function toNumber(word: string): number | null {
  const w = word.trim().toLowerCase();
  if (/^\d{1,2}$/.test(w)) return Number(w);
  return WORD_NUMBERS[w] ?? ROMAN[w] ?? null;
}

const NUM = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|i{1,3}|iv|v|vi{0,3}|ix|x)`;

const SEASON_PATTERNS = [
  new RegExp(String.raw`\bseason\s*${NUM}\b`, "i"),
  new RegExp(String.raw`\b${NUM}(?:st|nd|rd|th)\s+season\b`, "i"),
  /\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/i,
];

const PART_PATTERNS = [
  new RegExp(String.raw`\b(?:part|cour)\s*${NUM}\b`, "i"),
  new RegExp(String.raw`\b${NUM}(?:st|nd|rd|th)\s+(?:part|cour)\b`, "i"),
  /\b(second|third|fourth)\s+(?:part|cour)\b/i,
];

/** Take the number out of the first pattern that matches. */
function firstNumber(title: string, patterns: RegExp[]): { value: number; match: string } | null {
  for (const pattern of patterns) {
    const m = title.match(pattern);
    const value = m ? toNumber(m[1]) : null;
    if (m && value !== null && value >= 1) return { value, match: m[0] };
  }
  return null;
}

const tidy = (t: string) =>
  t
    .replace(/\s+/g, " ")
    .replace(/\s+([:,)])/g, "$1")
    .replace(/[\s:–—\-,(]+$/g, "")
    .replace(/^[\s:–—\-,)]+/g, "")
    .trim();

export function parseSeasonTitle(title: string): ParsedTitle {
  let rest = title.trim();
  const finalSeason = /\bfinal\s+season\b/i.test(rest);
  if (finalSeason) rest = rest.replace(/\b(?:the\s+)?final\s+season\b/i, " ");

  const season = firstNumber(rest, SEASON_PATTERNS);
  if (season) rest = rest.replace(season.match, " ");
  const part = firstNumber(rest, PART_PATTERNS);
  if (part) rest = rest.replace(part.match, " ");

  return { base: tidy(rest), season: season?.value ?? null, part: part?.value ?? null, finalSeason };
}

/** A title boiled down for comparing: lower case, letters and digits only. */
export const baseKey = (title: string) =>
  parseSeasonTitle(title)
    .base.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

const variants = (t: TitleLike) =>
  [t.english, t.romaji, t.native].filter((x): x is string => !!x && x.trim().length > 0);

/** Do two entries belong to the same series (same title once season/part words are removed)? */
export function sameSeries(a: TitleLike, b: TitleLike): boolean {
  const keys = new Set(variants(a).map(baseKey).filter((k) => k.length >= 3));
  return variants(b).some((t) => keys.has(baseKey(t)));
}

/** Does any version of the title say it is a season or a part? */
export function isSeasonLike(t: TitleLike): boolean {
  return variants(t).some((title) => {
    const p = parseSeasonTitle(title);
    return p.season !== null || p.part !== null || p.finalSeason;
  });
}

/** Parse the version of a title that actually carries a season / part marker, if any. */
export function parseBestTitle(t: TitleLike, preferred: string): ParsedTitle {
  const first = parseSeasonTitle(preferred);
  if (first.season !== null || first.part !== null || first.finalSeason) return first;
  for (const title of variants(t)) {
    const p = parseSeasonTitle(title);
    if (p.season !== null || p.part !== null || p.finalSeason) return p;
  }
  return first;
}
