/**
 * Switching SUB / DUB inside a player that has BOTH audio tracks in one link.
 *
 * - If your sub and dub links are different (for example ...?track=sub and ...?track=dub) the
 *   page simply loads the other link; nothing here is needed.
 * - If both buttons point at the SAME link, the page keeps the player running and tells it which
 *   audio track to use:
 *     * a direct video file: switched natively through video.audioTracks;
 *     * an embedded player (iframe): by postMessage. A page can never reach into a
 *       cross-origin iframe, so this only works when that player listens for messages.
 *       Put the message format your player documents in PROTOCOLS below, keyed by its host.
 */
export type Track = "sub" | "dub";

/** Language codes tried when matching audio tracks. SUB = Japanese audio, DUB = English audio. */
export const TRACK_LANGS: Record<Track, string[]> = {
  sub: ["ja", "jpn", "jp", "japanese"],
  dub: ["en", "eng", "english"],
};

type Protocol = (track: Track) => unknown[];

/**
 * Per-host message formats. Add your player's real one here, for example:
 *   "player.example.com": (t) => [{ action: "audio", value: t === "dub" ? "en" : "ja" }],
 */
export const PROTOCOLS: Record<string, Protocol> = {};

/** Used for hosts not listed above. Harmless if the player ignores it. */
const generic: Protocol = (track) => [
  { type: "setAudioTrack", track, lang: TRACK_LANGS[track][0] },
  { event: "audioTrack", track, language: TRACK_LANGS[track][0] },
];

export function trackMessages(host: string, track: Track): unknown[] {
  return (PROTOCOLS[host] ?? generic)(track);
}

/** Enable the matching audio track on a native <video>, where the browser supports it. */
export function setNativeAudioTrack(video: HTMLVideoElement, track: Track): boolean {
  const list = (video as HTMLVideoElement & {
    audioTracks?: ArrayLike<{ enabled: boolean; language: string; label: string }> & { length: number };
  }).audioTracks;
  if (!list || !list.length) return false;
  const wanted = TRACK_LANGS[track];
  let hit = -1;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const key = `${t.language} ${t.label}`.toLowerCase();
    if (wanted.some((w) => t.language.toLowerCase() === w || key.includes(w))) hit = i;
  }
  if (hit < 0) return false;
  for (let i = 0; i < list.length; i++) list[i].enabled = i === hit;
  return true;
}
