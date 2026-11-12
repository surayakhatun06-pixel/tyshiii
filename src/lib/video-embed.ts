export type EmbedProvider =
  "youtube" | "vimeo" | "dailymotion" | "drive" | "file" | "generic";

export type Embed = {
  kind: "iframe" | "video";
  src: string;
  host: string;
  provider: EmbedProvider;
};

const FILE_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i;

function decodeEntities(s: string) {
  return s.replace(/&amp;|&#0*38;|&#x0*26;/gi, "&");
}

/**
 * Accepts a pasted link, a full <iframe ...> embed code, or a <video>/<source> snippet
 * and returns something playable. Any host we don't recognise is embedded as a plain
 * iframe, which is how AniLink-style embed pages work.
 */
export function toEmbed(input: string): Embed | null {
  let raw = input.trim();
  if (!raw) return null;

  const fromIframe = raw.match(/<iframe[^>]+src\s*=\s*["']([^"']+)["']/i);
  const fromVideo = raw.match(
    /<(?:video|source)[^>]+src\s*=\s*["']([^"']+)["']/i,
  );
  if (fromIframe) raw = fromIframe[1];
  else if (fromVideo) raw = fromVideo[1];
  else if (/\s/.test(raw)) {
    // "Some label https://site/embed/1" -> take the first URL.
    const m = raw.match(/https?:\/\/[^\s"'<>]+/i);
    if (m) raw = m[0];
  }
  raw = decodeEntities(raw).trim();

  if (raw.startsWith("//")) raw = `https:${raw}`;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!u.hostname.includes(".")) return null;

  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const iframe = (src: string, provider: EmbedProvider): Embed => ({
    kind: "iframe",
    src,
    host,
    provider,
  });

  // YouTube
  if (/(^|\.)youtube(?:-nocookie)?\.com$/.test(host) || host === "youtu.be") {
    let id = host === "youtu.be" ? parts[0] : u.searchParams.get("v");
    if (!id && ["shorts", "embed", "live"].includes(parts[0])) id = parts[1];
    const list = u.searchParams.get("list");
    if (id)
      return iframe(
        `https://www.youtube-nocookie.com/embed/${id}${list ? `?list=${list}` : ""}`,
        "youtube",
      );
    if (list)
      return iframe(
        `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
        "youtube",
      );
  }
  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((p) => /^\d+$/.test(p));
    if (id) return iframe(`https://player.vimeo.com/video/${id}`, "vimeo");
  }
  // Dailymotion
  if (host === "dailymotion.com" || host === "dai.ly") {
    const id = host === "dai.ly" ? parts[0] : parts[parts.indexOf("video") + 1];
    if (id)
      return iframe(
        `https://www.dailymotion.com/embed/video/${id}`,
        "dailymotion",
      );
  }
  // Google Drive
  if (host === "drive.google.com") {
    const id = parts[parts.indexOf("d") + 1];
    if (parts.includes("d") && id)
      return iframe(`https://drive.google.com/file/d/${id}/preview`, "drive");
  }
  // Direct video file
  if (FILE_RE.test(u.pathname))
    return { kind: "video", src: u.toString(), host, provider: "file" };

  // Anything else: embed the page/link directly in an iframe
  return iframe(u.toString(), "generic");
}

/** Providers where we can start playback at a given second via the embed URL. */
export function canSeekEmbed(embed: Embed) {
  return (
    embed.kind === "video" ||
    ["youtube", "vimeo", "dailymotion"].includes(embed.provider)
  );
}

/** Providers (or files) that report playback time back to the page. */
export function canTrackEmbed(embed: Embed) {
  return (
    embed.kind === "video" ||
    embed.provider === "youtube" ||
    embed.provider === "vimeo"
  );
}

/** Adds resume + autoplay parameters for providers that support them. Other embeds are untouched. */
export function playableSrc(
  embed: Embed,
  opts: { start?: number; autoplay?: boolean } = {},
) {
  if (embed.kind === "video") return embed.src;
  const start = Math.floor(opts.start ?? 0);
  let u: URL;
  try {
    u = new URL(embed.src);
  } catch {
    return embed.src;
  }
  switch (embed.provider) {
    case "youtube":
      u.searchParams.set("enablejsapi", "1");
      if (start > 0) u.searchParams.set("start", String(start));
      if (opts.autoplay) u.searchParams.set("autoplay", "1");
      return u.toString();
    case "vimeo":
      if (opts.autoplay) u.searchParams.set("autoplay", "1");
      if (start > 0) u.hash = `t=${start}s`;
      return u.toString();
    case "dailymotion":
      if (start > 0) u.searchParams.set("start", String(start));
      if (opts.autoplay) u.searchParams.set("autoplay", "1");
      return u.toString();
    default:
      return embed.src;
  }
}
