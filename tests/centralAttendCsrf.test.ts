import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");
test("central attendance auto-attaches only memory-held CSRF after verified Hub access", async () => {
  const [mode, csrf, api, access, routes] = await Promise.all([
    read("../src/services/moduleService.ts"), read("../src/services/centralCsrf.ts"),
    read("../src/api/andonApiClient.ts"), read("../src/services/accessService.ts"),
    read("../server/src/routes/andonCalls.ts"),
  ]);
  assert.match(mode, /setCentralMode\(access\.centralAccessEnabled === true\)/);
  assert.match(csrf, /let csrf = ""/);
  assert.match(csrf, /credentials: "include", cache: "no-store"/);
  assert.match(csrf, /\/api\/access\/session/);
  assert.doesNotMatch(csrf, /localStorage|sessionStorage/);
  assert.match(api, /getCentralCsrf\(baseUrl, workstationId/);
  assert.match(api, /"X-Andon-CSRF": centralCsrf/);
  assert.match(access, /setCentralCsrf\(csrf\)/);
  assert.match(routes, /runCentralMultiTechnicianAttendancePrototype\(prisma/);
  assert.match(routes, /isAuthorizedCentralAttendanceRequest\(request\)/);
});
