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
