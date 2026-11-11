import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("S3-B6: a feature-disabled error is the only route to legacy opening", async () => {
  const page = await read("../src/pages/MachineDetailPage.tsx");
  assert.match(page, /error instanceof AndonApiError && error\.code === "hierarchical_calls_disabled"/);
  assert.match(page, /setReasonCatalogStatus\(\s*error instanceof AndonApiError/);
  assert.match(page, /"legacy"\s*:\s*"unavailable"/);
  assert.match(page, /if \(accessChecking \|\| !access\)/);
  assert.match(page, /reasonCatalogStatus === "legacy" \? null : \[\]/);
  assert.match(page, /reasonCatalogStatus === "loading" \|\| reasonCatalogStatus === "unavailable"/);
  assert.match(page, /setReasonCatalogStatus\(reasons\.length \? "ready" : "unavailable"\)/);
});

test("S3-B6: operators can retry failed catalog without losing existing-call actions", async () => {
  const [page, panel] = await Promise.all([
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/components/machines/MachineActionPanel.tsx"),
  ]);
  assert.match(page, /onRetryReasonCatalog=\{\(\) => setReasonCatalogReload/);
  assert.match(panel, /reasonCatalogStatus === "unavailable"/);
  assert.match(panel, /role=\{reasonCatalogStatus === "unavailable" \? "alert" : "status"\}/);
  assert.match(panel, /onClick=\{onRetryReasonCatalog\}/);
  assert.match(panel, /activeCalls\.some/);
  assert.match(panel, /onSelectCall=\{onSelectCall\}/);
});
