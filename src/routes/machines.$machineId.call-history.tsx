import { createFileRoute } from "@tanstack/react-router";
import { MachineCallHistoryPage } from "@/pages/MachineCallHistoryPage";

export const Route = createFileRoute("/machines/$machineId/call-history")({
  component: MachineCallHistoryRoute,
});

function MachineCallHistoryRoute() {
  const { machineId } = Route.useParams();
  return <MachineCallHistoryPage machineId={machineId} />;
}
