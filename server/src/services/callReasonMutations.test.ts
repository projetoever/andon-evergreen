import assert from "node:assert/strict";
import test from "node:test";
import { AccessError } from "../access/policy.js";
import {
  parseReasonCreate, parseReasonPatch, parseOptionCreate,
  parseOptionPatch, assertEffectiveReasonOption,
} from "./callReasonMutations.js";

const corrective = {
  id: "maintenance", displayName: "Manutenção", color: "#112233",
  displayOrder: 1, active: true, revision: 1,
  nature: "corrective_failure", suggestedResponsibility: "maintenance",
  maintenanceKpiPolicy: "eligible", analyticsDisposition: "include",
};
const option = {
  id: "maintenance_mechanics", reasonId: "maintenance",
  technicalAreaId: "mechanical", displayName: null,
  displayOrder: 0, revision: 1, active: true,
  natureOverride: null, suggestedResponsibilityOverride: null,
  maintenanceKpiPolicyOverride: null, analyticsDispositionOverride: null,
};
const mechanical = { id: "mechanical", displayName: "Mecânica", categoryGroup: "maintenance", active: true };
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);

test("R6/S2 domain: require explicit KPI nature and policy on create", () => {
  const setup = parseReasonCreate({
    id: "setup", displayName: "Setup", nature: "planned_setup",
    maintenanceKpiPolicy: "excluded",
  });
  assert.equal(setup.analyticsDisposition, "include");
  assert.equal(setup.suggestedResponsibility, "unassigned");
  assert.equal(setup.color, "#64748B");
  denied(() => parseReasonCreate({ id: "setup", displayName: "Setup" }), "invalid_call_reason");
  denied(() => parseReasonCreate({ id: "setup", displayName: "Setup",
    nature: "planned_setup", maintenanceKpiPolicy: "eligible" }), "invalid_reason_kpi_policy");
  denied(() => parseReasonCreate({ id: "setup", displayName: "Setup", nature: "planned_setup",
    maintenanceKpiPolicy: "excluded", unknown: "test" }), "invalid_call_reason");
  denied(() => parseReasonCreate({ id: "../setup", displayName: "Setup", nature: "planned_setup",
    maintenanceKpiPolicy: "excluded" }), "invalid_call_reason");
  denied(() => parseReasonCreate({ id: "setup", displayName: "Setup", nature: "planned_setup",
    maintenanceKpiPolicy: "excluded", analyticsDisposition: "incorrect" }), "invalid_reason_kpi_policy");
});

test("R6/S2 domain: optimistic revision and field allowlists prevent stale or identity edits", () => {
  assert.deepEqual(parseReasonPatch({ expectedRevision: 1, displayName: "Nova manutenção" }, corrective).displayName, "Nova manutenção");
  denied(() => parseReasonPatch({ expectedRevision: 2, displayName: "stale" }, corrective), "call_reason_revision_conflict");
  denied(() => parseReasonPatch({ expectedRevision: 1 }, corrective), "invalid_call_reason");
  denied(() => parseReasonPatch({ expectedRevision: 1, id: "other" }, corrective), "invalid_call_reason");
  denied(() => parseReasonPatch({ expectedRevision: 1, nature: "planned_setup" }, corrective), "invalid_reason_kpi_policy");
  denied(() => parseReasonPatch({ expectedRevision: 1, displayOrder: -1 }, corrective), "invalid_call_reason");
  denied(() => parseReasonPatch({ expectedRevision: 1, color: "javascript:alert(1)" }, corrective), "invalid_call_reason");
});

test("R6/S2 domain: option overrides validate as effective policy, including parent changes", () => {
  const parsed = parseOptionCreate({ id: "setup_mechanics", technicalAreaId: "mechanical", active: false });
  assert.equal(parsed.active, false);
  assert.equal(parsed.maintenanceKpiPolicyOverride, null);
  denied(() => parseOptionCreate({ id: "invalid", technicalAreaId: "mechanical",
    parentId: "maintenance" }), "invalid_call_reason");
  denied(() => parseOptionCreate({ id: "option", technicalAreaId: "../escape" }), "invalid_call_reason");
  const updated = parseOptionPatch({
    expectedRevision: 1, displayName: "Ajuste mecânico", maintenanceKpiPolicyOverride: "excluded",
  }, option);
  assert.equal(updated.displayName, "Ajuste mecânico");
  assert.equal(updated.maintenanceKpiPolicyOverride, "excluded");
  denied(() => parseOptionPatch({ expectedRevision: 2, active: false }, option), "call_reason_revision_conflict");
  denied(() => parseOptionPatch({ expectedRevision: 1, technicalAreaId: "other" }, option), "invalid_call_reason");
  denied(() => parseOptionPatch({ expectedRevision: 1, reasonId: "setup" }, option), "invalid_call_reason");
  denied(() => assertEffectiveReasonOption(corrective, {
    ...option, natureOverride: "planned_setup",
  }, mechanical), "invalid_reason_kpi_policy");
  const setup = { ...corrective, id: "setup", nature: "planned_setup",
    maintenanceKpiPolicy: "excluded", suggestedResponsibility: "operations" };
  const setupOption = { ...option, reasonId: "setup" };
  assert.equal(assertEffectiveReasonOption(setup, setupOption, mechanical).correctiveCandidate, false);
  denied(() => assertEffectiveReasonOption(corrective, option, {
    ...mechanical, categoryGroup: "production",
  }), "corrective_reason_requires_maintenance_area");
});
