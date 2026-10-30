export type ModuleId = "operational" | "bi" | "priorities";
export const HUB_ADMIN_SECTIONS = [
  "overview",
  "users",
  "workstations",
  "andon",
  "security",
  "modules",
] as const;
export type HubAdminSection = (typeof HUB_ADMIN_SECTIONS)[number];

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  route: "/andon" | "/bi" | "/machine-priorities";
  icon: "factory" | "chart" | "priority";
  available: boolean;
  enabled: boolean;
  allowed: boolean;
  passwordRequired: boolean;
  authenticated: boolean;
}

export interface ModuleAccess {
  hubEnabled: boolean;
  centralAccessEnabled?: boolean;
  prioritiesWriteEnabled?: boolean;
  principal?: {
    userId: string;
    login: string;
    displayName: string;
    roleLabel: string;
    purpose: string;
    machineScope: string;
    machineIds: string[];
  } | null;
  workstation: {
    id: string;
    name: string | null;
    active: boolean;
    pendingApproval?: boolean;
    allowOperational: boolean;
    allowBi: boolean;
    allowPriorities: boolean;
    lockedMachineId: string | null;
    admission?: {
      status: "pending" | "approved" | "rejected";
      requestedAt: string;
      decisionReason: string | null;
    } | null;
  };
  modules: ModuleDefinition[];
}

export type PasswordModule = Exclude<ModuleId, "priorities">;
export interface ModuleCredentialSettings {
  id: PasswordModule;
  username: string | null;
  configured: boolean;
  passwordRequired: boolean;
}
