import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(here, path), "utf8");

test("SEC-04/2A.9b2b: central prototype composes verified PINs, call domain and atomic audit, not a route", async () => {
  const [prototype, wrapper, verifier, domain, middleware, routes] = await Promise.all([
    source("centralMultiAttendancePrototype.ts"),
    source("centralAttendanceAtomicAudit.ts"),
    source("centralMultiTechnicianVerification.ts"),
    source("../routes/andonCalls.ts"),
    source("../security/workstationAccess.ts"),
    source("../routes/access.ts"),
  ]);
  assert.match(prototype, /runCentralAttendanceWithAtomicAudit\(db,/);
  assert.match(prototype, /verifyCentralAttendanceTechnicians\(/);
  assert.match(prototype, /applyVerifiedCentralAttendanceDomainTransitionMany\(/);
  assert.match(prototype, /technicianIds: technicians\.map/);
  assert.match(wrapper, /await appendAudit\(tx/);
  assert.match(wrapper, /await lockUser\(tx, session\.userId\)/);
  assert.match(wrapper, /await lockWorkstationFlow\(tx, input\.workstationId\)/);
  assert.match(verifier, /orderedIds = original\.map\(\(t\) => t\.id\)\.sort\(\)/);
  assert.match(domain, /return persistAttendanceTransition\(tx,/);
  assert.match(middleware, /throw new AccessError\("central_action_not_supported"\)/);
  assert.doesNotMatch(middleware, /runCentralMultiTechnicianAttendancePrototype/);
  assert.doesNotMatch(routes, /runCentralMultiTechnicianAttendancePrototype/);
});

test("SEC-04/2A.9b2b: isolated PG validation covers rollback, concurrency and non-replayed audits", async () => {
  const script = await source("../../scripts/validate-central-attendance-e2e.mjs");
  assert.match(script, /ANDON_INTEGRATION_TEST/);
  assert.match(script, /\/andon_test/);
  assert.match(script, /ANDON_CENTRAL_ACCESS_ENABLED/);
  assert.match(script, /const contender = new PrismaClient\(\)/);
  assert.match(script, /Promise\.allSettled/);
  assert.match(script, /"technician_credential_invalid"/);
  assert.match(script, /"authentication_required"/);
  assert.match(script, /ipAddress: "x"\.repeat\(46\)/);
  assert.match(script, /audits\.length, 1/);
  assert.match(script, /tokenHash\(token\)/);
  assert.match(script, /"call_state_changed"/);
  assert.match(script, /await db\.accessSession\.update/);
});
