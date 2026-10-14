import { createFileRoute } from "@tanstack/react-router";
import { HubAdminPage } from "@/pages/HubAdminPage";
export const Route = createFileRoute("/hub/admin")({ component: HubAdminPage });
