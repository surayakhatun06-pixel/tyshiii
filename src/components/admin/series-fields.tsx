import { FORMATS, prettyLabel, STATUSES } from "@/lib/anilist";
import type { AnimeRef } from "@/lib/cloud-episodes";
import { cn } from "@/lib/utils";

export const fieldInput =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary";

export type SeriesDraft = {
  title: string;
  poster: string;
  banner: string;
  about: string;
  genres: string;
  year: string;
  format: string;
  status: string;
};

export const emptyDraft: SeriesDraft = {
  title: "",
  poster: "",
  banner: "",
  about: "",
  genres: "",
  year: "",
  format: "",
  status: "",
};

export function draftFromRef(anime: AnimeRef): SeriesDraft {
  return {
    title: anime.title,
    poster: anime.poster ?? "",
    banner: anime.banner ?? "",
    about: anime.about ?? "",
    genres: (anime.genres ?? []).join(", "),
    year: anime.year ? String(anime.year) : "",
    format: anime.format ?? "",
    status: anime.status ?? "",
  };
}

export function validImage(v: string) {
  if (!v.trim()) return true;
  try {
    return ["http:", "https:"].includes(new URL(v.trim()).protocol);
  } catch {
    return false;
  }
}

const yearValid = (v: string) =>
  !v.trim() || (/^\d{4}$/.test(v.trim()) && Number(v) >= 1900 && Number(v) <= 2100);

/** Returns an error message, or null when the draft can be saved. */
export function draftError(d: SeriesDraft): string | null {
  if (!d.title.trim()) return "Add a name.";
  if (!validImage(d.poster)) return "The logo / poster must be an https:// image link.";
  if (!validImage(d.banner)) return "The banner must be an https:// image link.";
  if (!yearValid(d.year)) return "Year must be 4 digits, like 2024.";
  return null;
}

export function draftToDetails(
  d: SeriesDraft,
): Omit<AnimeRef, "anilistId" | "custom"> {
  return {
    title: d.title.trim(),
    poster: d.poster.trim() || null,
    banner: d.banner.trim() || null,
    about: d.about.trim() || null,
    genres: d.genres
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean),
    year: d.year.trim() ? Number(d.year) : null,
    format: d.format || null,
    status: d.status || null,
  };
}

/** Name, logo, banner, about and facts for a series. Used for new and existing ones. */
export function SeriesFields({
  draft,
  onChange,
}: {
  draft: SeriesDraft;
  onChange: (patch: Partial<SeriesDraft>) => void;
}) {
  return (
    <div className="grid flex-1 gap-3 md:grid-cols-2">
      <label className="text-xs text-muted-foreground">
        Name
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={300}
          className={cn(fieldInput, "mt-1")}
        />
      </label>
      <label className="text-xs text-muted-foreground">
        Logo / poster image link
        <input
          value={draft.poster}
          onChange={(e) => onChange({ poster: e.target.value })}
          placeholder="https://…"
          className={cn(fieldInput, "mt-1", !validImage(draft.poster) && "border-destructive")}
        />
      </label>
      <label className="text-xs text-muted-foreground md:col-span-2">
        Banner image link (optional, wide picture on top of the page)
        <input
          value={draft.banner}
          onChange={(e) => onChange({ banner: e.target.value })}
          placeholder="https://…"
          className={cn(fieldInput, "mt-1", !validImage(draft.banner) && "border-destructive")}
        />
      </label>
      <label className="text-xs text-muted-foreground md:col-span-2">
        About
        <textarea
          value={draft.about}
          onChange={(e) => onChange({ about: e.target.value })}
          rows={4}
          maxLength={5000}
          placeholder="What is this series about?"
          className="mt-1 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary"
        />
      </label>
      <label className="text-xs text-muted-foreground md:col-span-2">
        Genres (separate with commas)
        <input
          value={draft.genres}
          onChange={(e) => onChange({ genres: e.target.value })}
          placeholder="Action, Comedy, Fantasy"
          className={cn(fieldInput, "mt-1")}
        />
      </label>
      <div className="grid grid-cols-3 gap-3 md:col-span-2">
        <label className="text-xs text-muted-foreground">
          Year
          <input
            value={draft.year}
            onChange={(e) => onChange({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            inputMode="numeric"
            placeholder="2024"
            className={cn(fieldInput, "mt-1", !yearValid(draft.year) && "border-destructive")}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Format
          <select
            value={draft.format}
            onChange={(e) => onChange({ format: e.target.value })}
            className={cn(fieldInput, "mt-1")}
          >
            <option value="">—</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {prettyLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Status
          <select
            value={draft.status}
            onChange={(e) => onChange({ status: e.target.value })}
            className={cn(fieldInput, "mt-1")}
          >
            <option value="">—</option>
            {STATUSES.map((f) => (
              <option key={f} value={f}>
                {prettyLabel(f)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
