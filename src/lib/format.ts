export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 1112 -> "18:32", 3725 -> "1:02:05" */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

/** 754 -> "13m left", 4000 -> "1h 7m left", 20 -> "<1m left" */
export function formatRemaining(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return "<1m left";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return m ? `${h}h ${m}m left` : `${h}h left`;
  return `${m}m left`;
}

/** Episode 7 -> "07"; extras (no number) -> "Extra". */
export function episodeNumberLabel(episode: number | undefined | null) {
  return episode === undefined || episode === null ? "Extra" : pad2(episode);
}

/** True when a title is just the auto-generated "Episode 7" placeholder. */
export function isDefaultEpisodeTitle(title: string, episode: number | undefined | null) {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (episode === undefined || episode === null) return false;
  return new RegExp(`^(episode|ep\\.?)\\s*0*${episode}$`, "i").test(t);
}
