import { createFileRoute } from "@tanstack/react-router";
import { ActiveCallsPage } from "@/pages/ActiveCallsPage";

export const Route = createFileRoute("/active-calls")({
  component: ActiveCallsPage,
});
