import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/pages/HubPage";

export const Route = createFileRoute("/")({
  component: HubPage,
});
