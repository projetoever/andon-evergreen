import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import { CredentialActionDialog } from "@/components/common/CredentialActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessRequest } from "@/services/accessService";
import { ui } from "@/i18n/translate";
import type { ProductionMode } from "@/types/machine";

type Props = {
  open: boolean;
  machineId: string;
  currentMode: ProductionMode;
  requestedMode: ProductionMode | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/** One-shot approval without replacing or elevating the Production login. */
export function ProductionModeCredentialModal({
  open, machineId, currentMode, requestedMode, onOpenChange, onSuccess,
}: Props) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Synchronous lock closes the interval before React commits busy=true.
  const submittingRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLogin("");
    setPassword("");
    setError("");
  }, [open, machineId, requestedMode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || busy || !login.trim() || !password || !requestedMode ||
        currentMode === requestedMode) return;
    submittingRef.current = true;
    setBusy(true);
    setError("");
    try {
      await accessRequest("/machines/production-mode", "POST", {
        machineId,
        expectedProductionMode: currentMode,
        productionMode: requestedMode,
        login: login.trim(),
        password,
      });
      setPassword("");
      onOpenChange(false);
      onSuccess();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message.includes("production_mode_changed")
        ? ui("A programação foi alterada em outra estação. Feche, confira o estado atual e tente novamente.")
        : ui("Não foi possível confirmar. Verifique usuário, senha e autorização para esta máquina."));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const targetLabel = requestedMode === "scheduled"
    ? ui("Produção Programada") : ui("Fora de Produção");
  return (
    <CredentialActionDialog open={open} busy={busy} onOpenChange={onOpenChange}
      icon={CalendarClock} title={ui("Confirmar programação de produção")}
      description={ui("A mudança para {0} exige a senha de um usuário autorizado. A conta conectada ao terminal continuará a mesma.", { 0: targetLabel })}>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{ui("Usuário autorizado")}</span>
            <Input autoComplete="username" autoFocus required maxLength={120}
              value={login} onChange={event => setLogin(event.target.value)} />
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{ui("Senha")}</span>
            <Input type="password" autoComplete="current-password" required maxLength={128}
              value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" type="submit" disabled={busy || !login.trim() || !password || !requestedMode}>
              {busy ? ui("Confirmando...") : ui("Confirmar alteração")}
            </Button>
            <Button className="w-full sm:w-auto" type="button" variant="secondary" disabled={busy}
              onClick={() => onOpenChange(false)}>{ui("Cancelar")}</Button>
          </div>
        </form>
    </CredentialActionDialog>
  );
}
