import { createFileRoute } from "@tanstack/react-router";
import { MachineCallHistoryPage } from "@/pages/MachineCallHistoryPage";

export const Route = createFileRoute("/machines/$machineId_/failure-history")({
  component: MachineFailureHistoryRoute,
});

function MachineFailureHistoryRoute() {
  const params = Route.useParams() as { machineId?: string; machineId_?: string };
  return <MachineCallHistoryPage machineId={params.machineId ?? params.machineId_ ?? ""} />;
}
