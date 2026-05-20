import { createFileRoute } from "@tanstack/react-router";
import { MachineFailureHistoryPage } from "@/pages/MachineFailureHistoryPage";

export const Route = createFileRoute("/machines/$machineId_/failure-history")({
  component: MachineFailureHistoryRoute,
});

function MachineFailureHistoryRoute() {
  const params = Route.useParams() as { machineId?: string; machineId_?: string };
  return <MachineFailureHistoryPage machineId={params.machineId ?? params.machineId_ ?? ""} />;
}
