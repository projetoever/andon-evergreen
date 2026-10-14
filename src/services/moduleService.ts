import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { ModuleAccess } from "@/types/modules";
import { registerCurrentWorkstation } from "./workstationService";

const api = createAndonApiClient();

export async function loadModuleAccess(): Promise<ModuleAccess> {
  const workstation = await registerCurrentWorkstation();
  // Explicit development mode only; production never falls back to this registry.
  if (CONFIGURED_DATA_MODE === "local")
    return {
      hubEnabled: true,
      workstation,
      modules: [
        {
          id: "operational",
          name: "ANDON operacional",
          description: "Máquinas, chamados e atendimento em tempo real.",
          route: "/",
          icon: "factory",
          available: true,
          enabled: true,
          allowed: workstation.active && workstation.allowOperational,
        },
        {
          id: "bi",
          name: "ANDON BI",
          description: "Indicadores, análises e confiabilidade industrial.",
          route: "/bi",
          icon: "chart",
          available: true,
          enabled: true,
          allowed: workstation.active && workstation.allowBi,
        },
        {
          id: "priorities",
          name: "Prioridades de produção",
          description: "Organização da sequência visual das máquinas.",
          route: "/machine-priorities",
          icon: "priority",
          available: true,
          enabled: true,
          allowed: workstation.active,
        },
      ],
    };
  return api.get<ModuleAccess>("/api/modules/access");
}

export const updateHubEnabled = (hubEnabled: boolean) =>
  api.patch<{ hubEnabled: boolean }>("/api/modules/settings", { hubEnabled });
