import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Factory, LayoutGrid, LogOut, MonitorCog, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HubBuildVersionCard } from "@/components/settings/HubBuildVersionCard";
import { UsersAccessSettings } from "@/components/settings/UsersAccessSettings";
import { WorkstationsSettingsTab } from "@/components/settings/WorkstationsSettingsTab";
import { GeneralSettingsTab } from "@/components/settings/GeneralSettingsTab";
import { AppearanceSettingsPreview } from "@/components/settings/AppearanceSettingsPreview";
import { AttendanceModeSettingsTab } from "@/components/settings/AttendanceModeSettingsTab";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { accessRequest, type AccessState, type ManagedWorkstation } from "@/services/accessService";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { ui } from "@/i18n/translate";

function CentralOverview() {
  const [stations, setStations] = useState<ManagedWorkstation[] | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setStations(await accessRequest<ManagedWorkstation[]>("/workstations"));
      setError(false);
    } catch {
      setStations(null);
      setError(true);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-lg font-bold">{ui("Resumo administrativo")}</h2>
        <p className="text-sm text-muted-foreground">
          {ui("Estatísticas consultadas pela sessão central. Último contato não comprova presença online.")}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {([
            [ui("Registradas"), stations?.length],
            [ui("Aguardando aprovação"), stations?.filter(s => s.pendingApproval).length],
            [ui("Bloqueadas"), stations?.filter(s => !s.active && !s.pendingApproval).length],
          ] as const).map(([label, value]) => (
            <div className="rounded-xl border border-border p-3" key={label}>
              <p className="text-2xl font-black tabular-nums">{value ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-danger">
          {ui("Não foi possível consultar as workstations.")}
        </p>}
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          {ui("Atualizar resumo")}
        </Button>
      </section>
      <HubBuildVersionCard />
    </div>
  );
}

/**
 * Central Admin is authenticated against /api/access/session (server-owned
 * HttpOnly cookie). Never infer privilege from role labels or local storage.
 * The legacy sensitive tabs remain unavailable until their own migrations.
 */
export function HubCentralAdminPage() {
  const { section: requestedSection } = useSearch({ from: "/hub/admin" });
  const section = requestedSection ?? "overview";
  const navigate = useNavigate();
  const { access, refresh: refreshModules } = useModuleAccess();
  const [session, setSession] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setSession(await accessRequest<AccessState>("/session")); }
    catch { setSession(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const primaryAdmin = session?.principal?.purpose === "normal" &&
    session.principal.isPrimaryAdmin === true;
  if (loading)
    return <main className="min-h-dvh bg-background" aria-label={ui("Verificando sessão administrativa")} />;
  // Installation bootstrap is the ONE exception to the central Admin gate.
  // Server /api/access/initialize still requires approved workstation, HTTPS,
  // CSRF, the existing legacy Admin secret, and an uninitialized DB.
  // Do not mount overview, workstations or operational settings before login.
  if (session && !session.initialized) {
    if (!access?.workstation.active || access.workstation.pendingApproval)
      return (
        <main className="min-h-dvh bg-background p-6">
          <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
            <h1 className="text-lg font-bold">{ui("Workstation ainda não aprovada")}</h1>
            <p>{ui("A configuração inicial do Admin principal exige uma workstation ativa e aprovada.")}</p>
            <Button asChild variant="outline"><Link to="/hub">{ui("Voltar ao Hub")}</Link></Button>
          </div>
        </main>
      );
    return (
      <main className="min-h-dvh bg-background p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 md:p-6">
            <h1 className="text-xl font-bold">{ui("Primeiro acesso — Admin principal")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {ui("Crie a conta central com a senha Admin global existente. As configurações e os módulos permanecem bloqueados até autenticar a conta principal.")}
            </p>
          </div>
          <UsersAccessSettings onSessionInitialized={async () => {
            await refresh();
            await refreshModules();
          }} />
          <Button asChild variant="outline"><Link to="/hub">{ui("Voltar ao Hub")}</Link></Button>
        </div>
      </main>
    );
  }
  if (!primaryAdmin)
    return (
      <main className="min-h-dvh bg-background p-6">
        <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-bold">{ui("Acesso administrativo restrito")}</h1>
          <p className="text-sm text-muted-foreground">
            {ui("Identifique-se no Hub com uma conta Admin principal autorizada. A senha legada não libera a administração central.")}
          </p>
          <Button asChild variant="outline"><Link to="/hub">{ui("Voltar ao Hub")}</Link></Button>
        </div>
      </main>
    );

  const sections = [
    { id: "overview", name: ui("Visão geral"), icon: LayoutGrid },
    { id: "users", name: ui("Usuários e Acessos"), icon: ShieldCheck },
    { id: "workstations", name: ui("Workstations"), icon: MonitorCog },
    { id: "andon", name: ui("Configurações do ANDON"), icon: Factory },
  ] as const;
  return (
    <main className="andon-screen-enter min-h-dvh bg-background p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link to="/hub" aria-label={ui("Voltar ao Hub")}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-black">{ui("Administração do Hub")}</h1>
              <p className="text-xs text-muted-foreground">
                {ui("Sessão central")}: {session?.principal?.displayName}
              </p>
            </div>
          </div>
          <LanguageSelector compact />
          <Button variant="outline" onClick={() => {
            void (async () => {
              try { await accessRequest("/logout", "POST", {}); }
              finally {
                setSession(null);
                await refreshModules();
                void navigate({ to: "/hub", replace: true });
              }
            })();
          }}>
            <LogOut className="mr-2 h-4 w-4" />{ui("Sair desta sessão")}
          </Button>
        </header>
        <nav aria-label={ui("Seções administrativas do Hub")}
          className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2 md:grid-cols-4">
          {sections.map(item => {
            const Icon = item.icon;
            return <Button asChild key={item.id}
              variant={section === item.id ? "default" : "ghost"}
              className="h-auto min-h-11 whitespace-normal px-2 py-2 text-center">
              <Link to="/hub/admin" search={{ section: item.id }}
                aria-current={section === item.id ? "page" : undefined}>
                <Icon className="mr-2 h-4 w-4 shrink-0" />{item.name}
              </Link>
            </Button>;
          })}
        </nav>
        {section === "overview" && <CentralOverview />}
        {section === "users" && <UsersAccessSettings />}
        {section === "workstations" && <WorkstationsSettingsTab />}
        {section === "andon" && (
          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-4 md:p-5">
              <h2 className="text-lg font-bold">{ui("Configurações operacionais do ANDON")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {ui("Estas regras são globais e exigem uma sessão de Admin principal. Sons, cadastros e credenciais mantêm controles separados.")}
              </p>
            </section>
            <GeneralSettingsTab />
            <AppearanceSettingsPreview allowGlobalSave />
            <section className="rounded-xl border border-border bg-card p-4 md:p-5">
              <AttendanceModeSettingsTab />
            </section>
          </div>
        )}
        {!["overview","users","workstations","andon"].includes(section) && (
          <div role="status" className="rounded-xl border border-border bg-card p-5">
            {ui("Configuração indisponível na administração central enquanto as operações sensíveis não estiverem migradas.")}
          </div>
        )}
      </div>
    </main>
  );
}
