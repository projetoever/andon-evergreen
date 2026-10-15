import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "@/i18n/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  changeAdminPassword,
  generateAdminRecoveryCode,
} from "@/services/adminAuthService";

export function HubSecuritySettings() {
  useInterfaceLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingAdminPassword, setIsSavingAdminPassword] = useState(false);
  const [recoveryCurrentPassword, setRecoveryCurrentPassword] = useState("");
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState("");
  const [isGeneratingRecoveryCode, setIsGeneratingRecoveryCode] = useState(false);

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          {ui("Senha administrativa")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-3" onSubmit={handleChangePassword}>
          <p className="text-sm text-muted-foreground">
            {ui(
              "Esta senha é salva no servidor e passa a valer para o Admin e desbloqueio em todas as máquinas.",
            )}
          </p>
          <div className="space-y-1">
            <Label htmlFor="current-admin-password">{ui("Senha atual")}</Label>
            <Input
              id="current-admin-password"
              required
              maxLength={128}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder={ui("Senha atual")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-admin-password">{ui("Nova senha")}</Label>
              <Input
                id="new-admin-password"
                required
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={ui("Mínimo {0} caracteres", { 0: ADMIN_PASSWORD_MIN_LENGTH })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-admin-password">{ui("Confirmar senha")}</Label>
              <Input
                id="confirm-admin-password"
                required
                minLength={ADMIN_PASSWORD_MIN_LENGTH}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={ui("Repita a nova senha")}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSavingAdminPassword}>
              {isSavingAdminPassword ? ui("Salvando...") : ui("Alterar senha global")}
            </Button>
          </div>
        </form>

        <div className="border-t border-border pt-4">
          <div className="space-y-1">
            <p className="font-black">{ui("Recuperação da senha do Admin")}</p>
            <p className="text-xs text-muted-foreground">
              {ui(
                "Gere um código de recuperação e guarde-o fora do ANDON. O código é exibido somente nesta geração e fica armazenado no servidor apenas como hash.",
              )}
            </p>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="admin-recovery-current-password">
                {ui("Senha administrativa atual")}
              </Label>
              <Input
                id="admin-recovery-current-password"
                required
                maxLength={128}
                type="password"
                autoComplete="current-password"
                value={recoveryCurrentPassword}
                onChange={(event) => setRecoveryCurrentPassword(event.target.value)}
                placeholder={ui("Confirme a senha atual")}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isGeneratingRecoveryCode}
              onClick={() => void handleGenerateRecoveryCode()}
            >
              {isGeneratingRecoveryCode ? ui("Gerando...") : ui("Gerar novo código")}
            </Button>
          </div>

          {generatedRecoveryCode && (
            <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-warning">
                {ui("Guarde este código agora")}
              </p>
              <p className="mt-2 select-all font-mono text-xl font-black tracking-wider text-foreground">
                {generatedRecoveryCode}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {ui(
                  "Em caso de esquecimento, use “Esqueci a senha” na tela de acesso administrativo. Após uma recuperação, este código é invalidado e um novo deve ser gerado.",
                )}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
