import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock3, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ui } from "@/i18n/translate";
import { accessRequest, type AccessState } from "@/services/accessService";
import type { ModuleAccess } from "@/types/modules";

const messages: Record<string, string> = {
  invalid_credentials: "Credenciais inválidas ou conta indisponível.",
  workstation_denied: "A workstation ainda não foi liberada.",
  https_required: "A identificação central exige HTTPS.",
  origin_denied: "Origem HTTPS não autorizada.",
  csrf_denied: "Sessão de segurança inválida. Atualize a página.",
  rate_limited: "Muitas tentativas. Aguarde antes de tentar novamente.",
  invalid_input: "Confira os dados informados.",
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
  const [error, setError] = useState("");
  const admission = access.workstation.admission;
  const waiting = access.workstation.pendingApproval && admission?.status === "pending";
  const refreshSession = useCallback(async () => {
    const next = await accessRequest<AccessState>("/session");
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
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(messages[code] ?? "Não foi possível concluir. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const authenticate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const login = String(values.get("login") ?? "");
    const password = String(values.get("password") ?? "");
    event.currentTarget.reset();
    void run(async () => {
      await accessRequest("/login", "POST", { login, password });
      await refreshSession();
      await onChanged();
    });
  };
  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") ?? "");
    const confirm = String(values.get("confirm") ?? "");
    if (password !== confirm) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    event.currentTarget.reset();
    void run(async () => {
      await accessRequest("/password", "POST", { newPassword: password });
      await refreshSession();
      await onChanged();
    });
  };
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
      {!principal && (
        <form className="space-y-4" onSubmit={authenticate}>
          <Label className="block space-y-2">
            {ui("Login")}
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
      {principal?.purpose === "password_change" && (
        <form className="space-y-4" onSubmit={changePassword}>
          <p className="text-sm text-muted-foreground">
            {ui("Use uma frase de acesso de 15 a 128 caracteres.")}
          </p>
          <Label className="block space-y-2">
            {ui("Nova senha pessoal")}
            <Input
              name="password"
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
          <Button disabled={busy}>{ui("Salvar senha pessoal")}</Button>
        </form>
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
