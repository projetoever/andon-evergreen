import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, FileDown, RefreshCw } from "lucide-react";

import { BiAnalyticsDrillDown } from "@/components/bi/BiAnalyticsDrillDown";
import { BiBadActorsPanel } from "@/components/bi/BiBadActorsPanel";
import { BiDataHealthPanel } from "@/components/bi/BiDataHealthPanel";
import { BiFailureWorkspace } from "@/components/bi/BiFailureWorkspace";
import { BiMaintenanceParticipation } from "@/components/bi/BiMaintenanceParticipation";
import { BiMachine360Overlay } from "@/components/bi/BiMachine360Overlay";
import { BiOverviewWorkspace } from "@/components/bi/BiOverviewWorkspace";
import { BiReliabilityStrip } from "@/components/bi/BiReliabilityStrip";
import {
  BiWorkspaceTabs,
  type BiWorkspaceTab,
} from "@/components/bi/BiWorkspaceTabs";
import { buildExecutiveReportHtml, openReportPrintDialog } from "@/services/andonBiPdfReport";
import {
  loadAnalyticsDrilldown,
  loadAndonBiFilterOptions,
  loadAssetReliability,
  loadExecutiveOverview,
  loadFailureIntelligence,
  loadMaintenanceParticipation,
  loadMachine360,
} from "@/services/andonBiService";
import type {
  AnalyticsAssetReliability,
  AnalyticsDrilldownResult,
  AnalyticsDrilldownSelection,
  AnalyticsFailureIntelligence,
  AnalyticsMaintenanceParticipation,
  AnalyticsMachine360,
  AnalyticsOverview,
  AndonBiFilterOptions,
  AndonBiFilters,
  AndonBiPeriodPreset,
} from "@/types/analytics";

const EMPTY_OPTIONS: AndonBiFilterOptions = {
  machines: [],
  sectors: [],
  classifications: [],
};

const DEFAULT_FILTERS: AndonBiFilters = {
  period: "7d",
  machineId: "",
  subtype: "",
  classification: "",
};

const PERIOD_LABELS: Record<AndonBiPeriodPreset, string> = {
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

export function AndonBiPage() {
  const [activeTab, setActiveTab] = useState<BiWorkspaceTab>("overview");
  const [filters, setFilters] = useState<AndonBiFilters>(DEFAULT_FILTERS);
  const [options, setOptions] = useState<AndonBiFilterOptions>(EMPTY_OPTIONS);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [maintenance, setMaintenance] =
    useState<AnalyticsMaintenanceParticipation | null>(null);
  const [assetReliability, setAssetReliability] =
    useState<AnalyticsAssetReliability | null>(null);
  const [failureIntelligence, setFailureIntelligence] =
    useState<AnalyticsFailureIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [reliabilityLoading, setReliabilityLoading] = useState(false);
  const [reliabilityError, setReliabilityError] = useState<string | null>(null);
  const [failureLoading, setFailureLoading] = useState(false);
  const [failureError, setFailureError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [drillSelection, setDrillSelection] =
    useState<AnalyticsDrilldownSelection | null>(null);
  const [drilldown, setDrilldown] = useState<AnalyticsDrilldownResult | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [machineSelection, setMachineSelection] =
    useState<{ id: string; name: string } | null>(null);
  const [machine360, setMachine360] = useState<AnalyticsMachine360 | null>(null);
  const [machine360Loading, setMachine360Loading] = useState(false);
  const [machine360Error, setMachine360Error] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);

    void loadAndonBiFilterOptions()
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Falha ao carregar filtros.",
          );
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadOverview = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setMaintenance(null);
    setMaintenanceError(null);
    setAssetReliability(null);
    setReliabilityError(null);
    setFailureIntelligence(null);
    setFailureError(null);

    void loadExecutiveOverview(filters)
      .then(async (result) => {
        if (!active) return;

        setOverview(result);
        setMaintenanceLoading(true);
        setReliabilityLoading(true);
        setFailureLoading(true);

        const [maintenanceResult, reliabilityResult, failureResult] = await Promise.allSettled([
          loadMaintenanceParticipation(filters, result.meta.period),
          loadAssetReliability(filters, result.meta.period),
          loadFailureIntelligence(filters, result.meta.period),
        ]);

        if (!active) return;

        if (maintenanceResult.status === "fulfilled") {
          setMaintenance(maintenanceResult.value);
        } else {
          setMaintenanceError(
            maintenanceResult.reason instanceof Error
              ? maintenanceResult.reason.message
              : "Falha ao carregar participação técnica.",
          );
        }

        if (reliabilityResult.status === "fulfilled") {
          setAssetReliability(reliabilityResult.value);
        } else {
          setReliabilityError(
            reliabilityResult.reason instanceof Error
              ? reliabilityResult.reason.message
              : "Falha ao carregar confiabilidade por ativo.",
          );
        }

        if (failureResult.status === "fulfilled") {
          setFailureIntelligence(failureResult.value);
        } else {
          setFailureError(
            failureResult.reason instanceof Error
              ? failureResult.reason.message
              : "Falha ao carregar reincidências.",
          );
        }

        setMaintenanceLoading(false);
        setReliabilityLoading(false);
        setFailureLoading(false);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Falha ao carregar indicadores do ANDON BI.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => loadOverview(), [loadOverview, refreshVersion]);

  useEffect(() => {
    setDrillSelection(null);
    setDrilldown(null);
    setDrillError(null);
    setMachineSelection(null);
    setMachine360(null);
    setMachine360Error(null);
  }, [filters, activeTab]);

  useEffect(() => {
    if (!drillSelection || !overview) return;

    let active = true;
    setDrillLoading(true);
    setDrillError(null);

    void loadAnalyticsDrilldown(filters, overview.meta.period, drillSelection)
      .then((result) => {
        if (active) setDrilldown(result);
      })
      .catch((loadError) => {
        if (active) {
          setDrillError(
            loadError instanceof Error
              ? loadError.message
              : "Falha ao carregar o detalhamento analítico.",
          );
        }
      })
      .finally(() => {
        if (active) setDrillLoading(false);
      });

    return () => {
      active = false;
    };
  }, [drillSelection, filters, overview]);

  useEffect(() => {
    if (!machineSelection || !overview) return;
    let active = true;
    setMachine360(null);
    setMachine360Loading(true);
    setMachine360Error(null);

    void loadMachine360(filters, overview.meta.period, machineSelection.id)
      .then((result) => {
        if (active) setMachine360(result);
      })
      .catch((loadError) => {
        if (active) {
          setMachine360Error(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar o Machine 360.",
          );
        }
      })
      .finally(() => {
        if (active) setMachine360Loading(false);
      });

    return () => {
      active = false;
    };
  }, [machineSelection, filters, overview]);

  const closeMachine360 = useCallback(() => {
    setMachineSelection(null);
    setMachine360(null);
    setMachine360Error(null);
  }, []);

  const classificationLabels = useMemo(
    () => new Map(options.classifications.map((item) => [item.value, item.label])),
    [options.classifications],
  );
  const sectorLabels = useMemo(
    () => new Map(options.sectors.map((item) => [item.id, item.displayName])),
    [options.sectors],
  );

  const dataQualityAttentionCount = useMemo(() => {
    const health = assetReliability?.dataHealth;
    if (!health) return 0;

    return (
      (health.activeCallsOver24h ?? 0) +
      health.openFailureEventsOver24h +
      (health.activeSessionsOver24h ?? 0) +
      health.finishedCallsMissingClassification
    );
  }, [assetReliability]);

  async function exportExecutivePdf() {
    if (reportLoading) return;
    setReportLoading(true);
    setReportError(null);
    try {
      // Re-fetch the authoritative period at click time. Never mix stale
      // overview cards with a new filter or a different reporting window.
      const reportOverview = await loadExecutiveOverview(filters);
      const [reportReliability, reportMaintenance, reportFailures] = await Promise.all([
        loadAssetReliability(filters, reportOverview.meta.period),
        loadMaintenanceParticipation(filters, reportOverview.meta.period),
        loadFailureIntelligence(filters, reportOverview.meta.period),
      ]);
      const reportHtml = buildExecutiveReportHtml({
        overview: reportOverview,
        reliability: reportReliability,
        maintenance: reportMaintenance,
        failures: reportFailures,
        filters,
        options,
      });
      openReportPrintDialog(reportHtml);
    } catch (reportFailure) {
      setReportError(
        reportFailure instanceof Error
          ? reportFailure.message
          : "Não foi possível preparar o relatório executivo.",
      );
    } finally {
      setReportLoading(false);
    }
  }

  const closeDrilldown = () => {
    setDrillSelection(null);
    setDrilldown(null);
    setDrillError(null);
  };

  // Modal keyboard behavior: Escape closes; focus returns to the control
  // that opened the detail, preserving fast keyboard navigation.
  useEffect(() => {
    if (!drillSelection) return;

    const previousFocus = document.activeElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setDrillSelection(null);
      setDrilldown(null);
      setDrillError(null);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [drillSelection]);

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col gap-3 px-4 py-3 md:px-6">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              Maintenance & Reliability Intelligence
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                ANDON BI
              </h1>
              <span className="hidden text-xs text-muted-foreground xl:inline">
                Gestão executiva · confiabilidade · manutenção
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {overview && (
              <span className="rounded-full border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                Atualizado{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: overview.meta.timeZone,
                }).format(new Date(overview.meta.generatedAt))}
              </span>
            )}
            <button
              type="button"
              onClick={() => void exportExecutivePdf()}
              disabled={reportLoading}
              title="Preparar relatório A4 e selecionar Salvar como PDF no navegador"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
            >
              <FileDown className="h-3.5 w-3.5" />
              {reportLoading ? "Preparando PDF…" : "Exportar PDF"}
            </button>
            <button
              type="button"
              onClick={() => setRefreshVersion((value) => value + 1)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-bold transition hover:bg-muted"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <Link
              to="/"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-bold transition hover:bg-muted"
            >
              ANDON operacional
            </Link>
          </div>
        </header>

        <section className="grid shrink-0 grid-cols-4 gap-3 rounded-xl border border-border bg-card p-3">
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Período
            <select
              value={filters.period}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  period: event.target.value as AndonBiPeriodPreset,
                }))
              }
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Máquina
            <select
              value={filters.machineId}
              disabled={optionsLoading}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  machineId: event.target.value,
                }))
              }
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Todas as máquinas</option>
              {options.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                  {machine.isActive === false ? " · inativa" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Setor
            <select
              value={filters.subtype}
              disabled={optionsLoading}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  subtype: event.target.value,
                }))
              }
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Todos os setores</option>
              {options.sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.displayName}
                  {sector.active === false ? " · inativo" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Classificação
            <select
              value={filters.classification}
              disabled={optionsLoading}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  classification: event.target.value,
                }))
              }
              className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Todas as classificações</option>
              {options.classifications.map((classification) => (
                <option key={classification.id} value={classification.value}>
                  {classification.label}
                  {classification.active === false ? " · inativa" : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        <BiWorkspaceTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          attentionCount={dataQualityAttentionCount}
        />

        {error && (
          <div className="shrink-0 rounded-lg border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </div>
        )}
        {reportError && (
          <div role="alert" className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Não foi possível exportar o PDF: {reportError}
          </div>
        )}

        <section className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "overview" && (
            <BiOverviewWorkspace
              overview={overview}
              loading={loading}
              period={filters.period}
              classificationLabels={classificationLabels}
              sectorLabels={sectorLabels}
              onDrilldown={setDrillSelection}
            />
          )}

          {activeTab === "reliability" && (
            <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
              {overview ? (
                <BiReliabilityStrip overview={overview} />
              ) : (
                <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/20" />
              )}
              <BiBadActorsPanel
                data={assetReliability}
                loading={reliabilityLoading}
                error={reliabilityError}
                classificationLabels={classificationLabels}
                onSelectMachine={(machineId, machineName) => {
                  setDrillSelection(null);
                  setMachineSelection({ id: machineId, name: machineName });
                }}
              />
            </div>
          )}

          {activeTab === "failures" && (
            <BiFailureWorkspace
              overview={overview}
              intelligence={failureIntelligence}
              intelligenceLoading={failureLoading}
              intelligenceError={failureError}
              classificationLabels={classificationLabels}
              sectorLabels={sectorLabels}
              onDrilldown={setDrillSelection}
            />
          )}

          {activeTab === "maintenance" && (
            <div className="h-full min-h-0 overflow-hidden">
              <BiMaintenanceParticipation
                data={maintenance}
                loading={maintenanceLoading}
                error={maintenanceError}
                areaLabels={sectorLabels}
              />
            </div>
          )}

          {activeTab === "data-quality" && (
            <BiDataHealthPanel
              data={assetReliability}
              loading={reliabilityLoading}
              error={reliabilityError}
            />
          )}
        </section>

        <footer className="flex shrink-0 items-center justify-between border-t border-border pt-2 text-[9px] uppercase tracking-wide text-muted-foreground">
          <span>
            PostgreSQL · testes de sistema excluídos · BI read-only
          </span>
          <span>
            {overview
              ? `Fórmula ${overview.meta.metricDefinitionVersion} · ${overview.coverage.finishedCallsWithClassification}/${overview.coverage.finishedCalls} concluídos classificados`
              : "Carregando definições analíticas"}
          </span>
        </footer>
      </div>

      {machineSelection && (
        <BiMachine360Overlay
          machineName={machineSelection.name}
          data={machine360}
          loading={machine360Loading}
          error={machine360Error}
          classificationLabels={classificationLabels}
          onClose={closeMachine360}
        />
      )}

      {drillSelection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhamento de ${drillSelection.label}`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDrilldown();
          }}
        >
          <div className="h-[min(760px,calc(100dvh-48px))] w-[min(1500px,calc(100vw-48px))]">
            <BiAnalyticsDrillDown
              selection={drillSelection}
              result={drilldown}
              loading={drillLoading}
              error={drillError}
              classificationLabels={classificationLabels}
              sectorLabels={sectorLabels}
              onClose={closeDrilldown}
            />
          </div>
        </div>
      )}
    </main>
  );
}
