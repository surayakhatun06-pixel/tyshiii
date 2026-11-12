import { useEffect, useRef, useState } from "react";
import { Play, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { canSeekEmbed, playableSrc, type Embed } from "@/lib/video-embed";
import { parsePlayerMessage } from "@/lib/player-messages";
import {
  setNativeAudioTrack,
  trackMessages,
  type Track,
} from "@/lib/audio-track";
import { SANDBOX, useShield } from "@/hooks/use-shield";

const IFRAME_ALLOW =
  "autoplay; encrypted-media; fullscreen; picture-in-picture";
type Props = {
  embed: Embed;
  title: string;
  poster?: string | null;
  /** Seconds to start from. Read once on mount; remount (change `key`) to apply a new value. */
  startAt?: number;
  autoPlay?: boolean;
  /** SUB or DUB, for players that hold both audio tracks in one link. */
  track?: Track;
  onTime?: (position: number, duration: number | null) => void;
  onPause?: () => void;
  onEnded?: () => void;
};

/**
 * Plays either a direct video file (full control: resume, progress, ended) or an
 * iframe embed. YouTube and Vimeo iframes report time through postMessage; other
 * embeds (AniLink-style pages, Drive, etc.) play fine but can't be timed.
 */
export function VideoPlayer({
  embed,
  title,
  poster,
  startAt = 0,
  autoPlay = true,
  track,
  onTime,
  onPause,
  onEnded,
}: Props) {
  // Callbacks live in a ref so listeners never need re-attaching.
  const cb = useRef({ onTime, onPause, onEnded });
  cb.current = { onTime, onPause, onEnded };

  const [start] = useState(() => (canSeekEmbed(embed) ? startAt : 0));
  const stage = useRef<HTMLDivElement>(null);

  function seek(offset: number) {
    const video = stage.current?.querySelector("video");
    if (!video) return;
    video.currentTime = Math.max(
      0,
      Math.min(
        Number.isFinite(video.duration) ? video.duration : Infinity,
        video.currentTime + offset,
      ),
    );
  }
  return (
    <div
      ref={stage}
      tabIndex={0}
      aria-label={`Video player: ${title}`}
      className="relative h-full w-full overflow-hidden rounded-[inherit] outline-none"
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("input, select, textarea, button, summary")
        )
          return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        const video = stage.current?.querySelector("video");
        if (!video) return;
        if (event.key === " " || event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (video.paused)
            void video
              .play()
              .catch(() =>
                toast.error("Press the video's play button to start."),
              );
          else video.pause();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          seek(event.key === "ArrowLeft" ? -10 : 10);
        } else if (event.key.toLowerCase() === "m") {
          event.preventDefault();
          video.muted = !video.muted;
        }
      }}
    >
      {embed.kind === "video" ? (
        <FilePlayer
          src={embed.src}
          poster={poster}
          start={start}
          autoPlay={autoPlay}
          track={track}
          cb={cb}
        />
      ) : (
        <FramePlayer
          embed={embed}
          title={title}
          start={start}
          autoPlay={autoPlay}
          track={track}
          cb={cb}
        />
      )}
    </div>
  );
}

type CbRef = React.RefObject<Pick<Props, "onTime" | "onPause" | "onEnded">>;

function FilePlayer({
  src,
  poster,
  start,
  autoPlay,
  track,
  cb,
}: {
  src: string;
  poster?: string | null;
  start: number;
  autoPlay: boolean;
  track?: Track;
  cb: CbRef;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  // Pick the audio track in place (no reload) when the file carries both.
  useEffect(() => {
    if (track && ref.current) setNativeAudioTrack(ref.current, track);
  }, [track]);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  function onLoadedMetadata() {
    const v = ref.current;
    if (!v) return;
    if (track) setNativeAudioTrack(v, track);
    if (start > 0 && (!Number.isFinite(v.duration) || start < v.duration - 1))
      v.currentTime = start;
    if (autoPlay) v.play().catch(() => setBlocked(true));
  }

  if (failed) {
    return (
      <div className="grid h-full w-full place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="size-8" />
          This video couldn't be loaded. Try another episode or reload the
          player.
        </div>
      </div>
    );
  }

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        controls
        controlsList="nofullscreen noremoteplayback"
        disablePictureInPicture
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => setBlocked(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          cb.current?.onTime?.(
            v.currentTime,
            Number.isFinite(v.duration) ? v.duration : null,
          );
        }}
        onPause={() => cb.current?.onPause?.()}
        onEnded={() => cb.current?.onEnded?.()}
        onError={() => setFailed(true)}
        className="h-full w-full rounded-[inherit] object-cover"
      />
      {blocked && (
        <button
          type="button"
          onClick={() =>
            ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true))
          }
          aria-label="Play"
          className="absolute inset-0 grid place-items-center bg-black/40"
        >
          <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}
    </>
  );
}

function FramePlayer({
  embed,
  title,
  start,
  autoPlay,
  track,
  cb,
}: {
  embed: Embed;
  title: string;
  start: number;
  autoPlay: boolean;
  track?: Track;
  cb: CbRef;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() =>
    playableSrc(embed, { start, autoplay: autoPlay }),
  );
  const [loaded, setLoaded] = useState(false);
  const gotSignal = useRef(false);
  // Ad shield: unknown embed pages (anime players) run in a locked box with no popups and no redirects.
  // Well-known hosts (YouTube, Vimeo, Drive) are left alone so their own buttons keep working.
  const { adShield, freshPlayer } = useShield();
  const shielded = adShield && embed.provider === "generic";
  const fresh = freshPlayer && embed.provider === "generic";
  // An ad layer can still send the player ITSELF to an ad page (a sandbox can't stop that). A real player loads once,
  // so a second load after it has been running means it was redirected: put the real player back.
  const loads = useRef(0);
  const mountedAt = useRef(Date.now());
  const [recoveries, setRecoveries] = useState(0);
  function handleLoad() {
    setLoaded(true);
    loads.current += 1;
    if (
      shielded &&
      loads.current > 1 &&
      Date.now() - mountedAt.current > 3000 &&
      recoveries < 5
    ) {
      toast.info("Blocked an ad redirect inside the player.");
      loads.current = 0;
      mountedAt.current = Date.now();
      setRecoveries((n) => n + 1);
    }
  }

  useEffect(() => {
    const origin = (() => {
      try {
        return new URL(src).origin;
      } catch {
        return "*";
      }
    })();

    // YouTube and Vimeo only talk once we say we're listening, and may ignore us until
    // their player has booted, so we retry for a few seconds.
    function handshake() {
      const w = frame.current?.contentWindow;
      if (!w) return;
      if (embed.provider === "youtube") {
        w.postMessage(
          JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
          origin,
        );
        w.postMessage(
          JSON.stringify({
            event: "command",
            func: "addEventListener",
            args: ["onStateChange"],
            id: 1,
            channel: "widget",
          }),
          origin,
        );
      } else if (embed.provider === "vimeo") {
        for (const value of ["timeupdate", "ended", "pause"]) {
          w.postMessage(
            JSON.stringify({ method: "addEventListener", value }),
            origin,
          );
        }
      }
    }

    // Only the first "ended" per video counts (some players repeat it).
    let endedSent = false;

    function onMessage(e: MessageEvent) {
      // Only our own player frame, never a frame nested inside it (that is where ads live).
      if (e.source !== frame.current?.contentWindow) return;
      // YouTube and Vimeo are strict. Other players may redirect to another address, so any
      // address is fine for them as long as the message really comes from our frame.
      if (e.origin !== origin && (embed.provider === "youtube" || embed.provider === "vimeo")) return;
      // Turn on with: localStorage.setItem("tyshi-debug-player", "1"), then reload. Shows what the embed sends.
      if (window.localStorage.getItem("tyshi-debug-player") === "1")
        console.log("[player message]", e.origin, e.data);
      if (
        embed.provider === "vimeo" &&
        typeof e.data === "string" &&
        e.data.includes('"ready"')
      )
        handshake();
      const sig = parsePlayerMessage(e.data, embed.provider);
      if (!sig) return;
      gotSignal.current = true;
      if (sig.time !== undefined)
        cb.current?.onTime?.(sig.time, sig.duration ?? null);
      if (sig.ended && !endedSent) {
        endedSent = true;
        cb.current?.onEnded?.();
      }
    }

    window.addEventListener("message", onMessage);
    const canTalk = embed.provider === "youtube" || embed.provider === "vimeo";
    let tries = 0;
    const retry = canTalk
      ? window.setInterval(() => {
          if (gotSignal.current || ++tries > 12)
            return window.clearInterval(retry);
          handshake();
        }, 1000)
      : undefined;

    return () => {
      window.removeEventListener("message", onMessage);
      if (retry) window.clearInterval(retry);
    };
  }, [embed.provider, src, cb]);

  // Tell the embedded player which audio track to use: when it loads, and whenever SUB/DUB
  // changes. Sent to the player's own origin only, and repeated a few times while it boots.
  useEffect(() => {
    if (!track || !loaded) return;
    let host = "";
    let origin = "";
    try {
      const u = new URL(src);
      host = u.hostname;
      origin = u.origin;
    } catch {
      return;
    }
    if (embed.provider === "youtube" || embed.provider === "vimeo") return;
    const send = () => {
      const w = frame.current?.contentWindow;
      if (!w) return;
      for (const message of trackMessages(host, track))
        w.postMessage(message, origin);
    };
    send();
    const timers = [400, 1200, 3000].map((ms) => window.setTimeout(send, ms));
    return () => timers.forEach(window.clearTimeout);
  }, [track, loaded, src, embed.provider]);

  return (
    <>
      {!loaded && (
        <div
          className="pointer-events-none absolute inset-0 animate-pulse bg-surface-2"
          aria-hidden
        />
      )}
      <iframe
        // A new iframe is made whenever the protection changes, because these settings are read at load time.
        key={`${shielded ? "shield" : "open"}-${fresh ? "fresh" : "saved"}-${recoveries}`}
        ref={frame}
        src={src}
        title={title}
        allow={IFRAME_ALLOW}
        allowFullScreen
        sandbox={shielded ? SANDBOX : undefined}
        // Chrome / Brave: load the player with empty, throw-away storage so it can't remember an old language.
        {...(fresh
          ? ({ credentialless: true } as Record<string, boolean>)
          : {})}
        onLoad={handleLoad}
        className="relative h-full w-full border-0"
      />
    </>
  );
}
