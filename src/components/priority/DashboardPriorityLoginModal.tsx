import { useEffect, useState, type FormEvent } from "react";
import { ListOrdered } from "lucide-react";

import { BigButton } from "@/components/common/BigButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getDashboardPriorityAccessStatus,
  loginDashboardPriority,
} from "@/services/dashboardPriorityService";

interface DashboardPriorityLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DashboardPriorityLoginModal({
  open,
  onOpenChange,
  onSuccess,
}: DashboardPriorityLoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setError("");
    setPassword("");
    setConfigured(null);

    void getDashboardPriorityAccessStatus()
      .then((status) => {
        setConfigured(status.configured);
        setUsername(status.username ?? "");
      })
      .catch(() => {
        setConfigured(false);
        setError("Não foi possível verificar o acesso de prioridades.");
      });
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      await loginDashboardPriority(username, password);
      setPassword("");
      onOpenChange(false);
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Usuário ou senha inválidos.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListOrdered className="h-5 w-5" />
          </div>
          <DialogTitle>Prioridade de produção</DialogTitle>
          <DialogDescription>
            Acesso exclusivo para organizar visualmente os cards de máquinas no Dashboard.
          </DialogDescription>
        </DialogHeader>

        {configured === false ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            O acesso ainda não foi configurado. Defina usuário e senha no painel administrativo.
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-semibold">
              Usuário
              <input
                autoFocus
                autoComplete="username"
                className="mt-1 w-full rounded-md border border-border bg-background p-2"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Senha
              <input
                type="password"
                autoComplete="current-password"
                className="mt-1 w-full rounded-md border border-border bg-background p-2"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <BigButton type="submit" tone="primary" size="md" disabled={isSubmitting}>
                {isSubmitting ? "Entrando..." : "Entrar"}
              </BigButton>
              <BigButton
                type="button"
                tone="neutral"
                size="md"
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
