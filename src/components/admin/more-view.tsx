import { useEffect, useState } from "react";
import { Library, ListPlus, Plus, Server } from "lucide-react";

import { Row } from "@/components/admin/hub";
import { AdminHeader, lastOpened, type LastOpened } from "@/components/admin/ui";

/** Extra options: single episodes and the older tools. Most work happens in Bulk import and Universal Servers. */
export function MoreView() {
  const [last, setLast] = useState<LastOpened | null>(null);
  useEffect(() => setLast(lastOpened()), []);
  return (
    <>
      <AdminHeader
        title="Extra options"
        subtitle="Things you rarely need. Bulk import and Universal Servers cover most of the work."
      />
      <div className="space-y-2.5">
        <Row
          s={{ view: "episodes", anime: last?.id }}
          icon={ListPlus}
          title="Add episodes"
          note={last ? `Continue with ${last.title}` : "Add one episode by hand to an anime"}
        />
        <Row s={{ view: "library" }} icon={Library} title="My anime" note="Everything in your database · edit, delete" />
        <Row s={{ view: "new" }} icon={Plus} title="Add anime or series" note="From AniList, or your own series" />
        <Row s={{ view: "servers" }} icon={Server} title="Servers (older tool)" note="Your older embed servers: SUB and DUB links" />
      </div>
    </>
  );
}
