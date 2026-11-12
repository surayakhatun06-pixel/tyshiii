/** What we can learn from a cross-origin player's postMessage traffic. */
export type PlayerSignal = { time?: number; duration?: number; ended?: boolean };

function parse(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const t = x.trim();
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return null;
}

/** Does an event name mean "the video finished"? Ad events (an ad ending) never count. */
function isEndedName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (/(^|[^a-z])ad(s|vert|break)?([^a-z]|$)/.test(n)) return false;
  // "ended", "video_ended", "MEDIA_ENDED", "playbackEnded"... but not "suspended" or "extended".
  return (
    ENDED_EVENTS.has(n) ||
    /(^|[^a-z])(video|media|playback|player|episode|stream|content|movie)?ended$/.test(n)
  );
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const ENDED_EVENTS = new Set([
  "ended",
  "finish",
  "finished",
  "complete",
  "completed",
  "videoended",
  "onended",
]);

/**
 * Understands the YouTube and Vimeo iframe protocols. For any other embed we only look
 * for an "ended" style event, never timestamps, because unknown players send all sorts
 * of numbers that are not playback positions.
 */
export function parsePlayerMessage(raw: unknown, provider: string): PlayerSignal | null {
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== "object") {
    // A bare text message such as "ended" or "video:ended" (only for players we don't know).
    if (provider !== "youtube" && provider !== "vimeo" && typeof raw === "string" && raw.length < 40) {
      const word = raw.trim().toLowerCase().split(/[:_\-. ]+/).pop() ?? "";
      if (isEndedName(raw) || ["ended", "finished"].includes(word)) return { ended: true };
    }
    return null;
  }
  const d = parsed as Obj;

  if (provider === "youtube") {
    if (d.event === "infoDelivery" && d.info && typeof d.info === "object") {
      const info = obj(d.info);
      const time = num(info.currentTime);
      const duration = num(info.duration);
      const ended = info.playerState === 0 ? true : undefined;
      if (time === undefined && duration === undefined && ended === undefined) return null;
      return { time, duration: duration && duration > 0 ? duration : undefined, ended };
    }
    if (d.event === "onStateChange" && d.info === 0) return { ended: true };
    return null;
  }

  if (provider === "vimeo") {
    if (d.event === "timeupdate" || d.event === "playProgress") {
      const data = obj(d.data);
      const time = num(data.seconds);
      const duration = num(data.duration);
      if (time === undefined) return null;
      return { time, duration: duration && duration > 0 ? duration : undefined };
    }
    if (d.event === "ended" || d.event === "finish") return { ended: true };
    return null;
  }

  // Many players wrap their event, for example {type:"PLAYER_EVENT", data:{event:"ended"}},
  // so look at the message itself and at the object inside it.
  for (const layer of [d, obj(d.data), obj(d.payload), obj(d.message), obj(d.detail)]) {
    const name = String(layer.event ?? layer.type ?? layer.name ?? layer.action ?? "");
    if (isEndedName(name)) return { ended: true };
    const state = String(layer.state ?? layer.status ?? layer.playerState ?? "").toLowerCase();
    if (state === "ended") return { ended: true };
    // Some players only send time updates. Treat "right at the end of a real episode" as ended.
    // Anything under 2 minutes is ignored, so a short ad can never skip the episode.
    if (/time|progress|playing/i.test(name)) {
      const time = num(layer.currentTime ?? layer.time ?? layer.seconds);
      const duration = num(layer.duration);
      if (time !== undefined && duration !== undefined && duration >= 120 && time >= duration - 1)
        return { ended: true };
    }
  }
  return null;
}
