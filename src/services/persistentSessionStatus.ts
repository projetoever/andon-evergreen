/** Server-supplied diagnostic codes are descriptive, never authorization. */
export const PERSISTENCE_BLOCKER_HINTS: Readonly<Record<string, string>> = {
  policy_not_persistent: "Selecione Não expirar na política de login deste usuário.",
  account_type_not_supported: "Utilize uma conta Pessoa, não um cadastro Kiosk inativo.",
  primary_admin_not_eligible: "A conta Admin principal não pode ter sessão permanente.",
  password_change_required: "Conclua a troca de senha provisória antes de ativar a sessão permanente.",
  workstation_not_approved: "O administrador deve aprovar e ativar esta workstation.",
  workstation_not_trusted: "Habilite Não expirar login operacional na aba Workstations.",
  no_selected_permissions: "Selecione pelo menos uma permissão operacional para o perfil.",
  login_not_ready: "Confira a política Não expirar do usuário, a aprovação da workstation e a autorização do terminal.",
};

export const PERSISTENCE_NOT_ACTIVE =
  "Sessão sem expiração NÃO ativada. Este login pode expirar por inatividade.";

export function persistentSessionMismatch(principal: {
  sessionPolicy?: string;
  persistentOperational?: boolean;
  purpose?: string;
} | null | undefined): boolean {
  return principal?.purpose === "normal" &&
    principal.sessionPolicy === "persistent" &&
    principal.persistentOperational !== true;
}

export function persistentBlockerMessage(code?: string | null): string {
  return code && Object.prototype.hasOwnProperty.call(PERSISTENCE_BLOCKER_HINTS, code)
    ? PERSISTENCE_BLOCKER_HINTS[code]
    : PERSISTENCE_BLOCKER_HINTS.login_not_ready;
}
