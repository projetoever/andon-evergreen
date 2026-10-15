import { useCallback, useEffect, useState } from "react";
import { ListOrdered, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getDashboardPriorityAccessStatus } from "@/services/dashboardPriorityService";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";
import type { DashboardMachineOrderMode } from "@/types/systemSettings";

export function GeneralSettingsTab() {
  const [virtualKeyboardEnabled, setVirtualKeyboardEnabled] = useState(true);
  const [requireWorkOrderAtOpen, setRequireWorkOrderAtOpen] = useState(false);
  const [restrictMaintenanceCompletion, setRestrictMaintenanceCompletion] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [isSavingKeyboard, setIsSavingKeyboard] = useState(false);
  const [isSavingWorkOrder, setIsSavingWorkOrder] = useState(false);
  const [isSavingMaintenanceRestriction, setIsSavingMaintenanceRestriction] = useState(false);
  const [dashboardMachineOrderMode, setDashboardMachineOrderMode] =
    useState<DashboardMachineOrderMode>("default");
  const [isSavingDashboardOrderMode, setIsSavingDashboardOrderMode] = useState(false);
  const [priorityConfigured, setPriorityConfigured] = useState(false);
  const [isLoadingPriorityAccess, setIsLoadingPriorityAccess] = useState(true);
  const [priorityAccessLoadError, setPriorityAccessLoadError] = useState<string | null>(null);

  const loadGeneralSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    setSettingsLoadError(null);

    try {
      const settings = await getSystemSettings();
      setVirtualKeyboardEnabled(settings.virtualKeyboardEnabled !== false);
      setRequireWorkOrderAtOpen(settings.requireWorkOrderAtOpen === true);
      setRestrictMaintenanceCompletion(
        settings.restrictMaintenanceCompletionToAttendanceWorkstation === true,
      );
      setDashboardMachineOrderMode(
        settings.dashboardMachineOrderMode === "priority" ? "priority" : "default",
      );
    } catch {
      const message = "Não foi possível carregar as configurações gerais.";
      setSettingsLoadError(message);
      toast.error(message);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const loadPriorityAccess = useCallback(async () => {
    setIsLoadingPriorityAccess(true);
    setPriorityAccessLoadError(null);

    try {
      const status = await getDashboardPriorityAccessStatus();
      setPriorityConfigured(status.configured || status.passwordRequired === false);
    } catch {
      const message = "Não foi possível carregar o acesso de prioridades.";
      setPriorityAccessLoadError(message);
      toast.error(message);
    } finally {
      setIsLoadingPriorityAccess(false);
    }
  }, []);

  useEffect(() => {
    void loadGeneralSettings();
    void loadPriorityAccess();
  }, [loadGeneralSettings, loadPriorityAccess]);

  async function handleDashboardOrderModeChange(mode: DashboardMachineOrderMode) {
    if (mode === dashboardMachineOrderMode || isSavingDashboardOrderMode || settingsLoadError) {
      return;
    }
    if (mode === "priority" && priorityAccessLoadError) {
      toast.error("Não foi possível confirmar o acesso da gestão de prioridades.");
      return;
    }
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

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Configurações gerais</h3>
        <p className="text-sm text-muted-foreground">
          Regras de chamados, interface e preferências do Dashboard.
        </p>
      </div>

      {settingsLoadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
        >
          <div>
            <p className="font-black">Configurações globais indisponíveis</p>
            <p>{settingsLoadError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadGeneralSettings()}
            disabled={isLoadingSettings}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Operação global
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Regras e preferências globais aplicadas à operação do ANDON.
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
                disabled={isLoadingSettings || Boolean(settingsLoadError) || isSavingKeyboard}
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
                disabled={
                  isLoadingSettings || Boolean(settingsLoadError) || isSavingMaintenanceRestriction
                }
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
                disabled={isLoadingSettings || Boolean(settingsLoadError) || isSavingWorkOrder}
                onCheckedChange={(checked) => void handleWorkOrderRequirementChange(checked)}
              />
            </div>
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
                disabled={
                  isLoadingSettings || Boolean(settingsLoadError) || isSavingDashboardOrderMode
                }
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
                disabled={
                  isLoadingSettings || Boolean(settingsLoadError) || isSavingDashboardOrderMode
                }
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

              <p className="text-xs text-muted-foreground">
                O acesso ao módulo Prioridades é configurado na administração do Hub.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
