import { AlertCircle, CalendarCheck2, CalendarX2, CircleHelp, Clock3, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriorityProductionBadge } from "./PriorityMachineBadges";
import { ui } from "@/i18n/translate";
import type { DashboardPriorityMachine } from "@/services/dashboardPriorityService";
import { formatDateTime } from "@/utils/dateTimeUtils";
import type { PrioritySectionId } from "./PrioritySectionNav";

interface Props {
  machines: DashboardPriorityMachine[];
  configuredHighlightCount: number;
  globalRankVisible: boolean;
  loading: boolean;
  error: string | null;
  lastOrderUpdatedAt: string | null;
  lastOrderUpdatedBy: string | null;
  onSectionChange: (section: PrioritySectionId) => void;
}

export function PriorityOverviewPanel({
  machines, configuredHighlightCount, globalRankVisible, loading, error,
  lastOrderUpdatedAt, lastOrderUpdatedBy, onSectionChange,
}: Props) {
  if (loading) return <p role="status" className="rounded-xl border border-border bg-card p-5">
    {ui("Carregando sequência...")}
  </p>;
  if (error) return <p role="alert" className="rounded-xl border border-danger/40 bg-card p-5 text-danger">
    {error}
  </p>;

  const active = machines.filter(machine => machine.isActive);
  const highlightedCount = Math.min(configuredHighlightCount, active.length);
  const highlighted = globalRankVisible ? active.slice(0, highlightedCount) : [];
  const next = globalRankVisible ? active.slice(highlightedCount, highlightedCount + 5) : [];
  const scheduled = active.filter(machine => machine.productionMode === "scheduled").length;
  const notScheduled = active.filter(machine => machine.productionMode === "not_scheduled").length;
  const unknown = active.filter(machine => machine.productionMode == null).length;
  const outsideInHighlights = highlighted.filter(machine => machine.productionMode === "not_scheduled");
  const unknownInHighlights = highlighted.filter(machine => machine.productionMode == null);
  const countLabel = globalRankVisible
    ? ui("Máquinas ativas na sequência") : ui("Máquinas ativas no seu escopo");
  const cards = [
    { label: countLabel, value: active.length, icon: ListOrdered, tone: "border-border" },
    { label: ui("Produção Programada"), value: scheduled, icon: CalendarCheck2, tone: "border-emerald-500/30" },
    { label: ui("Fora de Produção"), value: notScheduled, icon: CalendarX2, tone: "border-amber-500/40" },
    { label: ui("Programação desconhecida"), value: unknown, icon: CircleHelp, tone: "border-border" },
  ];
  return (
    <section className="space-y-3" aria-label={ui("Visão Geral")}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <h2 className="text-base font-black">{ui("Panorama de prioridades")}</h2>
          <p className="text-xs text-muted-foreground">
            {ui("Dados reais do cadastro e da programação; esta visão não representa chamados ou paradas em tempo real.")}
          </p>
        </div>
        <Button size="sm" type="button" variant="outline" onClick={() => onSectionChange("sequence")}>
          <ListOrdered className="mr-2 h-4 w-4" aria-hidden="true" />
          {ui("Gerenciar sequência")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({label, value, icon: Icon, tone}) => (
          <div key={label} className={`rounded-xl border bg-card p-4 ${tone}`}>
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {globalRankVisible ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{ui("Cobertura das prioridades")}</h3>
              <span className="font-mono text-lg font-black tabular-nums text-primary">
                {highlightedCount}/{active.length}
              </span>
            </div>
            <div role="progressbar" aria-label={ui("Cobertura das prioridades")} aria-valuemin={0}
              aria-valuemax={Math.max(1,active.length)} aria-valuenow={highlightedCount}
              className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]"
                style={{width: active.length ? `${(highlightedCount / active.length) * 100}%` : "0%"}} />
            </div>
            <p className="text-xs text-muted-foreground">
              {ui("{0} máquinas destacadas e {1} ativas sem destaque. A ordem é global e os filtros não mudam os rankings.", {
                0: highlightedCount, 1: Math.max(0, active.length - highlightedCount),
              })}
            </p>
            {active.length === 0 && <p role="status" className="text-sm text-muted-foreground">
              {ui("Nenhuma máquina ativa na sequência.")}
            </p>}
            {highlighted.length > 0 && <ol className="grid gap-2 sm:grid-cols-2">
              {highlighted.slice(0, 12).map((machine, index) => (
                <li key={machine.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background p-2 text-sm">
                  <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-black text-primary">P{index+1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold" title={machine.name}>{machine.name}</p>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">{machine.id}</p>
                  </div>
                  <PriorityProductionBadge mode={machine.productionMode} />
                </li>
              ))}
            </ol>}
            {highlighted.length > 12 && <p className="text-xs text-muted-foreground">
              {ui("Mais {0} prioridades disponíveis na sequência.", { 0: highlighted.length - 12 })}
            </p>}
          </div>
          <div className="space-y-3">
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 font-bold">
                <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true"/>
                {ui("Atenções de programação")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {ui("{0} prioritárias fora da produção e {1} sem estado conhecido.", {
                  0: outsideInHighlights.length, 1: unknownInHighlights.length,
                })}
              </p>
              {outsideInHighlights.length === 0 && unknownInHighlights.length === 0
                ? <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300">
                    {ui("Nenhuma divergência de programação nas máquinas destacadas.")}
                  </p>
                : <p className="mt-2 text-xs text-muted-foreground">
                    {ui("Destaque de prioridade e programação são independentes. Verifique as situações antes de tomar decisões operacionais.")}
                  </p>}
              <Button className="mt-3" size="sm" variant="outline" type="button"
                onClick={() => onSectionChange("sequence")}>
                {ui("Ver programação por máquina")}
              </Button>
            </section>
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-bold">{ui("Próximas na sequência")}</h3>
              {next.length ? (
                <ol className="mt-2 space-y-2">
                  {next.map((machine, index) => (
                    <li key={machine.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-xs">
                      <span className="shrink-0 font-mono text-muted-foreground">#{highlightedCount + index + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold" title={machine.name}>{machine.name}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-muted-foreground">
                {ui("Não há máquinas ativas fora da faixa de destaque.")}
              </p>}
            </section>
          </div>
        </div>
      ) : <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        {ui("Seu acesso é limitado a determinadas máquinas. O ranking global não é exibido para evitar posições incompletas.")}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          {globalRankVisible && lastOrderUpdatedAt
            ? ui("Última atualização: {0}{1}", {0:formatDateTime(lastOrderUpdatedAt),
                1:lastOrderUpdatedBy ? ` · ${lastOrderUpdatedBy}` : ""})
            : ui("Última alteração global não disponível para este acesso.")}
        </span>
        <Button size="sm" type="button" variant="outline" onClick={() => onSectionChange("history")}>
          {ui("Consultar auditoria de prioridades")}
        </Button>
      </div>
    </section>
  );
}
