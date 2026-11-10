import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { effectiveAttendanceMode, allowedAttendanceModes } from "../src/utils/attendanceModePolicy";

test("REFINE13: name mode is available under central session when deliberately configured", () => {
  assert.equal(effectiveAttendanceMode("name", true), "name");
  assert.deepEqual(allowedAttendanceModes("name", true), ["name", "pin", "rfid"]);
  assert.equal(effectiveAttendanceMode("rfid", true), "rfid");
  assert.equal(effectiveAttendanceMode("pin", true), "pin");
  assert.deepEqual(allowedAttendanceModes("pin", true), ["pin", "rfid"]);
});

test("legacy name, PIN and RFID selection is preserved", () => {
  assert.equal(effectiveAttendanceMode("name", false), "name");
  assert.deepEqual(allowedAttendanceModes("name", false), ["name", "pin", "rfid"]);
  assert.deepEqual(allowedAttendanceModes("pin", false), ["pin", "rfid"]);
});

test("central declared-name selection never bypasses backend identity validation", async () => {
  const files = await Promise.all([
    readFile(new URL("../src/components/calls/TechnicianIdentificationModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/calls/EndTechnicianSessionModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/apiAndonRepository.ts", import.meta.url), "utf8"),
  ]);
  for (const source of files.slice(0, 2)) {
    assert.match(source, /effectiveAttendanceMode\(systemSettings\.attendanceMode, centralAttendance\)/);
    assert.match(source, /allowedAttendanceModes\(/);
    assert.doesNotMatch(source, /if \(centralAttendance\) return;/);
    assert.match(source, /declara|declaração/);
  }
  assert.match(files[2], /technicianIds/);
  assert.match(files[2], /technicianId:/);
});

test("central operational settings describes declared identity instead of verified credential", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /disabled=\{centralAttendance && option\.id === "name"\}/);
  assert.match(source, /selecionar por nome declara o mantenedor/);
  assert.match(source, /workstation responsáveis serão auditados/);
});
