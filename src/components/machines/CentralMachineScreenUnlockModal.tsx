import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accessRequest, type AccessState } from "@/services/accessService";
import { ui } from "@/i18n/translate";

type Props = {
  open: boolean;
  machineId: string;
  defaultLogin?: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
};

/** One-shot credential proof without switching the operator's central session. */
export function CentralMachineScreenUnlockModal({
  open, machineId, defaultLogin, onOpenChange, onSuccess,
}: Props) {
  const [login, setLogin] = useState(defaultLogin || "admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setLogin(defaultLogin || "admin"); setPassword(""); setError(""); }
  }, [open, defaultLogin]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !login.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const session = await accessRequest<AccessState>("/session");
      if (session.principal?.purpose !== "normal")
        throw new Error("authentication_required");
      await accessRequest("/workstations/screen-unlock", "POST", {
        login: login.trim(), password, machineId,
      });
      await onSuccess();
      setPassword("");
      onOpenChange(false);
    } catch {
      // Do not leak whether a user exists or which role is authorized.
      setError(ui("Credencial inválida ou sem permissão para desbloquear esta tela."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ui("Desbloquear tela fixada")}</DialogTitle>
          <DialogDescription>
            {ui("Informe a senha de um Admin, mantenedor ou usuário com permissão para desfixar esta máquina. O usuário conectado não será alterado.")}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <label className="block space-y-1 text-sm font-semibold">
            <span>{ui("Usuário")}</span>
            <Input autoComplete="username" autoFocus required maxLength={120}
              value={login} onChange={event => setLogin(event.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span>{ui("Senha")}</span>
            <Input type="password" autoComplete="current-password" required maxLength={128}
              value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !login.trim() || !password}>
              {ui("Desbloquear")}
            </Button>
            <Button type="button" variant="secondary" disabled={busy}
              onClick={() => onOpenChange(false)}>{ui("Cancelar")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
