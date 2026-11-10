import { AccessError } from "../access/policy.js";
import {
  validateReasonPolicy, resolveReasonOption, ReasonPolicyError,
  type ReasonPolicy, type ReasonRecord, type ReasonOptionRecord,
  type TechnicalAreaRecord,
} from "./callReasons.js";

const ID = /^[a-z0-9_]{2,40}$/;
const HEX = /^#[a-fA-F0-9]{6}$/;
const reasonKeys = [
  "id", "displayName", "color", "active", "displayOrder", "nature",
  "suggestedResponsibility", "maintenanceKpiPolicy", "analyticsDisposition",
] as const;
const optionKeys = [
  "id", "technicalAreaId", "displayName", "active", "displayOrder",
  "natureOverride", "suggestedResponsibilityOverride",
  "maintenanceKpiPolicyOverride", "analyticsDispositionOverride",
] as const;
const fail = (code = "invalid_call_reason") => { throw new AccessError(code, 400); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function unknownKeys(body: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(body).some(k => !keys.includes(k))) fail();
}
function string(value: unknown, max = 80): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail();
  return value.trim();
}
function id(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) return fail();
  return value;
}
function active(value: unknown): boolean {
  if (typeof value !== "boolean") return fail();
  return value;
}
function order(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 9999) return fail();
  return value as number;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return fail();
  return value as number;
}
function color(value: unknown): string {
  if (typeof value !== "string" || !HEX.test(value)) return fail();
  return value.toUpperCase();
}
function optionText(value: unknown): string | null {
  if (value === null) return null;
  return string(value);
}
function optionalOverride(value: unknown): string | null {
  if (value === null) return null;
  return string(value, 80);
}
function validatePolicy(policy: ReasonPolicy) {
  try { validateReasonPolicy(policy); }
  catch (error) {
    if (error instanceof ReasonPolicyError) throw new AccessError(error.code, 400);
    throw error;
  }
}

export function parseReasonCreate(raw: unknown) {
  const body = object(raw);
  unknownKeys(body, reasonKeys);
  // Nature and KPI policy are required: no accidental corrective inclusion.
  if (body.nature === undefined || body.maintenanceKpiPolicy === undefined) return fail();
  const data = {
    id: id(body.id),
    displayName: string(body.displayName),
    color: body.color === undefined ? "#64748B" : color(body.color),
    active: body.active === undefined ? true : active(body.active),
    displayOrder: body.displayOrder === undefined ? 0 : order(body.displayOrder),
    nature: string(body.nature),
    suggestedResponsibility: body.suggestedResponsibility === undefined
      ? "unassigned" : string(body.suggestedResponsibility),
    maintenanceKpiPolicy: string(body.maintenanceKpiPolicy),
    analyticsDisposition: body.analyticsDisposition === undefined
      ? "include" : string(body.analyticsDisposition),
  };
  validatePolicy(data);
  return data;
}

export function parseReasonPatch(raw: unknown, current: ReasonRecord & {
  color: string; displayOrder: number;
}) {
  const body = object(raw);
  unknownKeys(body, [...reasonKeys.filter(key => key !== "id"), "expectedRevision"]);
  if (body.expectedRevision === undefined) return fail();
  const expectedRevision = revision(body.expectedRevision);
  if (current.revision !== expectedRevision) throw new AccessError("call_reason_revision_conflict", 409);
  if (Object.keys(body).length === 1) return fail();
  const data = {
    displayName: body.displayName === undefined ? current.displayName : string(body.displayName),
    color: body.color === undefined ? current.color : color(body.color),
    active: body.active === undefined ? current.active : active(body.active),
    displayOrder: body.displayOrder === undefined ? current.displayOrder : order(body.displayOrder),
    nature: body.nature === undefined ? current.nature : string(body.nature),
    suggestedResponsibility: body.suggestedResponsibility === undefined
      ? current.suggestedResponsibility : string(body.suggestedResponsibility),
    maintenanceKpiPolicy: body.maintenanceKpiPolicy === undefined
      ? current.maintenanceKpiPolicy : string(body.maintenanceKpiPolicy),
    analyticsDisposition: body.analyticsDisposition === undefined
      ? current.analyticsDisposition : string(body.analyticsDisposition),
  };
  validatePolicy(data);
  return data;
}

export function parseOptionCreate(raw: unknown) {
  const body = object(raw);
  unknownKeys(body, optionKeys);
  return {
    id: id(body.id),
    technicalAreaId: id(body.technicalAreaId),
    displayName: body.displayName === undefined ? null : optionText(body.displayName),
    active: body.active === undefined ? true : active(body.active),
    displayOrder: body.displayOrder === undefined ? 0 : order(body.displayOrder),
    natureOverride: body.natureOverride === undefined ? null : optionalOverride(body.natureOverride),
    suggestedResponsibilityOverride: body.suggestedResponsibilityOverride === undefined
      ? null : optionalOverride(body.suggestedResponsibilityOverride),
    maintenanceKpiPolicyOverride: body.maintenanceKpiPolicyOverride === undefined
      ? null : optionalOverride(body.maintenanceKpiPolicyOverride),
    analyticsDispositionOverride: body.analyticsDispositionOverride === undefined
      ? null : optionalOverride(body.analyticsDispositionOverride),
  };
}

export function parseOptionPatch(raw: unknown, current: ReasonOptionRecord & { displayOrder: number }) {
  const body = object(raw);
  unknownKeys(body, [...optionKeys.filter(key => key !== "id" && key !== "technicalAreaId"), "expectedRevision"]);
  if (body.expectedRevision === undefined) return fail();
  const expectedRevision = revision(body.expectedRevision);
  if (current.revision !== expectedRevision) throw new AccessError("call_reason_revision_conflict", 409);
  if (Object.keys(body).length === 1) return fail();
  return {
    displayName: body.displayName === undefined ? current.displayName : optionText(body.displayName),
    active: body.active === undefined ? current.active : active(body.active),
    displayOrder: body.displayOrder === undefined ? current.displayOrder : order(body.displayOrder),
    natureOverride: body.natureOverride === undefined ? current.natureOverride : optionalOverride(body.natureOverride),
    suggestedResponsibilityOverride: body.suggestedResponsibilityOverride === undefined
      ? current.suggestedResponsibilityOverride : optionalOverride(body.suggestedResponsibilityOverride),
    maintenanceKpiPolicyOverride: body.maintenanceKpiPolicyOverride === undefined
      ? current.maintenanceKpiPolicyOverride : optionalOverride(body.maintenanceKpiPolicyOverride),
    analyticsDispositionOverride: body.analyticsDispositionOverride === undefined
      ? current.analyticsDispositionOverride : optionalOverride(body.analyticsDispositionOverride),
  };
}

/** Catalog validation ignores active flags but never bypasses invalid policies. */
export function assertEffectiveReasonOption(
  reason: ReasonRecord,
  option: ReasonOptionRecord,
  area: TechnicalAreaRecord,
) {
  try {
    return resolveReasonOption(
      { ...reason, active: true },
      { ...option, active: true },
      { ...area, active: true },
    );
  } catch (error) {
    if (error instanceof ReasonPolicyError) throw new AccessError(error.code, 400);
    throw error;
  }
}
