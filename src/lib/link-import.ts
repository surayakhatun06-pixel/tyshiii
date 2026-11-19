import { toEmbed, type Embed } from "@/lib/video-embed";

export type ExtractedLink = {
  /** 1-based line in the source text where the link starts. */
  line: number;
  /** The text that was matched (URL or embed code). */
  raw: string;
  /** Normalised playable URL (what gets saved). */
  url: string;
  embed: Embed;
  /** Episode number written before the link on its line ("Ep 5 | …"), if any. */
  explicitEpisode: number | null;
};

export type SkippedLine = { line: number; text: string; reason: string };

const TOKEN =
  /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>(?:\s*<\/iframe>)?|<(?:video|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>|((?:https?:)?\/\/[^\s"'<>|]+)/gi;

const EPISODE_PREFIX = /^\s*(?:episode|ep|e)?\s*[.#:]?\s*0*(\d{1,5})(?![\w])/i;

/**
 * Pulls every link out of a pasted list / TXT file, in the order they appear.
 * Accepts plain URLs, <iframe> embed codes (also spread over several lines),
 * <video>/<source> tags and lines like "Episode 5 | https://…".
 */
export function extractLinks(text: string): {
  links: ExtractedLink[];
  skipped: SkippedLine[];
} {
  const links: ExtractedLink[] = [];
  const skipped: SkippedLine[] = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (index: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const linesWithLinks = new Set<number>();
  let previousEnd = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    const lineIndex = lineOf(index);
    let raw = match[0];
    if (match[3]) raw = raw.replace(/[),.;\]]+$/, "");
    const end = index + match[0].length;
    for (let l = lineIndex; l <= lineOf(Math.max(index, end - 1)); l++)
      linesWithLinks.add(l);

    const prefixStart = Math.max(lineStarts[lineIndex], previousEnd);
    const prefix = text.slice(prefixStart, index);
    previousEnd = end;

    const embed = toEmbed(raw);
    if (!embed) {
      skipped.push({
        line: lineIndex + 1,
        text: raw.slice(0, 160),
        reason: "Not a valid link",
      });
      continue;
    }
    const n = prefix.match(EPISODE_PREFIX);
    const explicit = n ? Number(n[1]) : null;
    links.push({
      line: lineIndex + 1,
      raw,
      url: embed.src,
      embed,
      explicitEpisode: explicit && explicit > 0 ? explicit : null,
    });
  }

  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t || linesWithLinks.has(i) || /^(#|\/\/|<\/iframe>)/i.test(t)) return;
    skipped.push({
      line: i + 1,
      text: t.slice(0, 160),
      reason: "No link found",
    });
  });
  skipped.sort((a, b) => a.line - b.line);
  return { links, skipped };
}

export type NumberingMode = "sequential" | "file";

/** True when every link has its own, unique episode number written in the file. */
export function fileHasEpisodeNumbers(links: ExtractedLink[]): boolean {
  if (!links.length) return false;
  const seen = new Set<number>();
  for (const l of links) {
    if (l.explicitEpisode === null || seen.has(l.explicitEpisode)) return false;
    seen.add(l.explicitEpisode);
  }
  return true;
}

export type MappedLink = ExtractedLink & { number: number };

/** Assigns episode numbers: in file order from `start`, or from the numbers in the file. */
export function mapLinksToEpisodes(
  links: ExtractedLink[],
  mode: NumberingMode,
  start: number,
): MappedLink[] {
  return links.map((link, i) => ({
    ...link,
    number:
      mode === "file" && link.explicitEpisode !== null
        ? link.explicitEpisode
        : start + i,
  }));
}
