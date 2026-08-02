import { createAndonApiClient } from "@/api/andonApiClient";
import type { CallSubtype } from "@/types/andon";
import type { TechnicianConfig } from "@/types/settings";

const apiClient = createAndonApiClient();

const TECHNICIAN_AREAS = new Set<CallSubtype>([
  "electrical",
  "mechanical",
  "hot_melt",
  "quality",
  "leadership",
]);

interface ApiTechnician {
  id: string;
  name: string;
  technicalArea: string | null;
  shiftId: string | null;
  active: boolean;
}

export interface TechnicianConfigDraft {
  name: string;
  area: CallSubtype;
  shiftId: string;
  active: boolean;
}

function normalizeArea(value: string | null): CallSubtype {
  return value && TECHNICIAN_AREAS.has(value as CallSubtype)
    ? (value as CallSubtype)
    : "electrical";
}

function mapTechnician(technician: ApiTechnician): TechnicianConfig {
  return {
    id: technician.id,
    name: technician.name,
    area: normalizeArea(technician.technicalArea),
    shiftId: technician.shiftId ?? "",
    shiftIds: technician.shiftId ? [technician.shiftId] : [],
    active: technician.active,
  };
}

export async function listTechnicianConfigs(): Promise<TechnicianConfig[]> {
  const technicians = await apiClient.get<ApiTechnician[]>("/api/technicians");
  return technicians.map(mapTechnician);
}

export async function createTechnicianConfig(
  draft: TechnicianConfigDraft,
): Promise<TechnicianConfig> {
  const technician = await apiClient.post<ApiTechnician>("/api/technicians", {
    name: draft.name,
    technicalArea: draft.area,
    shiftId: draft.shiftId,
    active: draft.active,
  });

  return mapTechnician(technician);
}

export async function updateTechnicianConfig(
  id: string,
  patch: Partial<TechnicianConfigDraft>,
): Promise<TechnicianConfig> {
  const technician = await apiClient.patch<ApiTechnician>(
    `/api/technicians/${encodeURIComponent(id)}`,
    {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.area !== undefined ? { technicalArea: patch.area } : {}),
      ...(patch.shiftId !== undefined ? { shiftId: patch.shiftId } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    },
  );

  return mapTechnician(technician);
}
