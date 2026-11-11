import assert from "node:assert/strict";
import test from "node:test";
import { correctiveReasonCandidateWhere, isCorrectiveReasonCandidate } from "./correctiveReasonCohort.js";

test("S4: only corrective/eligible/include snapshot is a KPI candidate", () => {
  assert.equal(isCorrectiveReasonCandidate({
    nature: "corrective_failure", maintenanceKpiPolicy: "eligible",
    analyticsDisposition: "include",
  }), true);
  for (const nature of ["planned_setup", "production_support", "unclassified"]) {
    assert.equal(isCorrectiveReasonCandidate({
      nature, maintenanceKpiPolicy: "excluded", analyticsDisposition: "include",
    }), false);
  }
  assert.equal(isCorrectiveReasonCandidate({
    nature: "corrective_failure", maintenanceKpiPolicy: "pending",
    analyticsDisposition: "include",
  }), false);
  assert.equal(isCorrectiveReasonCandidate({
    nature: "corrective_failure", maintenanceKpiPolicy: "eligible",
    analyticsDisposition: "test",
  }), false);
});

test("S4: legacy call without snapshot retains its historical eligibility path", () => {
  assert.equal(isCorrectiveReasonCandidate(null), true);
  assert.equal(isCorrectiveReasonCandidate(undefined), true);
});

test("S4: explicit Prisma candidate predicate matches the pure eligibility rule", () => {
  assert.deepEqual(correctiveReasonCandidateWhere, {
    OR: [
      { callReasonSnapshot: { is: null } },
      { callReasonSnapshot: { is: {
        nature: "corrective_failure",
        maintenanceKpiPolicy: "eligible",
        analyticsDisposition: "include",
      } } },
    ],
  });
});
