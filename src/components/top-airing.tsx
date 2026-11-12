import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Captions, CalendarDays, ChevronRight, Star } from "lucide-react";

import { prettyLabel, titleOf, type MediaCard } from "@/lib/anilist";
import { topAiringQuery } from "@/lib/queries";

const chip =
  "inline-flex items-center gap-1 rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] font-medium text-foreground/85 backdrop-blur-sm";
const fadeLeft = "linear-gradient(to right, transparent 0%, black 65%)";

function progress(m: MediaCard) {
  const aired = m.nextAiringEpisode
    ? m.nextAiringEpisode.episode - 1
    : m.episodes;
  if (aired && m.episodes) return `${aired} / ${m.episodes}`;
  return String(aired ?? m.episodes ?? "?");
}

/** Top Airing: every row carries its own faded banner behind it. */
export function TopAiring() {
  const { data, isPending } = useQuery(topAiringQuery());
  const list = (data?.media ?? []).slice(0, 6);

  return (
    <aside
      aria-labelledby="top-airing-heading"
      className="glass rounded-2xl p-3"
    >
      <h2
        id="top-airing-heading"
        className="mb-2 text-sm font-bold tracking-wide"
      >
        <Link
          to="/browse"
          search={{ status: "RELEASING", sort: "TRENDING_DESC" }}
          aria-label="Browse all top airing anime"
          className="flex w-fit items-center gap-1 px-1 transition-colors hover:text-primary"
        >
          <ChevronRight className="size-4" />
          TOP AIRING
        </Link>
      </h2>
      <ul className="flex flex-col gap-2">
        {isPending
          ? Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="h-[84px] animate-pulse rounded-xl bg-surface-2"
              />
            ))
          : list.map((m) => {
              const banner =
                m.bannerImage ?? m.coverImage.extraLarge ?? m.coverImage.large;
              return (
                <li
                  key={m.id}
                  className="group relative z-0 transition-transform duration-200 ease-out hover:z-10 md:hover:-translate-y-1 md:hover:scale-[1.025] motion-reduce:transition-none"
                >
                  <div className="relative flex h-[84px] items-center gap-3 overflow-hidden rounded-xl bg-surface/60 ring-1 ring-border transition-[box-shadow,ring-color] duration-200 group-hover:ring-primary/45 group-hover:shadow-[0_10px_28px_var(--theme-wash)]">
                    {banner && (
                      <img
                        src={banner}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-y-0 right-0 block h-full w-4/5 object-cover opacity-55 transition-transform duration-300 group-hover:scale-105 md:opacity-60"
                        style={{
                          maskImage: fadeLeft,
                          WebkitMaskImage: fadeLeft,
                        }}
                      />
                    )}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/55 via-black/15 to-transparent"
                    />
                    {m.coverImage.large && (
                      <Link
                        to="/anime/$id"
                        params={{ id: String(m.id) }}
                        aria-label={`Open ${titleOf(m)} details`}
                        className="relative h-full w-[60px] shrink-0"
                      >
                        <img
                          src={m.coverImage.large}
                          alt={`${titleOf(m)} poster art`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </Link>
                    )}
                    <span className="relative min-w-0 pr-2">
                      <span className="flex items-center gap-2 text-sm font-bold leading-tight">
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        <Link
                          to="/anime/$id"
                          params={{ id: String(m.id) }}
                          className="line-clamp-2 hover:text-primary"
                        >
                          {titleOf(m)}
                        </Link>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {m.format && (
                          <span className={chip}>{prettyLabel(m.format)}</span>
                        )}
                        {m.seasonYear && (
                          <span className={chip}>
                            <CalendarDays
                              className="size-3"
                              aria-label="Year"
                            />
                            {m.seasonYear}
                          </span>
                        )}
                        <span className={chip}>
                          <Captions className="size-3" aria-label="Episodes" />
                          {progress(m)}
                        </span>
                        {m.averageScore ? (
                          <span className={chip}>
                            <Star className="size-3" aria-label="Score" />
                            {m.averageScore}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
      </ul>
    </aside>
  );
}
