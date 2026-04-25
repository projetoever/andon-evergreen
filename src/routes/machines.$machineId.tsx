import { createFileRoute } from "@tanstack/react-router";
import { MachineDetailPage } from "@/pages/MachineDetailPage";

export const Route = createFileRoute("/machines/$machineId")({
  component: MachineDetailRoute,
});

function MachineDetailRoute() {
  const { machineId } = Route.useParams();
  return <MachineDetailPage machineId={machineId} />;
}
