/** Explicit operator-selected suggestions. Role labels never authorize access by themselves. */
const suggestions: Readonly<Record<string, readonly string[]>> = {
  "Gestor/Gerente": [
    "andon.read",
    "history.read",
    "bi.read",
    "bi.export",
    "priorities.read",
  ],
  "Líder": [
    "andon.read",
    "history.read",
    "calls.open",
    "calls.cancel.own",
    "priorities.read",
    "priorities.write",
  ],
  "Manutenção": [
    "andon.read",
    "history.read",
    "calls.attend",
    "calls.finishMaintenance",
    "calls.followUp",
    "calls.returnToMaintenance",
    "diagnosis.edit",
  ],
  "Produção": [
    "andon.read",
    "calls.open",
    "priorities.read",
  ],
};

export const MODULE_ENTRY_PERMISSIONS = [
  { key: "andon.read", label: "ANDON: visualizar" },
  { key: "bi.read", label: "BI: visualizar" },
  { key: "priorities.read", label: "Prioridades: visualizar" },
] as const;

/** Only catalog-approved keys are returned; no Admin or unknown-role template exists. */
export function suggestedPermissions(roleLabel: string, catalog: readonly string[]) {
  const requested = new Set(suggestions[roleLabel] ?? []);
  return catalog.filter((key) => requested.has(key));
}

export function hasRoleSuggestion(roleLabel: string) {
  return Object.hasOwn(suggestions, roleLabel);
}
