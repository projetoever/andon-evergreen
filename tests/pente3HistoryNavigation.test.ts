import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { navigationModuleForPath } from "../src/utils/moduleNavigationRoute";

const src = (name: string) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
const server = (name: string) => readFile(new URL(`../server/src/${name}`, import.meta.url), "utf8");

test("PENTE 3-A: History routes are independent, while other modules retain their identity", () => {
  assert.equal(navigationModuleForPath("/history"), "history");
  assert.equal(navigationModuleForPath("/history/"), "history");
  assert.equal(navigationModuleForPath("/history/details"), "history");
  assert.equal(navigationModuleForPath("/bi"), "bi");
  assert.equal(navigationModuleForPath("/bi/maintenance"), "bi");
  assert.equal(navigationModuleForPath("/machine-priorities"), "priorities");
  assert.equal(navigationModuleForPath("/andon"), "operational");
  assert.equal(navigationModuleForPath("/machines/37"), "operational");
  assert.equal(navigationModuleForPath("/history-fake"), "operational");
});

test("PENTE 3-A: Global History header reuses permission-filtered module icons", async () => {
  const [page, nav] = await Promise.all([
    src("pages/GlobalCallHistoryPage.tsx"),
    src("components/layout/ModuleNavigation.tsx"),
  ]);
  assert.match(page, /<ModuleNavigation showModuleLinks\s*\/>/);
  assert.match(page, /<LanguageSelector compact\s*\/>/);
  const header = page.split("<header")[1]?.split("</header>")[0] ?? "";
  assert.ok(header, "Global History header must exist");
  assert.doesNotMatch(header, /<Link to="\/hub"/);
  assert.match(nav, /navigationModuleForPath\(pathname\)/);
  assert.match(nav, /target\.id === currentModule/);
  assert.match(nav, /!grant\?\.available \|\| !grant\.enabled \|\| !grant\.allowed/);
  assert.match(nav, /currentModule !== "history"/);
  assert.match(nav, /access\.centralAccessEnabled === true/);
  assert.match(nav, /access\.globalHistory\?\.available === true/);
  assert.match(nav, /access\.globalHistory\.allowed === true/);
  assert.match(nav, /<Link to="\/history"/);
  assert.match(nav, /<Link\s+to="\/hub"/);
  assert.match(nav, /currentModule === "operational" \|\| currentModule === "bi"/);
  assert.doesNotMatch(nav, /logoutModule\("history"\)/);
});

test("PENTE 3-A: Global History remains server-scoped and read-only", async () => {
  const [access, scoped, route, page] = await Promise.all([
    server("security/globalHistoryModuleAccess.ts"),
    server("security/centralScopedMachineReads.ts"),
    src("routes/history.tsx"),
    src("pages/GlobalCallHistoryPage.tsx"),
  ]);
  for (const grant of ["andon.read", "history.read", "history.global.read"]) {
    assert.ok(access.includes(`assertPermission(principal, "${grant}")`));
    assert.ok(scoped.includes(`assertPermission(principal, "${grant}")`));
  }
  assert.match(access, /workstation\.active/);
  assert.match(access, /pendingApproval/);
  assert.match(access, /ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED/);
  assert.match(scoped, /principal\.machineScope === "all" \? null : principal\.machineIds/);
  assert.match(route, /validateSearch:/);
  assert.match(page, /if \(!allowed\) return/);
  assert.match(page, /searchGlobalHistory\(applied, offset\)/);
});
