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

export const MODULE_ENTRY_PERMISSIONS = [
  { key: "andon.read", label: "ANDON: visualizar" },
  { key: "bi.read", label: "BI: visualizar" },
  { key: "priorities.read", label: "Prioridades: visualizar" },
  { key: "andon.settings.open", label: "Configurações do ANDON: acessar" },
] as const;

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
