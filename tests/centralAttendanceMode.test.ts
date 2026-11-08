import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  effectiveAttendanceMode,
  allowedAttendanceModes,
} from "../src/utils/attendanceModePolicy";

test("central login without declared-name feature still requires PIN/RFID and preserves saved preference", () => {
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

test("R12-02B2: only an explicit runtime capability allows unverified name in central UI", () => {
  assert.equal(effectiveAttendanceMode("name", true, false), "pin");
  assert.deepEqual(allowedAttendanceModes("name", true, false), ["pin", "rfid"]);
  assert.equal(effectiveAttendanceMode("name", true, true), "name");
  assert.deepEqual(allowedAttendanceModes("name", true, true), ["name", "pin", "rfid"]);
  assert.deepEqual(allowedAttendanceModes("pin", true, true), ["name", "pin", "rfid"]);
  assert.equal(effectiveAttendanceMode("pin", true, true), "pin");
  assert.equal(effectiveAttendanceMode("name", false, false), "name");
});

test("R12-02B2: start dialog is server-gated, individual technician exit is verified only", async () => {
  const start = await readFile(
    new URL("../src/components/calls/TechnicianIdentificationModal.tsx", import.meta.url), "utf8");
  const end = await readFile(
    new URL("../src/components/calls/EndTechnicianSessionModal.tsx", import.meta.url), "utf8");
  for (const source of [start, end]) {
    assert.match(source, /useModuleAccess/);
    assert.match(source, /effectiveAttendanceMode\(/);
    assert.match(source, /allowedAttendanceModes\(/);
  }
  assert.match(start, /systemSettings\.centralDeclaredNameAttendanceEnabled === true && purpose === "start"/);
  assert.match(start, /const canDeclareName = settings\?\.centralDeclaredNameAttendanceEnabled === true && purpose === "start"/);
  assert.match(start, /if \(centralAttendance && !canDeclareName\) return;/);
  assert.match(start, /A ação e o responsável são auditados/);
  assert.match(end, /effectiveAttendanceMode\(systemSettings\.attendanceMode, centralAttendance\)/);
  assert.match(end, /function handleNameSubmit\(\)\s*\{\s*if \(centralAttendance\) return;/);
  assert.match(end, /No login central, identifique o mantenedor por PIN ou tag/);
});

test("R12-02B2: declared start goes to a separate endpoint with CSRF; no PIN spoofing", async () => {
  const [repo, client] = await Promise.all([
    readFile(new URL("../src/repositories/apiAndonRepository.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(repo, /isCentralMode\(\) && technicians\.length > 0/);
  assert.match(repo, /technicians\.every\(\(technician\) => !technician\.credential\)/);
  assert.match(repo, /\/attend-declared`/);
  assert.match(repo, /technicianNames: technicians\.map/);
  assert.match(client, /attend-declared\$\/\.test\(path\)/);
});

test("R12-02B2: admin panel permits name only when server's runtime grant is true", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url), "utf8");
  assert.match(source, /settings\.centralDeclaredNameAttendanceEnabled !== true/);
  assert.match(source, /settings\.centralDeclaredNameAttendanceEnabled === true/);
  assert.match(source, /No login central, a seleção por nome não autentica o mantenedor/);
  assert.match(source, /A seleção por nome é uma declaração registrada pelo operador/);
});
