import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const load = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Client brand is persisted additively and exposed in system settings", async () => {
  const [schema, migration, getter, route, admin] = await Promise.all([
    load("../server/prisma/schema.prisma"),
    load("../server/prisma/migrations/20261029150000_hub_client_identity/migration.sql"),
    load("../server/src/services/systemSettings.ts"),
    load("../server/src/routes/systemSettings.ts"),
    load("../server/src/security/adminAuthorization.ts"),
  ]);
  assert.match(schema, /clientName\s+String\s+@default\("Evergreen"\)/);
  assert.match(schema, /clientUnit\s+String\s+@default\(""/);
  assert.match(migration, /ADD COLUMN "clientName"/);
  assert.match(migration, /ADD COLUMN "clientUnit"/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/);
  assert.match(getter, /clientName: true/);
  assert.match(getter, /clientUnit: true/);
  assert.match(route, /"clientName" in body/);
  assert.match(route, /"clientUnit" in body/);
  assert.match(route, /clientName\.trim\(\)\.length > 100/);
  assert.match(route, /clientUnit\.trim\(\)\.length > 100/);
  assert.match(route, /clientName: clientName\.trim\(\)/);
  assert.match(admin, /normalizedMethod === "PATCH" && path === "\/api\/system-settings"/);
});

test("Hub admin edits customer identity without opening operational providers", async () => {
  const [ui, overview, hub, admin] = await Promise.all([
    load("../src/components/settings/HubClientIdentitySettings.tsx"),
    load("../src/components/settings/HubAdminOverview.tsx"),
    load("../src/pages/HubPage.tsx"),
    load("../src/pages/HubAdminPage.tsx"),
  ]);
  assert.match(overview, /<HubClientIdentitySettings \/>/);
  assert.match(ui, /updateSystemSettings\(\{/);
  assert.match(ui, /getSystemSettings\(\)/);
  assert.match(ui, /disabled=\{!saved \|\| loading \|\| saving \|\| !changed \|\| !validName \|\| !validUnit\}/);
  assert.match(hub, /ANDON WEB INDUSTRIAL/);
  assert.match(hub, /getSystemSettings\(\)/);
  assert.match(admin, /if \(!authenticated\)/);
});

test("BI report retrieves current identity rather than assuming live main or stale browser values", async () => {
  const [pdf, bi] = await Promise.all([
    load("../src/services/andonBiPdfReport.ts"),
    load("../src/pages/AndonBiPage.tsx"),
  ]);
  assert.match(bi, /getSystemSettings\(\)/);
  assert.match(bi, /branding: \{ clientName: identity\.clientName, clientUnit: identity\.clientUnit \}/);
  assert.match(pdf, /client-identity/);
  assert.match(pdf, /esc\(clientLabel\)/);
  assert.match(pdf, /pageHeader\("03",[^\n]*branding\)/);
});
