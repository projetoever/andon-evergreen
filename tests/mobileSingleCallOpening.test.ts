import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (relative: string) => readFile(new URL(relative, import.meta.url), "utf8");

test("quick modal opens one maintenance call via single endpoint, preserving form on refusal", async () => {
  const modal = await source("../src/components/calls/QuickOpenCallModal.tsx");
  assert.match(modal, /const \{ machines, openCall \} = useAndon\(\)/);
  assert.match(modal, /await openCall\(\{/);
  assert.doesNotMatch(modal, /await openCalls\(/);
  assert.match(modal, /reasonId: hierarchicalChoice\.reasonId/);
  assert.match(modal, /setOpeningError\(message\)/);
  assert.match(modal, /role="alert"/);
  assert.match(modal, /Os dados preenchidos foram preservados/);
  assert.match(modal, /disabled=\{buttonDisabled\}/);
});

test("machine quick-stop and generic single item use individual API and genuine batches remain batch", async () => {
  const [page, api] = await Promise.all([
    source("../src/pages/MachineDetailPage.tsx"),
    source("../src/repositories/apiAndonRepository.ts"),
  ]);
  assert.match(page, /await openCall\(\{\s*machineId: machine\.id/);
  assert.doesNotMatch(page, /openCalls\(/);
  assert.match(api, /if \(params\.length === 1\) \{\s*return this\.openCall\(_machines, _calls, first\)/);
  assert.match(api, /this\.apiClient\.post<ApiAndonCall>\("\/api\/andon-calls"/);
  assert.match(api, /this\.apiClient\.post<ApiAndonCall\[\]>\("\/api\/andon-calls\/batch"/);
  assert.match(api, /params\.some\(\(item\) => item\.machineId !== first\.machineId\)/);
});

test("403 operator errors explain safe denial reasons without weakening central security", async () => {
  const [client, central, route] = await Promise.all([
    source("../src/api/andonApiClient.ts"),
    source("../server/src/security/centralOpenCallHttp.ts"),
    source("../server/src/routes/andonCalls.ts"),
  ]);
  for (const code of [
    "central_action_not_supported",
    "workstation_inactive",
    "workstation_identification_required",
    "csrf_denied",
    "permission_denied",
    "machine_scope_denied",
    "origin_denied",
    "hierarchical_calls_disabled",
  ]) assert.match(client, new RegExp(code));
  assert.match(central, /ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED === "1"/);
  assert.match(central, /assertPermission\(principal, "calls\.open"\)/);
  assert.match(central, /checkCsrf\(/);
  assert.match(route, /centralOpen && !isAuthorizedCentralOpenCall\(request\)/);
});
