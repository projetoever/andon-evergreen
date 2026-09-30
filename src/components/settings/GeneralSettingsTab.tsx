import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Keyboard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ADMIN_PASSWORD_MIN_LENGTH, changeAdminPassword } from "@/services/adminAuthService";
import { getSystemSettings, updateSystemSettings } from "@/services/systemSettingsService";

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
                <p className="font-bold">Exigir OS na abertura do chamado</p>
                <p className="text-xs text-muted-foreground">
                  Quando ativa, o número da OS será obrigatório para abrir novos chamados.
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
      </div>
    </div>
  );
}
