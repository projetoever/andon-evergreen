import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("SEC-04/2A.8: legacy workstation mutations preserve admission decisions and audit atomically", async () => {
  const source = await readFile(new URL("../routes/workstations.ts", import.meta.url), "utf8");
  const start = source.indexOf('app.patch<{ Params: { id: string }; Body: UpdateWorkstationBody }>');
  assert(start >= 0);
  const update = source.slice(start);
  assert.match(update, /const admin = readAdminSession\(request\)/);
  assert.match(update, /admin_auth_required/);
  const lock = update.indexOf("await lockWorkstationFlow(tx, id)");
  const read = update.indexOf("const lockedWorkstation = await tx.workstation.findUnique");
  const gate = update.indexOf("lockedWorkstation.pendingApproval");
  const session = update.indexOf("tx.technicianSession.findFirst");
  const mutation = update.indexOf("const updated = await tx.workstation.update");
  const revoke = update.indexOf("await tx.accessSession.updateMany");
  const audit = update.indexOf("await appendAudit(tx");
  const response = update.indexOf("return updated");
  assert(lock >= 0 && lock < read && read < gate && gate < session && session < mutation);
  assert(mutation < revoke && revoke < audit && audit < response, "audit and session revocation must commit with mutation");
  assert.match(update, /lockedWorkstation.admission\?\.status === "rejected"/);
  assert.doesNotMatch(update, /pendingApproval: false\s*}\s*:\s*\{\}/);
  assert.match(update, /actorType: "legacy_admin"/);
  assert.match(update, /action: "workstation.access.updated"/);
  assert.match(update, /where: \{ workstationId: id, revokedAt: null \}/);
});

test("SEC-04/2A.8: central workstation updates retain pending approval and revocation rules", async () => {
  const source = await readFile(new URL("../routes/access.ts", import.meta.url), "utf8");
  const start = source.indexOf('`${PREFIX}/workstations/:id`');
  assert(start >= 0);
  const update = source.slice(start, source.indexOf('`${PREFIX}/workstations/:id/decision`', start));
  assert.match(update, /station.pendingApproval/);
  assert.match(update, /station.admission\?\.status === "rejected"/);
  assert.match(update, /tx.accessSession.updateMany/);
  assert.match(update, /appendAudit\(tx/);
});
