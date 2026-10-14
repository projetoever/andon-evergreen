import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ListOrdered, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  configureDashboardPriorityCredentials,
  getDashboardPriorityAccessStatus,
} from "@/services/dashboardPriorityService";

export function PriorityAccessSettings() {
  const [priorityConfigured, setPriorityConfigured] = useState(false);
  const [isLoadingPriorityAccess, setIsLoadingPriorityAccess] = useState(true);
  const [priorityAccessLoadError, setPriorityAccessLoadError] = useState<string | null>(null);
  const [priorityUsername, setPriorityUsername] = useState("");
  const [priorityPassword, setPriorityPassword] = useState("");
  const [priorityPasswordConfirm, setPriorityPasswordConfirm] = useState("");
  const [isSavingPriorityCredentials, setIsSavingPriorityCredentials] = useState(false);

  const loadPriorityAccess = useCallback(async () => {
    setIsLoadingPriorityAccess(true);
    setPriorityAccessLoadError(null);

    try {
      const status = await getDashboardPriorityAccessStatus();
      setPriorityConfigured(status.configured);
      setPriorityUsername(status.username ?? "");
    } catch {
      const message = "Não foi possível carregar o acesso de prioridades.";
      setPriorityAccessLoadError(message);
      toast.error(message);
    } finally {
      setIsLoadingPriorityAccess(false);
    }
  }, []);

  useEffect(() => {
    void loadPriorityAccess();
  }, [loadPriorityAccess]);

  async function handleSavePriorityCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const username = priorityUsername.trim();
    if (username.length < 3) {
      toast.error("O usuário de prioridades deve possuir pelo menos 3 caracteres.");
      return;
    }
    if (priorityPassword.trim().length < 6) {
      toast.error("A senha de prioridades deve possuir pelo menos 6 caracteres.");
      return;
    }
    if (priorityPassword !== priorityPasswordConfirm) {
      toast.error("A confirmação da senha de prioridades não confere.");
      return;
    }

    setIsSavingPriorityCredentials(true);
    try {
      const result = await configureDashboardPriorityCredentials(username, priorityPassword);
      setPriorityConfigured(result.configured);
      setPriorityUsername(result.username);
      setPriorityPassword("");
      setPriorityPasswordConfirm("");
      toast.success("Credenciais da gestão de prioridades atualizadas.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as credenciais de prioridades.",
      );
    } finally {
      setIsSavingPriorityCredentials(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-primary" />
          Acesso de Prioridades
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O administrador provisiona esta credencial. A sequência de produção continua sendo
          organizada no módulo Prioridades. Atualizar a credencial encerra as sessões de Prioridades
          existentes.
        </p>
        <div className="rounded-xl border border-border bg-muted/15 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="font-black">Acesso à gestão de prioridades</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Credencial independente salva no servidor e válida em todas as
                máquinas/workstations.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                priorityAccessLoadError
                  ? "bg-danger/10 text-danger"
                  : priorityConfigured
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning"
              }`}
            >
              {isLoadingPriorityAccess
                ? "Carregando"
                : priorityAccessLoadError
                  ? "Indisponível"
                  : priorityConfigured
                    ? "Configurado"
                    : "Pendente"}
            </span>
          </div>

          {priorityAccessLoadError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
            >
              <span>{priorityAccessLoadError}</span>
              <button
                type="button"
                className="font-bold underline"
                onClick={() => void loadPriorityAccess()}
                disabled={isLoadingPriorityAccess}
              >
                Tentar novamente
              </button>
            </div>
          )}

          <form className="space-y-3" onSubmit={handleSavePriorityCredentials}>
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="priority-manager-username">Usuário</Label>
                <Input
                  id="priority-manager-username"
                  required
                  minLength={3}
                  maxLength={80}
                  autoComplete="off"
                  value={priorityUsername}
                  onChange={(event) => setPriorityUsername(event.target.value)}
                  placeholder="responsavel.producao"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="priority-manager-password">Nova senha</Label>
                <Input
                  id="priority-manager-password"
                  required
                  minLength={6}
                  maxLength={128}
                  type="password"
                  autoComplete="new-password"
                  value={priorityPassword}
                  onChange={(event) => setPriorityPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="priority-manager-password-confirm">Confirmar senha</Label>
                <Input
                  id="priority-manager-password-confirm"
                  required
                  minLength={6}
                  maxLength={128}
                  type="password"
                  autoComplete="new-password"
                  value={priorityPasswordConfirm}
                  onChange={(event) => setPriorityPasswordConfirm(event.target.value)}
                  placeholder="Repita a senha"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSavingPriorityCredentials || isLoadingPriorityAccess}
              >
                {isSavingPriorityCredentials
                  ? "Salvando..."
                  : priorityConfigured
                    ? "Atualizar credenciais"
                    : "Configurar acesso"}
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
