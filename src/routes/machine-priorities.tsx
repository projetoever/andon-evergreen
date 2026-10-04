import { createFileRoute } from "@tanstack/react-router";
import { DashboardPriorityPage } from "@/pages/DashboardPriorityPage";

export const Route = createFileRoute("/machine-priorities")({
  component: DashboardPriorityPage,
});
