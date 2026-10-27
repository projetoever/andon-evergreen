import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  invalid_input: "Confira os campos. A senha pessoal deve ter de 15 a 128 caracteres.",
  invalid_user: "Confira os campos e mantenha contas kiosk inativas.",
  invalid_machine_scope: "Uma máquina selecionada não está mais disponível.",
};
export function UsersAccessSettings() {
  useLanguage();
  const [session, setSession] = useState<AccessState | null>(null);
  const [error, setError] = useState("");
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
  const hasPrincipal = Boolean(principal);
  useEffect(() => {
    if (!hasPrincipal) return;
    // Keep idle time tied to real interaction, never background polling.
    let last = Date.now();
    const interact = () => {
      if (Date.now() - last < 60000) return;
      last = Date.now();
      void accessRequest("/interaction", "POST", {}).catch(report);
    };
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", interact);
    return () => {
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", interact);
    };
  }, [hasPrincipal, report]);
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
    form.reset();
    await run(async () => {
      if (!session?.initialized)
        await accessRequest("/initialize", "POST", { currentPassword: password, newPassword });
      else if (principal?.purpose === "password_change")
        await accessRequest("/password", "POST", { newPassword });
      else await accessRequest("/login", "POST", { login: loginName, password });
      setReauth(false);
      await refreshSession();
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
            {ui("As permissões cadastradas serão aplicadas aos módulos em uma etapa posterior.")}
          </p>
        </div>
        {principal && (
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
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">
          {ui(error)}
        </p>
      )}
      {!session && (
        <Button disabled={busy} onClick={() => void run(refreshSession)}>
          {ui("Tentar novamente")}
        </Button>
      )}
      {session && authForm && (
        <Card className="mx-auto max-w-xl p-5">
          <form onSubmit={(event) => void credentials(event)} className="space-y-4">
            <h3 className="font-bold">
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
              <p className="text-sm text-muted-foreground">
                {ui(
                  "Confirme a senha Admin já configurada e escolha uma senha pessoal para esta gestão. As credenciais dos módulos serão preservadas.",
                )}
              </p>
            )}
            {!personalPassword && (
              <Label className="block space-y-2">
                {ui("Login")}
                <Input
                  name="login"
                  autoComplete="username"
                  required
                  defaultValue={reauth ? principal?.login : ""}
                  readOnly={reauth}
                  maxLength={120}
                />
              </Label>
            )}
            {principal?.purpose !== "password_change" && (
              <Label className="block space-y-2">
                {ui(!session.initialized ? "Senha Admin existente" : "Senha")}
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </Label>
            )}
            {personalPassword && (
              <>
                <p className="text-sm text-muted-foreground">
                  {ui("Use uma frase de acesso de 15 a 128 caracteres.")}
                </p>
                <Label className="block space-y-2">
                  {ui("Nova senha pessoal")}
                  <Input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={15}
                    maxLength={128}
                  />
                </Label>
                <Label className="block space-y-2">
                  {ui("Confirmar nova senha")}
                  <Input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={15}
                    maxLength={128}
                  />
                </Label>
              </>
            )}
            <Button type="submit" disabled={busy}>
              {ui(personalPassword ? "Salvar senha pessoal" : "Entrar")}
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
            <Button disabled={busy} onClick={() => edit()}>
              {ui("Cadastrar usuário")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void run(refreshUsers)}>
              {ui("Atualizar")}
            </Button>
          </div>
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
                      {ui("Login")}
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
                    <div className="grid gap-2 md:grid-cols-2">
                      {catalog.permissions.map((key) => (
                        <Label
                          key={key}
                          className="flex min-h-11 items-start gap-3 rounded-md border p-3"
                        >
                          <input
                            className="mt-1 shrink-0"
                            type="checkbox"
                            checked={draft.permissions.includes(key)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                permissions: e.target.checked
                                  ? [...draft.permissions, key]
                                  : draft.permissions.filter((p) => p !== key),
                              })
                            }
                          />
                          <span className="min-w-0 break-words">
                            {ui(permissionLabels[key] ?? key)}
                          </span>
                        </Label>
                      ))}
                    </div>
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
