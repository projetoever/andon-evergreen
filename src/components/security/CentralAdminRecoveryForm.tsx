import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ui } from "@/i18n/translate";
import { accessRequest } from "@/services/accessService";

/** Recovery is verified by the API against physical loopback, HTTPS, CSRF
 * and a 128-bit offline secret. No legacy Bearer or automatic sign-in.
 */
export function CentralAdminRecoveryForm({ onRecovered, triggerLabel }: { onRecovered: () => Promise<void>; triggerLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const recoveryCode = String(values.get("recoveryCode") ?? "");
    const newPassword = String(values.get("newPassword") ?? "");
    const confirm = String(values.get("confirm") ?? "");
    if (newPassword !== confirm) {
      setError(ui("As senhas precisam ser iguais."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accessRequest("/admin-recover", "POST", { recoveryCode, newPassword });
      form.reset();
      setRecovered(true);
      await onRecovered();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(ui(
        code === "recovery_local_only"
          ? "Recuperação disponível somente no navegador local do servidor."
          : code === "invalid_recovery_code"
            ? "Código inválido ou já utilizado."
            : code === "rate_limited"
              ? "Muitas tentativas. Aguarde 15 minutos."
              : "Não foi possível recuperar a conta. Verifique os dados e a conexão HTTPS.",
      ));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-border pt-4">
      {recovered ? (
        <p role="status" className="text-sm font-semibold">
          {ui("Senha Admin central redefinida. Entre novamente com sua nova senha.")}
        </p>
      ) : (
        <>
          <Button type="button" variant="outline" onClick={() => setExpanded(!expanded)}>
            {triggerLabel ?? ui("Recuperar conta Admin central")}
          </Button>
          {expanded && (
            <form className="space-y-3" onSubmit={(event) => void submit(event)}>
              <p className="text-xs text-muted-foreground">
                {ui("Use o código de recuperação guardado e acesse este formulário diretamente no servidor (localhost, HTTPS). A recuperação encerra todas as sessões Admin existentes.")}
              </p>
              <Label className="block space-y-2">
                <span>{ui("Código de recuperação")}</span>
                <Input name="recoveryCode" type="text" autoComplete="off"
                  required maxLength={80} />
              </Label>
              <Label className="block space-y-2">
                <span>{ui("Nova senha Admin central")}</span>
                <Input name="newPassword" type="password" autoComplete="new-password"
                  required minLength={8} maxLength={128} />
              </Label>
              <Label className="block space-y-2">
                <span>{ui("Confirmar nova senha")}</span>
                <Input name="confirm" type="password" autoComplete="new-password"
                  required minLength={8} maxLength={128} />
              </Label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? ui("Validando recuperação...") : ui("Redefinir senha Admin central")}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
