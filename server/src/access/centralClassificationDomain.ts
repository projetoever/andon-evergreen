import { AccessError } from "./policy.js";
import {
  RESPONSIBILITIES, DISPOSITIONS, RESERVED_EXCLUSIONS, reservedDisposition,
} from "../analytics/eligibility.js";

/**
 * SEC-04/2B.4 preparatory domain validation for central classification writes.
 * No route hook or database mutation. The caller MUST use the locked server
 * record (not the HTTP body) as the current classification and write/audit in
 * the same transaction with runCentralGlobalCatalogTransaction.
 */
export type ClassificationMutation = {
  label?: unknown; value?: unknown; active?: unknown;
  responsibility?: unknown; analyticsDisposition?: unknown;
};
const IDENTIFIER = /^[a-z0-9_]{2,64}$/;
function string(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new AccessError("invalid_classification", 400);
  return value.trim();
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AccessError("invalid_classification", 400);
  return value;
}
function membership<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw new AccessError("invalid_classification", 400);
  return value as T;
}
export function validateCentralClassificationCreate(body: ClassificationMutation) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_classification", 400);
  if (Object.keys(body).some(key => !["label", "value", "active", "responsibility", "analyticsDisposition"].includes(key)))
    throw new AccessError("invalid_classification", 400);
  const value = string(body.value, 64).toLowerCase();
  if (!IDENTIFIER.test(value)) throw new AccessError("invalid_classification", 400);
  const responsibility = body.responsibility === undefined
    ? "unassigned" : membership(body.responsibility, RESPONSIBILITIES);
  const requestedDisposition = body.analyticsDisposition === undefined
    ? "include" : membership(body.analyticsDisposition, DISPOSITIONS);
  const reserved = reservedDisposition(value);
  if (reserved && body.analyticsDisposition !== undefined && requestedDisposition !== reserved)
    throw new AccessError("reserved_classification_exclusion", 403);
  return {
    value, label: string(body.label, 100),
    active: body.active === undefined ? true : boolean(body.active),
    responsibility, analyticsDisposition: reserved ?? requestedDisposition,
  };
}
export function validateCentralClassificationUpdate(
  current: { value: string }, body: ClassificationMutation,
) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_classification", 400);
  if (Object.prototype.hasOwnProperty.call(body, "value"))
    throw new AccessError("immutable_classification_identifier", 400);
  const keys = ["label", "active", "responsibility", "analyticsDisposition"] as const;
  const unknownKeys = Object.keys(body).filter(key => !keys.includes(key as typeof keys[number]));
  if (unknownKeys.length) throw new AccessError("invalid_classification", 400);
  const patch: {
    label?: string; active?: boolean; responsibility?: string; analyticsDisposition?: string;
  } = {};
  if (body.label !== undefined) patch.label = string(body.label, 100);
  if (body.active !== undefined) patch.active = boolean(body.active);
  if (body.responsibility !== undefined)
    patch.responsibility = membership(body.responsibility, RESPONSIBILITIES);
  if (body.analyticsDisposition !== undefined)
    patch.analyticsDisposition = membership(body.analyticsDisposition, DISPOSITIONS);
  if (Object.keys(patch).length === 0) throw new AccessError("invalid_classification", 400);
  if (RESERVED_EXCLUSIONS.includes(current.value as typeof RESERVED_EXCLUSIONS[number]) &&
      patch.analyticsDisposition === "include")
    throw new AccessError("reserved_classification_exclusion", 403);
  return patch;
}
