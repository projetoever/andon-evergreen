import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { effectiveAttendanceMode, allowedAttendanceModes } from "../src/utils/attendanceModePolicy";

test("REFINE13: configured name is available only when central server declares capability", () => {
  assert.equal(effectiveAttendanceMode("name", true), "pin");
  assert.deepEqual(allowedAttendanceModes("name", true), ["pin", "rfid"]);
  assert.equal(effectiveAttendanceMode("name", true, true), "name");
  assert.deepEqual(allowedAttendanceModes("name", true, true), ["name", "pin", "rfid"]);
  assert.equal(effectiveAttendanceMode("pin", true, true), "pin");
  assert.equal(effectiveAttendanceMode("rfid", true, true), "rfid");
});

test("legacy name/PIN/RFID preserved independently of central server capability", () => {
  assert.equal(effectiveAttendanceMode("name", false), "name");
  assert.deepEqual(allowedAttendanceModes("name", false), ["name", "pin", "rfid"]);
  assert.deepEqual(allowedAttendanceModes("pin", false), ["pin", "rfid"]);
});

test("central declared-name flows require server capability and preserve strong alternatives", async () => {
  const files = await Promise.all([
    readFile(new URL("../src/components/calls/TechnicianIdentificationModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/calls/EndTechnicianSessionModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/apiAndonRepository.ts", import.meta.url), "utf8"),
  ]);
  for (const source of files.slice(0, 2)) {
    assert.match(source, /effectiveAttendanceMode\(systemSettings\.attendanceMode, centralAttendance, systemSettings\.centralDeclaredAttendanceEnabled === true\)/);
    assert.match(source, /allowedAttendanceModes\(/);
    assert.doesNotMatch(source, /if \(centralAttendance\) return;/);
    assert.match(source, /declara|declaração|seleção por nome registra/);
  }
  assert.match(files[2], /technicianIds/);
  assert.match(files[2], /technicianId:/);
});

test("admin explains declared identity and disables name option when feature is OFF", async () => {
  const source = await readFile(new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url), "utf8");
  assert.match(source, /settings\.centralDeclaredAttendanceEnabled !== true/);
  assert.match(source, /selecionar por nome declara o mantenedor/);
  assert.match(source, /workstation responsáveis serão auditados/);
});
