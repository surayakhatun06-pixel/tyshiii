import { createFileRoute } from "@tanstack/react-router";

import { SiteShell } from "@/components/site-shell";
import { AdminGate } from "@/components/admin/admin-gate";
import { AdminHub } from "@/components/admin/hub";
import { AdminNav } from "@/components/admin/admin-nav";
import { SourceSwitch } from "@/components/admin/tmdb-panel";
import { BulkView } from "@/components/admin/bulk-view";
import { DetailsView } from "@/components/admin/details-view";
import { EpisodesView } from "@/components/admin/episodes-view";
import { LibraryView } from "@/components/admin/library-view";
import { NewView } from "@/components/admin/new-view";
import { ServersView } from "@/components/admin/servers-view";
import { SpotlightView } from "@/components/admin/spotlight-view";
import { MoreView } from "@/components/admin/more-view";
import { UniversalServersView } from "@/components/admin/universal-servers-view";
import { BackgroundsView } from "@/components/admin/backgrounds-view";
import { SiteAnnouncementsEditor } from "@/components/admin/site-announcements-editor";
import type { AdminSearch, AdminView } from "@/components/admin/ui";

const VIEWS: AdminView[] = ["universal", "more", "episodes", "library", "spotlight", "new", "details", "bulk", "servers", "announcements", "backgrounds"];
const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

export const Route = createFileRoute("/admin")({
  // /admin = the hub. /admin?view=episodes&anime=ID opens a view (the "Admin" link on anime pages uses ?anime=ID).
  validateSearch: (search: Record<string, unknown>): AdminSearch => {
    const anime = positive(search.anime);
    const view = VIEWS.includes(search.view as AdminView)
      ? (search.view as AdminView)
      : anime
        ? "episodes"
        : undefined;
    return { view, anime, from: positive(search.from) };
  },
  head: () => ({
    meta: [{ title: "Admin | TYSHI ZONE" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { view, anime, from } = Route.useSearch();
  return (
    <SiteShell>
      <div className="mx-auto max-w-[900px] px-4 py-6 md:px-8">
        <AdminGate>
          {(user) => (
            <>
              <AdminNav view={view} />
              {(() => {
            switch (view) {
              case "episodes":
                return anime ? <EpisodesView animeId={anime} /> : <SourceSwitch><EpisodesView animeId={anime} /></SourceSwitch>;
              case "library":
                return <LibraryView />;
              case "details":
                return <DetailsView animeId={anime} />;
              case "new":
                return <SourceSwitch><NewView from={from} /></SourceSwitch>;
              case "bulk":
                return anime ? <BulkView rootId={anime} /> : <SourceSwitch><BulkView rootId={anime} /></SourceSwitch>;
              case "servers":
                return <ServersView animeId={anime} />;
              case "spotlight":
                return <SpotlightView />;
              case "universal":
                return <UniversalServersView />;
              case "more":
                return <MoreView />;
              case "backgrounds":
                return <BackgroundsView />;
              case "announcements":
                return <SiteAnnouncementsEditor />;
              default:
                return <AdminHub user={user} />;
            }
              })()}
            </>
          )}
        </AdminGate>
      </div>
    </SiteShell>
  );
}
