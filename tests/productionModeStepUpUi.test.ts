import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("REFINE20: machine schedule always requests approval with login + password", async () => {
  const [page, modal, endpoint, policy, preset, eligibility] = await Promise.all([
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/components/machines/ProductionModeCredentialModal.tsx"),
    read("../server/src/routes/access.ts"),
    read("../server/src/access/policy.ts"),
    read("../src/services/accessRolePresets.ts"),
    read("../server/src/access/sessions.ts"),
  ]);
  assert.match(page, /onChange=\{\(productionMode\) => void requestProductionModeChange\(productionMode\)\}/);
  assert.match(page, /accessRequest<AccessState>\("\/session"\)/);
  assert.match(page, /production\.schedule\.request/);
  assert.match(page, /Você não tem permissão para alterar a programação desta máquina/);
  assert.match(page, /<ProductionModeCredentialModal/);
  assert.match(modal, /accessRequest\("\/machines\/production-mode", "POST"/);
  assert.match(modal, /expectedProductionMode: currentMode/);
  assert.match(modal, /autoComplete="current-password"/);
  assert.match(modal, /useRef\(false\)/);
  assert.match(modal, /submittingRef\.current \|\| busy/);
  assert.match(modal, /submittingRef\.current = true/);
  assert.match(modal, /submittingRef\.current = false/);
  assert.match(modal, /className="block space-y-2 text-sm font-semibold"/);
  assert.match(modal, /className="flex flex-col gap-2 sm:flex-row sm:justify-end"/);
  assert.match(modal, /className="w-full sm:w-auto" type="submit"/);


  assert.match(endpoint, /setCentralProductionModeWithCredential\(db/);
  assert.match(endpoint, /production-mode:\$\{req\.ip\}/);
  assert.match(policy, /"production\.schedule\.request"/);
  assert.match(preset, /"production\.schedule\.request"/);
  assert.match(eligibility, /permissions: row\.user\.permissions\.map/);
  assert.doesNotMatch(eligibility, /TRUSTED_OPERATIONAL_GRANTS/);
  assert.doesNotMatch(page, /onChange=\{\(productionMode\) => updateMachineProductionMode/);
});

test("REFINE20: central transition maintains transactional proof, audit and legacy direct write restrictions", async () => {
  const [domain, legacy, workstation] = await Promise.all([
    read("../server/src/access/centralProductionModeCredential.ts"),
    read("../server/src/routes/machines.ts"),
    read("../server/src/security/workstationAccess.ts"),
  ]);
  assert.match(domain, /resolveSession\(tx, input\)/);
  assert.match(domain, /mayApproveProductionMode\(account, input\.machineId\)/);
  assert.match(domain, /account\.passwordHash !== candidate\.passwordHash/);
  assert.match(domain, /machine\.productionMode !== input\.expectedProductionMode/);
  assert.match(domain, /lockMachineFlow\(tx, input\.machineId\)/);
  assert.match(domain, /await appendAudit\(tx,/);
  assert.match(domain, /operatorSessionUnchanged: true/);
  assert.match(legacy, /"\/api\/machines\/:id\/production-mode"/);
  assert.doesNotMatch(workstation, /markCentralProductionModeDirectAuthorized/);
});

test("REFINE21 mobile: production schedule buttons remain readable at narrow widths", async () => {
  const schedule = await read("../src/components/machines/ProductionSchedulePanel.tsx");
  assert.match(schedule, /grid-cols-2/);
  assert.match(schedule, /w-full min-w-0/);
  assert.match(schedule, /min-h-11/);
  assert.match(schedule, /whitespace-normal break-words text-center leading-tight/);
  assert.doesNotMatch(schedule, /className="truncate"/);
  assert.doesNotMatch(schedule, /min-w-\[220px\] shrink-0/);
  assert.match(schedule, /onClick=\{\(\) => onChange\("scheduled"\)\}/);
  assert.match(schedule, /onClick=\{\(\) => onChange\("not_scheduled"\)\}/);
  assert.match(schedule, /disabled=\{machine\.productionMode === "scheduled"\}/);
  assert.match(schedule, /disabled=\{machine\.productionMode === "not_scheduled"\}/);
});
