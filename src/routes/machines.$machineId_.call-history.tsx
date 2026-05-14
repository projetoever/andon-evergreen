import { createFileRoute } from "@tanstack/react-router";
import { MachineCallHistoryPage } from "@/pages/MachineCallHistoryPage";

export const Route = createFileRoute("/machines/$machineId_/call-history")({
  component: MachineCallHistoryRoute,
});

function MachineCallHistoryRoute() {
  const params = Route.useParams() as { machineId?: string; machineId_?: string };
  return <MachineCallHistoryPage machineId={params.machineId ?? params.machineId_ ?? ""} />;
}
