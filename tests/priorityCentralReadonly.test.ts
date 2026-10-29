import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("central priority editor remains read-only while writes are denied", async () => {
  const page = await readFile(new URL("../src/pages/DashboardPriorityPage.tsx", import.meta.url), "utf8");
  assert.match(page, /centralReadOnly = access\?\.centralAccessEnabled === true/);
  assert.match(page, /draggable=\{!centralReadOnly\}/);
  assert.match(page, /if \(centralReadOnly\) return/);
  assert.match(page, /if \(centralReadOnly \|\| !hasUnsavedChanges \|\| isSaving\) return/);
  assert.match(page, /disabled=\{centralReadOnly \|\| index === 0\}/);
  assert.match(page, /disabled=\{centralReadOnly \|\| index === rows.length - 1\}/);
  assert.match(page, /!centralReadOnly && <div className="sticky/);
});
test("priority GET requires bound central principal before waiving legacy password", async () => {
  const route = await readFile(new URL("../server/src/routes/dashboardPriority.ts", import.meta.url), "utf8");
  const scope = route.indexOf("const allowedIds = scopedMachineReadIds(request);");
  const sso = route.indexOf("if (!centralAccessEnabled() || request.industrialService)");
  assert(scope >= 0 && sso > scope);
  const writes = await readFile(new URL("../server/src/security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(writes, /central_action_not_supported/);
});
