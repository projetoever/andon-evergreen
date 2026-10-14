export type ModuleId = "operational" | "bi" | "priorities";
export const HUB_ADMIN_SECTIONS = ["overview", "workstations", "security", "priorities"] as const;
export type HubAdminSection = (typeof HUB_ADMIN_SECTIONS)[number];

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  route: "/" | "/bi" | "/machine-priorities";
  icon: "factory" | "chart" | "priority";
  available: boolean;
  enabled: boolean;
  allowed: boolean;
}

export interface ModuleAccess {
  hubEnabled: boolean;
  workstation: {
    id: string;
    name: string | null;
    active: boolean;
    allowOperational: boolean;
    allowBi: boolean;
    lockedMachineId: string | null;
  };
  modules: ModuleDefinition[];
}
