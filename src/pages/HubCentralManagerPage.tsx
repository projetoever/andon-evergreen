import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Factory, LayoutGrid, LogOut, MonitorCog, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { HubBuildVersionCard } from "@/components/settings/HubBuildVersionCard";
import { accessRequest, type ManagedWorkstation } from "@/services/accessService";
import { getSystemSettings } from "@/services/systemSettingsService";
import type { SystemSettings } from "@/types/systemSettings";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { ui } from "@/i18n/translate";

/** Only read-side features live here. Never mount the central Admin editor. */
export function HubCentralManagerPage({
  section,
  displayName,
}: {
  section: string;
  displayName: string;
}) {
  const navigate = useNavigate();
  const { refresh: refreshModules } = useModuleAccess();
  const [stations, setStations] = useState<ManagedWorkstation[] | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(false);
    try {
      // These endpoints are each checked against a central session, workstation
      // and explicit read permission by the backend. No credentials are persisted.
      const [workstations, operational] = await Promise.all([
        accessRequest<ManagedWorkstation[]>("/workstations"),
        getSystemSettings(),
      ]);
      setStations(workstations);
      setSettings(operational);
    } catch {
      setStations(null);
      setSettings(null);
      setLoadError(true);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const availableSections = [
    { id: "overview", name: ui("Visão geral"), icon: LayoutGrid },
    { id: "workstations", name: ui("Workstations"), icon: MonitorCog },
    { id: "andon", name: ui("Configurações do ANDON"), icon: Factory },
  ] as const;

  // A direct URL to users, security or any future Admin-only section never
  // renders its content under a manager session.
  if (!availableSections.some((item) => item.id === section)) {
    return (
      <main className="min-h-dvh bg-background p-6">
        <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-bold">{ui("Acesso administrativo restrito")}</h1>
          <p className="text-sm text-muted-foreground">{ui("Esta seção exige a conta Admin principal.")}</p>
          <Button asChild variant="outline"><Link to="/hub/admin" search={{ section: "overview" }}>{ui("Voltar à visão geral")}</Link></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="andon-screen-enter min-h-dvh bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link to="/hub" aria-label={ui("Voltar ao Hub")}><ArrowLeft className="h-4 w-4"/></Link>
            </Button>
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-black">{ui("Painel do gerente")}</h1>
              <p className="text-xs text-muted-foreground">{ui("Sessão central")}: {displayName}</p>
            </div>
          </div>
          <LanguageSelector compact />
          <Button variant="outline" onClick={() => {
            void (async () => {
              setLogoutError(false);
              try {
                await accessRequest("/logout", "POST", {});
                await refreshModules();
                void navigate({ to: "/hub", replace: true });
              } catch {
                // Stay on the page; failed revocation is not a successful logout.
                setLogoutError(true);
              }
            })();
          }}>
            <LogOut className="mr-2 h-4 w-4" />{ui("Sair desta sessão")}
          </Button>
        </header>
        <nav aria-label={ui("Seções administrativas do Hub")}
          className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2 md:grid-cols-3">
          {availableSections.map((item) => {
            const Icon = item.icon;
            return <Button key={item.id} asChild
              variant={section === item.id ? "default" : "ghost"}
              className="h-auto min-h-11 whitespace-normal px-2 py-2 text-center">
              <Link to="/hub/admin" search={{ section: item.id }}
                aria-current={section === item.id ? "page" : undefined}>
                <Icon className="mr-2 h-4 w-4 shrink-0" />{item.name}
              </Link>
            </Button>;
          })}
        </nav>
        {logoutError && <div role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">
          {ui("Não foi possível encerrar a sessão. Tente novamente.")}
        </div>}
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          {ui("Acesso gerencial somente leitura nesta etapa. Usuários, credenciais, aprovações e alterações globais exigem Admin principal.")}
        </div>
        {loadError && <div role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">
          {ui("Não foi possível consultar as informações gerenciais. Verifique a permissão e a workstation.")}
        </div>}
        {section === "overview" && (
          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-4 md:p-5">
              <h2 className="text-lg font-bold">{ui("Resumo gerencial")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {ui("Último contato não comprova presença online.")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                {([
                  [ui("Registradas"), stations?.length],
                  [ui("Aguardando aprovação"), stations?.filter(s => s.pendingApproval).length],
                  [ui("Bloqueadas"), stations?.filter(s => !s.active && !s.pendingApproval).length],
                ] as const).map(([name, value]) =>
                  <div key={name} className="rounded-lg border border-border p-3">
                    <p className="text-2xl font-black tabular-nums">{value ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{name}</p>
                  </div>)}
              </div>
              <Button className="mt-3" variant="outline" size="sm" onClick={() => void refresh()}>
                {ui("Atualizar resumo")}
              </Button>
            </section>
            <HubBuildVersionCard />
          </div>
        )}
        {section === "workstations" && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-lg font-bold">{ui("Workstations — consulta")}</h2>
            <p className="text-sm text-muted-foreground">{ui("A estação é considerada ativa se aprovada; o horário é o último contato registrado, não o estado online.")}</p>
            {stations?.map((station) =>
              <div key={station.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{station.name ?? ui("Workstation não identificada")}</p>
                  <p className="text-xs text-muted-foreground">{station.id.slice(-8)} · {station.lastIpAddress ?? "—"}</p>
                  <p className="text-xs">{ui("Usuário atual")}: {station.authenticatedAccount?.displayName ?? ui("Nenhuma sessão válida")}</p>
                  <p className="text-xs text-muted-foreground">{ui("Último contato")}: {station.lastSeenAt ? new Date(station.lastSeenAt).toLocaleString() : "—"}</p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs">
                  {station.pendingApproval ? ui("Aguardando aprovação") : station.active ? ui("Ativa") : ui("Bloqueada")}
                </span>
              </div>,
            )}
            {stations?.length === 0 && <p role="status">{ui("Nenhuma workstation cadastrada.")}</p>}
            <Button variant="outline" size="sm" onClick={() => void refresh()}>{ui("Atualizar")}</Button>
          </section>
        )}
        {section === "andon" && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-lg font-bold">{ui("Configurações operacionais — consulta")}</h2>
            <p className="text-sm text-muted-foreground">{ui("As alterações estarão disponíveis após migração das autorizações individuais no servidor.")}</p>
            {settings && <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">{ui("Teclado virtual")}</dt><dd>{settings.virtualKeyboardEnabled ? ui("Habilitado") : ui("Inativo")}</dd></div>
              <div><dt className="text-muted-foreground">{ui("OS obrigatória na abertura")}</dt><dd>{settings.requireWorkOrderAtOpen ? ui("Sim") : ui("Não")}</dd></div>
              <div><dt className="text-muted-foreground">{ui("Restrição de conclusão por estação")}</dt><dd>{settings.restrictMaintenanceCompletionToAttendanceWorkstation ? ui("Ativa") : ui("Inativa")}</dd></div>
              <div><dt className="text-muted-foreground">{ui("Ordem das máquinas")}</dt><dd>{settings.dashboardMachineOrderMode === "priority" ? ui("Prioridade") : ui("Padrão")}</dd></div>
            </dl>}
          </section>
        )}
      </div>
    </main>
  );
}
