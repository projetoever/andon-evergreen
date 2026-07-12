import { createAndonApiClient } from "@/api/andonApiClient";
import type {
  CatalogDeleteResult,
  MachineCatalogDraft,
  MachineCatalogPatch,
  MachineSet,
  MachineSetDeleteResult,
  MachineSetDraft,
  MachineSetListOptions,
  MachineSetPatch,
  MachineSetType,
  MachineSubset,
  MachineSubsetDeleteResult,
  MachineSubsetDraft,
  MachineSubsetPatch,
  MachineSubsetType,
} from "@/types/machineSet";

const apiClient = createAndonApiClient();

function encodeId(id: string) {
  return encodeURIComponent(id);
}

function buildQuery(
  values: Record<
    string,
    string | boolean | undefined
  >,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(
    values,
  )) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export function listMachineSetTypes(
  includeInactive = false,
) {
  return apiClient.get<MachineSetType[]>(
    `/api/machine-set-types${buildQuery({
      includeInactive:
        includeInactive || undefined,
    })}`,
  );
}

export function createMachineSetType(
  draft: MachineCatalogDraft,
) {
  return apiClient.post<MachineSetType>(
    "/api/machine-set-types",
    draft,
  );
}

export function updateMachineSetType(
  id: string,
  patch: MachineCatalogPatch,
) {
  return apiClient.patch<MachineSetType>(
    `/api/machine-set-types/${encodeId(id)}`,
    patch,
  );
}

export function deleteMachineSetType(
  id: string,
) {
  return apiClient.request<
    CatalogDeleteResult<MachineSetType>
  >(
    `/api/machine-set-types/${encodeId(id)}`,
    {
      method: "DELETE",
    },
  );
}

export function listMachineSubsetTypes(
  includeInactive = false,
) {
  return apiClient.get<MachineSubsetType[]>(
    `/api/machine-subset-types${buildQuery({
      includeInactive:
        includeInactive || undefined,
    })}`,
  );
}

export function createMachineSubsetType(
  draft: MachineCatalogDraft,
) {
  return apiClient.post<MachineSubsetType>(
    "/api/machine-subset-types",
    draft,
  );
}

export function updateMachineSubsetType(
  id: string,
  patch: MachineCatalogPatch,
) {
  return apiClient.patch<MachineSubsetType>(
    `/api/machine-subset-types/${encodeId(id)}`,
    patch,
  );
}

export function deleteMachineSubsetType(
  id: string,
) {
  return apiClient.request<
    CatalogDeleteResult<MachineSubsetType>
  >(
    `/api/machine-subset-types/${encodeId(id)}`,
    {
      method: "DELETE",
    },
  );
}

export function listMachineSets(
  machineId: string,
  options: MachineSetListOptions = {},
) {
  return apiClient.get<MachineSet[]>(
    `/api/machines/${encodeId(
      machineId,
    )}/sets${buildQuery({
      includeInactive:
        options.includeInactive || undefined,
      includeSubsets:
        options.includeSubsets,
    })}`,
  );
}

export function createMachineSet(
  machineId: string,
  draft: MachineSetDraft,
) {
  return apiClient.post<MachineSet>(
    `/api/machines/${encodeId(machineId)}/sets`,
    draft,
  );
}

export function updateMachineSet(
  id: string,
  patch: MachineSetPatch,
) {
  return apiClient.patch<MachineSet>(
    `/api/machine-sets/${encodeId(id)}`,
    patch,
  );
}

export function deleteMachineSet(
  id: string,
) {
  return apiClient.request<MachineSetDeleteResult>(
    `/api/machine-sets/${encodeId(id)}`,
    {
      method: "DELETE",
    },
  );
}

export function listMachineSubsets(
  machineSetId: string,
  includeInactive = false,
) {
  return apiClient.get<MachineSubset[]>(
    `/api/machine-sets/${encodeId(
      machineSetId,
    )}/subsets${buildQuery({
      includeInactive:
        includeInactive || undefined,
    })}`,
  );
}

export function createMachineSubset(
  machineSetId: string,
  draft: MachineSubsetDraft,
) {
  return apiClient.post<MachineSubset>(
    `/api/machine-sets/${encodeId(
      machineSetId,
    )}/subsets`,
    draft,
  );
}

export function updateMachineSubset(
  id: string,
  patch: MachineSubsetPatch,
) {
  return apiClient.patch<MachineSubset>(
    `/api/machine-subsets/${encodeId(id)}`,
    patch,
  );
}

export function deleteMachineSubset(
  id: string,
) {
  return apiClient.request<
    MachineSubsetDeleteResult
  >(
    `/api/machine-subsets/${encodeId(id)}`,
    {
      method: "DELETE",
    },
  );
}