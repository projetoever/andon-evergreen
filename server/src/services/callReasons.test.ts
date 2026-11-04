import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmedCorrectiveKpiContribution,
  resolveReasonOption,
  validateReasonPolicy,
  type ReasonRecord, type ReasonOptionRecord, type TechnicalAreaRecord,
} from "./callReasons.js";

const mechanical: TechnicalAreaRecord = {
  id: "mechanical", displayName: "Mecânica",
  categoryGroup: "maintenance", active: true,
};
const reason = (overrides: Partial<ReasonRecord> = {}): ReasonRecord => ({
  id: "maintenance_reason", displayName: "Manutenção", active: true,
  revision: 1, nature: "corrective_failure",
  suggestedResponsibility: "maintenance",
  maintenanceKpiPolicy: "eligible", analyticsDisposition: "include",
  ...overrides,
});
const option = (overrides: Partial<ReasonOptionRecord> = {}): ReasonOptionRecord => ({
  id: "reason_mechanical", reasonId: "maintenance_reason",
  technicalAreaId: "mechanical", displayName: null,
  active: true, revision: 1, natureOverride: null,
  suggestedResponsibilityOverride: null,
  maintenanceKpiPolicyOverride: null, analyticsDispositionOverride: null,
  ...overrides,
});
const evidence = {
  confirmedResponsibility: "maintenance",
  verifiedPhysicalEpisode: true,
  entirelyCorrectiveEpisode: true,
  isSystemTest: false,
};

test("REASON/01: Maintenance -> Mechanical is only a corrective KPI candidate until confirmed", () => {
  const p = resolveReasonOption(reason(), option(), mechanical);
  assert.equal(p.optionNameSnapshot, "Mecânica");
  assert.equal(p.categoryGroup, "maintenance");
  assert.equal(p.correctiveCandidate, true);
  assert.equal(p.effectiveKpiStatus, "eligible");
  assert.equal(confirmedCorrectiveKpiContribution(p, evidence), true);
  for (const overridden of [
    { ...evidence, confirmedResponsibility: "operations" },
    { ...evidence, confirmedResponsibility: "unassigned" },
    { ...evidence, verifiedPhysicalEpisode: false },
    { ...evidence, entirelyCorrectiveEpisode: false },
    { ...evidence, isSystemTest: true },
  ]) assert.equal(confirmedCorrectiveKpiContribution(p, overridden), false);
});

test("REASON/02: Setup -> same Mechanical technical area is legitimate but never corrective failure", () => {
  const setup = reason({
    id: "setup_reason", displayName: "Setup", nature: "planned_setup",
    suggestedResponsibility: "operations", maintenanceKpiPolicy: "excluded",
  });
  const setupMechanical = option({ id: "setup_mechanical", reasonId: "setup_reason" });
  const p = resolveReasonOption(setup, setupMechanical, mechanical);
  assert.equal(p.technicalAreaId, "mechanical");
  assert.equal(p.nature, "planned_setup");
  assert.equal(p.analyticsDisposition, "include");
  assert.equal(p.correctiveCandidate, false);
  assert.equal(p.effectiveKpiStatus, "excluded");
  assert.equal(p.isValidOperationalCall, true);
  assert.equal(p.technicalTimeRecordedSeparately, true);
  assert.equal(p.preservesIndependentPhysicalDowntime, true);
  assert.equal(confirmedCorrectiveKpiContribution(p, evidence), false);
});

test("REASON/03: explicit option overrides are effective, without rewriting the parent", () => {
  const base = reason({ maintenanceKpiPolicy: "pending" });
  const opt = option({
    displayName: "Mecânica industrial",
    maintenanceKpiPolicyOverride: "eligible",
    suggestedResponsibilityOverride: "operations",
  });
  const p = resolveReasonOption(base, opt, mechanical);
  assert.equal(p.maintenanceKpiPolicy, "eligible");
  assert.equal(p.suggestedResponsibility, "operations");
  assert.equal(p.optionNameSnapshot, "Mecânica industrial");
  assert.equal(base.maintenanceKpiPolicy, "pending");
  assert.equal(base.suggestedResponsibility, "maintenance");
  assert.equal(confirmedCorrectiveKpiContribution(p, { ...evidence, confirmedResponsibility: "operations" }), false);
});

test("REASON/04: setup/support and unclassified cannot be eligible, including overrides", () => {
  for (const nature of ["planned_setup", "production_support", "unclassified"]) {
    assert.throws(
      () => validateReasonPolicy({
        nature, suggestedResponsibility: "maintenance",
        maintenanceKpiPolicy: "eligible", analyticsDisposition: "include",
      }),
      /invalid_reason_kpi_policy/,
    );
  }
  assert.throws(() => resolveReasonOption(
    reason(), option({ natureOverride: "planned_setup" }), mechanical,
  ), /invalid_reason_kpi_policy/);
  assert.throws(() => resolveReasonOption(
    reason({ nature: "planned_setup", maintenanceKpiPolicy: "excluded" }),
    option({ maintenanceKpiPolicyOverride: "eligible" }), mechanical,
  ), /invalid_reason_kpi_policy/);
  assert.throws(() => resolveReasonOption(
    reason({ nature: "corrective_failure", maintenanceKpiPolicy: "eligible" }),
    option(), { ...mechanical, categoryGroup: "production" },
  ), /corrective_reason_requires_maintenance_area/);
});

test("REASON/05: test/false/duplicate cannot re-enter maintenance KPIs", () => {
  for (const disposition of ["test", "false_call", "duplicate"]) {
    const p = resolveReasonOption(
      reason({ analyticsDisposition: disposition }), option(), mechanical,
    );
    assert.equal(p.correctiveCandidate, false);
    assert.equal(p.isValidOperationalCall, false);
    assert.equal(p.effectiveKpiStatus, "excluded");
    assert.equal(confirmedCorrectiveKpiContribution(p, evidence), false);
  }
});

test("REASON/06: inactive catalog, mismatched areas and invalid revisions fail closed", () => {
  assert.throws(() => resolveReasonOption(reason({ active: false }), option(), mechanical), /reason_option_inactive/);
  assert.throws(() => resolveReasonOption(reason(), option({ active: false }), mechanical), /reason_option_inactive/);
  assert.throws(() => resolveReasonOption(reason(), option(), { ...mechanical, active: false }), /reason_option_inactive/);
  assert.throws(() => resolveReasonOption(reason(), option({ reasonId: "other" }), mechanical), /reason_option_relation_mismatch/);
  assert.throws(() => resolveReasonOption(reason(), option({ technicalAreaId: "electrical" }), mechanical), /reason_option_relation_mismatch/);
  assert.throws(() => resolveReasonOption(reason({ revision: 0 }), option(), mechanical), /reason_revision_invalid/);
  assert.throws(() => resolveReasonOption(reason(), option({ revision: 0 }), mechanical), /reason_revision_invalid/);
});

test("REASON/07: policy and display snapshots are immutable values at resolution time", () => {
  const r = reason();
  const opt = option();
  const p = resolveReasonOption(r, opt, mechanical);
  r.displayName = "Manutenção renomeada";
  r.maintenanceKpiPolicy = "excluded";
  opt.displayName = "Setor alterado";
  assert.equal(p.reasonNameSnapshot, "Manutenção");
  assert.equal(p.optionNameSnapshot, "Mecânica");
  assert.equal(p.maintenanceKpiPolicy, "eligible");
  assert.equal(p.reasonRevision, 1);
  assert.equal(p.optionRevision, 1);
});
