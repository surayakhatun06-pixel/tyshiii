/**
 * Small link helpers with no dependencies, so the watch page can use them without loading the admin code.
 */
/** Pull the link out of a pasted <iframe ...> embed code (or return the text as it is). */
export function linkFromPaste(text: string): string {
  const t = text.trim();
  const m = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(t);
  const raw = (m ? m[1] : t).replace(/&amp;/gi, "&").trim();
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

export const dropParam = (link: string, name: string) =>
  link
    .replace(new RegExp(`([?&])${name}=[^&#]*&`, "i"), "$1")
    .replace(new RegExp(`[?&]${name}=[^&#]*`, "i"), "");

/**
 * One link in, both languages out. Looks for the switch the player uses and flips it:
 *   ?lang=sub / ?lang=dub (also language, track, type, audio, version), ?dub=1,
 *   or a /sub/ or /dub/ part of the path. Returns null when the link has no such switch.
 */
export function trackVariants(
  link: string,
): { sub: string; dub: string } | null {
  const t = link.trim();
  const keyed =
    /([?&#](?:lang|language|track|type|audio|version|category)=)(sub|subbed|dub|dubbed)(?=$|[&#])/i.exec(
      t,
    );
  if (keyed) {
    const word = (isDub: boolean) =>
      /ed$/i.test(keyed[2])
        ? isDub
          ? "dubbed"
          : "subbed"
        : isDub
          ? "dub"
          : "sub";
    const swap = (isDub: boolean) =>
      t.replace(keyed[0], keyed[1] + word(isDub));
    return { sub: swap(false), dub: swap(true) };
  }
  const flag = /([?&])dub=(1|true|yes|0|false|no)(?=$|[&#])/i.exec(t);
  if (flag) {
    const on = /^(1|true|yes)$/i.test(flag[2]);
    const without = dropParam(t, "dub");
    const withDub = on ? t : t.replace(flag[0], `${flag[1]}dub=1`);
    return { sub: without, dub: withDub };
  }
  const seg = /\/(sub|subbed|dub|dubbed)(?=[/?#]|$)/i.exec(t);
  if (seg) {
    const word = (isDub: boolean) =>
      /ed$/i.test(seg[1])
        ? isDub
          ? "dubbed"
          : "subbed"
        : isDub
          ? "dub"
          : "sub";
    const swap = (isDub: boolean) => t.replace(seg[0], `/${word(isDub)}`);
    return { sub: swap(false), dub: swap(true) };
  }
  return null;
}

/**
 * Make a stored player link match the language that was picked. A link that has a language switch
 * (?lang=sub, ?dub=1, /dub/) is flipped to the wanted one, so a wrongly saved link can't play the wrong audio.
 * aniembed links with no switch at all get ?lang=sub / ?lang=dub added.
 */
export function forceLang(url: string, lang: "sub" | "dub"): string {
  const v = trackVariants(url);
  if (v) return v[lang];
  try {
    const u = new URL(url);
    if (/(^|\.)aniembed\./i.test(u.hostname) && !u.searchParams.has("lang")) {
      u.searchParams.set("lang", lang);
      return u.toString();
    }
  } catch {
    /* leave it as it is */
  }
  return url;
}

/** aniembed has more than one address (.ac and .se). Each one keeps its own saved player settings. */
export function swapAniembedHost(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)aniembed\.ac$/i.test(u.hostname)) u.hostname = "aniembed.se";
    else if (/(^|\.)aniembed\.se$/i.test(u.hostname))
      u.hostname = "aniembed.ac";
    else return url;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Ask AniWeeb's dynamic embed endpoint for a new player response after a manual reload.
 * Keep this scoped to that API: arbitrary saved links may contain signed query strings.
 */
export function refreshAniweebLink(url: string, session: number): string {
  if (!session) return url;
  try {
    const u = new URL(url);
    if (
      u.hostname.toLowerCase() !== "api.aniweeb.net" ||
      !/^\/embed\/ani\/\d+\/\d+\/?$/i.test(u.pathname)
    )
      return url;
    // Do not alter URLs that appear signed or tokenized by a provider.
    if (
      ["sig", "signature", "token", "auth", "jwt", "key"].some((key) =>
        u.searchParams.has(key),
      )
    )
      return url;
    u.searchParams.set("_tyshi_session", String(session));
    return u.toString();
  } catch {
    return url;
  }
}

/** Unique request key for a newly opened episode or an explicit player refresh. */
export function nextPlaybackSession() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
