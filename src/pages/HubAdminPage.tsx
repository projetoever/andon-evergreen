import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  KeyRound,
  LayoutGrid,
  KeySquare,
  LogOut,
  MonitorCog,
  ShieldCheck,
} from "lucide-react";
import { AdminLoginModal } from "@/components/settings/AdminLoginModal";
import { HubSecuritySettings } from "@/components/settings/HubSecuritySettings";
import { ModuleCredentialSettings } from "@/components/settings/ModuleCredentialSettings";
import { PlatformAdminLinks } from "@/components/settings/PlatformAdminLinks";
import { PriorityAccessSettings } from "@/components/settings/PriorityAccessSettings";
import { WorkstationsSettingsTab } from "@/components/settings/WorkstationsSettingsTab";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated, logoutAdmin } from "@/services/adminAuthService";
import { getHubSettings } from "@/services/moduleService";

const sections = [
  {
    id: "overview",
    get label() {
      return ui("Visão geral");
    },
    icon: LayoutGrid,
  },
  {
    id: "workstations",
    get label() {
      return ui("Estações e acessos");
    },
    icon: MonitorCog,
  },
  {
    id: "security",
    get label() {
      return ui("Segurança");
    },
    icon: KeyRound,
  },
  {
    id: "modules",
    get label() {
      return ui("Módulos e senhas");
    },
    icon: KeySquare,
  },
] as const;

/** Recovery entry remains outside operational providers and workstation/module gates. */
export function HubAdminPage() {
  useInterfaceLanguage();
  const { section: requestedSection } = useSearch({ from: "/hub/admin" });
  const section = requestedSection ?? "overview";
  const [authenticated, setAuthenticated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

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
    void getHubSettings()
      .then(() => {
        if (!disposed) {
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

  return (
    <main className="min-h-dvh bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link to="/hub" aria-label={ui("Voltar ao Hub")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {ui("ANDON EVERGREEN")}
              </p>
              <h1 className="text-xl font-black">{ui("Administração do Hub")}</h1>
            </div>
          </div>
          <LanguageSelector compact />
          {authenticated && (
            <Button
              variant="outline"
              onClick={() => {
                logoutAdmin();
                setAuthenticated(false);
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {ui("Sair do Admin")}
            </Button>
          )}
        </header>
        {!authenticated ? (
          <section className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">{ui("Acesso administrativo")}</h2>
            <p className="text-sm text-muted-foreground">
              {ui(
                "Entre com a credencial administrativa existente para gerenciar estações e recuperar acessos.",
              )}
            </p>
            <Button onClick={() => setLoginOpen(true)}>{ui("Entrar no Admin")}</Button>
          </section>
        ) : (
          <>
            <nav
              aria-label={ui("Seções administrativas do Hub")}
              className="grid grid-cols-2 gap-2 md:grid-cols-4"
            >
              {sections.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={section === item.id ? "default" : "outline"}
                    className="h-auto min-h-11 whitespace-normal py-3"
                    asChild
                  >
                    <Link
                      to="/hub/admin"
                      search={{ section: item.id }}
                      aria-current={section === item.id ? "page" : undefined}
                    >
                      <Icon className="mr-2 h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}
            </nav>
            {section === "overview" && (
              <div className="space-y-6">
                <section className="space-y-3 rounded-xl border border-border bg-card p-5">
                  <h2 className="text-lg font-bold">{ui("Entrada central da plataforma")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {ui(
                      "O endereço inicial abre o Hub. Cada workstation visualiza somente os módulos autorizados; a exigência de senha é configurada por módulo.",
                    )}
                  </p>
                  {settingsError && (
                    <p role="alert" className="text-sm text-danger">
                      {systemMessage(settingsError)}
                    </p>
                  )}
                </section>
                <PlatformAdminLinks />
                <section className="space-y-3 rounded-xl border border-border bg-card p-5">
                  <h2 className="text-lg font-bold">{ui("Responsabilidade de cada módulo")}</h2>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <p>
                      <strong className="text-primary">Hub</strong>
                      <br />
                      {ui(
                        "Estações, permissões e navegação entre módulos. Segurança administrativa central.",
                      )}
                    </p>
                    <p>
                      <strong className="text-primary">{ui("ANDON operacional")}</strong>
                      <br />
                      {ui(
                        "Chamados, atendimento, sons, máquinas, ativos, mantenedores, turnos e regras de operação.",
                      )}
                    </p>
                    <p>
                      <strong className="text-primary">ANDON BI</strong>
                      <br />
                      {ui("Indicadores, filtros, análises, qualidade dos dados e relatórios.")}
                    </p>
                    <p>
                      <strong className="text-primary">{ui("Prioridades")}</strong>
                      <br />
                      {ui("Credencial própria e sequência visual de produção.")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ui(
                      "O Admin do ANDON concentra cadastros e regras operacionais. Credenciais, estações e permissões são administradas no Hub.",
                    )}
                  </p>
                </section>
              </div>
            )}
            {section === "workstations" && <WorkstationsSettingsTab />}
            {section === "security" && <HubSecuritySettings />}
            {section === "modules" && <ModuleCredentialSettings />}
            {section === "priorities" && <PriorityAccessSettings />}
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
