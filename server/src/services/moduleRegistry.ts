export const MODULE_REGISTRY = [
  {
    id: "operational",
    name: "ANDON operacional",
    description: "Máquinas, chamados e atendimento em tempo real.",
    route: "/andon",
    icon: "factory",
    available: true,
    enabled: true,
  },
  {
    id: "bi",
    name: "ANDON BI",
    description: "Indicadores, análises e confiabilidade industrial.",
    route: "/bi",
    icon: "chart",
    available: true,
    enabled: true,
  },
  {
    id: "priorities",
    name: "Prioridades de produção",
    description: "Organização da sequência visual das máquinas.",
    route: "/machine-priorities",
    icon: "priority",
    available: true,
    enabled: true,
  },
] as const;

export type ModuleId = (typeof MODULE_REGISTRY)[number]["id"];

/** Unknown API families fail closed as operational. Never trust a client module header. */
export function apiModule(path: string): ModuleId | null {
  if (path.startsWith("/api/analytics/")) return "bi";
  if (path.startsWith("/api/dashboard-priority/")) return "priorities";
  if (
    path.startsWith("/api/access/") ||
    path.startsWith("/api/admin-auth/") ||
    path.startsWith("/api/modules/") ||
    path === "/api/workstations" ||
    /^\/api\/workstations\/[^/]+(?:\/runtime-preferences)?$/.test(path)
  )
    return null;
  return "operational";
}

export function isModuleAllowed(
  module: ModuleId,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const definition = MODULE_REGISTRY.find((item) => item.id === module);
  if (!definition?.available || !definition.enabled) return false;
  return module === "operational"
    ? workstation.allowOperational
    : module === "bi"
      ? workstation.allowBi
      : workstation.allowPriorities;
}

/** Recovery authority is limited to platform administration, never call/machine APIs. */
export function isRecoveryRequest(method: string, path: string) {
  return (
    (method === "GET" && path === "/api/modules/credentials") ||
    (method === "PUT" && /^\/api\/modules\/[^/]+\/credentials$/.test(path)) ||
    (method === "PATCH" && path === "/api/dashboard-priority/access-policy") ||
    (method === "GET" && (path === "/api/workstations" || path === "/api/modules/settings")) ||
    (method === "PATCH" &&
      (path === "/api/modules/settings" || /^\/api\/workstations\/[^/]+$/.test(path))) ||
    (method === "GET" && path === "/api/dashboard-priority/access-status") ||
    (method === "PUT" && path === "/api/dashboard-priority/credentials") ||
    (path.startsWith("/api/admin-auth/") && ["GET", "POST", "PUT"].includes(method))
  );
}
