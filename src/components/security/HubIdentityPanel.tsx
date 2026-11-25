import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Clock3, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CentralAdminRecoveryForm } from "@/components/security/CentralAdminRecoveryForm";
import { ui } from "@/i18n/translate";
import { toast } from "@/i18n/toast";
import { persistentBlockerMessage, PERSISTENCE_NOT_ACTIVE } from "@/services/persistentSessionStatus";
import { hadConfirmedPersistentSession, sessionLossMessage } from "@/services/sessionRecoveryDiagnostics";
import { accessRequest, type AccessState } from "@/services/accessService";
import { withHubTransientRetry } from "@/services/hubTransitionRetry";
import { personalPasswordHint } from "@/services/personalPasswordHint";
import type { ModuleAccess } from "@/types/modules";

const messages: Record<string, string> = {
  invalid_credentials: "Credenciais inválidas ou conta indisponível.",
  workstation_denied: "A workstation ainda não foi liberada.",
  https_required: "A identificação central exige HTTPS.",
  origin_denied: "Origem HTTPS não autorizada.",
  csrf_denied: "Sessão de segurança inválida. Atualize a página.",
  rate_limited: "Muitas tentativas. Aguarde antes de tentar novamente.",
  invalid_input: "Confira os dados informados.",
  password_policy_failed: "Senha recusada. Evite sequências comuns ou caracteres repetidos.",
};

export function HubIdentityPanel({
  access,
  onChanged,
}: {
  access: ModuleAccess;
  onChanged: () => Promise<void>;
}) {
  const [session, setSession] = useState<AccessState | null>(null);
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [error, setError] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const admission = access.workstation.admission;
  const waiting = access.workstation.pendingApproval && admission?.status === "pending" &&
    session?.principal?.purpose === "workstation_admission";
  const refreshSession = useCallback(async () => {
    const next = await withHubTransientRetry(() => accessRequest<AccessState>("/session"));
    setSession(next);
    setError("");
  }, []);
  useEffect(() => {
    void refreshSession().catch((cause) =>
      setError(messages[cause instanceof Error ? cause.message : ""] ?? "Acesso indisponível."),
    );
  }, [
    access.principal?.userId,
    access.principal?.purpose,
    access.workstation.admission?.status,
    access.workstation.pendingApproval,
    refreshSession,
  ]);
  const run = async (action: () => Promise<void>) => {
    // Synchronous guard prevents two login/admission/password actions before
    // React renders busy=true. No session token or password is stored here.
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(messages[code] ?? "Não foi possível concluir. Tente novamente.");
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };
  const authenticate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const login = String(values.get("login") ?? "");
    const password = String(values.get("password") ?? "");
    void run(async () => {
      const result = await accessRequest<{
        sessionPolicy?: string; persistentOperational?: boolean; persistenceBlocker?: string | null;
      }>("/login", "POST", { login, password });
      // Preserve the login field on rejected credentials; clear both fields
      // only once the server acknowledges authentication.
      form.reset();
      await refreshSession();
      await onChanged();
      // No more silent fallback to a 30-minute idle session on a pinned
      // production terminal. The login may be valid, but explicitly warn
      // when server-side trust/scope prevented permanent issuance.
      if (result.sessionPolicy === "persistent" && result.persistentOperational !== true)
        toast.error(ui(PERSISTENCE_NOT_ACTIVE), {
          description: ui(persistentBlockerMessage(result.persistenceBlocker)),
          duration: 12_000,
        });
    });
  };
  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") ?? "");
    const confirm = String(values.get("confirm") ?? "");
    const weakness = personalPasswordHint(password);
    if (weakness) {
      setError(ui(weakness));
      return;
    }
    if (password !== confirm) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    event.currentTarget.reset();
    setNewPasswordDraft("");
    void run(async () => {
      await accessRequest("/password", "POST", { newPassword: password });
      await refreshSession();
      await onChanged();
    });
  };
  const endAdmissionSession = () => void run(async () => {
    await accessRequest("/logout", "POST", {});
    setSession(null);
    await onChanged();
  });
  const approveSelfInLab = () => void run(async () => {
    await accessRequest("/admission/approve-self-in-lab", "POST", {
      requestedName: access.workstation.name || "Admin LAB",
    });
    // Approval revokes the admission-only session. A fresh password login is
    // mandatory; this action never converts the old cookie to a normal token.
    await refreshSession();
    await onChanged();
  });
  const requestAdmission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void run(async () => {
      await accessRequest("/admission/request", "POST", {
        requestedName: String(values.get("name") ?? ""),
        reason: String(values.get("reason") ?? "") || undefined,
      });
      await onChanged();
    });
  };
  if (waiting)
    return (
      <Card className="space-y-3 border-warning/40 p-5" role="status">
        <div className="flex items-center gap-3">
          <Clock3 className="h-5 w-5 text-warning" />
          <h3 className="font-bold">{ui("Solicitação aguardando aprovação")}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {ui(
            "A identificação foi registrada, mas nenhum módulo foi liberado. Um administrador precisa decidir a solicitação.",
          )}
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">{access.workstation.id}</p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await refreshSession();
              await onChanged();
            })
          }
        >
          {ui("Verificar novamente")}
        </Button>
        <Button variant="outline" disabled={busy} onClick={endAdmissionSession}>
          {ui("Sair desta sessão")}
        </Button>
        {session?.labSelfAdmissionAvailable && (
          <Button disabled={busy} onClick={approveSelfInLab}>
            {ui("Liberar esta workstation como Admin (LAB)")}
          </Button>
        )}
      </Card>
    );
  if (!session)
    return (
      <Card className="mx-auto max-w-xl space-y-3 p-5">
        <p role="alert" className="text-sm text-danger">
          {ui(error || "Acesso indisponível.")}
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void run(refreshSession)}>
          {ui("Tentar novamente")}
        </Button>
      </Card>
    );
  if (!session.initialized)
    return (
      <Card className="space-y-3 p-5">
        <h3 className="font-bold">{ui("Gestão de acessos ainda não inicializada")}</h3>
        <p className="text-sm text-muted-foreground">
          {ui("Inicialize o Admin principal em uma workstation já aprovada.")}
        </p>
        <Button asChild variant="outline">
          <Link to="/hub/admin">{ui("Primeiro acesso — Admin principal")}</Link>
        </Button>
      </Card>
    );
  const principal = session.principal;
  return (
    <Card className="mx-auto max-w-xl space-y-4 p-5">
      <div className="flex items-center gap-3">
        {principal ? (
          <ShieldCheck className="h-5 w-5 text-primary" />
        ) : (
          <LogIn className="h-5 w-5 text-primary" />
        )}
        <h3 className="font-bold">
          {ui(
            principal?.purpose === "workstation_admission"
              ? "Solicitar acesso desta workstation"
              : principal?.purpose === "password_change"
                ? "Crie sua senha pessoal"
                : "Identifique-se para acessar o Hub",
          )}
        </h3>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 p-3 text-sm text-danger">
          {ui(error)}
        </p>
      )}
      {!principal && session.sessionDiagnostic && hadConfirmedPersistentSession() && (
        <section className="space-y-2 text-xs" aria-label={ui("Diagnóstico do login anterior")}>
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
            <strong>{ui("Diagnóstico do login anterior")} ({session.sessionDiagnostic}):</strong>{" "}
            {ui(sessionLossMessage(session.sessionDiagnostic))}
          </p>
        </section>
      )}
      {!principal && (
        <form className="space-y-4" onSubmit={authenticate}>
          <Label className="block space-y-2">
            {ui("Usuário")}
            <Input name="login" autoComplete="username" required maxLength={120} />
          </Label>
          <Label className="block space-y-2">
            {ui("Senha")}
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </Label>
          <Button disabled={busy}>{ui("Identificar")}</Button>
        </form>
      )}
      {!principal && (
        <>
          <CentralAdminRecoveryForm
            triggerLabel={ui("Esqueci a senha")}
            onRecovered={async () => {
              await refreshSession();
              await onChanged();
            }}
          />
          <p className="text-xs text-muted-foreground">
            {ui("Para outras contas, solicite a redefinição da senha ao Admin principal.")}
          </p>
        </>
      )}
      {principal?.purpose === "password_change" && (
        <form className="space-y-4" onSubmit={changePassword}>
          <p className="text-sm text-muted-foreground">
            {ui("Use uma senha de 8 a 128 caracteres; recomendamos 12 ou mais.")}
          </p>
          <Label className="block space-y-2">
            {ui("Nova senha pessoal")}
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              onChange={(event) => setNewPasswordDraft(event.target.value)}
              aria-describedby="hub-password-feedback"
              required
              minLength={8}
              maxLength={128}
            />
          </Label>
          <p id="hub-password-feedback" aria-live="polite" className="text-xs text-danger">
            {newPasswordDraft && personalPasswordHint(newPasswordDraft)
              ? ui(personalPasswordHint(newPasswordDraft)!) : ""}
          </p>
          <Label className="block space-y-2">
            {ui("Confirmar nova senha")}
            <Input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </Label>
          <Button disabled={busy}>{ui("Salvar senha pessoal")}</Button>
        </form>
      )}
      {principal?.purpose === "workstation_admission" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={endAdmissionSession}>
            {ui("Sair desta sessão")}
          </Button>
          {session?.labSelfAdmissionAvailable && (
            <Button disabled={busy} onClick={approveSelfInLab}>
              {ui("Liberar esta workstation como Admin (LAB)")}
            </Button>
          )}
        </div>
      )}
      {principal?.purpose === "workstation_admission" && (
        <form className="space-y-4" onSubmit={requestAdmission}>
          <p className="text-sm text-muted-foreground">
            {ui(
              "Usuário identificado: {0}. A autenticação não libera módulos sem aprovação administrativa.",
              { 0: principal.displayName },
            )}
          </p>
          <Label className="block space-y-2">
            {ui("Identificação da workstation")}
            <Input
              name="name"
              required
              maxLength={120}
              defaultValue={access.workstation.name ?? ""}
              placeholder={ui("Ex.: Kiosk Máquina 37")}
            />
          </Label>
          <Label className="block space-y-2">
            {ui("Finalidade ou localização (opcional)")}
            <Input name="reason" maxLength={500} placeholder={ui("Ex.: Produção — Linha 1")} />
          </Label>
          <Button disabled={busy}>{ui("Enviar solicitação")}</Button>
        </form>
      )}
    </Card>
  );
}
