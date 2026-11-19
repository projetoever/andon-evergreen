import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { effectiveAttendanceMode, allowedAttendanceModes } from "../src/utils/attendanceModePolicy";
import { buildTechnicianEndPayload } from "../src/services/technicianEndPayload";

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
  assert.match(source, /value\.centralDeclaredAttendanceEnabled === true/);
  assert.match(source, /const canSelectName = access !== null && \(!centralAttendance \|\| centralCapability\?\.declaredName === true\)/);
  assert.match(source, /option\.id === "name" && !canSelectName/);
  assert.match(source, /const canSaveAttendance = canWriteAttendance/);
  assert.match(source, /selecionar por nome declara o mantenedor/);
  assert.match(source, /workstation responsáveis serão auditados/);
});

test("REFINE22.4: individual technician end omits empty notes; central accepts legacy null only for optional notes", async () => {
  const [modal, repository, guard, route, pg] = await Promise.all([
    readFile(new URL("../src/components/calls/EndTechnicianSessionModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/apiAndonRepository.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/centralTechnicianEnd.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/scripts/validate-central-technician-end-pg.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(modal, /notes: notes\.trim\(\) \|\| undefined/);
  assert.match(modal, /maxLength=\{4000\}/);
  assert.match(repository, /buildTechnicianEndPayload\(params, session, central\)/);
  const payloadContract = await readFile(new URL("../src/services/technicianEndPayload.ts", import.meta.url), "utf8");
  assert.match(payloadContract, /typeof params\.notes === "string" \? params\.notes\.trim\(\)/);
  assert.match(payloadContract, /\.\.\.\(notes \? \{ notes \} : \{\}\)/);
  assert.match(guard, /input\.notes !== undefined && input\.notes !== null/);
  assert.match(guard, /typeof input\.notes !== "string" \|\| input\.notes\.length > 4000/);
  assert.match(pg, /notes: null/);
  assert.match(pg, /badNotes\.json\(\)\.error, "invalid_technician_end_notes"/);
  assert.match(route, /runCentralTechnicianEnd\(prisma/);
  // The security contract remains credential or authorized declared name,
  // and ending the last maintenance participant remains guarded in the domain.
  assert.match(guard, /normalizeCredential\(/);
  assert.match(guard, /assertPermission\(latest, "calls\.technicians\.manage", reference\.machineId\)/);
  assert.match(guard, /endActiveTechnicianSession\(tx/);
});

test("REFINE22.5: a single safe payload contract handles declared name, PIN and empty notes", () => {
  const params = { callId: "call_1", sessionId: "session_1",
    technicianName: "Mantenedor A", endReason: "support_finished" as const, notes: null };
  const session = { technicianId: "tech_a", technicianName: "Mantenedor A" };
  assert.deepEqual(buildTechnicianEndPayload(params, session, true),
    { technicianId: "tech_a", reason: "support_finished" });
  assert.deepEqual(buildTechnicianEndPayload({
    ...params, credential: { method: "pin", value: "1234" },
  }, session, true), {
    credential: { method: "pin", value: "1234" }, reason: "support_finished",
  });
  assert.deepEqual(buildTechnicianEndPayload({ ...params, notes: "  Serviço concluído  " },
    session, false), {
    technicianName: "Mantenedor A", reason: "support_finished", notes: "Serviço concluído",
  });
  assert.throws(() => buildTechnicianEndPayload(params, undefined, true),
    /sem identificação válida/);
  assert.throws(() => buildTechnicianEndPayload({ ...params, notes: "X".repeat(4001) },
    session, true), /4\.000/);
});
