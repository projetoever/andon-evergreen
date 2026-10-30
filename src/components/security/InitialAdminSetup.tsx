import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ui } from "@/i18n/translate";
import {
  getAdminAuthStatus, initializeGlobalAdmin, type AdminAuthStatus,
} from "@/services/adminAuthService";

export function InitialAdminSetup({
  status, onComplete,
}: {
  status: AdminAuthStatus;
  onComplete: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupToken, setSetupToken] = useState(status.setupToken ?? "");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) {
      setError(ui("As senhas precisam ser iguais."));
      return;
    }
    if ([...password].length < 8 || [...password].length > 128) {
      setError(ui("A senha deve conter entre 8 e 128 caracteres."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await initializeGlobalAdmin(password, setupToken);
      setPassword("");
      setConfirm("");
      setSetupToken("");
      await onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui("Não foi possível concluir a configuração inicial."));
      // The one-time token may have expired; only the trusted local origin
      // receives a replacement. Never log or display it.
      try {
        const current = await getAdminAuthStatus();
        setSetupToken(current.setupToken ?? "");
        if (current.passwordConfigured) await onComplete();
      } catch { /* Keep the blocked setup screen until server is available. */ }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
      <Card className="mx-auto max-w-lg space-y-5 p-6">
        <div className="flex items-center gap-3">
          <LockKeyhole className="h-7 w-7 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold">{ui("Primeiro acesso — Configuração do administrador")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {ui("Esta instalação ainda não possui senha administrativa. Não existe senha padrão. A configuração deve ser concluída no próprio servidor antes de liberar o ANDON na rede.")}
        </p>
        {!status.setupAvailable ? (
          <div role="status" className="rounded-lg border border-warning/40 p-4 text-sm">
            {ui("Por segurança, abra o Hub diretamente no navegador do servidor usando localhost para cadastrar a primeira senha. Outros dispositivos não podem realizar esta etapa.")}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <Label className="block space-y-2">
              <span>{ui("Nova senha global do administrador")}</span>
              <Input type="password" required autoComplete="new-password"
                minLength={8} maxLength={128} value={password}
                onChange={event => setPassword(event.target.value)} />
            </Label>
            <Label className="block space-y-2">
              <span>{ui("Confirmar nova senha")}</span>
              <Input type="password" required autoComplete="new-password"
                minLength={8} maxLength={128} value={confirm}
                onChange={event => setConfirm(event.target.value)} />
            </Label>
            <p className="text-xs text-muted-foreground">
              {ui("Use entre 8 e 128 caracteres. Recomendamos pelo menos 12, sem senhas comuns. Esta senha será usada nas funções administrativas legadas durante a migração para o login central.")}
            </p>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={busy || !setupToken}>
              {busy ? ui("Configurando...") : ui("Criar senha e concluir primeira configuração")}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
