import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("SEC-04/2A.7: admission and workstation administration acquire user before workstation", async () => {
  const source = await readFile(new URL("../routes/access.ts", import.meta.url), "utf8");

  // These three handlers are intentionally the ONLY central admission and
  // workstation mutation paths covered by this checkpoint.
  assert.equal(
    [...source.matchAll(/await lockUser\(tx, principal\.userId\);\s*await lockWorkstationFlow\(tx, principal\.workstationId\);\s*const current = await resolveSession\(tx, requestAccess\(req\), new Date\(\), true\);/g)].length,
    1,
    "admission request must lock actor, then workstation, then revalidate session",
  );
  assert.equal(
    [...source.matchAll(/await lockUser\(tx, initial\.userId\);\s*await lockWorkstationFlow\(tx, id\);\s*const principal = await resolveSession\(tx, requestAccess\(req\)\);\s*if \(principal\.userId !== initial\.userId \|\|\s*principal\.sessionId !== initial\.sessionId\)/g)].length,
    2,
    "admin update and admission decision must use the same actor/station order",
  );
  const central = await readFile(new URL("./centralAttendanceAtomicAudit.ts", import.meta.url), "utf8");
  assert.match(central, /await lockUser\(tx, session\.userId\);[\s\S]*?await lockWorkstationFlow\(tx, input\.workstationId\);[\s\S]*?authorizeCentralAttendanceAfterLock\(/);
});

test("SEC-04/2A.7: global central mutation block remains in place", async () => {
  const source = await readFile(new URL("../security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(source, /!\["GET",\s*"HEAD"\]\.includes\(request\.method\)/);
  assert.match(source, /central_action_not_supported/);
});
