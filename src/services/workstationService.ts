import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { Workstation, WorkstationUpdate } from "@/types/workstation";
import { getCurrentWorkstationId, isValidWorkstationId } from "./workstationIdentityService";

export const WORKSTATION_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

const apiClient = createAndonApiClient();
let memoryWorkstations: Workstation[] = [];

function readLocalWorkstations() {
  return memoryWorkstations;
}

function saveLocalWorkstations(workstations: Workstation[]) {
  memoryWorkstations = workstations;
}

function registerLocalWorkstation(id: string) {
  const now = new Date().toISOString();
  const items = readLocalWorkstations();
  const existing = items.find((item) => item.id === id);
  const workstation: Workstation = existing
    ? { ...existing, lastSeenAt: now, updatedAt: now }
    : {
        id,
        name: null,
        active: true,
        lockedMachineId: null,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      };

  saveLocalWorkstations([...items.filter((item) => item.id !== id), workstation]);
  return workstation;
}

export async function registerCurrentWorkstation() {
  const id = getCurrentWorkstationId();
  if (!id) throw new Error("Identidade da workstation indisponível neste ambiente.");

  if (CONFIGURED_DATA_MODE === "local") return registerLocalWorkstation(id);
  return apiClient.post<Workstation>("/api/workstations/register", { id });
}

export async function listWorkstations() {
  if (CONFIGURED_DATA_MODE === "local") {
    return [...readLocalWorkstations()].sort((current, next) =>
      next.lastSeenAt.localeCompare(current.lastSeenAt),
    );
  }
  return apiClient.get<Workstation[]>("/api/workstations");
}

export async function getWorkstation(id: string) {
  if (CONFIGURED_DATA_MODE === "local") {
    return readLocalWorkstations().find((item) => item.id === id) ?? null;
  }
  return apiClient.get<Workstation>(`/api/workstations/${encodeURIComponent(id)}`);
}

export async function updateWorkstation(id: string, patch: WorkstationUpdate) {
  if (CONFIGURED_DATA_MODE === "api") {
    return apiClient.patch<Workstation>(`/api/workstations/${encodeURIComponent(id)}`, patch);
  }

  const items = readLocalWorkstations();
  const existing = items.find((item) => item.id === id);
  if (!existing) throw new Error("Workstation não encontrada.");

  const updated: Workstation = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name.trim().replace(/\s+/g, " ") || null } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
    updatedAt: new Date().toISOString(),
  };
  saveLocalWorkstations(items.map((item) => (item.id === id ? updated : item)));
  return updated;
}
