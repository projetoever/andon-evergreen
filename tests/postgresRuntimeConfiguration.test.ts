import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CENTRALIZED_SERVICES = [
  "../src/services/adminAuthService.ts",
  "../src/services/dashboardPriorityService.ts",
  "../src/services/machineScreenLockService.ts",
  "../src/services/machineSoundPreferenceService.ts",
  "../src/services/shiftConfigService.ts",
  "../src/services/systemSettingsService.ts",
  "../src/services/technicianShiftFilterService.ts",
  "../src/services/workstationIdentityService.ts",
  "../src/services/workstationService.ts",
  "../src/services/localStorageService.ts",
];

test("configurações operacionais não persistem em localStorage", async () => {
  for (const path of CENTRALIZED_SERVICES) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /localStorage/, path);
  }
});

test("PostgreSQL contém turnos, filtro global e preferências por workstation", async () => {
  const [schema, shifts, workstations, settings] = await Promise.all([
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/shifts.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/workstations.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/systemSettings.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /filterTechniciansByCurrentShift\s+Boolean/);
  assert.match(schema, /lockedMachineId\s+String\?/);
  assert.match(schema, /model WorkstationMachineSoundPreference/);
  assert.match(shifts, /app\.patch<[^]*"\/api\/shifts\/:id"/);
  assert.match(workstations, /runtime-preferences/);
  assert.match(workstations, /machine-sound/);
  assert.match(workstations, /screen-lock/);
  assert.match(settings, /filterTechniciansByCurrentShift/);
});

test("identidade persistente da workstation usa cookie técnico, não configuração local", async () => {
  const identity = await readFile(
    new URL("../src/services/workstationIdentityService.ts", import.meta.url),
    "utf8",
  );

  assert.match(identity, /document\.cookie/);
  assert.match(identity, /SameSite=Lax/);
  assert.doesNotMatch(identity, /localStorage/);
});


test("modo local legado mantém somente memória de processo", async () => {
  const source = await readFile(
    new URL("../src/services/localStorageService.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /new Map<string, string>\(\)/);
  assert.doesNotMatch(source, /window\.localStorage|localStorage\./);
});
