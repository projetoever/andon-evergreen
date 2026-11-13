import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import { personalPasswordHint } from "@/services/personalPasswordHint";
import {
  accessRequest,
  type AccessState,
  type AccessUser,
  type AccessCatalog,
  type UserDraft,
} from "@/services/accessService";

import { permissionLabels } from "@/services/accessLabels";
import { persistentSessionIncompatibleGrants, suggestedPersistentProductionGrants } from "@/services/persistentSessionEligibility";
import {
  SIMPLE_MODULE_GROUPS,
  advancedModuleGrants,
  advancedIndependentGrants,
  simpleModuleState,
  toggleSimpleModule,
  reconcileSimpleModuleRole,
  PILOT_SIMPLE_ROLES,
  hasRoleSuggestion,
  suggestedPermissions,
  toggleAndonModulePermission,
} from "@/services/accessRolePresets";

const emptyDraft = (): UserDraft => ({
  login: "",
  displayName: "",
  roleLabel: "Produção",
  accountType: "person",
  active: true,
  machineScope: "selected",
  sessionPolicy: "standard",
  permissions: [],
  machineIds: [],
});
const errorLabels: Record<string, string> = {
  https_required: "Este acesso exige HTTPS na interface e na API.",
  invalid_credentials: "Credenciais inválidas ou conta indisponível.",
  authentication_required: "Sua sessão expirou. Entre novamente.",
  workstation_denied: "Esta estação precisa estar ativa e aprovada.",
  workstation_inactive: "Esta estação precisa estar ativa e aprovada.",
  csrf_denied: "Sessão de segurança inválida. Atualize a página.",
  origin_denied: "Origem HTTPS não autorizada.",
  rate_limited: "Muitas tentativas. Aguarde 15 minutos.",
  authentication_busy: "Serviço ocupado. Tente novamente.",
  user_conflict: "Login já utilizado ou cadastro alterado. Recarregue a lista.",
  already_initialized: "Admin já habilitado. Atualize a página e entre.",
  primary_admin_protected: "O Admin principal está protegido contra alterações nesta tela.",
  admin_required: "Somente o Admin principal pode gerenciar usuários nesta etapa.",
  reauthentication_required: "Sua sessão continua ativa. Confirme a senha central para executar esta operação sensível.",
  current_password_required: "Informe a senha atual correta.",
  invalid_input: "Confira os campos. A senha pessoal deve ter de 8 a 128 caracteres.",
  password_reuse_denied: "A nova senha central deve ser diferente da senha Admin legada.",
  password_policy_failed: "Use 8 a 128 caracteres e evite senhas comuns ou repetitivas.",
  central_recovery_required: "Gere e guarde um código de recuperação central antes de retirar a senha antiga.",
  legacy_admin_already_retired: "A senha global antiga já foi retirada. Atualize o painel.",
  retirement_confirmation_required: "Confirme a retirada da senha legada.",
  invalid_user: "Confira os campos e mantenha contas kiosk inativas.",
  invalid_machine_scope: "Uma máquina selecionada não está mais disponível.",
};
export function UsersAccessSettings({ onSessionInitialized }: { onSessionInitialized?: () => Promise<void> } = {}) {
  useLanguage();
  const [session, setSession] = useState<AccessState | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [advancedPermissions, setAdvancedPermissions] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AccessUser | null>(null);
  const [inlineResetReason, setInlineResetReason] = useState("");
  const resetSecretRef = useRef<HTMLDivElement>(null);
  const [original, setOriginal] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [temporaryCopyStatus, setTemporaryCopyStatus] = useState("");
  const [adminRecoveryCode, setAdminRecoveryCode] = useState<string | null>(null);
  const [recoveryCopyStatus, setRecoveryCopyStatus] = useState("");
  const [legacyStatus, setLegacyStatus] = useState<{
    legacyPasswordPresent: boolean; centralRecoveryConfigured: boolean;
    centralRecoveryIssuedAt: string | null;
  } | null>(null);
  const [legacyRetirementConfirmed, setLegacyRetirementConfirmed] = useState(false);
  const [resetTarget, setResetTarget] = useState<AccessUser | null>(null);
  const [reauth, setReauth] = useState(false);
  useEffect(() => {
    setTemporaryCopyStatus("");
    if (secret) resetSecretRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [secret]);
  const listVersion = useRef(0);
  const principal = session?.principal;
  const admin = principal?.isPrimaryAdmin && principal.purpose === "normal";
  const report = useCallback((e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    setErrorCode(code);
    setError(errorLabels[code] ?? "Não foi possível concluir. Atualize e tente novamente.");
    if (code === "authentication_required") {
      setSession((s) => (s ? { ...s, principal: null } : null));
      setDraft(null);
      setSecret(null);
      setAdminRecoveryCode(null);
      setResetTarget(null);
      setUsers([]);
    }
    if (code === "reauthentication_required") setReauth(true);
  }, []);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError("");
      setErrorCode("");
      try {
        await action();
      } catch (e) {
        report(e);
      } finally {
        setBusy(false);
      }
    },
    [report],
  );
  const refreshSession = useCallback(async () => {
    setSession(await accessRequest<AccessState>("/session"));
  }, []);
  const refreshUsers = useCallback(async () => {
    const version = ++listVersion.current;
    const result = await accessRequest<{ users: AccessUser[]; total: number }>(
      `/users?q=${encodeURIComponent(query)}&page=${page}`,
    );
    if (version === listVersion.current) {
      setUsers(result.users);
      setTotal(result.total);
    }
  }, [query, page]);
  useEffect(() => {
    void run(refreshSession);
  }, [run, refreshSession]);
  useEffect(() => {
    if (!admin) return;
    void accessRequest<AccessCatalog>("/catalog").then(setCatalog).catch(report);
  }, [admin, report]);
  useEffect(() => {
    if (!admin) {
      setLegacyStatus(null);
      setLegacyRetirementConfirmed(false);
      return;
    }
    let disposed = false;
    void accessRequest<{ legacyPasswordPresent: boolean; centralRecoveryConfigured: boolean; centralRecoveryIssuedAt: string | null }>(
      "/legacy-admin/status",
    ).then((value) => { if (!disposed) setLegacyStatus(value); })
      .catch(() => { if (!disposed) setLegacyStatus(null); });
    return () => { disposed = true; };
  }, [admin]);
  useEffect(() => {
    if (!admin) return;
    const timer = window.setTimeout(() => {
      void refreshUsers().catch(report);
    }, 250);
    const invalidate = () => {
      listVersion.current++;
    };
    return () => {
      window.clearTimeout(timer);
      invalidate();
    };
  }, [admin, refreshUsers, report]);
  const edit = (user?: AccessUser) => {
    const value: UserDraft = user
      ? {
          login: user.login,
          displayName: user.displayName,
          roleLabel: user.roleLabel,
          accountType: user.accountType,
          active: user.active,
          machineScope: user.machineScope,
          sessionPolicy: user.sessionPolicy,
          permissions: user.permissions.map((p) => p.key),
          machineIds: user.machines.map((m) => m.machineId),
          version: user.authorizationVersion,
        }
      : {
          ...emptyDraft(),
          // A new account starts without grants. Four module choices require
          // an explicit decision by the primary Admin before creating it.
        };
    // Existing custom grants remain intact. A historical user must never open
    // directly into the exhaustive ACL grid (pilot UX) or lose permissions.
    setAdvancedPermissions(false);
    setEditing(user?.id ?? null);
    setEditingUser(user ?? null);
    setInlineResetReason("");
    setDraft(value);
    setOriginal(JSON.stringify(value));
    setSecret(null);
    setResetTarget(null);
    setError("");
  };
  const togglePermission = (key: string, checked: boolean) => {
    if (!draft) return;
    setDraft({
      ...draft,
      permissions: toggleAndonModulePermission(draft.permissions, key, checked),
    });
  };
  const credentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    const confirm = String(values.get("confirm") ?? "");
    const weakness = newPassword ? personalPasswordHint(newPassword) : null;
    if (weakness) {
      setError(ui(weakness));
      return;
    }
    if (newPassword && newPassword !== confirm) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    const loginName = String(values.get("login") ?? principal?.login ?? "");
    await run(async () => {
      if (!session?.initialized)
        await accessRequest("/initialize", "POST", {
          login: loginName,
          currentPassword: password,
          newPassword,
        });
      else if (principal?.purpose === "password_change")
        await accessRequest("/password", "POST", { newPassword });
      else if (reauth && principal?.isPrimaryAdmin && principal.purpose === "normal")
        await accessRequest("/reauthenticate", "POST", { password });
      else await accessRequest("/login", "POST", { login: loginName, password });
      setReauth(false);
      await refreshSession();
      if (!session?.initialized) await onSessionInitialized?.();
      form.reset();
      setNewPasswordDraft("");
    });
  };
  const authForm = !principal || principal.purpose === "password_change" || reauth;
  const personalPassword = !session?.initialized || principal?.purpose === "password_change";
  return (
    <section className="min-w-0 space-y-4" aria-label={ui("Usuários e Acessos")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{ui("Usuários e Acessos")}</h2>
          <p className="text-sm text-muted-foreground">
            {ui("Cadastros, permissões e credenciais da gestão central.")}
          </p>
        </div>
        {principal && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
              {ui("Sessão central: {0} · {1}", {
                0: principal.displayName,
                1: principal.login,
              })}
            </span>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await accessRequest("/logout", "POST", {});
                  setSecret(null);
                   setAdminRecoveryCode(null);
                  setDraft(null);
                  setUsers([]);
                  setResetTarget(null);
                  setReauth(false);
                  await refreshSession();
                })
              }
            >
              {ui("Sair desta sessão")}
            </Button>
          </div>
        )}
      </div>
      {error && errorCode !== "https_required" && (
        <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">
          {ui(error)}
        </p>
      )}
      {!session && errorCode === "https_required" && (
        <Card className="flex items-start gap-3 border-warning/40 p-4" role="status">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="font-bold">{ui("Acesso HTTPS necessário")}</h3>
            <p className="text-sm text-muted-foreground">
              {ui(
                "Gestão de usuários indisponível neste endereço. É necessário configurar acesso HTTPS seguro.",
              )}
            </p>
          </div>
        </Card>
      )}
      {!session && errorCode !== "https_required" && (
        <Button disabled={busy} onClick={() => void run(refreshSession)}>
          {ui("Tentar novamente")}
        </Button>
      )}
      {session && authForm && (
        <Card className="mx-auto w-full max-w-xl p-4 sm:p-6">
          <form
            onSubmit={(event) => void credentials(event)}
            className="flex min-w-0 flex-col gap-5"
          >
            <div className="space-y-2">
              <h3 className="text-lg font-bold leading-7">
                {ui(
                  !session.initialized
                    ? "Habilitar gestão de usuários"
                    : personalPassword
                      ? "Crie sua senha pessoal"
                      : reauth
                        ? "Confirmação de segurança"
                        : "Entrar em Usuários e Acessos",
                )}
              </h3>
              {reauth && principal?.isPrimaryAdmin && (
                <p className="text-sm leading-6 text-muted-foreground">
                  {ui("Sua sessão de trabalho continua ativa. Confirme sua senha central para autorizar operações sensíveis pelos próximos 5 minutos. Esta confirmação não reinicia a validade de 12 horas da sessão.")}
                </p>
              )}
              {!session.initialized && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                    {ui("Migração do administrador existente")}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {ui(
                      "Confirme a senha Admin existente uma última vez e crie a senha central do Hub. Depois, gere e guarde o código de recuperação central para poder desativar a senha antiga com segurança.",
                    )}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {ui(
                      "Próxima etapa: abrir o painel de colaboradores para cadastrar usuários, escolher máquinas e definir permissões. O acesso operacional central não será ativado nesta configuração.",
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              {(!personalPassword || !session.initialized) && (
                <Label className="flex min-w-0 flex-col gap-2 text-sm leading-normal">
                  <span className="block font-semibold leading-5">
                    {ui(!session.initialized ? "Usuário administrador" : "Usuário")}
                  </span>
                  <Input
                    className="h-11 min-w-0"
                    name="login"
                    autoComplete="username"
                    required
                    defaultValue={reauth ? principal?.login : ""}
                    readOnly={reauth}
                    minLength={3}
                    maxLength={120}
                    pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,119}"
                    placeholder={!session.initialized ? "admin" : undefined}
                  />
                </Label>
              )}
              {principal?.purpose !== "password_change" && (
                <Label className="flex min-w-0 flex-col gap-2 text-sm leading-normal">
                  <span className="block font-semibold leading-5">
                    {ui(!session.initialized ? "Senha Admin existente" : "Senha")}
                  </span>
                  <Input
                    className="h-11 min-w-0"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                  />
                </Label>
              )}
              {personalPassword && (
                <div className="flex min-w-0 flex-col gap-5">
                  <p id="central-user-password-help" className="text-sm leading-5 text-muted-foreground">
                    {ui("Use uma senha de 8 a 128 caracteres (recomendamos 12 ou mais). Depois de desativar a senha Admin antiga, somente a senha central será usada para esse administrador.")}
                  </p>
                  <Label className="flex min-w-0 flex-col gap-2 text-sm leading-normal">
                    <span className="block font-semibold leading-5">
                      {ui("Nova senha pessoal")}
                    </span>
                    <Input
                      className="h-11 min-w-0"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      aria-describedby="central-user-password-help central-user-password-feedback"
                      onChange={(event) => setNewPasswordDraft(event.target.value)}
                      required
                      minLength={8}
                      maxLength={128}
                    />
                  </Label>
                  <p id="central-user-password-feedback" aria-live="polite" className="text-xs text-danger">
                    {newPasswordDraft && personalPasswordHint(newPasswordDraft)
                      ? ui(personalPasswordHint(newPasswordDraft)!) : ""}
                  </p>
                  <Label className="flex min-w-0 flex-col gap-2 text-sm leading-normal">
                    <span className="block font-semibold leading-5">
                      {ui("Confirmar nova senha")}
                    </span>
                    <Input
                      className="h-11 min-w-0"
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                    />
                  </Label>
                </div>
              )}
            </div>
            <Button className="min-h-11 w-full sm:w-fit" type="submit" disabled={busy}>
              {ui(!session.initialized
                ? "Criar administrador e abrir painel"
                : personalPassword
                  ? "Salvar senha pessoal"
                  : "Entrar")}
            </Button>
          </form>
        </Card>
      )}
      {principal?.purpose === "normal" && !admin && (
        <Card className="p-5">
          <p>{ui("Primeiro acesso concluído. Sua senha pessoal está definida.")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ui("Somente o Admin principal pode gerenciar usuários nesta etapa.")}
          </p>
        </Card>
      )}
      {admin && !authForm && (
        <>
          <Card className="space-y-3 p-5">
            <h3 className="font-bold">{ui("Recuperação da conta Admin central")}</h3>
            <p className="text-sm text-muted-foreground">
              {ui("Gere e guarde um código de recuperação fora do ANDON. Ele permite redefinir a senha central somente no navegador local do servidor. Gerar outro código invalida o anterior.")}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(async () => {
                setAdminRecoveryCode(null);
                setRecoveryCopyStatus("");
                setLegacyRetirementConfirmed(false);
                const result = await accessRequest<{ recoveryCode: string; issuedAt: string }>(
                  "/admin-recovery-code", "POST", {},
                );
                // Authoritative timestamp was written atomically with the audit.
                // Do not turn a successful issuance into an error on a later GET.
                setAdminRecoveryCode(result.recoveryCode);
                setLegacyStatus(previous => ({
                  legacyPasswordPresent: previous?.legacyPasswordPresent ?? false,
                  centralRecoveryConfigured: true,
                  centralRecoveryIssuedAt: result.issuedAt,
                }));
              })}
            >
              {ui("Gerar novo código de recuperação")}
            </Button>
            {legacyStatus?.centralRecoveryConfigured && (
              <p className="text-xs text-muted-foreground" role="status">
                {ui("Último código gerado em")}:{" "}
                <strong>{legacyStatus.centralRecoveryIssuedAt &&
                  Number.isFinite(Date.parse(legacyStatus.centralRecoveryIssuedAt))
                  ? new Date(legacyStatus.centralRecoveryIssuedAt).toLocaleString(getInterfaceLocale())
                  : ui("Data não disponível para este código")}</strong>
              </p>
            )}
            {adminRecoveryCode && (
              <div role="status" className="space-y-2 rounded-lg border border-warning/40 p-3">
                <p className="text-sm font-semibold">{ui("Código secreto — exibição única")}</p>
                <code className="block select-all break-all font-mono text-sm">{adminRecoveryCode}</code>
                <p className="text-xs text-muted-foreground">
                  {ui("Copie e guarde o código em local seguro. A área de transferência poderá ser acessada por outros aplicativos.")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" type="button" variant="outline" onClick={async () => {
                    try {
                      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
                      await navigator.clipboard.writeText(adminRecoveryCode);
                      setRecoveryCopyStatus(ui("Código copiado. Guarde-o em local seguro."));
                    } catch {
                      setRecoveryCopyStatus(ui("Não foi possível copiar. Selecione o código manualmente."));
                    }
                  }}>{ui("Copiar código")}</Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => {
                    setAdminRecoveryCode(null);
                    setRecoveryCopyStatus("");
                  }}>
                    {ui("Já guardei o código")}
                  </Button>
                </div>
                {recoveryCopyStatus && <p role="status" className="text-xs">{recoveryCopyStatus}</p>}
              </div>
            )}
          </Card>
          {legacyStatus?.legacyPasswordPresent && (
            <Card className="space-y-3 p-5">
              <h3 className="font-bold">{ui("Retirar a senha Admin antiga")}</h3>
              <p className="text-sm text-muted-foreground">
                {ui("A conta Admin central já possui sua própria senha. A retirada apaga a senha global antiga e o código de recuperação legado. As credenciais dos módulos não são alteradas.")}
              </p>
              {!legacyStatus.centralRecoveryConfigured && (
                <p className="text-sm font-semibold">
                  {ui("Antes de continuar, gere e guarde o código de recuperação da conta Admin central acima.")}
                </p>
              )}
              <label className="flex items-start gap-3 text-sm leading-6">
                <Checkbox
                  checked={legacyRetirementConfirmed}
                  onCheckedChange={(value) => setLegacyRetirementConfirmed(value === true)}
                  disabled={!legacyStatus.centralRecoveryConfigured || busy}
                />
                <span>
                  {ui("Confirmei o backup e guardei o código central. Entendo que retornar ao modo legado exigirá uma nova configuração local da senha.")}
                </span>
              </label>
              <Button
                variant="outline"
                disabled={!legacyStatus.centralRecoveryConfigured || !legacyRetirementConfirmed || busy}
                onClick={() => void run(async () => {
                  await accessRequest("/legacy-admin/retire", "POST", { confirmed: true });
                  setLegacyRetirementConfirmed(false);
                  setLegacyStatus(await accessRequest<{
                    legacyPasswordPresent: boolean; centralRecoveryConfigured: boolean;
                    centralRecoveryIssuedAt: string | null;
                  }>("/legacy-admin/status"));
                })}
              >
                {ui("Desativar definitivamente a senha Admin antiga")}
              </Button>
            </Card>
          )}
          {secret && (
            <div ref={resetSecretRef}>
            <Card className="space-y-3 border-primary p-5" role="status">
              <h3 className="font-bold">{ui("Senha provisória — exibição única")}</h3>
              <p className="text-sm">
                {ui(
                  "Entregue esta senha ao usuário por um canal seguro. Válida por 24 horas e um único primeiro acesso.",
                )}
              </p>
              <code className="block break-all text-xl select-all">{secret}</code>
              <p className="text-xs text-muted-foreground">
                {ui("Copiar a senha deixa o segredo temporariamente na área de transferência do dispositivo.")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={async () => {
                  const toCopy = secret;
                  try {
                    if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
                    await navigator.clipboard.writeText(toCopy);
                    setTemporaryCopyStatus(ui("Senha provisória copiada. Compartilhe somente por um canal seguro."));
                  } catch {
                    setTemporaryCopyStatus(ui("Não foi possível copiar. Selecione a senha manualmente."));
                  }
                }}>{ui("Copiar senha")}</Button>
                <Button type="button" onClick={() => {
                  setSecret(null);
                  setTemporaryCopyStatus("");
                }}>{ui("Já anotei, ocultar")}</Button>
              </div>
              {temporaryCopyStatus && <p role="status" className="text-xs">{temporaryCopyStatus}</p>}
            </Card>
            </div>
          )}
          {resetTarget && !draft && (
            <Card className="p-5">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
                  void run(async () => {
                    setSecret(null);
                    const result = await accessRequest<{ temporaryPassword: string }>(
                      `/users/${encodeURIComponent(resetTarget.id)}/reset`,
                      "POST",
                      { reason },
                    );
                    setSecret(result.temporaryPassword);
                    setResetTarget(null);
                    await refreshUsers();
                  });
                }}
              >
                <h3 className="font-bold">
                  {ui("Redefinir senha")} · {resetTarget.displayName}
                </h3>
                <Label className="block space-y-2">
                  {ui("Motivo da redefinição")}
                  <Input name="reason" required maxLength={500} />
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy}>{ui("Gerar senha provisória")}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setResetTarget(null)}
                  >
                    {ui("Cancelar")}
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <div className="space-y-1">
            <h3 className="text-lg font-bold">{ui("Painel de colaboradores")}</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {ui("Cadastre e gerencie pessoas, máquinas e permissões individuais. Alterações de acesso operacional dependem da ativação segura do controle central.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="min-w-0 flex-1 basis-64"
              value={query}
              maxLength={120}
              aria-label={ui("Pesquisar usuários")}
              placeholder={ui("Pesquisar usuários")}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <Button disabled={busy || !catalog} onClick={() => edit()}>
              {ui("Cadastrar usuário")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void run(refreshUsers)}>
              {ui("Atualizar")}
            </Button>
          </div>
          {!catalog && (
            <p role="status" className="text-sm text-muted-foreground">
              {ui("Carregando catálogo de permissões...")}
            </p>
          )}
          {draft && catalog && (
            <Card className="p-4 md:p-5">
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    setSecret(null);
                    const result = await accessRequest<{ temporaryPassword?: string }>(
                      editing ? `/users/${encodeURIComponent(editing)}` : "/users",
                      editing ? "PUT" : "POST",
                      draft,
                    );
                    setDraft(null);
                    setSecret(result.temporaryPassword ?? null);
                    await refreshUsers();
                  });
                }}
              >
                <h3 className="text-lg font-bold">
                  {ui(editing ? "Editar usuário" : "Cadastrar usuário")}
                </h3>
                <fieldset disabled={busy} className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    {ui("A permissão Configurações do ANDON delega a gestão do painel a qualquer perfil. O acesso à administração do Hub é separado.")}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Label className="space-y-2">
                      {ui("Nome")}
                      <Input
                        value={draft.displayName}
                        required
                        maxLength={120}
                        onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                      />
                    </Label>
                    <Label className="space-y-2">
                      {ui("Usuário")}
                      <Input
                        value={draft.login}
                        required
                        pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,119}"
                        maxLength={120}
                        autoComplete="off"
                        onChange={(e) => setDraft({ ...draft, login: e.target.value })}
                      />
                    </Label>
                    <Label className="space-y-2">
                      {ui("Perfil")}
                      <select
                        aria-label={ui("Perfil")}
                        className="block min-h-11 w-full rounded-md border bg-background p-2"
                        value={draft.roleLabel}
                        onChange={(e) => {
                          const roleLabel = e.target.value;
                          setDraft({
                            ...draft,
                            roleLabel,
                            // Role is descriptive. No module or action is
                            // granted/revoked by changing its label; the Admin
                            // selects full modules or Advanced exceptions.
                            ...(!advancedPermissions && draft.accountType === "person"
                              ? {
                                  permissions: reconcileSimpleModuleRole(
                                    draft.permissions, draft.roleLabel, roleLabel,
                                    catalog.permissions,
                                  ),
                                }
                              : {}),
                          });
                        }}
                      >
                        {!advancedPermissions &&
                          !PILOT_SIMPLE_ROLES.some((role) => role === draft.roleLabel) && (
                            <option value={draft.roleLabel}>
                              {ui(draft.roleLabel)} — {ui("Perfil existente (personalizado)")}
                            </option>
                          )}
                        {(advancedPermissions
                          ? catalog.roles.filter((role) => role !== "Admin")
                          : PILOT_SIMPLE_ROLES.filter((role) => catalog.roles.includes(role))
                        ).map((role) => (
                          <option key={role} value={role}>
                            {!advancedPermissions && role === "Gestor/Gerente"
                              ? ui("Gerente")
                              : ui(role)}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ui("Novos cadastros são contas de usuário com senha. O perfil descreve a função; selecione os módulos ou use Avançado para restringir ações.")}
                  </p>
                  {draft.accountType === "kiosk" && (
                    <div role="status" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                      <p className="font-bold">{ui("Cadastro Kiosk reservado — sem login e sem senha")}</p>
                      <p>{ui("Este cadastro permanece inativo porque ainda não existe provisionamento seguro de Kiosk. Não é possível ativá-lo, redefinir sua senha ou convertê-lo em Pessoa aqui.")}</p>
                      <p>{ui("Para utilizar esse login na Produção, renomeie este cadastro inativo e salve; depois crie uma conta Pessoa com o login desejado, escopo de máquinas e permissões adequados.")}</p>
                    </div>
                  )}
                  {draft.accountType === "person" && (
                    <fieldset className="space-y-2 rounded-md border p-3">
                      <legend className="px-1 font-bold">{ui("Duração da sessão")}</legend>
                      <Label className="space-y-2">
                        {ui("Política de login do usuário")}
                        <select
                          aria-label={ui("Política de login do usuário")}
                          className="block min-h-11 w-full rounded-md border bg-background p-2"
                          value={draft.sessionPolicy}
                          onChange={(e) => setDraft({
                            ...draft,
                            sessionPolicy: e.target.value as "standard" | "persistent",
                          })}
                        >
                          <option value="standard">{ui("Padrão — 30 minutos inativo / 12 horas máximo")}</option>
                          <option value="persistent">{ui("Produção — não expirar em workstation confiável")}</option>
                        </select>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {ui("A sessão permanente exige também autorização na workstation, máquina fixada e somente permissões operacionais compatíveis. Selecionar ANDON completo pode impedir a persistência. A API continua permitindo revogação imediata pelo Admin.")}
                      </p>
                      {draft.sessionPolicy === "persistent" && (
                        <div className="space-y-2 rounded-md border border-warning/40 p-3">
                          <p className="font-semibold">{ui("Verificação de elegibilidade da conta")}</p>
                          {persistentSessionIncompatibleGrants(draft.permissions).length > 0 && (
                            <p role="status" className="text-sm text-warning">
                              {ui("Permissões incompatíveis com login persistente:")}{" "}
                              {persistentSessionIncompatibleGrants(draft.permissions)
                                .map((key) => ui(permissionLabels[key] ?? key)).join(", ")}
                            </p>
                          )}
                          {draft.permissions.length === 0 && (
                            <p role="status" className="text-sm text-warning">
                              {ui("Selecione pelo menos uma função operacional antes de salvar.")}
                            </p>
                          )}
                          {draft.machineScope === "selected" && draft.machineIds.length === 0 && (
                            <p role="status" className="text-sm text-warning">
                              {ui("Selecione uma máquina autorizada para a operação contínua.")}
                            </p>
                          )}
                          <Button type="button" variant="outline" onClick={() => setDraft({
                            ...draft,
                            roleLabel: "Produção",
                            permissions: suggestedPersistentProductionGrants(catalog.permissions),
                          })}>
                            {ui("Aplicar conjunto restrito de Produção 24h")}
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            {ui("Esta ação substitui as permissões atuais por leitura, histórico, abertura e cancelamento próprio. Revise antes de salvar; a workstation precisa permitir persistência separadamente.")}
                          </p>
                        </div>
                      )}
                    </fieldset>
                  )}
                  <Label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      disabled={draft.accountType === "kiosk"}
                      onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                    />
                    {ui("Usuário ativo")}
                  </Label>
                  <fieldset className="space-y-3">
                    <legend className="font-bold">{ui("Escopo de máquinas")}</legend>
                    <select
                      aria-label={ui("Escopo de máquinas")}
                      className="min-h-11 w-full rounded-md border bg-background p-2"
                      value={draft.machineScope}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          machineScope: e.target.value as "all" | "selected",
                          machineIds: [],
                        })
                      }
                    >
                      <option value="selected">{ui("Máquinas selecionadas")}</option>
                      <option value="all">{ui("Todas as máquinas")}</option>
                    </select>
                    {draft.machineScope === "selected" && (
                      <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border p-3 md:grid-cols-2">
                        {catalog.machines.map((machine) => (
                          <Label
                            key={machine.id}
                            className="flex min-h-11 items-center gap-3 break-words"
                          >
                            <input
                              type="checkbox"
                              checked={draft.machineIds.includes(machine.id)}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  machineIds: e.target.checked
                                    ? [...draft.machineIds, machine.id]
                                    : draft.machineIds.filter((id) => id !== machine.id),
                                })
                              }
                            />
                            <span className="min-w-0 break-all">
                              {machine.name} · {machine.id}
                              {!machine.isActive && ` · ${ui("Inativa")}`}
                            </span>
                          </Label>
                        ))}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {ui(
                        "Sem seleção significa sem acesso a máquinas. Todas inclui máquinas futuras; as ações continuam dependendo de permissão explícita.",
                      )}
                    </p>
                  </fieldset>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <p className="text-sm text-muted-foreground">
                      {ui("Cada módulo marcado seleciona todas as suas funções. Em Avançado você pode retirar ações específicas sem alterar os demais módulos.")}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAdvancedPermissions((value) => !value)}
                    >
                      {ui(advancedPermissions ? "Voltar aos 4 módulos" : "Avançado — restringir funções")}
                    </Button>
                  </div>
                  {!advancedPermissions && (
                    <fieldset className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                      <legend className="px-1 font-bold">{ui("Acesso aos módulos e configurações")}</legend>
                      <p className="text-sm text-muted-foreground">
                        {ui("Marcar ANDON habilita abrir, atender, acompanhar, concluir, finalizar, cancelar, editar diagnóstico, alterar status e desfixar tela com credencial. As outras três opções selecionam todas as funções de seus respectivos conjuntos. Ajuste exceções em Avançado.")}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {SIMPLE_MODULE_GROUPS.map((entry) => {
                          const state = simpleModuleState(
                            draft.permissions, entry.id, draft.roleLabel, catalog.permissions,
                          );
                          return (
                            <Label key={entry.id} className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-background p-3">
                              <input
                                type="checkbox"
                                disabled={draft.accountType !== "person"}
                                checked={state === "on"}
                                onChange={(e) => setDraft({
                                  ...draft,
                                  permissions: toggleSimpleModule(
                                    draft.permissions, entry.id, draft.roleLabel,
                                    catalog.permissions, e.target.checked,
                                  ),
                                })}
                              />
                              <span className="min-w-0 flex-1 font-semibold">{ui(entry.label)}</span>
                              {state === "partial" && (
                                <span className="text-xs text-warning">{ui("Parcial")}</span>
                              )}
                            </Label>
                          );
                        })}
                      </div>
                      {SIMPLE_MODULE_GROUPS.some((entry) =>
                        simpleModuleState(draft.permissions, entry.id, draft.roleLabel,
                          catalog.permissions) === "partial",
                      ) && (
                        <p role="status" className="text-xs text-muted-foreground">
                          {ui("Parcial: uma ou mais ações foram restringidas em Avançado ou são necessárias por outro módulo. Marcar novamente concede todas as ações daquele conjunto.")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {ui("Os grupos não liberam administração do Hub, contas ou workstations. Ações como desfixar tela ainda exigem credenciais e validação da API. Para sessões persistentes de Produção, restrinja no Avançado as funções incompatíveis.")}
                      </p>
                    </fieldset>
                  )}
                  {advancedPermissions && <fieldset className="space-y-3">
                    <legend className="font-bold">{ui("Permissões por módulo e ação")}</legend>
                    {draft.accountType === "person" && hasRoleSuggestion(draft.roleLabel) && (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              permissions: suggestedPermissions(draft.roleLabel, catalog.permissions),
                            })
                          }
                        >
                          {ui("Aplicar permissões sugeridas")}
                        </Button>
                        <p className="text-sm text-muted-foreground">
                          {ui("Substitui a seleção atual. Revise as permissões antes de salvar.")}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {ui("Desmarque abaixo apenas as funções que deseja restringir. O resumo exibirá Parcial; mudar o perfil não reativa permissões retiradas.")}
                    </p>
                    {SIMPLE_MODULE_GROUPS.map((entry) => {
                      const keys = advancedModuleGrants(entry.id, catalog.permissions);
                      return (
                        <section key={entry.id} className="space-y-2 rounded-lg border border-border p-3">
                          <h4 className="font-bold">{ui(entry.label)} · {keys.filter(key => draft.permissions.includes(key)).length}/{keys.length}</h4>
                          <div className="grid gap-2 md:grid-cols-2">
                            {keys.map((key) => (
                              <Label key={key} className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3">
                                <input
                                  className="mt-1 shrink-0"
                                  type="checkbox"
                                  checked={draft.permissions.includes(key)}
                                  onChange={(e) => togglePermission(key, e.target.checked)}
                                />
                                <span className="min-w-0 break-words">{ui(permissionLabels[key] ?? key)}</span>
                              </Label>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                    <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                      <h4 className="font-bold">{ui("Segurança e administração — permissões independentes")}</h4>
                      <p className="text-xs text-muted-foreground">
                        {ui("Estas permissões não são selecionadas por nenhum dos 4 módulos. Habilite-as individualmente somente quando necessárias.")}
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {advancedIndependentGrants(catalog.permissions).map((key) => (
                          <Label key={key} className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3">
                            <input
                              className="mt-1 shrink-0"
                              type="checkbox"
                              checked={draft.permissions.includes(key)}
                              onChange={(e) => togglePermission(key, e.target.checked)}
                            />
                            <span className="min-w-0 break-words">{ui(permissionLabels[key] ?? key)}</span>
                          </Label>
                        ))}
                      </div>
                    </section>
                    <p className="text-sm text-muted-foreground">
                      {ui("As permissões serão aplicadas às operações após a ativação segura do controle central.")}
                    </p>
                  </fieldset>}
                  {editing && editingUser?.id === editing && editingUser.accountType === "person" &&
                    !editingUser.isPrimaryAdmin && (
                    <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"
                      aria-label={ui("Redefinir senha")}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{ui("Senha do usuário")}</p>
                          <p className="text-sm text-muted-foreground">
                            {ui("Redefina a senha sem alterar o perfil, as máquinas ou as permissões deste usuário.")}
                          </p>
                        </div>
                        {!resetTarget || resetTarget.id !== editing ? (
                          <Button type="button" variant="outline" disabled={busy}
                            onClick={() => { setResetTarget(editingUser); setInlineResetReason(""); setSecret(null); }}>
                            {ui("Redefinir senha")}
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" disabled={busy}
                            onClick={() => { setResetTarget(null); setInlineResetReason(""); }}>
                            {ui("Cancelar redefinição")}
                          </Button>
                        )}
                      </div>
                      {resetTarget?.id === editing && (
                        <div className="space-y-3">
                          <Label className="block space-y-2">
                            {ui("Motivo da redefinição")}
                            <Input value={inlineResetReason} maxLength={500}
                              onChange={(event) => setInlineResetReason(event.target.value)}
                              placeholder={ui("Informe o motivo para o registro de auditoria")} />
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {ui("A senha provisória será exibida uma única vez e exigirá troca no primeiro acesso.")}
                          </p>
                          <Button type="button" disabled={busy || !inlineResetReason.trim()}
                            onClick={() => void run(async () => {
                              if (resetTarget.id !== editing || resetTarget.isPrimaryAdmin ||
                                  resetTarget.accountType !== "person") return;
                              const result = await accessRequest<{ temporaryPassword: string }>(
                                "/users/" + encodeURIComponent(resetTarget.id) + "/reset", "POST",
                                { reason: inlineResetReason.trim() },
                              );
                              setResetTarget(null);
                              setInlineResetReason("");
                              setDraft(null);
                              setEditing(null);
                              setEditingUser(null);
                              setSecret(result.temporaryPassword);
                              await refreshUsers();
                            })}>
                            {ui("Gerar senha provisória")}
                          </Button>
                        </div>
                      )}
                    </section>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={
                        !draft.displayName.trim() ||
                        !draft.login.trim() ||
                        (Boolean(editing) && JSON.stringify(draft) === original)
                      }
                    >
                      {ui("Salvar usuário")}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                      {ui("Cancelar")}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </Card>
          )}
          <div className="space-y-3">
            {users.map((user) => (
              <Card
                key={user.id}
                className="flex min-w-0 flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words font-bold">{user.displayName}</h3>
                  <p className="break-all text-sm text-muted-foreground">
                    {user.login} · {ui(user.roleLabel)} ·{" "}
                    {user.accountType === "kiosk" ? ui("Kiosk legado — inativo") : ui("Usuário")}
                  </p>
                  <p className="text-sm">
                    {ui(user.active ? "Ativo" : "Inativo")} ·{" "}
                    {ui(
                      user.machineScope === "all" ? "Todas as máquinas" : "Máquinas selecionadas",
                    )}
                    {user.accountType === "kiosk"
                      ? ` · ${ui("Kiosk sem login por senha")}`
                      : user.mustChangePassword && ` · ${ui("Troca de senha pendente")}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {user.isPrimaryAdmin ? (
                    <span className="text-sm text-primary">{ui("Admin principal")}</span>
                  ) : (
                    <>
                      <Button variant="outline" disabled={busy} onClick={() => edit(user)}>
                        {ui("Editar")}
                      </Button>
                      {user.accountType === "person" ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setSecret(null);
                            setResetTarget(user);
                            setDraft(null);
                          }}
                        >
                          {ui("Redefinir senha")}
                        </Button>
                      ) : (
                        <span
                          className="inline-flex min-h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground"
                          title={ui("Este Kiosk não possui login por senha. Para usar esse nome, renomeie o registro inativo e crie uma conta Pessoa.")}
                        >
                          {ui("Senha indisponível — Kiosk")}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {!users.length && <p role="status">{ui("Nenhum usuário encontrado.")}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={busy || page === 0}
              onClick={() => setPage(page - 1)}
            >
              {ui("Anterior")}
            </Button>
            <span>{ui("Página {page} · {total} usuários", { page: page + 1, total })}</span>
            <Button
              variant="outline"
              disabled={busy || (page + 1) * 30 >= total}
              onClick={() => setPage(page + 1)}
            >
              {ui("Próxima")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
