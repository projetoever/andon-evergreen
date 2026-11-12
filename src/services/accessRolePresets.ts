/** Server ACL remains authoritative. These templates are explicit grant sets chosen
 * by the primary Admin; the free-form role label NEVER creates authorization.
 * Do not include identity administration, secrets, or irreversible machine control.
 */
export const PILOT_SIMPLE_ROLES = ["Produção", "Manutenção", "Líder", "Gestor/Gerente"] as const;

const suggestions: Readonly<Record<string, readonly string[]>> = {
  "Produção": [
    "andon.read",
    "calls.open",
    "calls.cancel.own",
  ],
  "Manutenção": [
    "andon.read",
    "history.read",
    "calls.open",
    "calls.cancel.own",
    "calls.attend",
    "calls.technicians.manage",
    "calls.finishMaintenance",
    "calls.finish",
    "calls.followUp",
    "calls.returnToMaintenance",
    "diagnosis.edit",
    "bi.read",
    "bi.export",
    "priorities.read",
  ],
  "Gestor/Gerente": [
    "andon.read",
    "history.read",
    "calls.open",
    "calls.cancel.own",
    "calls.cancel.any",
    "calls.attend",
    "calls.technicians.manage",
    "calls.finishMaintenance",
    "calls.finish",
    "calls.followUp",
    "calls.returnToMaintenance",
    "machines.status.write",
    "production.schedule.write",
    "diagnosis.edit",
    "analytics.reclassify",
    "bi.read",
    "bi.export",
    "priorities.read",
    "priorities.write",
    "workstations.read",
    "hub.settings.presentation.write",
    "audit.read",
  ],
  // Existing Leader accounts are preserved, but this profile belongs to the
  // advanced workflow while the pilot exposes three ordinary choices.
  "Líder": [
    "andon.read",
    "history.read",
    "calls.open",
    "calls.cancel.own",
    "priorities.read",
    "priorities.write",
  ],
};

/** Opt-in, never in a role preset: re-authentication still required server-side. */
export const SCREEN_UNLOCK_PERMISSION = "workstations.screen.unlock" as const;

export const MODULE_ENTRY_PERMISSIONS = [
  { key: "andon.read", label: "ANDON: visualizar" },
  { key: "bi.read", label: "BI: visualizar" },
  { key: "priorities.read", label: "Prioridades: visualizar" },
  { key: "andon.settings.open", label: "Configurações do ANDON: acessar" },
] as const;

/** Pilot editor: visible, individually revocable action grants.
 * Displaying an action NEVER infers it from the role or module permission.
 * Keep sensitive/rare grants in the separately accessible advanced editor.
 */
export const PILOT_OPERATIONAL_ACTIONS = [
  { key: "calls.open", label: "Abrir chamados" },
  { key: "calls.cancel.own", label: "Cancelar chamados próprios" },
  { key: "calls.attend", label: "Atender chamados" },
  { key: "calls.finishMaintenance", label: "Concluir manutenção" },
  { key: "calls.finish", label: "Finalizar chamados" },
  { key: "history.read", label: "Consultar histórico de chamados" },
] as const;

/**
 * REFINE 16 — Exactly four pilot controls. These are explicit Admin-issued
 * bundles of existing server permissions, never client-side authorization.
 * Backend keeps checking each action, workstation, session, machine and flag.
 * Sensitive Hub/user/workstation management, audit and screen unlock are NOT
 * silently added to any bundle. Advanced grants remain a separate opt-in.
 */
export const SIMPLE_MODULE_GROUPS = [
  { id: "andon", label: "ANDON" },
  { id: "bi", label: "BI" },
  { id: "priorities", label: "Prioridades" },
  { id: "andonSettings", label: "Config. do ANDON" },
] as const;
export type SimpleModuleGroup = (typeof SIMPLE_MODULE_GROUPS)[number]["id"];

/** All ordinary operational grants; role presets decide which can be bundled. */
const ANDON_OPERATION_GRANTS = [
  "andon.read",
  "history.read",
  "calls.open",
  "calls.cancel.own",
  "calls.cancel.any", // Manager preset only; never Production or Maintenance.
  "calls.attend",
  "calls.technicians.manage",
  "calls.finishMaintenance",
  "calls.finish",
  "calls.followUp",
  "calls.returnToMaintenance",
  "machines.status.write",
  "production.schedule.write",
  "diagnosis.edit",
] as const;
const BI_GRANTS = ["bi.read", "bi.export", "analytics.reclassify"] as const;
const PRIORITY_GRANTS = ["priorities.read", "priorities.write"] as const;
const ANDON_CONFIG_GRANTS = [
  "andon.settings.open",
  "catalog.assets.manage",
  "catalog.reasons.manage",
  "catalog.classifications.manage",
  "catalog.technicians.manage",
] as const;

function ownedByGroup(group: SimpleModuleGroup): readonly string[] {
  switch (group) {
    case "andon": return ANDON_OPERATION_GRANTS;
    case "bi": return BI_GRANTS;
    case "priorities": return PRIORITY_GRANTS;
    case "andonSettings": return ANDON_CONFIG_GRANTS;
  }
}

/** ANDON capabilities respect the selected operational profile, not its label
 * at runtime: this function writes the resulting grants once, on Admin save.
 */
export function simpleModuleGrants(
  group: SimpleModuleGroup, roleLabel: string, catalog: readonly string[],
): string[] {
  const supported = new Set(catalog);
  if (group === "andon") {
    const roleGrants = new Set(suggestions[roleLabel] ?? suggestions["Produção"]);
    return ANDON_OPERATION_GRANTS.filter(key => supported.has(key) && roleGrants.has(key));
  }
  if (group === "bi") {
    // Reclassification changes historical KPIs: only the Manager profile can
    // obtain it from the simple BI bundle, and the server still audits it.
    return BI_GRANTS.filter(key => supported.has(key) &&
      (key !== "analytics.reclassify" || roleLabel === "Gestor/Gerente"));
  }
  return ownedByGroup(group).filter(key => supported.has(key));
}

/** Partial historical grants must NEVER make the module look fully enabled.
 * Example: 'vini' with andon.read but without calls.open is PARTIAL, not ON.
 */
export function simpleModuleState(
  current: readonly string[], group: SimpleModuleGroup,
  roleLabel: string, catalog: readonly string[],
): "on" | "partial" | "off" {
  const expected = simpleModuleGrants(group, roleLabel, catalog);
  if (!expected.length) return "off";
  const granted = expected.filter(key => current.includes(key)).length;
  return granted === expected.length ? "on" : granted > 0 ? "partial" : "off";
}

export function toggleSimpleModule(
  current: readonly string[], group: SimpleModuleGroup,
  roleLabel: string, catalog: readonly string[], checked: boolean,
): string[] {
  const next = new Set(current);
  if (checked) {
    for (const key of simpleModuleGrants(group, roleLabel, catalog)) next.add(key);
    // ANDON settings live in /andon, so even a config-only account needs read.
    if (group === "andonSettings" && catalog.includes("andon.read")) next.add("andon.read");
  } else {
    for (const key of ownedByGroup(group)) next.delete(key);
    if (group === "andon") {
      // A screen-unlock exception is unsafe without its parent module.
      next.delete(SCREEN_UNLOCK_PERMISSION);
      // Keep only the minimum module entry required by the independent config
      // bundle when it remains enabled. Never retain operational call grants.
      if (next.has("andon.settings.open")) next.add("andon.read");
    }
  }
  return [...next];
}

/** Reclassifying a user must not leave Manager call-cancellation,
 * maintenance or BI-reclassification powers attached to a Production profile.
 * Rebase role-dependent ANDON and BI grants; preserve Priorities, ANDON
 * settings and exceptional grants. Partial historical ACL is never silently
 * promoted to full access.
 */
export function reconcileSimpleModuleRole(
  current: readonly string[], oldRole: string, nextRole: string,
  catalog: readonly string[],
): string[] {
  if (oldRole === nextRole) return [...current];
  const next = new Set(current);
  for (const group of ["andon", "bi"] as const) {
    const fullyEnabled = simpleModuleState(current, group, oldRole, catalog) === "on";
    const allowedNew = simpleModuleGrants(group, nextRole, catalog);
    const allowedSet = new Set(allowedNew);
    for (const grant of ownedByGroup(group))
      if (!allowedSet.has(grant)) next.delete(grant);
    if (fullyEnabled)
      for (const grant of allowedNew) next.add(grant);
  }
  if (next.has("andon.settings.open") && catalog.includes("andon.read"))
    next.add("andon.read");
  return [...next];
}

/**
 * Settings access is independent of the role label, but /andon still needs
 * operational module read to expose its settings dialog. Grant this minimal
 * prerequisite automatically in the user editor; never add calls, BI, Hub or
 * workstation management.
 */
export function toggleAndonModulePermission(
  current: readonly string[], key: string, checked: boolean,
): string[] {
  const next = new Set(current);
  if (checked) {
    next.add(key);
    if (key === "andon.settings.open" || key === SCREEN_UNLOCK_PERMISSION) next.add("andon.read");
  } else {
    next.delete(key);
    if (key === "andon.read") {
      next.delete("andon.settings.open");
      next.delete(SCREEN_UNLOCK_PERMISSION);
    }
  }
  return [...next];
}

export function hasRoleSuggestion(roleLabel: string) {
  return Object.hasOwn(suggestions, roleLabel);
}

export function suggestedPermissions(roleLabel: string, catalog: readonly string[]) {
  const requested = new Set(suggestions[roleLabel] ?? []);
  return catalog.filter((key) => requested.has(key));
}

/** Classify historical/custom users without altering or dropping their grants. */
export function isExactRolePreset(
  roleLabel: string,
  storedPermissions: readonly string[],
  catalog: readonly string[],
) {
  if (!hasRoleSuggestion(roleLabel)) return false;
  const expected = new Set(suggestedPermissions(roleLabel, catalog));
  return storedPermissions.length === expected.size &&
    new Set(storedPermissions).size === expected.size &&
    storedPermissions.every((key) => expected.has(key));
}
