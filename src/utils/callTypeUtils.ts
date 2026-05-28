import type { AndonCall, CallCategory, CallSubtype, MaintenanceSubtype } from "@/types/andon";

const MAINTENANCE_SUBTYPES: MaintenanceSubtype[] = ["electrical", "mechanical", "hot_melt"];

export function isMaintenanceSubtype(subtype: CallSubtype): subtype is MaintenanceSubtype {
  return MAINTENANCE_SUBTYPES.includes(subtype as MaintenanceSubtype);
}

export function isMaintenanceCategory(category: CallCategory): category is "maintenance" {
  return category === "maintenance";
}

export function isMaintenanceCall(call: Pick<AndonCall, "category" | "subtype">): boolean {
  return isMaintenanceCategory(call.category) && isMaintenanceSubtype(call.subtype);
}

export function requiresMaintenanceTechnician(call: Pick<AndonCall, "category" | "subtype">): boolean {
  return isMaintenanceCall(call);
}
