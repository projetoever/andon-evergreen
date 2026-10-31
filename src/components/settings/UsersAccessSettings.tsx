import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import {
  accessRequest,
  type AccessState,
  type AccessUser,
  type AccessCatalog,
  type UserDraft,
} from "@/services/accessService";

import { permissionLabels } from "@/services/accessLabels";
import {
  MODULE_ENTRY_PERMISSIONS,
  hasRoleSuggestion,
  suggestedPermissions,
} from "@/services/accessRolePresets";

const emptyDraft = (): UserDraft => ({
  login: "",
  displayName: "",
  roleLabel: "Gestor/Gerente",
  accountType: "person",
  active: true,
  machineScope: "selected",
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
  reauthentication_required: "Entre novamente como Admin antes de redefinir a senha.",
  current_password_required: "Informe a senha atual correta.",
  invalid_input: "Confira os campos. A senha pessoal deve ter de 8 a 128 caracteres.",
  password_reuse_denied: "A nova senha central deve ser diferente da senha Admin legada.",
  password_policy_failed: "Use 8 a 128 caracteres e evite senhas comuns ou repetitivas.",
  invalid_user: "Confira os campos e mantenha contas kiosk inativas.",
  invalid_machine_scope: "Uma máquina selecionada não está mais disponível.",
};
export function UsersAccessSettings({ onSessionInitialized }: { onSessionInitialized?: () => Promise<void> } = {}) {
  useLanguage();
  const [session, setSession] = useState<AccessState | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AccessUser | null>(null);
  const [reauth, setReauth] = useState(false);
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
          permissions: user.permissions.map((p) => p.key),
          machineIds: user.machines.map((m) => m.machineId),
          version: user.authorizationVersion,
        }
      : emptyDraft();
    setEditing(user?.id ?? null);
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
      permissions: checked
        ? [...draft.permissions.filter((permission) => permission !== key), key]
        : draft.permissions.filter((permission) => permission !== key),
    });
  };
  const credentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    const confirm = String(values.get("confirm") ?? "");
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
      else await accessRequest("/login", "POST", { login: loginName, password });
      setReauth(false);
      await refreshSession();
      if (!session?.initialized) await onSessionInitialized?.();
      form.reset();
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
                        ? "Confirme seu acesso Admin"
                        : "Entrar em Usuários e Acessos",
                )}
              </h3>
              {!session.initialized && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                    {ui("Etapa 1 de 2 · Configuração do administrador")}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {ui(
                      "Você criará uma única conta Admin principal central. A senha Admin existente apenas confirma sua identidade e não será alterada. Durante a migração, haverá duas senhas: a antiga para funções legadas e a nova para o login central do Hub, ANDON e BI.",
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
                    {ui("Use uma senha de 8 a 128 caracteres (recomendamos 12 ou mais). Ela é exclusiva do login central e não altera a senha Admin legada nem as senhas dos módulos.")}
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
                      aria-describedby="central-user-password-help"
                      required
                      minLength={8}
                      maxLength={128}
                    />
                  </Label>
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
          {secret && (
            <Card className="space-y-3 border-primary p-5" role="status">
              <h3 className="font-bold">{ui("Senha provisória — exibição única")}</h3>
              <p className="text-sm">
                {ui(
                  "Entregue esta senha ao usuário por um canal seguro. Válida por 24 horas e um único primeiro acesso.",
                )}
              </p>
              <code className="block break-all text-xl select-all">{secret}</code>
              <Button onClick={() => setSecret(null)}>{ui("Já anotei, ocultar")}</Button>
            </Card>
          )}
          {resetTarget && (
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
                        onChange={(e) => setDraft({ ...draft, roleLabel: e.target.value })}
                      >
                        {catalog.roles.map((role) => (
                          <option key={role} value={role}>
                            {ui(role)}
                          </option>
                        ))}
                      </select>
                    </Label>
                    <Label className="space-y-2">
                      {ui("Tipo de conta")}
                      <select
                        aria-label={ui("Tipo de conta")}
                        className="block min-h-11 w-full rounded-md border bg-background p-2"
                        disabled={Boolean(editing)}
                        value={draft.accountType}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            accountType: e.target.value as "person" | "kiosk",
                            active: e.target.value === "person",
                          })
                        }
                      >
                        <option value="person">{ui("Pessoa")}</option>
                        <option value="kiosk">{ui("Kiosk — cadastro inativo")}</option>
                      </select>
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ui(
                      "O perfil é uma identificação. Nenhuma permissão é concedida automaticamente. Kiosks permanecem inativos até o provisionamento específico.",
                    )}
                  </p>
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
                  <fieldset className="space-y-3">
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
                    <p className="text-sm font-semibold">{ui("Acesso aos módulos")}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {MODULE_ENTRY_PERMISSIONS.filter((item) =>
                        catalog.permissions.includes(item.key),
                      ).map((item) => (
                        <Label
                          key={item.key}
                          className="flex min-h-11 items-center gap-3 rounded-md border p-3"
                        >
                          <input
                            type="checkbox"
                            checked={draft.permissions.includes(item.key)}
                            onChange={(e) => togglePermission(item.key, e.target.checked)}
                          />
                          <span className="min-w-0 break-words">{ui(item.label)}</span>
                        </Label>
                      ))}
                    </div>
                    <p className="text-sm font-semibold">{ui("Permissões de ações específicas")}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {catalog.permissions
                        .filter((key) => !MODULE_ENTRY_PERMISSIONS.some((item) => item.key === key))
                        .map((key) => (
                          <Label
                            key={key}
                            className="flex min-h-11 items-start gap-3 rounded-md border p-3"
                          >
                            <input
                              className="mt-1 shrink-0"
                              type="checkbox"
                              checked={draft.permissions.includes(key)}
                              onChange={(e) => togglePermission(key, e.target.checked)}
                            />
                            <span className="min-w-0 break-words">
                              {ui(permissionLabels[key] ?? key)}
                            </span>
                          </Label>
                        ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {ui("As permissões serão aplicadas às operações após a ativação segura do controle central.")}
                    </p>
                  </fieldset>
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
                    {ui(user.accountType === "person" ? "Pessoa" : "Kiosk — cadastro inativo")}
                  </p>
                  <p className="text-sm">
                    {ui(user.active ? "Ativo" : "Inativo")} ·{" "}
                    {ui(
                      user.machineScope === "all" ? "Todas as máquinas" : "Máquinas selecionadas",
                    )}
                    {user.mustChangePassword && ` · ${ui("Troca de senha pendente")}`}
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
                      {user.accountType === "person" && (
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
