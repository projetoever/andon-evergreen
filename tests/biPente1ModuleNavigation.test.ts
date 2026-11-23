import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const src = (name: string) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

test("PENTE 1: BI uses shared cross-module icons, with no duplicate operational link", async () => {
  const bi = await src("pages/AndonBiPage.tsx");
  assert.match(bi, /<ModuleNavigation showModuleLinks\s*\/>/);
  assert.doesNotMatch(bi, /<Link[\s\S]*?to="\/andon"/);
  assert.doesNotMatch(bi, /useModuleAccess\(\)/);
  assert.match(bi, /<LanguageSelector compact\s*\/>/);
  assert.match(bi, /<FileDown/);
  assert.match(bi, /<RefreshCw/);
});

test("PENTE 1: only explicitly authorized, available and enabled modules get navigation links", async () => {
  const [nav, modules, backend] = await Promise.all([
    src("components/layout/ModuleNavigation.tsx"),
    src("types/modules.ts"),
    readFile(new URL("../server/src/routes/modules.ts", import.meta.url), "utf8"),
  ]);
  assert.match(nav, /showModuleLinks = false/);
  assert.match(nav, /showModuleLinks && moduleLinks\.map/);
  assert.match(nav, /target\.id === currentModule/);
  assert.match(nav, /!grant\?\.available \|\| !grant\.enabled \|\| !grant\.allowed/);
  assert.match(nav, /access\.modules\.find\(/);
  assert.match(nav, /to: "\/andon"/);
  assert.match(nav, /to: "\/bi"/);
  assert.match(nav, /to: "\/machine-priorities"/);
  assert.match(nav, /access\.centralAccessEnabled === true/);
  assert.match(nav, /access\.globalHistory\?\.available === true/);
  assert.match(nav, /access\.globalHistory\.allowed === true/);
  assert.match(nav, /<Link to="\/history"/);
  assert.match(nav, /<Link\s+to="\/hub"/);
  assert.match(nav, /access\.workstation\.lockedMachineId/);
  assert.match(modules, /allowed: boolean/);
  assert.match(backend, /assertModule\(principal, workstation, module\.id\)/);
  assert.match(backend, /allowed: permitted\(module\)/);
  assert.doesNotMatch(nav, /principal\.roleLabel|isPrimaryAdmin/);
});

test("PENTE 1: other pages retain existing navigation until their own refinement", async () => {
  const [priorities, dashboard] = await Promise.all([
    src("pages/DashboardPriorityPage.tsx"),
    src("pages/DashboardPage.tsx"),
  ]);
  assert.match(priorities, /<ModuleNavigation\s*\/>/);
  assert.match(dashboard, /<ModuleNavigation\s*\/>/);
  assert.doesNotMatch(priorities, /<ModuleNavigation showModuleLinks/);
  assert.doesNotMatch(dashboard, /<ModuleNavigation showModuleLinks/);
});
