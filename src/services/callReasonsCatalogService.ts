import { createAndonApiClient } from "@/api/andonApiClient";

const api = createAndonApiClient();

/** Administration-only S2 catalogue. Not connected to opening calls or BI. */
export interface CallReasonOptionView {
  id: string;
  reasonId: string;
  technicalAreaId: string;
  displayName: string | null;
  active: boolean;
  displayOrder: number;
  revision: number;
  technicalArea: {
    id: string;
    displayName: string;
    active: boolean;
    categoryGroup: "maintenance" | "production";
  };
  effectivePolicy: {
    correctiveCandidate: boolean;
    effectiveKpiStatus: "eligible" | "excluded" | "pending";
    technicalTimeRecordedSeparately: boolean;
    preservesIndependentPhysicalDowntime: boolean;
  };
}

export interface CallReasonView {
  id: string;
  displayName: string;
  color: string;
  active: boolean;
  displayOrder: number;
  nature: "corrective_failure" | "planned_setup" | "production_support" | "unclassified";
  suggestedResponsibility: string;
  maintenanceKpiPolicy: "eligible" | "excluded" | "pending";
  analyticsDisposition: string;
  revision: number;
  options: CallReasonOptionView[];
}

export type CreateCallReason = Pick<CallReasonView,
  "id" | "displayName" | "color" | "nature" | "suggestedResponsibility" |
  "maintenanceKpiPolicy" | "analyticsDisposition" | "active" | "displayOrder">;

export function getCallReasonsCatalog() {
  return api.get<CallReasonView[]>("/api/call-reasons");
}

export function createCallReason(input: CreateCallReason) {
  return api.post<CallReasonView>("/api/call-reasons", input);
}

export function updateCallReason(
  reasonId: string,
  revision: number,
  patch: Partial<Omit<CreateCallReason, "id">>,
) {
  return api.patch<CallReasonView>(
    "/api/call-reasons/" + encodeURIComponent(reasonId),
    { ...patch, expectedRevision: revision },
  );
}

export function addCallReasonOption(
  reasonId: string, input: {
    id: string;
    technicalAreaId: string;
    active: boolean;
    displayOrder: number;
  },
) {
  return api.post<CallReasonOptionView>(
    "/api/call-reasons/" + encodeURIComponent(reasonId) + "/options", input,
  );
}

export function updateCallReasonOption(
  reasonId: string, optionId: string, revision: number,
  patch: { active?: boolean; displayOrder?: number; displayName?: string | null },
) {
  return api.patch<CallReasonOptionView>(
    "/api/call-reasons/" + encodeURIComponent(reasonId) +
      "/options/" + encodeURIComponent(optionId),
    { ...patch, expectedRevision: revision },
  );
}
