import { createAndonApiClient } from "@/api/andonApiClient";

const client = createAndonApiClient();
export interface MachineConfigurationInventoryItem {
  id: string;
  name: string;
  requireWorkOrderAtOpen: boolean;
  isActive: boolean;
}
export interface MachineConfigurationInventoryPage {
  items: MachineConfigurationInventoryItem[];
  nextCursor: string | null;
}
/** Settings-only inventory. Never reuse the operational /api/machines route. */
export function listMachineConfigurationInventory(cursor?: string) {
  const query = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
  return client.get<MachineConfigurationInventoryPage>(
    "/api/andon-settings/machines" + query,
  );
}
/** The server returns a sanitized payload if the machine is out of scope. */
export function updateMachineConfigurationInventoryMetadata(
  machineId: string, patch: { name?: string; requireWorkOrderAtOpen?: boolean },
) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(machineId))
    throw new Error("invalid_machine_id");
  return client.patch<MachineConfigurationInventoryItem>(
    "/api/machines/" + encodeURIComponent(machineId), patch,
  );
}
