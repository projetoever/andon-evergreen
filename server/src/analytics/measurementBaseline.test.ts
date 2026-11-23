import assert from "node:assert/strict";
import test from "node:test";
import { effectiveBiPeriodStart, parseBiMeasurementStartAt } from "./measurementBaseline.js";

const at = (value: string) => new Date(value);

test("RC23: unset cutover preserves old read-only BI behavior", () => {
  assert.equal(parseBiMeasurementStartAt(undefined), null);
  assert.equal(parseBiMeasurementStartAt(""), null);
  assert.equal(effectiveBiPeriodStart(at("2026-11-16T00:00:00Z"),at("2026-11-24T00:00:00Z"),null).toISOString(),"2026-11-16T00:00:00.000Z");
});

test("RC23: only explicit, absolute UTC instants are accepted", () => {
  const baseline=parseBiMeasurementStartAt("2026-11-23T17:00:00Z");
  assert.equal(baseline?.toISOString(),"2026-11-23T17:00:00.000Z");
  for(const bad of ["2026-11-23","2026-11-23T14:00:00-03:00","2026-02-30T10:00:00Z","2026-11-23T25:00:00Z","now","2026-11-23T17:00:00Z\nBYPASS=1"])
    assert.throws(()=>parseBiMeasurementStartAt(bad),/invalid_bi_measurement_start_at_utc/,bad);
});

test("RC23: cutoff clips time window, never creates negative duration", () => {
  const start=at("2026-11-16T00:00:00Z"),end=at("2026-11-24T00:00:00Z");
  assert.equal(effectiveBiPeriodStart(start,end,at("2026-11-23T17:00:00Z")).toISOString(),"2026-11-23T17:00:00.000Z");
  assert.equal(effectiveBiPeriodStart(start,end,at("2026-12-01T00:00:00Z")).toISOString(),end.toISOString());
  assert.equal(effectiveBiPeriodStart(start,end,at("2026-11-01T00:00:00Z")).toISOString(),start.toISOString());
});

test("RC23: one BI cohort boundary is applied to calls and physical events", async () => {
  const { analyticsEligibility } = await import("./eligibility.js");
  const { withBiMeasurementStartAt } = await import("./datasetPolicy.js");
  const original=analyticsEligibility([]);
  const baseline=at("2026-11-23T17:00:00Z");
  assert.equal(withBiMeasurementStartAt(original, null), original);
  const scoped=withBiMeasurementStartAt(original, baseline);
  assert.deepEqual(scoped.callWhere, { AND: [original.callWhere, { openedAt: { gte: baseline } }] });
  assert.deepEqual(scoped.eventWhere, { AND: [original.eventWhere, { startedAt: { gte: baseline } }] });
  assert.deepEqual(scoped.eventOwnWhere, { AND: [original.eventOwnWhere, { startedAt: { gte: baseline } }] });
  assert.equal(JSON.stringify(original.eventWhere).includes("startedAt"), false,
    "baseline OFF must not change legacy BI behavior");
});
