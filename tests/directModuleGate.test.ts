import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { workstationGateDecision } from "../src/components/security/workstationGateDecision";
import type { ModuleAccess } from "../src/types/modules";

const access: ModuleAccess = {
  hubEnabled: true,
  centralAccessEnabled: true,
  principal: {
    userId: "user-1", login: "operator", displayName: "Operator",
    roleLabel: "Produção", purpose: "normal", machineScope: "selected", machineIds: ["10"],
  },
  workstation: {
    id: "ws-1", name: "Posto 10", active: true,
    allowOperational: true, allowBi: false, allowPriorities: false,
    lockedMachineId: null,
  },
  modules: [
    { id: "operational", name: "ANDON", description: "", route: "/andon",
      icon: "factory", available: true, enabled: true, allowed: true,
      passwordRequired: false, authenticated: true },
  ],
};

test("SEC-GATE-01: direct machine link requests secure identity instead of generic workstation denial", () => {
  const absent = { ...access, principal: null };
  assert.equal(workstationGateDecision(absent, "operational", false, null), "identity");
  assert.equal(workstationGateDecision({
    ...absent, workstation: { ...access.workstation, active: false, pendingApproval: true },
  }, "operational", false, null), "identity");
  assert.equal(workstationGateDecision({
    ...access, principal: { ...access.principal!, purpose: "password_change" },
  }, "operational", false, null), "identity");
  // In central mode a server response that claims allowed cannot supersede missing login.
  assert.equal(workstationGateDecision({
    ...absent, modules: access.modules,
  }, "operational", false, null), "identity");
});

test("SEC-GATE-02: a human login cannot bypass station admission or module ACL", () => {
  assert.equal(workstationGateDecision(access, "operational", false, null), "allowed");
  assert.equal(workstationGateDecision({
    ...access, workstation: { ...access.workstation, active: false, pendingApproval: true },
  }, "operational", false, null), "denied");
  assert.equal(workstationGateDecision({
    ...access, modules: access.modules.map(m => ({ ...m, allowed: false })),
  }, "operational", false, null), "denied");
  assert.equal(workstationGateDecision({
    ...access, modules: access.modules.map(m => ({ ...m, available: false })),
  }, "operational", false, null), "denied");
  assert.equal(workstationGateDecision(null, "operational", false, "api_error"), "error");
  assert.equal(workstationGateDecision(access, "operational", true, null), "checking");
});

test("SEC-GATE-03: legacy module password still requires legacy module login", () => {
  const legacy = {
    ...access, centralAccessEnabled: false, principal: null,
    modules: access.modules.map(m => ({ ...m, passwordRequired: true, authenticated: false })),
  };
  assert.equal(workstationGateDecision(legacy, "operational", false, null), "module-login");
  assert.equal(workstationGateDecision({
    ...legacy, workstation: { ...legacy.workstation, active: false },
  }, "operational", false, null), "denied");
});

test("SEC-GATE-04: login reuses existing Hub workflow; denial never mounts operational children", async () => {
  const [gate, root, hub] = await Promise.all([
    readFile(new URL("../src/components/security/WorkstationAccessGate.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/security/HubIdentityPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(gate, /<HubIdentityPanel access=\{access\} onChanged=\{refresh\} \/>/);
  assert.match(gate, /<Dialog open>/);
  assert.match(gate, /decision === "allowed"\) return <>{children}<\/>/);
  assert.match(gate, /returnToHub.*decision === "denied"/);
  assert.match(gate, /navigate\(\{ to: "\/hub", replace: true \}\)/);
  assert.doesNotMatch(gate, /"Acesso ao módulo restrito"/);
  assert.match(hub, /await accessRequest\("\/login", "POST", \{ login, password \}\)/);
  assert.match(root, /<WorkstationAccessGate>/);
  assert.doesNotMatch(gate, /approve-self-in-lab|localStorage|sessionStorage|setCentralMode/);
});
