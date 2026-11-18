export type ImportedEpisode = {
  episode: string;
  title: string;
  thumbnail: string;
  url: string;
};

export function validImageUrl(value: string): boolean {
  if (!value || /^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(value))
    return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function parsePersonalLibrary(text: string) {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 1000)
    throw new Error("Choose a JSON backup with 1–1,000 videos.");
  return parsed.map((record: unknown, index) => {
    if (!record || typeof record !== "object")
      throw new Error(`Invalid video ${index + 1}.`);
    const entry = record as Record<string, unknown>;
    if (entry.animeId !== undefined && entry.animeId !== null)
      throw new Error(
        "Import anime episodes from that anime's Manage episodes page.",
      );
    if (typeof entry.url !== "string" || !entry.url.trim())
      throw new Error(`Video ${index + 1} needs a URL.`);
    const seriesLogo =
      typeof entry.seriesLogo === "string" ? entry.seriesLogo.trim() : "";
    if (!validImageUrl(seriesLogo))
      throw new Error(`Video ${index + 1} has an invalid logo.`);
    return {
      url: entry.url.trim(),
      title:
        typeof entry.title === "string"
          ? entry.title.trim().slice(0, 200)
          : "Untitled",
      seriesName:
        typeof entry.seriesName === "string"
          ? entry.seriesName.trim().slice(0, 200)
          : "",
      seriesLogo,
    };
  });
}

export function parseEpisodeList(text: string): ImportedEpisode[] {
  if (text.trim().startsWith("[")) {
    const records: unknown = JSON.parse(text);
    if (!Array.isArray(records))
      throw new Error("Expected a JSON array of episodes.");
    return records.map((record: unknown, index) => {
      if (!record || typeof record !== "object")
        throw new Error(`Invalid item ${index + 1}.`);
      const entry = record as Record<string, unknown>;
      if (typeof entry.url !== "string" || !entry.url.trim())
        throw new Error(`Item ${index + 1} needs a video URL.`);
      return {
        episode: entry.episode == null ? "" : String(entry.episode),
        title: typeof entry.title === "string" ? entry.title : "",
        thumbnail: typeof entry.thumbnail === "string" ? entry.thumbnail : "",
        url: entry.url.trim(),
      };
    });
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      const lead =
        parts.length > 1
          ? parts[0].match(/^(?:episode|ep\.?|e)?\s*0*(\d+)$/i)
          : null;
      const episode = lead ? lead[1] : "";
      if (lead) parts.shift();
      const url = parts.pop() ?? "";
      const [title = "", thumbnail = ""] = parts;
      return { episode, title, thumbnail, url };
    });
}

export function missingEpisodes(numbers: number[]): {
  count: number;
  first: number[];
} {
  const sorted = [
    ...new Set(
      numbers.filter((number) => Number.isSafeInteger(number) && number > 0),
    ),
  ].sort((first, second) => first - second);
  let previous = 0;
  let count = 0;
  const first: number[] = [];
  for (const number of sorted) {
    count += number - previous - 1;
    for (
      let candidate = previous + 1;
      candidate < number && first.length < 12;
      candidate++
    )
      first.push(candidate);
    previous = number;
  }
  return { count, first };
}

export function downloadEpisodes(filename: string, records: unknown[]) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
