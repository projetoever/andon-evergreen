import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, LogOut, MonitorCog, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { AdminWorkspaceShell } from "@/components/settings/AdminWorkspaceShell";
import { HubBuildVersionCard } from "@/components/settings/HubBuildVersionCard";
import { HubRestrictedAccessRedirect } from "@/components/security/HubRestrictedAccessRedirect";
import { accessRequest, type ManagedWorkstation } from "@/services/accessService";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";

/** Only read-side features live here. Never mount the central Admin editor. */
export function HubCentralManagerPage({
  section,
  displayName,
 }: {
  section: string;
  displayName: string;
}) {
  useInterfaceLanguage();
  const navigate = useNavigate();
  const { refresh: refreshModules } = useModuleAccess();
  const [stations, setStations] = useState<ManagedWorkstation[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(false);
    try {
      // These endpoints are each checked against a central session, workstation
      // and explicit read permission by the backend. No credentials are persisted.
      const workstations = await accessRequest<ManagedWorkstation[]>("/workstations");
      setStations(workstations);
    } catch {
      setStations(null);
      setLoadError(true);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const availableSections = [
    { id: "overview", name: ui("Visão geral"), icon: LayoutGrid },
    { id: "workstations", name: ui("Workstations"), icon: MonitorCog },
  ] as const;

  // A direct URL to users, security or any future Admin-only section never
  // renders its content under a manager session.
  if (!availableSections.some((item) => item.id === section)) {
    return <HubRestrictedAccessRedirect
      destination="manager-overview"
      notice="Esta seção exige a conta Admin principal."
    />;
  }

  return (
    <AdminWorkspaceShell
      brand="HUB"
      title={ui("Painel do gerente")}
      ariaLabel={ui("Painel do gerente")}
      navLabel={ui("Seções administrativas do Hub")}
      subtitle={`${ui("Sessão central")}: ${displayName}`}
      items={availableSections.map(item => ({ id: item.id, label: item.name, icon: item.icon, group: "Sistema" }))}
      hubNavigation
      activeId={section}
      onSelect={() => undefined}
      onBack={() => void navigate({ to: "/hub" })}
      backLabel={ui("Voltar ao Hub")}
      headerActions={<>
        <LanguageSelector compact />
        <Button variant="outline" onClick={() => {
          void (async () => {
            setLogoutError(false);
            try {
              await accessRequest("/logout", "POST", {});
              await refreshModules();
              void navigate({ to: "/hub", replace: true });
            } catch {
              setLogoutError(true);
            }
          })();
        }}>
          <LogOut className="mr-2 h-4 w-4" />{ui("Sair desta sessão")}
        </Button>
      </>}
      alert={logoutError ? <div role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">
        {ui("Não foi possível encerrar a sessão. Tente novamente.")}
      </div> : null}
    >
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
                  <p className="text-xs text-muted-foreground">{ui("Último contato")}: {station.lastSeenAt ? new Date(station.lastSeenAt).toLocaleString(getInterfaceLocale()) : "—"}</p>
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

    </AdminWorkspaceShell>
  );
}