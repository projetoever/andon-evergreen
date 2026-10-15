import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
const api = createAndonApiClient();
let localApprovalRequired = false;
export const getLocalWorkstationApproval = () => localApprovalRequired;
export async function getWorkstationAdmissionPolicy() {
  if (CONFIGURED_DATA_MODE === "local")
    return { requireWorkstationApproval: localApprovalRequired };
  return api.get<{ requireWorkstationApproval: boolean }>("/api/modules/settings");
}
export async function saveWorkstationAdmissionPolicy(requireWorkstationApproval: boolean) {
  if (CONFIGURED_DATA_MODE === "local") {
    localApprovalRequired = requireWorkstationApproval;
    return { requireWorkstationApproval };
  }
  return api.patch<{ requireWorkstationApproval: boolean }>("/api/modules/settings", {
    requireWorkstationApproval,
  });
}
