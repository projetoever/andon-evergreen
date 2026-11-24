import type { AndonCall } from "@/types/andon";
import { getCallSubtypeLabel } from "@/utils/statusUtils";

type DashboardCall = Pick<AndonCall, "subtype" | "callReasonSnapshot">;

/**
 * PENTE 4-A: The group exists only when the original opening has a coherent,
 * immutable reason/option snapshot. Direct and legacy calls display the sector.
 * Never infer group membership from the mutable reason catalog.
 */
export function getDashboardCallIdentity(call: DashboardCall): {
  sector: string;
  group: string | null;
  label: string;
} {
  const sector = getCallSubtypeLabel(call.subtype);
  const snapshot = call.callReasonSnapshot;
  if (
    !snapshot ||
    snapshot.technicalAreaId !== call.subtype ||
    !snapshot.reasonId?.trim() ||
    !snapshot.optionId?.trim() ||
    !snapshot.reasonNameSnapshot?.trim() ||
    !snapshot.optionNameSnapshot?.trim()
  ) {
    return { sector, group: null, label: sector };
  }

  const originalSector = snapshot.optionNameSnapshot.trim();
  const originalGroup = snapshot.reasonNameSnapshot.trim();
  return {
    sector: originalSector,
    group: originalGroup,
    label: `${originalSector} — ${originalGroup}`,
  };
}
