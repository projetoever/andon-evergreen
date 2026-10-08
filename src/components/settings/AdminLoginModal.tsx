import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BigButton } from "@/components/common/BigButton";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  loginAdmin,
  recoverAdminPassword,
} from "@/services/adminAuthService";

interface AdminLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
  successLabel?: string;
}

export function AdminLoginModal({
  open,
  onOpenChange,
  onSuccess,
  title = "Acesso administrativo",
  description = "Informe usuário e senha para acessar configurações.",
  successLabel = "Entrar",
}: AdminLoginModalProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState("");

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setIsSubmitting(true);
    try {
      if (await loginAdmin(username, password)) {
        setError("");
        setPassword("");
        onOpenChange(false);
        onSuccess();
        return;
      }
      setError("Usuário ou senha inválidos.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecovery(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (recoveryPassword.trim().length < ADMIN_PASSWORD_MIN_LENGTH) {
      setError(
        `A nova senha deve possuir pelo menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`,
      );
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setIsSubmitting(true);
    try {
      await recoverAdminPassword(recoveryCode, recoveryPassword);
      setError("");
      setRecoveryCode("");
      setRecoveryPassword("");
      setRecoveryPasswordConfirm("");
      setRecoveryMode(false);
      onOpenChange(false);
      onSuccess();
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "Não foi possível recuperar o acesso administrativo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleModeChange() {
    setError("");
    setRecoveryMode((current) => !current);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{recoveryMode ? "Recuperar acesso administrativo" : title}</DialogTitle>
          <DialogDescription>
            {recoveryMode
              ? "Use o código de recuperação guardado anteriormente para definir uma nova senha global."
              : description}
          </DialogDescription>
        </DialogHeader>

        {recoveryMode ? (
          <form className="space-y-4" onSubmit={handleRecovery}>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              O código é de uso único. Após a recuperação, gere um novo código no painel Admin.
            </div>
            <label className="block text-sm">
              Código de recuperação
              <input
                autoFocus
                autoComplete="off"
                className="mt-1 w-full rounded border p-2 font-mono uppercase"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                placeholder="ADM-XXXX-XXXX-XXXX"
              />
            </label>
            <label className="block text-sm">
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded border p-2"
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
                placeholder={`Mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres`}
              />
            </label>
            <label className="block text-sm">
              Confirmar nova senha
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded border p-2"
                value={recoveryPasswordConfirm}
                onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                placeholder="Repita a nova senha"
              />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <BigButton type="submit" tone="primary" size="md" disabled={isSubmitting}>
                {isSubmitting ? "Recuperando..." : "Redefinir senha"}
              </BigButton>
              <BigButton
                type="button"
                tone="neutral"
                size="md"
                disabled={isSubmitting}
                onClick={handleModeChange}
              >
                Voltar ao login
              </BigButton>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm">
              Usuário
              <input
                autoFocus
                autoComplete="username"
                className="mt-1 w-full rounded border p-2"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Senha
              <input
                type="password"
                autoComplete="current-password"
                className="mt-1 w-full rounded border p-2"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button"
              className="text-sm font-bold text-primary hover:underline"
              onClick={handleModeChange}
            >
              Esqueci a senha
            </button>
            <div className="flex gap-2">
              <BigButton type="submit" tone="primary" size="md" disabled={isSubmitting}>
                {isSubmitting ? "Validando..." : successLabel}
              </BigButton>
              <BigButton
                type="button"
                tone="neutral"
                size="md"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </BigButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
