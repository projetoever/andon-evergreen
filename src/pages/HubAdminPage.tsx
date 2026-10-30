import { UsersAccessSettings } from "@/components/settings/UsersAccessSettings";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
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
  const section = requestedSection === "andon" ? "overview" : requestedSection ?? "overview";
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
    <main className="andon-screen-enter min-h-dvh bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 md:p-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link to="/hub" aria-label={ui("Voltar ao Hub")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {ui("ANDON WEB INDUSTRIAL")}
              </p>
              <h1 className="text-xl font-black">{ui("Administração do Hub")}</h1>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {authenticated && (
              <Badge variant="outline">
                <span className="sm:hidden">{ui("Admin legado")}</span>
                <span className="hidden sm:inline">{ui("Sessão Admin legado ativa")}</span>
              </Badge>
            )}
            <LanguageSelector compact />
            {authenticated && (
              <Button
                variant="outline"
                onClick={() => {
                  logoutAdmin();
                  setAuthenticated(false);
                  setLoginOpen(false);
                  void navigate({ to: "/hub", replace: true });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {ui("Sair do Admin")}
              </Button>
            )}
          </div>
        </header>
        <nav
          aria-label={ui("Seções administrativas do Hub")}
          className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={section === item.id ? "default" : "ghost"}
                className="h-auto min-h-11 whitespace-normal px-3 py-2 text-center"
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
        <div key={section} className="andon-panel-enter min-w-0">
          {section === "users" ? (
            <UsersAccessSettings />
          ) : section === "workstations" ? (
            <WorkstationsSettingsTab />
          ) : (
            <>
              {section === "overview" && <HubAdminOverview />}
              {section === "security" && <HubSecuritySettings />}
              {section === "modules" && <ModuleCredentialSettings />}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
