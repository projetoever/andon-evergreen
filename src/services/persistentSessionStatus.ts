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

/** Non-secret visual hint only. Never used to authenticate or recover a cookie.
 * Survives a normal Firefox restart when site storage is retained.
 */
const PREVIOUS_PERMANENT_SESSION_KEY = "andon.ui.previouslyConfirmedPersistent.v1";

export function rememberConfirmedPersistentSession(): void {
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(PREVIOUS_PERMANENT_SESSION_KEY, "1");
  } catch { /* Storage may be blocked; the server remains authoritative. */ }
}

export function hadConfirmedPersistentSession(): boolean {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(PREVIOUS_PERMANENT_SESSION_KEY) === "1";
  } catch { return false; }
}

export function forgetConfirmedPersistentSession(): void {
  try {
    if (typeof window !== "undefined")
      window.localStorage.removeItem(PREVIOUS_PERMANENT_SESSION_KEY);
  } catch { /* Never affect auth or logout on a storage error. */ }
}

export const SESSION_LOSS_MESSAGES: Readonly<Record<string, string>> = {
  cookie_missing: "O Firefox não enviou o cookie de login. Confira se o perfil apaga cookies ao fechar, se está em modo privado e se usa o mesmo HTTPS.",
  workstation_identity_missing: "Identidade da workstation não enviada. Verifique os dados do site e o perfil do navegador.",
  cookie_unrecognized: "O cookie apresentado não corresponde a uma sessão no servidor. Confira o endereço HTTPS e possíveis restaurações.",
  session_revoked: "A sessão foi revogada. Confira no Hub o histórico de logout remoto e as alterações de segurança.",
  workstation_identity_changed: "O navegador enviou uma identidade de workstation diferente daquela usada no login.",
  session_expired: "A sessão anterior tinha prazo e expirou. Confirme a emissão de Não expirar após autenticar.",
  account_security_changed: "Houve alteração de segurança, senha ou permissões da conta. Uma nova autenticação é necessária.",
  workstation_blocked: "A workstation está inativa ou aguardando aprovação no Hub.",
  persistent_trust_removed: "A política permanente ou a confiança da workstation foi desativada após o login.",
  session_unavailable: "A sessão não pôde ser validada. Consulte o diagnóstico de acesso no Hub.",
};

export function sessionLossMessage(code?: string | null): string {
  return code && Object.prototype.hasOwnProperty.call(SESSION_LOSS_MESSAGES, code)
    ? SESSION_LOSS_MESSAGES[code]!
    : SESSION_LOSS_MESSAGES.session_unavailable;
}
