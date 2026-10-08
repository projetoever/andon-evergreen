import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, ListOrdered, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  changeAdminPassword,
  generateAdminRecoveryCode,
} from "@/services/adminAuthService";
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
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [isSavingKeyboard, setIsSavingKeyboard] = useState(false);
  const [isSavingWorkOrder, setIsSavingWorkOrder] = useState(false);
  const [isSavingMaintenanceRestriction, setIsSavingMaintenanceRestriction] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingAdminPassword, setIsSavingAdminPassword] = useState(false);
  const [recoveryCurrentPassword, setRecoveryCurrentPassword] = useState("");
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState("");
  const [isGeneratingRecoveryCode, setIsGeneratingRecoveryCode] = useState(false);
  const [dashboardMachineOrderMode, setDashboardMachineOrderMode] =
    useState<DashboardMachineOrderMode>("default");
  const [isSavingDashboardOrderMode, setIsSavingDashboardOrderMode] = useState(false);
  const [priorityConfigured, setPriorityConfigured] = useState(false);
  const [isLoadingPriorityAccess, setIsLoadingPriorityAccess] = useState(true);
  const [priorityAccessLoadError, setPriorityAccessLoadError] = useState<string | null>(null);
  const [priorityUsername, setPriorityUsername] = useState("");
  const [priorityPassword, setPriorityPassword] = useState("");
  const [priorityPasswordConfirm, setPriorityPasswordConfirm] = useState("");
  const [isSavingPriorityCredentials, setIsSavingPriorityCredentials] = useState(false);

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
    void loadGeneralSettings();
    void loadPriorityAccess();
  }, [loadGeneralSettings, loadPriorityAccess]);

  async function handleDashboardOrderModeChange(mode: DashboardMachineOrderMode) {
    if (
      mode === dashboardMachineOrderMode ||
      isSavingDashboardOrderMode ||
      settingsLoadError
    ) {
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

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.trim() !== confirmPassword.trim()) {
      toast.error("A confirmação não confere com a nova senha.");
      return;
    }

    setIsSavingAdminPassword(true);
    try {
      const result = await changeAdminPassword(currentPassword, newPassword);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível alterar a senha administrativa.",
      );
    } finally {
      setIsSavingAdminPassword(false);
    }
  }

  async function handleGenerateRecoveryCode() {
    if (!recoveryCurrentPassword.trim()) {
      toast.error("Informe a senha administrativa atual para gerar o código de recuperação.");
      return;
    }

    setIsGeneratingRecoveryCode(true);
    try {
      const result = await generateAdminRecoveryCode(recoveryCurrentPassword);
      setGeneratedRecoveryCode(result.recoveryCode);
      setRecoveryCurrentPassword("");
      toast.success("Novo código de recuperação gerado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível gerar o código de recuperação.",
      );
    } finally {
      setIsGeneratingRecoveryCode(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Configurações gerais</h3>
        <p className="text-sm text-muted-foreground">
          Preferências globais da interface e credenciais administrativas.
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
                disabled={isLoadingSettings || Boolean(settingsLoadError) || isSavingMaintenanceRestriction}
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Senha administrativa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-3" onSubmit={handleChangePassword}>
              <p className="text-sm text-muted-foreground">
                Esta senha é salva no servidor e passa a valer para o Admin e desbloqueio em todas as máquinas.
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
                <Button type="submit" disabled={isSavingAdminPassword}>
                  {isSavingAdminPassword ? "Salvando..." : "Alterar senha global"}
                </Button>
              </div>
            </form>

            <div className="border-t border-border pt-4">
              <div className="space-y-1">
                <p className="font-black">Recuperação da senha do Admin</p>
                <p className="text-xs text-muted-foreground">
                  Gere um código de recuperação e guarde-o fora do ANDON. O código é exibido somente
                  nesta geração e fica armazenado no servidor apenas como hash.
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="admin-recovery-current-password">Senha administrativa atual</Label>
                  <Input
                    id="admin-recovery-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={recoveryCurrentPassword}
                    onChange={(event) => setRecoveryCurrentPassword(event.target.value)}
                    placeholder="Confirme a senha atual"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isGeneratingRecoveryCode}
                  onClick={() => void handleGenerateRecoveryCode()}
                >
                  {isGeneratingRecoveryCode ? "Gerando..." : "Gerar novo código"}
                </Button>
              </div>

              {generatedRecoveryCode && (
                <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-warning">
                    Guarde este código agora
                  </p>
                  <p className="mt-2 select-all font-mono text-xl font-black tracking-wider text-foreground">
                    {generatedRecoveryCode}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Em caso de esquecimento, use “Esqueci a senha” na tela de acesso administrativo.
                    Após uma recuperação, este código é invalidado e um novo deve ser gerado.
                  </p>
                </div>
              )}
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
                disabled={isLoadingSettings || Boolean(settingsLoadError) || isSavingDashboardOrderMode}
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
                disabled={isLoadingSettings || Boolean(settingsLoadError) || isSavingDashboardOrderMode}
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
                    Credencial independente salva no servidor e válida em todas as máquinas/workstations.
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
      </div>
    </div>
  );
}
