import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/pages/HistoryPage";

/** The URL only selects a filter. Authorization always comes from the
 * authenticated session and the SQL machine scope, never from this value. */
export const Route = createFileRoute("/history")({
  validateSearch: (search: Record<string, unknown>): { machineId?: string } => ({
    machineId:
      typeof search.machineId === "string" &&
      search.machineId.length >= 1 &&
      search.machineId.length <= 128 &&
      !/[\u0000-\u001f\u007f]/.test(search.machineId)
        ? search.machineId
        : undefined,
  }),
  component: HistoryPage,
});
