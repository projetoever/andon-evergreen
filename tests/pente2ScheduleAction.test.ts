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
