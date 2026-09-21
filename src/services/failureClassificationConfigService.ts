import { createAndonApiClient } from "@/api/andonApiClient";
import type { FailureClassificationConfig } from "@/types/settings";

const apiClient = createAndonApiClient();

export type CreateFailureClassificationInput = {
  label: string;
  value: string;
  active?: boolean;
};

export type UpdateFailureClassificationInput = {
  label?: string;
  active?: boolean;
};

export function getFailureClassificationConfigs(options: { activeOnly?: boolean } = {}) {
  const query = options.activeOnly ? "?active=true" : "";
  return apiClient.get<FailureClassificationConfig[]>(`/api/failure-classifications${query}`);
}

export function createFailureClassification(input: CreateFailureClassificationInput) {
  return apiClient.post<FailureClassificationConfig>("/api/failure-classifications", input);
}

export function updateFailureClassification(id: string, patch: UpdateFailureClassificationInput) {
  return apiClient.patch<FailureClassificationConfig>(
    `/api/failure-classifications/${encodeURIComponent(id)}`,
    patch,
  );
}
