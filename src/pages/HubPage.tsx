import { systemMessage, ui } from "@/i18n/translate";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutGrid, Settings } from "lucide-react";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { ModuleCards } from "@/components/layout/ModuleCards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { HubIdentityPanel } from "@/components/security/HubIdentityPanel";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { isAdminAuthenticated } from "@/services/adminAuthService";
import { getSystemSettings } from "@/services/systemSettingsService";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { getAdminAuthStatus, type AdminAuthStatus } from "@/services/adminAuthService";
import { InitialAdminSetup } from "@/components/security/InitialAdminSetup";

export function HubPage() {
  const { access, error, checking, refresh } = useModuleAccess();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [initialStatus, setInitialStatus] = useState<AdminAuthStatus | null>(null);
  const [initialStatusError, setInitialStatusError] = useState("");
  const [initialStatusPending, setInitialStatusPending] = useState(
    CONFIGURED_DATA_MODE === "api",
  );
  const refreshInitialStatus = async () => {
    if (CONFIGURED_DATA_MODE !== "api") return;
    setInitialStatusPending(true);
    try {
      setInitialStatus(await getAdminAuthStatus());
      setInitialStatusError("");
    } catch {
      setInitialStatusError(ui("Não foi possível verificar a configuração administrativa inicial."));
    } finally {
      setInitialStatusPending(false);
    }
  };
  useEffect(() => {
    void refreshInitialStatus();
  }, []);

  const [identity, setIdentity] = useState({ clientName: "", clientUnit: "" });
  useEffect(() => {
    let mounted = true;
    void getSystemSettings().then((settings) => {
      if (mounted) setIdentity({ clientName: settings.clientName, clientUnit: settings.clientUnit });
    }).catch(() => { /* Keep explicit default rather than inventing new values. */ });
    return () => { mounted = false; };
  }, []);
  const enterAdministration = () => {
    if (access?.centralAccessEnabled) {
      void navigate({ to: "/hub/admin" });
    } else if (isAdminAuthenticated()) {
      void navigate({ to: "/hub/admin" });
    } else {
      setAdminLoginOpen(true);
    }
  };
  if (CONFIGURED_DATA_MODE === "api") {
    if (initialStatusPending) return (
      <main className="min-h-dvh bg-background p-6 text-foreground" role="status">
        {ui("Verificando a configuração inicial do administrador...")}
      </main>
    );
    if (initialStatusError || !initialStatus) return (
      <main className="min-h-dvh bg-background p-6 text-foreground">
        <div role="alert">{initialStatusError || ui("Configuração inicial indisponível.")}</div>
        <Button className="mt-4" onClick={() => void refreshInitialStatus()}>
          {ui("Tentar novamente")}
        </Button>
      </main>
    );
    if (!initialStatus.passwordConfigured) return (
      <InitialAdminSetup status={initialStatus} onComplete={refreshInitialStatus} />
    );
  }
  return (
    <main className="andon-screen-enter min-h-dvh bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              <LayoutGrid className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {ui("ANDON WEB INDUSTRIAL")}
              </p>
              <h1 className="text-2xl font-black">{ui("HUB")}</h1>
              {identity.clientName && <p className="text-xs text-muted-foreground">{identity.clientName}{identity.clientUnit ? ` · ${identity.clientUnit}` : ""}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSelector />
            <Button variant="outline" onClick={enterAdministration}>
              <Settings className="mr-2 h-4 w-4" />
              {t("Administração do Hub")}
            </Button>
          </div>
        </header>
        <section className="space-y-3 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            {t("Central de módulos")}
          </p>
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {t("Selecione seu módulo de trabalho")}
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            {t("Operação, indicadores e prioridades em um só lugar.")}
          </p>
        </section>
        {checking && (
          <section
            role="status"
            aria-label={t("Carregando módulos e permissões...")}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              {t("Carregando módulos e permissões...")}
            </p>
            <div className="grid gap-4 md:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div key={index} className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-6">
                  <Skeleton className="h-12 w-12 rounded-xl motion-reduce:animate-none" />
                  <Skeleton className="h-6 w-3/4 motion-reduce:animate-none" />
                  <Skeleton className="h-4 w-full motion-reduce:animate-none" />
                  <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </section>
        )}
        {!checking && !access && (
          <div role={error ? "alert" : "status"} className="space-y-3 rounded-xl border border-border bg-card p-6">
            <p>{error ? systemMessage(error) : t("Nenhuma informação de acesso disponível.")}</p>
            <Button onClick={() => void refresh()}>{t("Verificar novamente")}</Button>
          </div>
        )}
        {!checking && access && (
          <>
            {!access.centralAccessEnabled && !access.workstation.active && (
              <p role="alert" className="text-danger">
                {t(
                  access.workstation.pendingApproval
                    ? "Workstation aguardando aprovação do administrador do Hub."
                    : "Solicite ao administrador a liberação desta workstation.",
                )}
              </p>
            )}
            {access.centralAccessEnabled &&
            (!access.workstation.active ||
              !access.principal ||
              access.principal.purpose !== "normal") ? (
              <HubIdentityPanel access={access} onChanged={refresh} />
            ) : (
              <ModuleCards />
            )}
            <footer className="flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
              <span>
                {t("Workstation")}: {access.workstation.name || access.workstation.id.slice(-8)}
              </span>
              <span>{t("Permissões administradas pelo Hub")}</span>
              {access.principal && (
                <span>
                  {t("Acesso")}: {access.principal.roleLabel} · {access.principal.displayName}
                </span>
              )}
            </footer>
          </>
        )}
        {!access?.centralAccessEnabled && <AdminLoginModal
          open={adminLoginOpen}
          onOpenChange={setAdminLoginOpen}
          onSuccess={() => { void navigate({ to: "/hub/admin" }); }}
        />}
      </div>
    </main>
  );
}
