import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PENTE 2 schedule request does not grant an unattended write or silently discard order", async () => {
  const page = await source("src/pages/DashboardPriorityPage.tsx");
  const modal = await source("src/components/machines/ProductionModeCredentialModal.tsx");
  assert.match(page, /if \(hasUnsavedChanges\) \{[\s\S]*?return;/);
  assert.match(page, /access\?\.centralAccessEnabled !== true\) return/);
  assert.match(page, /access\.modules\.find\(\(item\) => item\.id === "operational"\)/);
  assert.match(page, /accessRequest<AccessState>\("\/session"\)/);
  assert.match(page, /principal\.permissions\?\.includes\("production\.schedule\.request"\)/);
  assert.match(page, /principal\.permissions\?\.includes\("production\.schedule\.write"\)/);
  assert.match(page, /principal\.permissions\?\.includes\("andon\.read"\)/);
  assert.match(page, /principal\.machineIds\?\.includes\(machine\.id\)/);
  assert.match(page, /<ProductionModeCredentialModal/);
  assert.doesNotMatch(page, /accessRequest\([^\n]*"POST"[^\n]*production-mode/);
  assert.match(modal, /expectedProductionMode: currentMode/);
  assert.match(modal, /productionMode: requestedMode/);
  assert.match(modal, /submittingRef\.current/);
  assert.match(modal, /production_mode_changed/);
});

test("PENTE 2 reuses the central step-up with authorizer, scope, locks and audited event history", async () => {
  const service = await source("server/src/access/centralProductionModeCredential.ts");
  assert.match(service, /assertScheduleRequestPermission\(principal, input\.machineId\)/);
  assert.match(service, /mayApproveProductionMode\(candidate, input\.machineId\)/);
  assert.match(service, /assertModule\(latest, workstation, "operational"\)/);
  assert.match(service, /await lockMachineFlow\(tx, input\.machineId\)/);
  assert.match(service, /machine\.productionMode !== input\.expectedProductionMode/);
  assert.match(service, /new AccessError\("production_mode_changed", 409\)/);
  assert.match(service, /machineProductionEvent\.create/);
  assert.match(service, /appendAudit\(tx/);
});

test("PENTE 2 final: authorized writers avoid per-machine password, request-only retains step-up", async () => {
  const [page, routes, sessionWrite, badge] = await Promise.all([
    source("src/pages/DashboardPriorityPage.tsx"),
    source("server/src/routes/access.ts"),
    source("server/src/access/centralProductionModeSession.ts"),
    source("src/components/priority/PriorityMachineBadges.tsx"),
  ]);
  assert.match(page, /principal!\.permissions\?\.includes\("production\.schedule\.write"\)/);
  assert.match(page, /if \(canWrite\) \{/);
  assert.match(page, /scheduleSubmittingRef\.current = true/);
  assert.match(page, /scheduleSubmittingRef\.current = false/);
  assert.match(page, /accessRequest\("\/machines\/production-mode\/session", "POST"/);
  assert.match(page, /setPendingSchedule\(\{/);
  assert.match(page, /currentMode: machine\.productionMode/);
  assert.match(page, /expectedProductionMode: confirmation\.currentMode/);
  assert.match(page, /setScheduleConfirmation\(\{/);
  assert.match(routes, /machines\/production-mode\/session/);
  assert.match(routes, /setCentralProductionModeWithSession\(db/);
  assert.match(sessionWrite, /assertPermission\(principal, "production\.schedule\.write", machineId\)/);
  assert.doesNotMatch(sessionWrite, /verifyAccessPassword|input\.password/);
  assert.match(sessionWrite, /resolveSession\(tx, input\)/);
  assert.match(sessionWrite, /lockMachineFlow\(tx, input\.machineId\)/);
  assert.match(sessionWrite, /production_mode_changed", 409/);
  assert.match(sessionWrite, /machineProductionEvent\.create/);
  assert.match(sessionWrite, /machine\.production_mode\.session_authorized/);
  // The unified row composes the existing semantic badge; its colors belong
  // to the badge component rather than a duplicated production-only list.
  assert.match(page, /<PriorityProductionBadge mode=\{row\.productionMode\}/);
  assert.match(page, /onClick=\{\(\) => void requestScheduleChange\(row\)\}/);
  assert.match(badge, /bg-emerald-50/);
  assert.match(badge, /bg-amber-50/);
  assert.match(badge, /dark:bg-emerald-950/);
  assert.match(badge, /dark:bg-amber-950/);
});

test("PENTE 2C: confirmed scheduling is audited and pending priorities remain protected", async () => {
  const page = await source("src/pages/DashboardPriorityPage.tsx");
  assert.match(page, /setScheduleConfirmation\(\{/);
  assert.match(page, /async function confirmScheduleChange\(\)/);
  assert.match(page, /scheduleSubmittingRef\.current = true/);
  assert.match(page, /expectedProductionMode: confirmation\.currentMode/);
  assert.match(page, /setPendingSchedule\(\{/);
  assert.match(page, /toast\.error\(ui\("A programação foi alterada em outra estação/);
  assert.doesNotMatch(page, /window\.confirm\(/);
});
