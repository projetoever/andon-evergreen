import { createFileRoute } from "@tanstack/react-router";
import { AndonAdminPage } from "@/pages/AndonAdminPage";

export const Route = createFileRoute("/andon/admin")({
  component: AndonAdminPage,
});
