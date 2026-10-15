import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { ModuleAccess } from "@/types/modules";
import {
  registerCurrentWorkstation,
  WORKSTATION_HEARTBEAT_INTERVAL_MS,
} from "./workstationService";

const api = createAndonApiClient();
let localHubEnabled = true;
let registeredAt: number | null = null;
let registration: Promise<void> | null = null;

async function ensureRegistration() {
  if (registeredAt !== null && Date.now() - registeredAt < WORKSTATION_HEARTBEAT_INTERVAL_MS)
    return;
  if (!registration) {
    registration = registerCurrentWorkstation()
      .then(() => {
        registeredAt = Date.now();
      })
      .finally(() => {
        registration = null;
      });
  }
  await registration;
}

export async function loadModuleAccess(): Promise<ModuleAccess> {
  if (CONFIGURED_DATA_MODE === "api") {
    await ensureRegistration();
    return api.get<ModuleAccess>("/api/modules/access");
  }
  const workstation = await registerCurrentWorkstation();
  // Explicit development mode only; production never falls back to this registry.
  if (CONFIGURED_DATA_MODE === "local")
    return {
      hubEnabled: localHubEnabled,
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
  throw new Error("Modo de dados não suportado para o Hub.");
}

export const getHubSettings = () =>
  CONFIGURED_DATA_MODE === "local"
    ? Promise.resolve({ hubEnabled: localHubEnabled })
    : api.get<{ hubEnabled: boolean }>("/api/modules/settings");

export const updateHubEnabled = (hubEnabled: boolean) => {
  if (CONFIGURED_DATA_MODE === "local") {
    localHubEnabled = hubEnabled;
    return Promise.resolve({ hubEnabled });
  }
  return api.patch<{ hubEnabled: boolean }>("/api/modules/settings", { hubEnabled });
};
