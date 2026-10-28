import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Clock3, Monitor, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getHubSettings } from "@/services/moduleService";
import { listWorkstations } from "@/services/workstationService";
import type { Workstation } from "@/types/workstation";

const RECENT_HEARTBEAT_MS = 30 * 60 * 1000;

/**
 * Hub administrative overview is informational only. A recent heartbeat
 * means "seen in the past 30 min", NOT an open kiosk, live API connection,
 * active user session, or an authorized industrial service.
 */
export function HubAdminOverview() {
  useLanguage();
  const [workstations, setWorkstations] = useState<Workstation[] | null>(null);
  const [hubEnabled, setHubEnabled] = useState<boolean | null>(null);
  const [stationError, setStationError] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [observedAt, setObservedAt] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setStationError(null);
    setHubError(null);
    Promise.allSettled([getHubSettings(), listWorkstations()]).then(([hub, stations]) => {
      if (disposed) return;
      setHubEnabled(hub.status === "fulfilled" ? hub.value.hubEnabled : null);
      setHubError(hub.status === "rejected"
        ? (hub.reason instanceof Error ? hub.reason.message : ui("Não foi possível consultar o Hub."))
        : null);
      setWorkstations(stations.status === "fulfilled" ? stations.value : null);
      setStationError(stations.status === "rejected"
        ? (stations.reason instanceof Error ? stations.reason.message : ui("Não foi possível consultar as workstations."))
        : null);
      setObservedAt(Date.now());
      setLoading(false);
    });
    return () => { disposed = true; };
  }, [refreshKey]);

  const stats = useMemo(() => {
    if (!workstations || observedAt === null) return null;
    return {
      total: workstations.length,
      approved: workstations.filter((station) => station.active && !station.pendingApproval).length,
      pending: workstations.filter((station) => station.pendingApproval).length,
      blocked: workstations.filter((station) => !station.active && !station.pendingApproval).length,
      unnamed: workstations.filter((station) => !station.name?.trim()).length,
      seenRecently: workstations.filter((station) => {
        const lastSeen = Date.parse(station.lastSeenAt);
        return Number.isFinite(lastSeen) &&
          lastSeen <= observedAt && observedAt - lastSeen <= RECENT_HEARTBEAT_MS;
      }).length,
    };
  }, [workstations, observedAt]);

  const metrics = [
    { label: "Registradas", value: stats?.total, Icon: Monitor },
    { label: "Aguardando aprovação", value: stats?.pending, Icon: ShieldCheck },
    { label: "Bloqueadas", value: stats?.blocked, Icon: Users },
    { label: "Vistas nos últimos 30 min", value: stats?.seenRecently, Icon: Clock3 },
  ];

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{ui("Resumo administrativo")}</h2>
            <p className="text-sm text-muted-foreground">
              {ui("Situação consultada no servidor; não representa disponibilidade instantânea das máquinas.")}
            </p>
          </div>
          <Button type="button" variant="outline" disabled={loading} onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {ui(loading ? "Consultando..." : "Atualizar resumo")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ label, value, Icon }) => (
            <div key={label} className="min-w-0 rounded-xl border border-border p-3" role="group" aria-label={ui(label)}>
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-3 text-2xl font-black tabular-nums" aria-live="polite">
                {value ?? "—"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{ui(label)}</p>
            </div>
          ))}
        </div>

        {stationError && (
          <p role="alert" className="text-sm text-danger">
            {ui("Dados das workstations indisponíveis: {0}", { 0: systemMessage(stationError) })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {ui("“Vistas nos últimos 30 min” considera apenas o último registro no servidor. Não confirma que a tela ANDON ou o kiosk estejam abertos.")}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="flex items-center gap-2 font-bold">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            {ui("Estado de administração")}
          </h3>
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{ui("Entrada do Hub")}</dt>
              <dd className="font-semibold">{hubEnabled === null
                ? ui("Não verificada") : ui(hubEnabled ? "Ativa" : "Inativa")}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{ui("Sessão Admin legado")}</dt>
              <dd className="font-semibold">{ui("Autenticada neste navegador")}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{ui("Estações aprovadas")}</dt>
              <dd className="font-semibold tabular-nums">{stats?.approved ?? "—"}</dd>
            </div>
          </dl>
          {hubError && <p role="alert" className="text-sm text-danger">{systemMessage(hubError)}</p>}
          <p className="text-xs text-muted-foreground">
            {ui("A sessão do Admin legado não substitui o login central de colaboradores.")}
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4 md:p-5">
          <h3 className="font-bold">{ui("Atenção administrativa")}</h3>
          {stats === null ? (
            <p className="text-sm text-muted-foreground">{ui("Sem dados de workstations para avaliar pendências.")}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>{stats.pending > 0
                ? ui("{0} estação(ões) aguardando aprovação.", { 0: stats.pending })
                : ui("Não há workstations aguardando aprovação.")}</p>
              <p>{stats.unnamed > 0
                ? ui("{0} estação(ões) sem nome cadastrado.", { 0: stats.unnamed })
                : ui("Todas as workstations cadastradas possuem nome.")}</p>
              <p>{stats.blocked > 0
                ? ui("{0} estação(ões) bloqueadas; revise somente se necessário.", { 0: stats.blocked })
                : ui("Não há workstations bloqueadas.")}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="outline" size="sm">
              <Link to="/hub/admin" search={{ section: "workstations" }}>{ui("Gerenciar workstations")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/hub/admin" search={{ section: "users" }}>{ui("Gerenciar usuários")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/hub/admin" search={{ section: "security" }}>{ui("Ver segurança")}</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
