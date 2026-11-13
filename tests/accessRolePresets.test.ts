import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MODULE_ENTRY_PERMISSIONS,
  advancedModuleGrants,
  advancedIndependentGrants,
  PILOT_OPERATIONAL_ACTIONS,
  SCREEN_UNLOCK_PERMISSION,
  PILOT_SIMPLE_ROLES,
  SIMPLE_MODULE_GROUPS,
  simpleModuleGrants,
  simpleModuleState,
  toggleSimpleModule,
  reconcileSimpleModuleRole,
  hasRoleSuggestion,
  isExactRolePreset,
  suggestedPermissions,
  toggleAndonModulePermission,
} from "../src/services/accessRolePresets";

const catalog = [
  "andon.read",
  "history.read",
  "calls.open",
  "calls.cancel.own",
  "calls.attend",
  "calls.technicians.manage",
  "calls.finishMaintenance",
  "calls.finish",
  "analytics.reclassify",
  "calls.cancel.any",
  "calls.followUp",
  "calls.returnToMaintenance",
  "diagnosis.edit",
  "bi.read",
  "bi.export",
  "priorities.read",
  "priorities.write",
  "workstations.manage",
  "users.create",
];

test("role suggestions require an explicit action and never imply admin powers", () => {
  for (const role of ["Gestor/Gerente", "Líder", "Manutenção", "Produção"]) {
    assert.equal(hasRoleSuggestion(role), true);
    const perms = suggestedPermissions(role, catalog);
    assert(perms.includes("andon.read"), role);
    assert.equal(perms.includes("workstations.manage"), false, role);
    assert.equal(perms.includes("users.create"), false, role);
  }
  const maintenance = suggestedPermissions("Manutenção", catalog);
  assert(maintenance.includes("calls.technicians.manage"));
  assert(maintenance.includes("calls.finish"));
  assert(maintenance.includes("diagnosis.edit"));
  assert(!maintenance.includes("analytics.reclassify"),
    "BI reclassification is an independent explicit admin grant");
  assert(!suggestedPermissions("Produção", catalog).includes("calls.technicians.manage"));
  assert(!suggestedPermissions("Líder", catalog).includes("calls.technicians.manage"));
  assert.equal(hasRoleSuggestion("Admin"), false);
  assert.deepEqual(suggestedPermissions("Admin", catalog), []);
  assert.deepEqual(suggestedPermissions("unknown", catalog), []);
});

test("suggestions are strictly limited to the permitted catalog", () => {
  assert.deepEqual(suggestedPermissions("Gestor/Gerente", ["bi.read"]), ["bi.read"]);
  assert.deepEqual(suggestedPermissions("Líder", ["calls.open", "priorities.read"]), [
    "calls.open",
    "priorities.read",
  ]);
  assert.deepEqual(suggestedPermissions("Produção", []), []);
  assert.deepEqual(
    MODULE_ENTRY_PERMISSIONS.map((item) => item.key),
    ["andon.read", "bi.read", "priorities.read", "andon.settings.open"],
  );
});

test("pilot registration defaults to Production, with an explicit advanced path", () => {
  assert.deepEqual([...PILOT_SIMPLE_ROLES], ["Produção", "Manutenção", "Líder", "Gestor/Gerente"]);
  assert.deepEqual(suggestedPermissions("Produção", [
    "andon.read", "history.read", "calls.open", "calls.cancel.own",
    "calls.attend", "bi.read", "users.create",
  ]), ["andon.read", "calls.open", "calls.cancel.own"]);
  assert(isExactRolePreset("Produção", ["calls.cancel.own", "andon.read", "calls.open"], catalog));
  assert(!isExactRolePreset("Produção", ["andon.read"], catalog));
  assert(!isExactRolePreset("Produção", ["andon.read", "calls.open", "calls.cancel.own", "users.create"], catalog));
  assert(!isExactRolePreset("Líder desconhecido", [], catalog));
});
test("Manager and maintenance templates are operational, never user or service administration", () => {
  const fullCatalog = [
    ...catalog,
    "workstations.read", "hub.settings.presentation.write", "audit.read", "analytics.policy.manage",
    "catalog.assets.manage", "production.schedule.write", "machines.status.write",
  ];
  const manager = suggestedPermissions("Gestor/Gerente", fullCatalog);
  const maintenance = suggestedPermissions("Manutenção", fullCatalog);
  assert(manager.includes("bi.read") && manager.includes("workstations.read"));
  assert(manager.includes("hub.settings.presentation.write"));
  assert(!maintenance.includes("hub.settings.presentation.write"));
  assert(manager.includes("calls.open") && manager.includes("priorities.write"));
  assert(!manager.includes("users.create") && !manager.includes("workstations.manage"));
  assert(!manager.includes("analytics.policy.manage") && !manager.includes("catalog.assets.manage"));
  assert(maintenance.includes("bi.read") && maintenance.includes("calls.attend"));
  assert(!maintenance.includes("workstations.read") && !maintenance.includes("users.create"));
});

test("R10-09: granting ANDON settings in any profile enables only minimum ANDON module read", () => {
  for (const role of ["Produção", "Manutenção", "Líder", "Gestor/Gerente", "Personalizado"]) {
    const before = suggestedPermissions(role, catalog).filter(key => key !== "andon.read");
    const granted = toggleAndonModulePermission(before, "andon.settings.open", true);
    assert(granted.includes("andon.settings.open"), role);
    assert(granted.includes("andon.read"), role);
    assert(!granted.includes("users.create"));
    assert(!granted.includes("workstations.manage"));
    assert(!granted.includes("bi.export") || before.includes("bi.export"));
    const revoked = toggleAndonModulePermission(granted, "andon.read", false);
    assert(!revoked.includes("andon.settings.open"));
    assert(!revoked.includes("andon.read"));
  }
  assert.deepEqual(toggleAndonModulePermission([], "andon.settings.open", true),
    ["andon.settings.open", "andon.read"]);
  assert.deepEqual(toggleAndonModulePermission(["andon.read", "andon.settings.open"],
    "andon.settings.open", false), ["andon.read"]);
});

test("REFINE 11: individual machine-screen unpin requires ANDON read and is not in role presets", () => {
  assert.equal(SCREEN_UNLOCK_PERMISSION, "workstations.screen.unlock");
  for (const role of ["Produção", "Manutenção", "Líder", "Gestor/Gerente"]) {
    const list = suggestedPermissions(role, [...catalog, SCREEN_UNLOCK_PERMISSION]);
    assert(!list.includes(SCREEN_UNLOCK_PERMISSION), "role presets must not auto-grant screen release");
  }
  const granted = toggleAndonModulePermission([], SCREEN_UNLOCK_PERMISSION, true);
  assert.deepEqual(granted, [SCREEN_UNLOCK_PERMISSION, "andon.read"]);
  assert.deepEqual(
    toggleAndonModulePermission(granted, SCREEN_UNLOCK_PERMISSION, false),
    ["andon.read"], "revoking screen permission does not remove the ANDON module");
  assert.deepEqual(
    toggleAndonModulePermission(granted, "andon.read", false),
    [], "removing ANDON access also revokes screen release");
});


test("REFINE 16 P0: opening a call is explicitly granted, never inferred from ANDON read", () => {
  const actions: string[] = PILOT_OPERATIONAL_ACTIONS.map((entry) => entry.key);
  assert(actions.includes("calls.open"));
  assert(actions.includes("calls.attend"));
  assert(actions.includes("calls.finish"));
  assert(!actions.includes("users.create"));
  assert(!actions.includes("workstations.manage"));
  assert(!actions.includes("calls.cancel.any"));
  const existingCustom = ["andon.read", "bi.read", "andon.settings.open"];
  const afterOpeningGrant = toggleAndonModulePermission(existingCustom, "calls.open", true);
  assert.deepEqual(afterOpeningGrant, [...existingCustom, "calls.open"]);
  assert.equal(existingCustom.includes("calls.open"), false,
    "a user viewing ANDON must not gain an open-call permission implicitly");
  assert.deepEqual(
    toggleAndonModulePermission(afterOpeningGrant, "calls.open", false),
    existingCustom, "revoking call opening leaves custom grants untouched",
  );
  assert.equal(suggestedPermissions("Gestor/Gerente", catalog).includes("calls.open"), true);
});


test("REFINE 16 P0: simple editor exposes exactly four grouped modules, never individual call controls", async () => {
  assert.deepEqual(SIMPLE_MODULE_GROUPS.map((entry) => entry.label), [
    "ANDON", "BI", "Prioridades", "Config. do ANDON",
  ]);
  const source = await readFile(
    new URL("../src/components/settings/UsersAccessSettings.tsx", import.meta.url), "utf8",
  );
  const simple = source.slice(
    source.indexOf('                  {!advancedPermissions && ('),
    source.indexOf('                  {advancedPermissions && <fieldset'),
  );
  assert.match(simple, /SIMPLE_MODULE_GROUPS\.map/);
  assert.match(simple, /simpleModuleState\(/);
  assert.match(simple, /toggleSimpleModule\(/);
  assert.doesNotMatch(simple, /PILOT_OPERATIONAL_ACTIONS|SCREEN_UNLOCK_PERMISSION/);
  assert.doesNotMatch(simple, /Chamados: abrir|Cancelar chamados próprios|Concluir manutenção/);
  assert.match(source, /reconcileSimpleModuleRole\(/);
  assert.match(source, /Role is descriptive/);
  assert.ok(source.includes("advancedModuleGrants("));
  assert.ok(source.includes("advancedIndependentGrants("));
  assert.match(source, /A new account starts without grants/);
});


test("SEC-16: all four essential modules grant their entire catalog regardless of profile", () => {
  const fullCatalog = [
    ...catalog,
    "andon.settings.open", "machines.status.write", "production.schedule.write",
    "workstations.screen.unlock", "analytics.policy.manage",
    "catalog.assets.manage", "catalog.reasons.manage",
    "catalog.classifications.manage", "catalog.technicians.manage",
    "hub.settings.presentation.write", "audit.read", "audit.export",
  ];
  const requiredAndon = [
    "andon.read", "history.read", "calls.open", "calls.cancel.own",
    "calls.cancel.any", "calls.attend", "calls.technicians.manage",
    "calls.finishMaintenance", "calls.finish", "calls.followUp",
    "calls.returnToMaintenance", "machines.status.write",
    "production.schedule.write", "diagnosis.edit", "workstations.screen.unlock",
  ];
  const requiredBi = ["bi.read", "bi.export", "analytics.reclassify", "analytics.policy.manage"];
  const requiredPriorities = ["priorities.read", "priorities.write"];
  const requiredSettings = [
    "andon.settings.open", "catalog.assets.manage", "catalog.reasons.manage",
    "catalog.classifications.manage", "catalog.technicians.manage",
  ];
  for (const role of ["Produção", "Manutenção", "Líder", "Gestor/Gerente", "Desconhecido"]) {
    const byRole = (group: "andon" | "bi" | "priorities" | "andonSettings") =>
      simpleModuleGrants(group, role, fullCatalog);
    assert.deepEqual(byRole("andon"), requiredAndon, role + " ANDON");
    assert.deepEqual(byRole("bi"), requiredBi, role + " BI");
    assert.deepEqual(byRole("priorities"), requiredPriorities, role + " priorities");
    assert.deepEqual(byRole("andonSettings"), requiredSettings, role + " config");
    const enabled = toggleSimpleModule([], "andon", role, fullCatalog, true);
    assert.equal(simpleModuleState(enabled, "andon", role, fullCatalog), "on");
    for (const key of requiredAndon) assert(enabled.includes(key), "ANDON misses " + key);
    for (const forbidden of ["users.create", "workstations.manage", "audit.read",
      "hub.settings.presentation.write", "analytics.policy.manage", "andon.settings.open"])
      assert(!enabled.includes(forbidden), role + " automatically granted " + forbidden);
  }
});

test("SEC-16: Advanced restricts individual actions and summary reports partial without regranting", () => {
  const fullCatalog = [...new Set([...catalog, "andon.settings.open",
    "workstations.screen.unlock", "machines.status.write", "production.schedule.write",
    "catalog.assets.manage", "catalog.reasons.manage", "analytics.policy.manage",
    "analytics.reclassify", "workstations.read", "audit.read",
  ])];
  let granted = toggleSimpleModule(["audit.read"], "andon", "Produção", fullCatalog, true);
  assert(granted.includes("workstations.screen.unlock"));
  granted = toggleAndonModulePermission(granted, "calls.finish", false);
  granted = toggleAndonModulePermission(granted, "workstations.screen.unlock", false);
  assert.equal(simpleModuleState(granted, "andon", "Produção", fullCatalog), "partial");
  assert(!granted.includes("calls.finish"));
  assert(!granted.includes("workstations.screen.unlock"));
  const relabeled = reconcileSimpleModuleRole(granted, "Produção", "Gestor/Gerente", fullCatalog);
  assert.deepEqual(relabeled, granted, "changing role label must not silently add missing actions");
  const restored = toggleSimpleModule(relabeled, "andon", "Produção", fullCatalog, true);
  assert.equal(simpleModuleState(restored, "andon", "Produção", fullCatalog), "on");
  assert(restored.includes("calls.finish") && restored.includes("workstations.screen.unlock"));
  assert(restored.includes("audit.read"));
});

test("SEC-16: each group can be revoked without losing unrelated modules or Hub security", () => {
  const fullCatalog = [...new Set([...catalog,
    "andon.settings.open", "catalog.assets.manage", "catalog.reasons.manage",
    "catalog.classifications.manage", "catalog.technicians.manage",
    "workstations.screen.unlock", "machines.status.write", "production.schedule.write",
    "analytics.policy.manage", "audit.read", "workstations.read",
    "hub.settings.presentation.write",
  ])];
  let grants = ["audit.read", "workstations.read", "hub.settings.presentation.write"];
  for (const group of SIMPLE_MODULE_GROUPS) {
    grants = toggleSimpleModule(grants, group.id, "Produção", fullCatalog, true);
    assert.equal(simpleModuleState(grants, group.id, "Produção", fullCatalog), "on");
  }
  assert(grants.includes("analytics.policy.manage"));
  const noAndon = toggleSimpleModule(grants, "andon", "Produção", fullCatalog, false);
  for (const key of ["calls.open", "calls.attend", "calls.finish", "calls.cancel.any",
    "workstations.screen.unlock", "machines.status.write", "production.schedule.write"])
    assert(!noAndon.includes(key), "removed ANDON still has " + key);
  assert(noAndon.includes("andon.read"), "Config ANDON requires minimum module read");
  for (const key of ["andon.settings.open", "bi.read", "priorities.write",
    "audit.read", "workstations.read", "hub.settings.presentation.write"])
    assert(noAndon.includes(key), "unrelated grant lost: " + key);
  const withoutConfig = toggleSimpleModule(noAndon, "andonSettings", "Produção", fullCatalog, false);
  assert(!withoutConfig.includes("andon.settings.open"));
  assert(!withoutConfig.includes("catalog.assets.manage"));
  assert(withoutConfig.includes("bi.read") && withoutConfig.includes("priorities.read"));
  const withoutBi = toggleSimpleModule(withoutConfig, "bi", "Produção", fullCatalog, false);
  assert(!withoutBi.includes("analytics.policy.manage") && !withoutBi.includes("analytics.reclassify"));
  assert(withoutBi.includes("priorities.write") && withoutBi.includes("audit.read"));
  const withoutPriorities = toggleSimpleModule(withoutBi, "priorities", "Produção", fullCatalog, false);
  assert(!withoutPriorities.includes("priorities.write"));
  assert(withoutPriorities.includes("audit.read") && withoutPriorities.includes("workstations.read"));
});

test("SEC-16: four grouped Advanced sections cover each module action exactly once", () => {
  const all = [...new Set([...catalog,
    "andon.settings.open", "workstations.screen.unlock",
    "catalog.assets.manage", "catalog.reasons.manage",
    "catalog.classifications.manage", "catalog.technicians.manage",
    "analytics.policy.manage", "audit.read", "audit.export",
    "workstations.read", "hub.settings.presentation.write",
    "machines.status.write", "production.schedule.write",
  ])];
  const grouped = SIMPLE_MODULE_GROUPS.flatMap(g => advancedModuleGrants(g.id, all));
  const independent = advancedIndependentGrants(all);
  assert.equal(new Set(grouped).size, grouped.length, "permission belongs to multiple groups");
  assert.deepEqual(new Set([...grouped, ...independent]), new Set(all));
  for (const key of ["workstations.manage", "users.create", "audit.read", "audit.export",
    "workstations.read", "hub.settings.presentation.write"])
    assert(independent.includes(key), "unexpected privileged implicit group grant: " + key);
  assert(grouped.includes("workstations.screen.unlock"), "ANDON must include screen unlock");
});

test("SEC-17: new user defaults to Person; unsupported Kiosk enrollment is disabled", async () => {
  const [panel, users, routes, sessions, trust] = await Promise.all([
    readFile(new URL("../src/components/settings/UsersAccessSettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/users.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/access.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/sessions.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/kioskTrustPolicy.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(panel.includes('accountType: "person",'));
  assert.ok(panel.includes('active: true,'));
  assert.ok(!panel.includes('value={draft.accountType}'));
  assert.ok(!panel.includes('<option value="kiosk"'));
  assert.ok(!panel.includes('aria-label={ui("Tipo de conta")}'));
  assert.ok(!panel.includes('accountType: e.target.value as "person" | "kiosk"'));
  assert.ok(panel.includes('Cadastro Kiosk reservado — sem login e sem senha'));
  assert.ok(panel.includes('Kiosk sem login por senha'));
  assert.ok(panel.includes('disabled={draft.accountType === "kiosk"}'));
  assert.ok(panel.includes('editingUser.accountType === "person"'));
  assert.ok(users.includes('(input.accountType === "kiosk" && input.active)'));
  assert.ok(users.includes('if (!id && input.accountType === "kiosk")'));
  assert.ok(users.includes('before.accountType !== input.accountType'));
  assert.ok(routes.includes('user.accountType !== "person"'));
  assert.ok(sessions.includes('user.accountType !== "person"'));
  assert.ok(trust.includes('PURE, dormant kiosk authorization contract'));
  assert.ok(!panel.includes('Kiosk disponível para login'));
});


test("SEC-17B: account editor does not offer Kiosk selection; legacy account is read-only", async () => {
  const source = await readFile(new URL("../src/components/settings/UsersAccessSettings.tsx", import.meta.url), "utf8");
  assert.match(source, /accountType: "person"/);
  assert.doesNotMatch(source, /<option value="kiosk"/);
  assert.doesNotMatch(source, /<select\s+aria-label=\{ui\("Tipo de conta"\)\}/);
  assert.match(source, /draft\.accountType === "kiosk"/);
  assert.match(source, /Kiosk sem login por senha/);
  assert.match(source, /Senha indisponível — Kiosk/);
  assert.match(source, /user\.accountType === "person" \?/);
});
