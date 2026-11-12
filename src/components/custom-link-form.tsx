import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { EpisodeThumb } from "@/components/episode-thumb";
import { useVideos, type SavedVideo } from "@/hooks/use-videos";
import { titleOf } from "@/lib/anilist";
import { browseQuery } from "@/lib/queries";
import { toEmbed } from "@/lib/video-embed";
import { validImageUrl } from "@/lib/episode-import";

const field =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

export function CustomLinkForm({
  editing,
  onSaved,
  onClose,
}: {
  editing?: SavedVideo | null;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const { save, update } = useVideos();
  const [series, setSeries] = useState(
    editing?.seriesName || editing?.title || "",
  );
  const [logo, setLogo] = useState(editing?.seriesLogo ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  const results = useQuery({
    ...browseQuery({ search: debounced, perPage: 6, sort: ["SEARCH_MATCH"] }),
    enabled: debounced.length > 1,
    retry: false,
  });
  const embed = toEmbed(url);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!series.trim())
      return setError("Give your series a name, or pick one from search.");
    if (!embed)
      return setError("Paste a valid video link or iframe embed code.");
    if (!validImageUrl(logo.trim()))
      return setError(
        "Use a full image URL or upload a PNG, JPEG or WebP logo.",
      );
    try {
      const input = {
        url: embed.src,
        title: title.trim() || series.trim(),
        seriesName: series.trim(),
        seriesLogo: logo.trim(),
      };
      if (editing) {
        update(editing.id, input);
        onSaved(editing.id);
      } else {
        onSaved(save(input).id);
      }
      toast.success(
        editing ? "Link updated." : "Added to your personal watch library.",
      );
    } catch {
      setError(
        "Couldn't save. Check browser storage permissions or use a smaller logo.",
      );
    }
  }

  return (
    <section
      className="mb-6 rounded-2xl border border-primary/30 bg-surface/40 p-4 md:p-6"
      aria-labelledby="custom-link-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">
            Your personal library
          </p>
          <h2 id="custom-link-heading" className="mt-1 text-xl font-semibold">
            {editing ? "Edit my link" : "Add my own link"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a series from search or create your own. Saved only in this
            browser.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close custom link form"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border hover:text-primary"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <label className="relative block">
            <span className="mb-2 block text-xs text-muted-foreground">
              Find a series and artwork
            </span>
            <Search className="absolute left-3 top-10 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search anime titles…"
              className={`${field} pl-10`}
            />
          </label>
          {debounced.length > 1 && (
            <div
              aria-live="polite"
              className="mt-2 space-y-1 rounded-xl border border-border p-2"
            >
              {results.isPending ? (
                <p className="p-3 text-sm text-muted-foreground">Searching…</p>
              ) : results.isError ? (
                <p className="p-3 text-sm text-destructive">
                  Search is unavailable. Enter a name and logo manually.
                </p>
              ) : results.data?.media.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No matches. You can still create your own series.
                </p>
              ) : (
                results.data?.media.map((media) => (
                  <button
                    key={media.id}
                    type="button"
                    onClick={() => {
                      setSeries(titleOf(media));
                      setLogo(
                        media.coverImage.extraLarge ??
                          media.coverImage.large ??
                          "",
                      );
                      setSearch("");
                      setDebounced("");
                      setError("");
                    }}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2"
                  >
                    <EpisodeThumb
                      src={media.coverImage.large}
                      className="w-16 shrink-0 rounded-md"
                    />
                    <span className="text-sm">{titleOf(media)}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <EpisodeThumb src={logo} className="aspect-[2/1]" />
            <div className="p-3">
              <p className="text-sm font-semibold">
                {series || "Your series name"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {title || "Your video title"}
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Series name *
            </span>
            <input
              required
              maxLength={200}
              value={series}
              onChange={(event) => setSeries(event.target.value)}
              placeholder="Name your series"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Video / episode title
            </span>
            <input
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Episode 1 — The beginning"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Logo or cover image URL
            </span>
            <input
              value={logo.startsWith("data:") ? "" : logo}
              onChange={(event) => setLogo(event.target.value)}
              placeholder={
                logo.startsWith("data:")
                  ? "Uploaded logo selected"
                  : "https://…"
              }
              className={field}
            />
          </label>
          <div className="flex items-center gap-3 text-xs">
            <label className="cursor-pointer rounded-full border border-border px-3 py-2 hover:border-primary">
              Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    ) ||
                    file.size > 300_000
                  )
                    return setError(
                      "Choose a PNG, JPEG or WebP smaller than 300 KB.",
                    );
                  const reader = new FileReader();
                  reader.onload = () => {
                    setLogo(String(reader.result));
                    setError("");
                  };
                  reader.onerror = () =>
                    setError("Couldn't read the logo file.");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {logo && (
              <button
                type="button"
                onClick={() => setLogo("")}
                className="text-muted-foreground hover:text-foreground"
              >
                Remove logo
              </button>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Video link or embed code *
            </span>
            <textarea
              required
              rows={3}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://… or <iframe …>"
              className={`${field} h-auto resize-y py-3`}
            />
          </label>
          {embed && (
            <p className="text-xs text-primary">
              Recognized: {embed.host} ·{" "}
              {embed.kind === "video" ? "direct video" : "embedded player"}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            <Link2 className="size-4" />
            {editing ? "Save changes" : "Save and watch"}
          </button>
        </form>
      </div>
    </section>
  );
}
