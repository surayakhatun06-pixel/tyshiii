import { AdminHeader } from "@/components/admin/ui";
import { SpotlightEditor } from "@/components/admin/spotlight-editor";

/** The home-page hero, on its own page. */
export function SpotlightView() {
  return (
    <>
      <AdminHeader title="Spotlight" subtitle="The slides at the top of the home page." />
      <SpotlightEditor />
    </>
  );
}
