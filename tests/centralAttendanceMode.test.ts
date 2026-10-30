import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  effectiveAttendanceMode,
  allowedAttendanceModes,
} from "../src/utils/attendanceModePolicy";

test("central login selects PIN when legacy name is stored without mutating the original setting", () => {
  assert.equal(effectiveAttendanceMode("name", true), "pin");
  assert.deepEqual(allowedAttendanceModes("name", true), ["pin", "rfid"]);
  assert.equal(effectiveAttendanceMode("rfid", true), "rfid");
  assert.equal(effectiveAttendanceMode("pin", true), "pin");
});

test("legacy name/PIN/RFID selection is preserved when central access is OFF", () => {
  assert.equal(effectiveAttendanceMode("name", false), "name");
  assert.deepEqual(allowedAttendanceModes("name", false), ["name", "pin", "rfid"]);
  assert.deepEqual(allowedAttendanceModes("pin", false), ["pin", "rfid"]);
  assert.deepEqual(allowedAttendanceModes("rfid", false), ["pin", "rfid"]);
});

test("both attendance and individual exit dialogs are central-safe, with no name-only mutation", async () => {
  const files = await Promise.all([
    readFile(new URL("../src/components/calls/TechnicianIdentificationModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/calls/EndTechnicianSessionModal.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of files) {
    assert.match(source, /useModuleAccess/);
    assert.match(source, /effectiveAttendanceMode\(systemSettings\.attendanceMode, centralAttendance\)/);
    assert.match(source, /allowedAttendanceModes\(/);
    assert.match(source, /function handleNameSubmit\(\)\s*\{\s*if \(centralAttendance\) return;/);
    assert.match(source, /No login central, identifique o mantenedor por PIN ou tag/);
  }
});

test("admin explains PIN/RFID policy and does not silently change the legacy saved setting", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{centralAttendance && option\.id === "name"\}/);
  assert.match(source, /centralAttendance && settings\.attendanceMode === "name"/);
  assert.match(source, /No login central, a seleção por nome não autentica o mantenedor/);
});
