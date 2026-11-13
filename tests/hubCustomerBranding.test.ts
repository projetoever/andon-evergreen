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


test("BRAND-01: document title uses only the current Hub company, with safe fallback", async () => {
  const { formatAndonBrowserTitle } = await import("../src/utils/andonBrowserTitle.ts");
  assert.equal(formatAndonBrowserTitle("Evergreen"), "Andon (Evergreen)");
  assert.equal(formatAndonBrowserTitle("Evergreen do Brasil"), "Andon (Evergreen do Brasil)");
  assert.equal(formatAndonBrowserTitle(" Fábrica São João "), "Andon (Fábrica São João)");
  assert.equal(formatAndonBrowserTitle("長春企業"), "Andon (長春企業)");
  assert.equal(formatAndonBrowserTitle("a"), "Andon");
  assert.equal(formatAndonBrowserTitle(null), "Andon");
  assert.equal(formatAndonBrowserTitle(123), "Andon");
  assert.equal(formatAndonBrowserTitle(" "), "Andon");
  assert.equal(formatAndonBrowserTitle("X".repeat(101)), "Andon");
  assert.equal(formatAndonBrowserTitle("Main\u202e Admin"), "Andon (Main Admin)");
  assert.equal(formatAndonBrowserTitle("AC\u0000ME"), "Andon (ACME)");
});

test("BRAND-01: only browser favicon changes; the Hub remains product-neutral", async () => {
  const [root, branding, favicon, hub, service] = await Promise.all([
    load("../src/routes/__root.tsx"),
    load("../src/components/layout/AndonBrowserIdentity.tsx"),
    load("../public/favicon.svg"),
    load("../src/components/settings/HubClientIdentitySettings.tsx"),
    load("../src/services/systemSettingsService.ts"),
  ]);
  assert.match(root, /\{ title: "Andon" \}/);
  assert.match(root, /rel: "icon"/);
  assert.match(root, /type: "image\/svg\+xml"/);
  assert.match(root, /href: "\/favicon\.svg\?v=2"/);
  assert.match(root, /<AndonBrowserIdentity \/>/);
  assert.match(branding, /getSystemSettings\(\)/);
  assert.match(branding, /settings\.clientName/);
  assert.match(branding, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(branding, /window\.addEventListener\("focus", refresh\)/);
  assert.match(branding, /requestVersion \+= 1/);
  assert.match(branding, /document\.title = formatAndonBrowserTitle\(clientName\)/);
  assert.match(service, /new CustomEvent<SystemSettings>\(SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(hub, /clientName: draft\.clientName\.trim\(\)/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.match(favicon, /#15A46B/);
  assert.match(favicon, /engrenagem, indicador de status e pulso/);
  assert.match(favicon, /id="steel"/);
  assert.match(favicon, /#21DF53/);
  assert.match(favicon, /#F4E921/);
  assert.match(favicon, /#FB352E/);
  assert.match(favicon, /id="swoosh"/);
  assert.doesNotMatch(favicon, /Evergreen|<script|href="https?:/);
});
