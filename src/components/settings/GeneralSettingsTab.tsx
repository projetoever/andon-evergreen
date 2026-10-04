import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Keyboard, ListOrdered, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ADMIN_PASSWORD_MIN_LENGTH, changeAdminPassword } from "@/services/adminAuthService";
import {
  configureDashboardPriorityCredentials,
  getDashboardPriorityAccessStatus,
} from "@/services/dashboardPriorityService";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";
import type { DashboardMachineOrderMode } from "@/types/systemSettings";

export function GeneralSettingsTab() {
  const [virtualKeyboardEnabled, setVirtualKeyboardEnabled] = useState(true);
  const [requireWorkOrderAtOpen, setRequireWorkOrderAtOpen] = useState(false);
  const [restrictMaintenanceCompletion, setRestrictMaintenanceCompletion] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingKeyboard, setIsSavingKeyboard] = useState(false);
  const [isSavingWorkOrder, setIsSavingWorkOrder] = useState(false);
  const [isSavingMaintenanceRestriction, setIsSavingMaintenanceRestriction] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dashboardMachineOrderMode, setDashboardMachineOrderMode] =
    useState<DashboardMachineOrderMode>("default");
  const [isSavingDashboardOrderMode, setIsSavingDashboardOrderMode] = useState(false);
  const [priorityConfigured, setPriorityConfigured] = useState(false);
  const [priorityUsername, setPriorityUsername] = useState("");
  const [priorityPassword, setPriorityPassword] = useState("");
  const [priorityPasswordConfirm, setPriorityPasswordConfirm] = useState("");
  const [isSavingPriorityCredentials, setIsSavingPriorityCredentials] = useState(false);

  useEffect(() => {
    let active = true;

    void getSystemSettings()
      .then((settings) => {
        if (active) {
          setVirtualKeyboardEnabled(settings.virtualKeyboardEnabled !== false);
          setRequireWorkOrderAtOpen(settings.requireWorkOrderAtOpen === true);
          setRestrictMaintenanceCompletion(
            settings.restrictMaintenanceCompletionToAttendanceWorkstation === true,
          );
          setDashboardMachineOrderMode(
            settings.dashboardMachineOrderMode === "priority" ? "priority" : "default",
          );
        }
      })
      .catch(() => {
        if (active) toast.error("Não foi possível carregar as configurações gerais.");
      })
      .finally(() => {
        if (active) setIsLoadingSettings(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getDashboardPriorityAccessStatus()
      .then((status) => {
        if (!active) return;
        setPriorityConfigured(status.configured);
        setPriorityUsername(status.username ?? "");
      })
      .catch(() => {
        if (active) toast.error("Não foi possível carregar o acesso de prioridades.");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleDashboardOrderModeChange(mode: DashboardMachineOrderMode) {
    if (mode === dashboardMachineOrderMode || isSavingDashboardOrderMode) return;
    if (mode === "priority" && !priorityConfigured) {
      toast.error("Configure primeiro o usuário e a senha da gestão de prioridades.");
      return;
    }

    const previousMode = dashboardMachineOrderMode;
    setDashboardMachineOrderMode(mode);
    setIsSavingDashboardOrderMode(true);

    try {
      const settings = await updateSystemSettings({ dashboardMachineOrderMode: mode });
      setDashboardMachineOrderMode(settings.dashboardMachineOrderMode);
      toast.success(
        settings.dashboardMachineOrderMode === "priority"
          ? "Dashboard configurado para prioridade de produção."
          : "Dashboard restaurado para a organização padrão.",
      );
    } catch {
      setDashboardMachineOrderMode(previousMode);
      toast.error("Não foi possível alterar a organização do Dashboard.");
    } finally {
      setIsSavingDashboardOrderMode(false);
    }
  }

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

  async function handleKeyboardChange(enabled: boolean) {
    const previousValue = virtualKeyboardEnabled;
    setVirtualKeyboardEnabled(enabled);
    setIsSavingKeyboard(true);

    try {
      const settings = await updateSystemSettings({ virtualKeyboardEnabled: enabled });
      setVirtualKeyboardEnabled(settings.virtualKeyboardEnabled);
      toast.success(
        settings.virtualKeyboardEnabled
          ? "Teclado virtual habilitado."
          : "Teclado virtual desabilitado.",
      );
    } catch {
      setVirtualKeyboardEnabled(previousValue);
      toast.error("Não foi possível salvar a configuração do teclado virtual.");
    } finally {
      setIsSavingKeyboard(false);
    }
  }

  async function handleWorkOrderRequirementChange(required: boolean) {
    const previousValue = requireWorkOrderAtOpen;
    setRequireWorkOrderAtOpen(required);
    setIsSavingWorkOrder(true);

    try {
      const settings = await updateSystemSettings({ requireWorkOrderAtOpen: required });
      setRequireWorkOrderAtOpen(settings.requireWorkOrderAtOpen);
      toast.success(
        settings.requireWorkOrderAtOpen
          ? "OS obrigatória na abertura dos chamados."
          : "OS opcional na abertura dos chamados.",
      );
    } catch {
      setRequireWorkOrderAtOpen(previousValue);
      toast.error("Não foi possível salvar a regra da OS.");
    } finally {
      setIsSavingWorkOrder(false);
    }
  }

  async function handleMaintenanceRestrictionChange(restricted: boolean) {
    const previousValue = restrictMaintenanceCompletion;
    setRestrictMaintenanceCompletion(restricted);
    setIsSavingMaintenanceRestriction(true);

    try {
      const settings = await updateSystemSettings({
        restrictMaintenanceCompletionToAttendanceWorkstation: restricted,
      });
      setRestrictMaintenanceCompletion(
        settings.restrictMaintenanceCompletionToAttendanceWorkstation,
      );
      toast.success(
        settings.restrictMaintenanceCompletionToAttendanceWorkstation
          ? "Conclusão restrita às workstations do atendimento."
          : "Restrição de workstation desabilitada.",
      );
    } catch {
      setRestrictMaintenanceCompletion(previousValue);
      toast.error("Não foi possível salvar a restrição de workstation.");
    } finally {
      setIsSavingMaintenanceRestriction(false);
    }
  }

  function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.trim() !== confirmPassword.trim()) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }

    const result = changeAdminPassword(currentPassword, newPassword);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success(result.message);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Configurações gerais</h3>
        <p className="text-sm text-muted-foreground">
          Preferências globais da interface e credenciais administrativas.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" />
              Teclado virtual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Exibe um ícone dentro dos campos de texto para operar o ANDON sem teclado físico.
            </p>
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="font-bold">Habilitar teclado virtual</p>
                <p className="text-xs text-muted-foreground">
                  A preferência vale para todas as telas deste sistema.
                </p>
              </div>
              <Switch
                aria-label="Habilitar teclado virtual"
                checked={virtualKeyboardEnabled}
                disabled={isLoadingSettings || isSavingKeyboard}
                onCheckedChange={(checked) => void handleKeyboardChange(checked)}
              />
            </div>
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="font-bold">
                  Restringir conclusão da manutenção à workstation do atendimento
                </p>
                <p className="text-xs text-muted-foreground">
                  Quando habilitado, a manutenção só poderá ser concluída em uma workstation que
                  possua uma sessão ativa nesse atendimento.
                </p>
              </div>
              <Switch
                aria-label="Restringir conclusão da manutenção à workstation do atendimento"
                checked={restrictMaintenanceCompletion}
                disabled={isLoadingSettings || isSavingMaintenanceRestriction}
                onCheckedChange={(checked) => void handleMaintenanceRestrictionChange(checked)}
              />
            </div>
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="font-bold">Regra global: exigir OS na abertura</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativa, todas as máquinas exigem OS. Mesmo desativada, uma máquina pode
                  exigir OS individualmente em Máquinas.
                </p>
              </div>
              <Switch
                aria-label="Exigir OS na abertura do chamado"
                checked={requireWorkOrderAtOpen}
                disabled={isLoadingSettings || isSavingWorkOrder}
                onCheckedChange={(checked) => void handleWorkOrderRequirementChange(checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Senha administrativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleChangePassword}>
              <p className="text-sm text-muted-foreground">
                Altere a senha usada no painel administrativo e no desbloqueio de telas fixadas.
              </p>
              <div className="space-y-1">
                <Label htmlFor="current-admin-password">Senha atual</Label>
                <Input
                  id="current-admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Senha atual"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="new-admin-password">Nova senha</Label>
                  <Input
                    id="new-admin-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder={`Mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres`}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm-admin-password">Confirmar senha</Label>
                  <Input
                    id="confirm-admin-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Alterar senha</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-primary" />
              Organização visual do Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-sm text-muted-foreground">
                Define somente a ordem visual dos cards de máquinas. Não altera chamados, tempos,
                status, sons, atendimento ou qualquer regra operacional do ANDON.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                disabled={isLoadingSettings || isSavingDashboardOrderMode}
                onClick={() => void handleDashboardOrderModeChange("default")}
                className={`rounded-xl border p-4 text-left transition ${
                  dashboardMachineOrderMode === "default"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent/50"
                }`}
              >
                <p className="font-black">Padrão atual</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mantém a organização atual dos cards do Dashboard.
                </p>
              </button>

              <button
                type="button"
                disabled={isLoadingSettings || isSavingDashboardOrderMode}
                onClick={() => void handleDashboardOrderModeChange("priority")}
                className={`rounded-xl border p-4 text-left transition ${
                  dashboardMachineOrderMode === "priority"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent/50"
                }`}
              >
                <p className="font-black">Prioridade de produção</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usa a sequência definida pelo responsável e destaca visualmente P1–P5.
                </p>
              </button>
            </div>

            <div className="rounded-xl border border-border bg-muted/15 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <p className="font-black">Acesso à gestão de prioridades</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Credencial independente usada somente na tela de ordenação das máquinas.
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                    priorityConfigured
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {priorityConfigured ? "Configurado" : "Pendente"}
                </span>
              </div>

              <form className="space-y-3" onSubmit={handleSavePriorityCredentials}>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="priority-manager-username">Usuário</Label>
                    <Input
                      id="priority-manager-username"
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
                      type="password"
                      autoComplete="new-password"
                      value={priorityPasswordConfirm}
                      onChange={(event) => setPriorityPasswordConfirm(event.target.value)}
                      placeholder="Repita a senha"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSavingPriorityCredentials}>
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
      </div>
    </div>
  );
}
