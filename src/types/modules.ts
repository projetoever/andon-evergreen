export type ModuleId = "operational" | "bi" | "priorities";

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
