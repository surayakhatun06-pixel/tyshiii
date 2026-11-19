import { SiteShell } from "@/components/site-shell";
import { EpisodeCardSkeleton } from "@/components/episode-card";

const bar = "animate-pulse rounded bg-surface-2";

export function AnimeDetailSkeleton() {
  return (
    <SiteShell>
      <div className="h-56 w-full animate-pulse bg-surface-2 md:h-80" />
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="-mt-20 flex flex-col gap-6 md:-mt-28 md:flex-row">
          <div className="aspect-2/3 w-32 shrink-0 animate-pulse rounded-2xl bg-surface md:w-52" />
          <div className="flex-1 space-y-3 md:pt-32">
            <div className={`${bar} h-9 w-2/3`} />
            <div className={`${bar} h-4 w-1/3`} />
            <div className={`${bar} h-4 w-1/2`} />
            <div className="flex gap-2 pt-3">
              <div className="h-12 w-40 animate-pulse rounded-full bg-surface-2" />
              <div className="h-12 w-36 animate-pulse rounded-full bg-surface-2" />
            </div>
          </div>
        </div>
        <div className="mt-10 space-y-3">
          <div className={`${bar} h-5 w-28`} />
          <div className={`${bar} h-4 w-full`} />
          <div className={`${bar} h-4 w-11/12`} />
          <div className={`${bar} h-4 w-4/5`} />
        </div>
      </div>
    </SiteShell>
  );
}

export function WatchSkeleton() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-[1900px] px-0 pb-6 pt-0 sm:px-3 sm:pt-3 md:px-5">
        <div className="aspect-video w-full animate-pulse bg-surface-2 sm:rounded-xl" />
        <div className="mx-3 mt-3 space-y-2 sm:mx-0 sm:mt-4">
          <div className={`${bar} h-7 w-52`} />
          <div className={`${bar} h-4 w-40`} />
        </div>
        <div className="mx-3 mt-4 h-11 animate-pulse rounded-xl bg-surface sm:mx-0" />
        <div className="mt-8 grid gap-3 px-3 sm:px-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <EpisodeCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
