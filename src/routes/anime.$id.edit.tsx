import { createFileRoute, redirect } from "@tanstack/react-router";

// The old "Manage episodes" page is gone: every anime plays through the Universal Servers, so
// there is nothing to add. Anyone who still opens this address lands on the normal details page.
export const Route = createFileRoute("/anime/$id/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/anime/$id", params: { id: params.id }, replace: true });
  },
});
