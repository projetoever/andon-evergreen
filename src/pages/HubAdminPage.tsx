import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { WorkstationsSettingsTab } from "@/components/settings/WorkstationsSettingsTab";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createAndonApiClient } from "@/api/andonApiClient";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { isAdminAuthenticated, logoutAdmin } from "@/services/adminAuthService";
import { updateHubEnabled } from "@/services/moduleService";

const api = createAndonApiClient();

/** Recovery entry remains outside operational providers and workstation/module gates. */
export function HubAdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [hubEnabled, setHubEnabled] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { refresh } = useModuleAccess();

  useEffect(() => {
    const check = () => setAuthenticated(isAdminAuthenticated());
    check();
    window.addEventListener("andon:admin-session-expired", check);
    const timer = window.setInterval(check, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("andon:admin-session-expired", check);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    void api
      .get<{ hubEnabled: boolean }>("/api/modules/settings")
      .then((settings) => {
        if (!disposed) {
          setHubEnabled(settings.hubEnabled);
          setSettingsError(null);
        }
      })
      .catch((error) => {
        if (!disposed)
          setSettingsError(
            error instanceof Error ? error.message : "Falha ao carregar configuração do Hub.",
          );
      });
    return () => {
      disposed = true;
    };
  }, [authenticated]);

  async function changeHubEnabled(enabled: boolean) {
    setSaving(true);
    try {
      const saved = await updateHubEnabled(enabled);
      setHubEnabled(saved.hubEnabled);
      await refresh();
      toast.success(
        enabled
          ? "Navegação do Hub ativada."
          : "Navegação do Hub desativada. Permissões preservadas.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar configuração.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link to="/hub" aria-label="Voltar ao Hub">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                ANDON EVERGREEN
              </p>
              <h1 className="text-xl font-black">Administração do Hub</h1>
            </div>
          </div>
          {authenticated && (
            <Button
              variant="outline"
              onClick={() => {
                logoutAdmin();
                setAuthenticated(false);
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do Admin
            </Button>
          )}
        </header>
        {!authenticated ? (
          <section className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">Acesso administrativo</h2>
            <p className="text-sm text-muted-foreground">
              Entre com a credencial administrativa existente para gerenciar estações e recuperar
              acessos.
            </p>
            <Button onClick={() => setLoginOpen(true)}>Entrar no Admin</Button>
          </section>
        ) : (
          <>
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-bold">Navegação central</h2>
              <p className="text-sm text-muted-foreground">
                Ative o botão Módulos nas telas. As rotas diretas e as permissões de acesso são
                preservadas ao desativar esta opção.
              </p>
              {settingsError && (
                <p role="alert" className="text-sm text-danger">
                  {settingsError}
                </p>
              )}
              <label className="flex items-center gap-3 text-sm font-bold">
                <Switch
                  checked={hubEnabled === true}
                  disabled={hubEnabled === null || saving}
                  onCheckedChange={(enabled) => void changeHubEnabled(enabled)}
                />
                Navegação do Hub ativa
              </label>
            </section>
            <WorkstationsSettingsTab />
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-bold">Responsabilidade de cada módulo</h2>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <p>
                  <strong className="text-primary">Hub</strong>
                  <br />
                  Estações, permissões e navegação entre módulos. Segurança administrativa central.
                </p>
                <p>
                  <strong className="text-primary">ANDON operacional</strong>
                  <br />
                  Chamados, atendimento, sons, máquinas, ativos, mantenedores, turnos e regras de
                  operação.
                </p>
                <p>
                  <strong className="text-primary">ANDON BI</strong>
                  <br />
                  Indicadores, filtros, análises, qualidade dos dados e relatórios.
                </p>
                <p>
                  <strong className="text-primary">Prioridades</strong>
                  <br />
                  Credencial própria e sequência visual de produção.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                As configurações administrativas existentes continuam disponíveis no ANDON durante
                esta transição.
              </p>
            </section>
          </>
        )}
        <AdminLoginModal
          open={loginOpen}
          onOpenChange={setLoginOpen}
          onSuccess={() => setAuthenticated(true)}
        />
      </div>
    </main>
  );
}
