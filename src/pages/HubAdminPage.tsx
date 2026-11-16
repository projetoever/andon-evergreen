import { UsersAccessSettings } from "@/components/settings/UsersAccessSettings";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { AdminWorkspaceShell } from "@/components/settings/AdminWorkspaceShell";
import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
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
import { HubAdminOverview } from "@/components/settings/HubAdminOverview";
import { ModuleCredentialSettings } from "@/components/settings/ModuleCredentialSettings";
import { WorkstationsSettingsTab } from "@/components/settings/WorkstationsSettingsTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAdminAuthenticated, logoutAdmin } from "@/services/adminAuthService";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { HubCentralAdminPage } from "./HubCentralAdminPage";

const sections = [
  {
    id: "overview",
    get label() {
      return ui("Visão geral");
    },
    icon: LayoutGrid,
  },
  {
    id: "users",
    get label() {
      return ui("Usuários e Acessos");
    },
    icon: ShieldCheck,
  },
  {
    id: "workstations",
    get label() {
      return ui("Workstations");
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
  const section = String(requestedSection) === "andon" ? "overview" : requestedSection ?? "overview";
  const navigate = useNavigate();
  const { access, error: accessError, checking: checkingAccess } = useModuleAccess();
  // Match SSR and the first client render; reveal the page only after a session check.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const valid = isAdminAuthenticated();
      setAuthenticated(valid);
      setSessionChecked(true);
      setLoginOpen(!valid);
    };
    check();
    window.addEventListener("andon:admin-session-expired", check);
    const timer = window.setInterval(check, 30_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("andon:admin-session-expired", check);
    };
  }, []);

  // A direct URL never mounts administrative sections while unauthenticated.
  // Closing the sign-in dialog returns to Hub; success sets the validated state.
  useEffect(() => {
    if (!checkingAccess && !access?.centralAccessEnabled && sessionChecked && !authenticated && !loginOpen) {
      void navigate({ to: "/hub", replace: true });
    }
  }, [checkingAccess, access?.centralAccessEnabled, sessionChecked, authenticated, loginOpen, navigate]);

  if (checkingAccess) {
    return <main className="min-h-dvh bg-background" aria-label={ui("Acesso administrativo")} />;
  }
  // An unavailable policy server must never silently fall back to cached
  // legacy administration while central access may be active.
  if (accessError) {
    return <main className="min-h-dvh bg-background p-6" role="alert">
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-border bg-card p-6">
        <p>{ui("Não foi possível verificar as permissões administrativas.")}</p>
        <Button asChild variant="outline"><Link to="/hub">{ui("Voltar ao Hub")}</Link></Button>
      </div>
    </main>;
  }
  // Central administration never trusts legacy token/sessionStorage.
  // Its own page revalidates the HttpOnly central session on the server.
  if (access?.centralAccessEnabled) return <HubCentralAdminPage />;

  if (!sessionChecked) {
    return <main className="min-h-dvh bg-background" aria-label={ui("Acesso administrativo")} />;
  }

  if (!authenticated) {
    return (
      <main className="min-h-dvh bg-background" aria-label={ui("Acesso administrativo")}>
        <AdminLoginModal
          open={loginOpen}
          onOpenChange={setLoginOpen}
          onSuccess={() => setAuthenticated(true)}
        />
      </main>
    );
  }

  return (
    <AdminWorkspaceShell
      brand="HUB"
      title={ui("Administração do Hub")}
      ariaLabel={ui("Administração do Hub")}
      navLabel={ui("Seções administrativas do Hub")}
      subtitle={ui("Sessão Admin legado ativa")}
      items={sections.map(item => ({ id: item.id, label: item.label, icon: item.icon, group: "Sistema" }))}
      hubNavigation
      activeId={section}
      onSelect={() => undefined}
      onBack={() => void navigate({ to: "/hub" })}
      backLabel={ui("Voltar ao Hub")}
      headerActions={<>
        <Badge variant="outline">{ui("Admin legado")}</Badge>
        <LanguageSelector compact />
        <Button variant="outline" onClick={() => {
          logoutAdmin();
          setAuthenticated(false);
          setLoginOpen(false);
          void navigate({ to: "/hub", replace: true });
        }}>
          <LogOut className="mr-2 h-4 w-4" />{ui("Sair do Admin")}
        </Button>
      </>}
      alert={<section role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        {ui("Modo de administração legado ativo. O acesso central, as integrações API e a senha única só aparecem no ambiente HTTPS de homologação com gestão central habilitada. Não ative essas funções no servidor industrial sem homologação.")}
      </section>}
    >
      <div key={section} className="andon-panel-enter min-w-0">
        {section === "users" ? <UsersAccessSettings /> :
          section === "workstations" ? <WorkstationsSettingsTab /> : (
            <>
              {section === "overview" && <HubAdminOverview />}
              {section === "security" && <HubSecuritySettings />}
              {section === "modules" && <ModuleCredentialSettings />}
            </>
          )}
      </div>
    </AdminWorkspaceShell>
  );
}
