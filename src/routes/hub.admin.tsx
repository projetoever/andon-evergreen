import { createFileRoute } from "@tanstack/react-router";
import { HubAdminPage } from "@/pages/HubAdminPage";
import { HUB_ADMIN_SECTIONS, type HubAdminSection } from "@/types/modules";

export const Route = createFileRoute("/hub/admin")({
  validateSearch: (search: Record<string, unknown>): { section?: HubAdminSection } => ({
    section: HUB_ADMIN_SECTIONS.includes(search.section as HubAdminSection)
      ? (search.section as HubAdminSection)
      : undefined,
  }),
  component: HubAdminPage,
});
