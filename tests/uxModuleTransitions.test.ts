import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const load = (relative: string) => readFile(new URL(relative, import.meta.url), "utf8");
test("UX-07: route and tab transitions do not delay alarms or alter provider hierarchy", async () => {
  const paths = [
    "../src/pages/HubPage.tsx",
    "../src/pages/HubAdminPage.tsx",
    "../src/pages/AndonBiPage.tsx",
    "../src/pages/DashboardPage.tsx",
    "../src/pages/DashboardPriorityPage.tsx",
  ];
  for (const path of paths) assert.match(await load(path), /andon-screen-enter/, path);
  const css = await load("../src/styles.css");
  assert.match(css, /@keyframes andon-screen-reveal/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\), print/);
  assert.match(css, /140ms ease-out/);
  assert.doesNotMatch(css.slice(css.indexOf("UX-07:")), /animation-delay|transition-delay|transform:/);
  const root = await load("../src/routes/__root.tsx");
  assert.match(root, /<AndonProvider>/);
  assert.match(root, /<TechnicianProvider>/);
  assert.doesNotMatch(root, /key=\{pathname\}/);
  assert.match(await load("../src/pages/AndonBiPage.tsx"), /key=\{activeTab\} className="andon-panel-enter/);
  assert.match(await load("../src/pages/HubAdminPage.tsx"), /key=\{section\} className="andon-panel-enter/);
});
test("UX-07: permission checks display neutral loading skeleton, not a forbidden error", async () => {
  const gate = await load("../src/components/security/WorkstationAccessGate.tsx");
  assert.match(gate, /if \(checking\)/);
  assert.match(gate, /<section role="status"/);
  assert.match(gate, /motion-reduce:animate-none/);
  assert.match(gate, /role="alert"/);
  assert.match(gate, /<ModuleLoginPanel/);
});
test("UX-07: ANDON machine skeleton only appears before first snapshot; real errors and empty differ", async () => {
  const provider = await load("../src/context/AndonProvider.tsx");
  const dashboard = await load("../src/pages/DashboardPage.tsx");
  assert.match(provider, /initialSnapshotState: "loading" \| "ready" \| "error"/);
  assert.match(provider, /CONFIGURED_DATA_MODE === "api" \? "loading" : "ready"/);
  assert.match(provider, /setInitialSnapshotState\("ready"\)/);
  assert.match(provider, /state === "ready" \? state : "error"/);
  assert.match(dashboard, /initialSnapshotState === "loading" && machines\.length === 0/);
  assert.match(dashboard, /initialSnapshotState === "error" && machines\.length === 0/);
  assert.match(dashboard, /initialSnapshotState === "ready" && machines\.length === 0/);
  assert.match(dashboard, /<MachineGrid/);
});
test("UX-07: BI and Priorities skeletons do not confuse empty, loading and failures", async () => {
  const bi = await load("../src/components/bi/BiOverviewWorkspace.tsx");
  const priorities = await load("../src/pages/DashboardPriorityPage.tsx");
  assert.match(bi, /if \(loading && !overview\)/);
  assert.match(bi, /role="status"/);
  assert.match(priorities, /isLoading \? \(/);
  assert.match(priorities, /loadingError \? \(/);
  assert.match(priorities, /rows\.length === 0 \? \(/);
  assert.match(priorities, /onClick=\{\(\) => void loadOrder\(\)\}/);
});
