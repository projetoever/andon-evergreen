import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BigButton } from "@/components/common/BigButton";
import { loginAdmin } from "@/services/adminAuthService";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loginAdmin(username, password)) {
      setError("");
      setPassword("");
      onOpenChange(false);
      onSuccess();
      return;
    }
    setError("Usuário ou senha inválidos.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm">
            Usuário
            <input
              autoFocus
              autoComplete="username"
              className="mt-1 w-full rounded border p-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <BigButton type="submit" tone="primary" size="md">
              {successLabel}
            </BigButton>
            <BigButton type="button" tone="neutral" size="md" onClick={() => onOpenChange(false)}>
              Cancelar
            </BigButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
