import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLogin("");
    setPassword("");
    setError("");
  }, [open, machineId, requestedMode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !login.trim() || !password || !requestedMode ||
        currentMode === requestedMode) return;
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
      setBusy(false);
    }
  };

  const targetLabel = requestedMode === "scheduled"
    ? ui("Produção Programada") : ui("Fora de Produção");
  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ui("Confirmar programação de produção")}</DialogTitle>
          <DialogDescription>
            {ui("A mudança para {0} exige a senha de um usuário autorizado. A conta conectada ao terminal continuará a mesma.", { 0: targetLabel })}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <label className="block space-y-1 text-sm font-semibold">
            <span>{ui("Usuário autorizado")}</span>
            <Input autoComplete="username" autoFocus required maxLength={120}
              value={login} onChange={event => setLogin(event.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span>{ui("Senha")}</span>
            <Input type="password" autoComplete="current-password" required maxLength={128}
              value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !login.trim() || !password || !requestedMode}>
              {busy ? ui("Confirmando...") : ui("Confirmar alteração")}
            </Button>
            <Button type="button" variant="secondary" disabled={busy}
              onClick={() => onOpenChange(false)}>{ui("Cancelar")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
