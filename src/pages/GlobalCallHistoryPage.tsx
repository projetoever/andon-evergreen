import { ui, systemMessage, getInterfaceLocale } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { Link, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft, CalendarDays, ChevronDown, CircleHelp, Clock3, FileSpreadsheet, Filter, History, Lock, RefreshCw,
  Search, SlidersHorizontal, Wrench,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import {
  DEFAULT_GLOBAL_HISTORY_SEARCH_FILTERS,
  getGlobalHistoryCallDetail,
  getGlobalHistorySummary,
  getAuditedGlobalHistoryExport,
  globalHistorySearchPath,
  listAuthorizedHistoryMachines,
  listGlobalHistoryCategoryOptions,
  listGlobalHistoryClassificationOptions,
  searchGlobalHistory,
  type AuthorizedHistoryMachine,
  type GlobalHistoryCategoryOption,
  type GlobalHistoryClassificationOption,
  type GlobalHistoryCallSummary,
  type GlobalHistoryCallDetail,
  type GlobalHistorySearchFilters,
  type GlobalHistorySearchResult,
  type GlobalHistorySummary,
} from "@/services/globalHistoryService";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { ModuleNavigation } from "@/components/layout/ModuleNavigation";
import { toast } from "@/i18n/toast";
import { AndonApiError } from "@/api/andonApiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalHistoryDetailSections } from "@/components/history/GlobalHistoryDetailSections";
import { GlobalHistorySummaryPanel } from "@/components/history/GlobalHistorySummaryPanel";
import { downloadGlobalHistoryPageCsv, downloadGlobalHistoryFilteredCsv } from "@/services/globalHistoryPageCsv";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  post_maintenance: "Em acompanhamento",
  finished: "Finalizado",
  cancelled: "Cancelado",
};
const CRITICALITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};
const STATUS_VALUES = [
  ["all", "Todos os status"],
  ["open", "Abertos"],
  ["in_progress", "Em atendimento"],
  ["post_maintenance", "Acompanhamento"],
  ["finished", "Finalizados"],
  ["cancelled", "Cancelados"],
] as const;

function formatInstant(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(getInterfaceLocale(), { dateStyle: "short", timeStyle: "short" })
    : ui("Data indisponível");
}

function SummaryDetail({ call, detail, detailLoading, detailError }: {
  call: GlobalHistoryCallSummary;
  detail: GlobalHistoryCallDetail | null;
  detailLoading: boolean;
  detailError: string;
}) {
  const line = (label: string, value: string | null | undefined) => (
    <div className="flex min-w-0 flex-wrap justify-between gap-2 border-b border-border/60 py-2 text-sm">
      <dt className="text-muted-foreground">{ui(label)}</dt>
      <dd className="min-w-0 max-w-full break-words text-right font-medium">{value || "—"}</dd>
    </div>
  );
  return (
    <article className="space-y-5" aria-label={ui("Resumo do chamado selecionado")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{ui("Detalhamento do chamado")}</p>
          <h2 className="mt-1 text-xl font-black">{call.machine?.name || call.machineId}</h2>
          <p className="break-all text-xs text-muted-foreground">{ui("ID")} {call.id}</p>
        </div>
        <span className="rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs font-bold">
          {ui(STATUS_LABELS[call.status] || call.status)}
        </span>
      </div>
      <dl className="rounded-xl border border-border bg-card px-4 py-2">
        {line("Máquina", call.machine?.name || call.machineId)}
        {line("Número da OS", call.workOrderNumber)}
        {line("Abertura", formatInstant(call.openedAt))}
        {line("Finalização", formatInstant(call.finishedAt))}
        {line("Última movimentação", formatInstant(call.updatedAt))}
        {line("Tipo de chamado", call.callReasonSnapshot?.reasonNameSnapshot || call.category)}
        {line("Subcategoria / falha", call.callReasonSnapshot?.optionNameSnapshot || call.subtype)}
        {line("Classificação", call.failureClassification)}
        {line("Criticidade", call.criticality)}
        {line("Mantenedores", call.technicianNames.length
          ? call.technicianNames.join(", ") : call.technicianName)}
        {line("Origem", call.isSystemTest ? "Teste do sistema" : "Chamado real")}
      </dl>
      {detailLoading && <div role="status" className="space-y-3">
        <p className="text-sm text-muted-foreground">{ui("Carregando registro completo do chamado…")}</p>
        <Skeleton className="h-28 w-full" /><Skeleton className="h-44 w-full" />
      </div>}
      {detailError && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
        {ui("Não foi possível consultar o detalhamento autorizado deste chamado.")} {detailError}
      </p>}
      {detail && detail.id === call.id && <GlobalHistoryDetailSections call={detail}/>}
      {!detail && !detailLoading && !detailError && <p role="note" className="text-sm text-muted-foreground">
        {ui("Detalhamento indisponível nesta seleção.")}
      </p>}
    </article>
  );
}

function FilterField({
  label, value, onChange, placeholder, suggestions = [],
}: { label: string; value: string; onChange: (value: string) => void;
  placeholder: string; suggestions?: Array<{ value: string; label: string }> }) {
  const listId = useId();
  return (
    <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
      <span>{ui(label)}</span>
      <input
        type="text"
        list={suggestions.length ? listId : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={ui(placeholder)}
        maxLength={100}
        className="min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map(item => (
            <option key={item.value} value={item.value} label={item.label} />
          ))}
        </datalist>
      )}
    </label>
  );
}

export function GlobalCallHistoryPage() {
  useInterfaceLanguage();
  const { access, checking, refresh } = useModuleAccess();
  const allowed = access?.centralAccessEnabled === true && access.globalHistory?.allowed === true;
  const userId = access?.principal?.userId;
  const { machineId: linkedMachineId } = useSearch({ from: "/history" });
  const requestedMachineId = linkedMachineId || "all";
  // A history opened from an individual machine keeps that machine fixed
  // until the operator explicitly returns to the unscoped Hub history URL.
  const machineContextLocked = requestedMachineId !== "all";
  const previousRequestedMachineId = useRef(requestedMachineId);
  const [draft, setDraft] = useState<GlobalHistorySearchFilters>(
    () => ({ ...DEFAULT_GLOBAL_HISTORY_SEARCH_FILTERS, machineId: requestedMachineId }),
  );
  const [applied, setApplied] = useState<GlobalHistorySearchFilters>(
    () => ({ ...DEFAULT_GLOBAL_HISTORY_SEARCH_FILTERS, machineId: requestedMachineId }),
  );
  const [machines, setMachines] = useState<AuthorizedHistoryMachine[]>([]);
  const [categories, setCategories] = useState<GlobalHistoryCategoryOption[]>([]);
  const [classifications, setClassifications] = useState<GlobalHistoryClassificationOption[]>([]);

  const [machineError, setMachineError] = useState("");
  const [result, setResult] = useState<GlobalHistorySearchResult | null>(null);
  const [summary, setSummary] = useState<GlobalHistorySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const exportInFlightRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GlobalHistoryCallDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [mobileDetail, setMobileDetail] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // A machine-history deep link only preselects a filter: the existing
  // server-scoped history query remains the sole authority over results.
  useEffect(() => {
    if (previousRequestedMachineId.current === requestedMachineId) return;
    previousRequestedMachineId.current = requestedMachineId;
    const next = { ...DEFAULT_GLOBAL_HISTORY_SEARCH_FILTERS, machineId: requestedMachineId };
    setDraft(next);
    setApplied(next);
    setOffset(0);
    setMobileDetail(false);
  }, [requestedMachineId]);

  useEffect(() => {
    if (!allowed) {
      setMachines([]);
      setCategories([]);
      setClassifications([]);
      setResult(null);
      setSelectedId(null);
      return;
    }
    let current = true;
    setMachines([]);
    setMachineError("");
    void listAuthorizedHistoryMachines().then(list => {
      if (current) setMachines(list);
    }).catch(() => {
      if (current) setMachineError(ui("Não foi possível consultar as máquinas autorizadas."));
    });
    void listGlobalHistoryCategoryOptions().then(list => {
      if (current) setCategories(list);
    }).catch(() => { if (current) setCategories([]); });
    void listGlobalHistoryClassificationOptions().then(list => {
      if (current) setClassifications(list);
    }).catch(() => { if (current) setClassifications([]); });
    return () => { current = false; };
  }, [allowed, userId]);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    setLoading(true);
    setError("");
    setResult(null);
    void searchGlobalHistory(applied, offset).then(next => {
      if (!current) return;
      setResult(next);
      setSelectedId(prev => next.items.some(item => item.id === prev)
        ? prev : (next.items[0]?.id ?? null));
      setMobileDetail(false);
    }).catch(cause => {
      if (!current) return;
      setResult(null);
      setSelectedId(null);
      setError(cause instanceof Error ? systemMessage(cause.message) : ui("Falha na consulta do histórico."));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [allowed, userId, applied, offset, reload]);

  useEffect(() => {
    setDetail(null);
    setDetailError("");
    if (!allowed || !selectedId || !result?.items.some(item => item.id === selectedId)) {
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetailLoading(true);
    void getGlobalHistoryCallDetail(selectedId).then(next => {
      if (active) setDetail(next.call);
    }).catch(error => {
      if (active) setDetailError(error instanceof Error
        ? systemMessage(error.message)
        : ui("Falha na consulta do histórico."));
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [allowed, userId, selectedId, result, reload]);

  // Aggregation uses the same server-authorized filters but no page offset.
  useEffect(() => {
    if (!allowed) {
      setSummary(null);
      setSummaryLoading(false);
      setSummaryError("");
      return;
    }
    let current = true;
    setSummary(null);
    setSummaryLoading(true);
    setSummaryError("");
    void getGlobalHistorySummary(applied).then(next => {
      if (current) setSummary(next);
    }).catch(cause => {
      if (current) setSummaryError(cause instanceof Error
        ? systemMessage(cause.message)
        : ui("Indicadores indisponíveis."));
    }).finally(() => {
      if (current) setSummaryLoading(false);
    });
    return () => { current = false; };
  }, [allowed, userId, applied, reload]);

  const edit = useCallback((patch: Partial<GlobalHistorySearchFilters>) =>
    setDraft(current => ({
      ...current, ...patch,
      ...(machineContextLocked ? { machineId: requestedMachineId } : {}),
    })), [machineContextLocked, requestedMachineId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Validate local calendar and clock before updating the live query.
    // A malformed range must not crash a React effect or issue a broad search.
    const next = {
      ...draft,
      machineId: machineContextLocked ? requestedMachineId : draft.machineId,
    };
    try {
      globalHistorySearchPath(next);
    } catch (cause) {
      setError(cause instanceof Error ? ui(cause.message) : ui("Informe um horário válido."));
      return;
    }
    setError("");
    setOffset(0);
    setDraft(next);
    setApplied(next);
    setMobileDetail(false);
  };
  const reset = () => {
    // An individual-machine history link must remain scoped to that machine
    // after clearing other filters. The SQL machineScope still decides access.
    const next = { ...DEFAULT_GLOBAL_HISTORY_SEARCH_FILTERS, machineId: requestedMachineId };
    setDraft(next);
    setApplied(next);
    setOffset(0);
    setMobileDetail(false);
    setReload(current => current + 1);
  };
  // Draft filters never affect a search or export until the operator applies them.
  const filtersPending = JSON.stringify(draft) !== JSON.stringify(applied);
  const selected = result?.items.find(item => item.id === selectedId) ?? null;

  async function exportFilteredCsv() {
    if (!allowed || loading || exportInFlightRef.current) return;
    exportInFlightRef.current = true; // synchronous double-click protection
    setExportBusy(true);
    try {
      // Export only the APPLIED filter set, never unfinished draft inputs.
      // A machine-originated link cannot broaden to all machines.
      const requested = { ...applied,
        machineId: machineContextLocked ? requestedMachineId : applied.machineId };
      const payload = await getAuditedGlobalHistoryExport(requested);
      if (payload.maxRows !== 500 || payload.total !== payload.items.length ||
          payload.items.length === 0 || payload.items.length > 500)
        throw new Error("invalid_history_export_response");
      downloadGlobalHistoryFilteredCsv(payload.items);
      toast.success(ui("CSV filtrado exportado com auditoria no servidor."));
    } catch (cause) {
      toast.error(cause instanceof AndonApiError && cause.code === "history_export_limit_exceeded"
        ? ui("A exportação excede 500 registros. Refine os filtros e tente novamente.")
        : ui("Não foi possível exportar o histórico filtrado."));
    } finally {
      exportInFlightRef.current = false;
      setExportBusy(false);
    }
  }

  if (checking) return (
    <main className="min-h-dvh space-y-3 bg-background p-6" role="status">
      <p>{ui("Verificando autorização do Histórico Global…")}</p>
      <Skeleton className="h-24 w-full" /><Skeleton className="h-52 w-full" />
    </main>
  );
  if (!allowed) return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <section role="alert" className="w-full max-w-lg rounded-xl border border-border bg-card p-6">
        <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold">{ui("Histórico Global não liberado")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ui("Este módulo ainda não foi homologado ou sua sessão não possui permissão de histórico. Os dados permanecem protegidos no servidor.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refresh()}>{ui("Verificar acesso")}</Button>
          <Button asChild><Link to="/hub">{ui("Voltar ao Hub")}</Link></Button>
        </div>
      </section>
    </main>
  );

  return (
    <main className="min-h-dvh bg-background px-3 pb-6 pt-4 text-foreground sm:px-5">
      <div className="mx-auto max-w-[1800px] space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><History className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{ui("ANDON · Consulta global")}</p>
              <h1 className="text-xl font-black sm:text-2xl">{ui("Histórico de chamados")}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm"
              title={ui("Exporta somente os registros da página atual, não o histórico completo.")}
              disabled={loading || !result?.items.length}
              onClick={() => {
                if (allowed && !loading && result?.items.length)
                  downloadGlobalHistoryPageCsv(result.items);
              }}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              {ui("CSV da página")}
            </Button>
            <Button variant="outline" size="sm"
              title={ui("Exporta todos os registros dos filtros atuais quando houver até 500, com auditoria no servidor.")}
              disabled={loading || exportBusy || !result?.total}
              onClick={() => void exportFilteredCsv()}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              {ui(exportBusy ? "Exportando CSV..." : "CSV filtrado (até 500)")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReload(v => v + 1)}>
              <RefreshCw className="mr-1 h-4 w-4" /> {ui("Atualizar")}
            </Button>
            <LanguageSelector compact />
            <ModuleNavigation showModuleLinks />
          </div>
        </header>

        <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CircleHelp className="h-4 w-4 text-primary" aria-hidden="true" />
            {ui("Como interpretar o Histórico Global e suas exportações")}
          </summary>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>{ui("A lista mostra uma página do período e filtros aplicados; os totais do resumo consideram todos os registros autorizados que correspondem aos filtros.")}</p>
            <p>{ui("Chamados reais e testes do sistema são origens diferentes. Use o filtro Origem para separá-los.")}</p>
            <p>{ui("CSV da página exporta até 25 chamados exibidos e não equivale a uma exportação auditada no servidor.")}</p>
            <p>{ui("CSV filtrado consulta o servidor, registra a exportação e permite até 500 chamados autorizados. Acima do limite, refine os filtros.")}</p>
            <p>{ui("Os tempos de espera, atendimento, acompanhamento, total e parada podem se sobrepor e não devem ser somados.")}</p>
          </div>
        </details>
        {summaryLoading && <div role="status" className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{ui("Calculando indicadores dos filtros…")}</p>
          <Skeleton className="h-14 w-full" />
        </div>}
        {summaryError && <div role="alert" className="rounded-xl border border-danger/40 bg-card p-3 text-sm">
          {ui("Indicadores indisponíveis.")} {summaryError}
        </div>}
        {!summaryLoading && !summaryError && summary && <GlobalHistorySummaryPanel summary={summary} />}
        <div className="grid min-h-[65dvh] gap-3 lg:min-h-[780px] lg:items-stretch lg:grid-cols-[minmax(330px,410px)_minmax(0,1fr)]">
          {/* On wide screens the detail defines the grid-row height; the list fills
              that entire height, with its own scroll and pinned pagination. */}
          <div className="min-w-0 lg:relative">
          <aside
            aria-label={ui("Falhas e filtros cronológicos")}
            className={`min-w-0 rounded-xl border border-border bg-card ${mobileDetail ? "hidden lg:flex" : "flex"} flex-col overflow-hidden lg:absolute lg:inset-0 lg:h-full lg:min-h-0`}
          >
            <div className="border-b border-border px-4 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
                  {ui("Filtros e ocorrências")}
                </span>
                <Button type="button" size="sm" variant="ghost"
                  aria-expanded={filtersExpanded} aria-controls="global-history-filters"
                  onClick={() => setFiltersExpanded(value => !value)}>
                  {ui(filtersExpanded ? "Ocultar filtros" : "Mostrar filtros")}
                  <ChevronDown aria-hidden="true" className={`ml-1 h-4 w-4 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
                </Button>
              </div>
              {filtersPending && (
                <p role="status" className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  {ui("Há filtros não aplicados. Clique em Filtrar para atualizar resultados e exportações.")}
                </p>
              )}
              <div id="global-history-filters" className={filtersExpanded ? "lg:max-h-[min(43dvh,450px)] lg:overflow-y-auto lg:pr-1" : "hidden"}>
                <form onSubmit={submit} className="space-y-3">
                <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                  <span>{ui("Buscar OS, chamado, falha ou descrição")}</span>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <input type="search" maxLength={100} value={draft.query}
                      onChange={e => edit({query:e.target.value})}
                      placeholder={ui("Número, texto ou mantenedor")}
                      className="min-h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground" />
                  </div>
                </label>
                <label className="mb-3 block space-y-1.5 text-xs font-medium text-muted-foreground">
                  <span>{ui("Ordenação cronológica")}</span>
                  <select value={draft.sort} onChange={e=>edit({sort:e.target.value as GlobalHistorySearchFilters["sort"]})}
                    className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                    <option value="opened">{ui("Abertura mais recente")}</option>
                    <option value="updated">{ui("Última movimentação")}</option>
                    <option value="finished">{ui("Finalização mais recente")}</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>{ui("Máquina")}</span>
                    {machineContextLocked ? (
                      <div role="status" aria-label={ui("Máquina vinculada ao histórico de origem")}
                        className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-semibold">
                        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 truncate">
                          {machines.find(m => m.id === requestedMachineId)?.name ?? requestedMachineId}
                        </span>
                      </div>
                    ) : (
                      <select value={draft.machineId} disabled={Boolean(machineError)}
                        onChange={e=>edit({machineId:e.target.value})}
                        className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
                        <option value="all">{ui("Todas permitidas")}</option>
                        {machines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>{ui("Situação")}</span>
                    <select value={draft.status} onChange={e=>edit({status:e.target.value})}
                      className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
                      {STATUS_VALUES.map(([v, label])=><option value={v} key={v}>{ui(label)}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>{ui("Criticidade")}</span>
                    <select value={draft.criticality}
                      onChange={e => edit({ criticality: e.target.value as GlobalHistorySearchFilters["criticality"] })}
                      className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
                      <option value="all">{ui("Todas as criticidades")}</option>
                      <option value="low">{ui("Baixa")}</option>
                      <option value="medium">{ui("Média")}</option>
                      <option value="high">{ui("Alta")}</option>
                      <option value="critical">{ui("Crítica")}</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>{ui("Período de abertura")}</span>
                    <select value={draft.period}
                      onChange={e=>edit({period:e.target.value as GlobalHistorySearchFilters["period"]})}
                      className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
                      <option value="all">{ui("Todo o período")}</option>
                      <option value="today">{ui("Hoje")}</option>
                      <option value="7d">{ui("Últimos 7 dias")}</option>
                      <option value="30d">{ui("Últimos 30 dias")}</option>
                      <option value="custom">{ui("Data específica")}</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    <span>{ui("Origem")}</span>
                    <select value={draft.origin} onChange={e=>edit({origin:e.target.value as GlobalHistorySearchFilters["origin"]})}
                      className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground">
                      <option value="all">{ui("Todas")}</option>
                      <option value="real">{ui("Chamados reais")}</option>
                      <option value="system">{ui("Testes do sistema")}</option>
                    </select>
                  </label>
                </div>
                {draft.period === "custom" && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                      <span>{ui("Data de abertura")}</span>
                      <input type="date" required value={draft.customDate}
                        onChange={e=>edit({customDate:e.target.value})}
                        className="min-h-10 w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                        <span>{ui("Horário inicial")}</span>
                        <input type="time" step={60} value={draft.timeFrom ?? ""}
                          onChange={e=>edit({timeFrom:e.target.value})}
                          className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm text-foreground" />
                      </label>
                      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                        <span>{ui("Horário final")}</span>
                        <input type="time" step={60} value={draft.timeBefore ?? ""}
                          onChange={e=>edit({timeBefore:e.target.value})}
                          className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm text-foreground" />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ui("Horários opcionais no fuso local. Se o final for anterior ao inicial, inclui a madrugada do dia seguinte.")}
                    </p>
                  </div>
                )}
                <details className="rounded-lg border border-border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-xs font-bold"><SlidersHorizontal className="mr-1 inline h-4 w-4" />{ui("Tipos de falha e filtros adicionais")}</summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <FilterField label={ui("Tipo / especialidade")} value={draft.subtype}
                      onChange={subtype=>edit({subtype})} placeholder={ui("Selecione ou digite o código")}
                      suggestions={categories.map(c => ({ value:c.id, label:c.displayName }))} />
                    <FilterField label={ui("Mantenedor")} value={draft.technician}
                      onChange={technician=>edit({technician})} placeholder={ui("Nome exato")} />
                    <FilterField label={ui("Classificação da falha")} value={draft.failureClassification}
                      onChange={failureClassification=>edit({failureClassification})} placeholder={ui("Selecione ou digite o código")}
                      suggestions={classifications.map(c => ({ value:c.value, label:c.label }))} />
                    <FilterField label={ui("Motivo principal")} value={draft.reasonId}
                      onChange={reasonId=>edit({reasonId})} placeholder={ui("Ex.: maintenance")} />
                  </div>
                </details>
                <div className="flex gap-2">
                  <Button className="flex-1" type="submit" disabled={loading}>
                    <Search className="mr-1 h-4 w-4" />{ui("Filtrar")}
                  </Button>
                  <Button type="button" variant="outline" onClick={reset}>{ui("Limpar")}</Button>
                </div>
                </form>
                {machineError && <p role="alert" className="mt-2 text-xs text-danger">{machineError}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
              <span className="font-bold">{applied.sort === "updated" ? ui("Chamados por última movimentação") :
                applied.sort === "finished" ? ui("Chamados por finalização") : ui("Falhas por horário de abertura")}</span>
              <span>{result ? `${result.total} ${ui("registros")}` : ui("Consultando…")}</span>
            </div>
            <div className="min-h-[180px] flex-1 space-y-1 overflow-y-auto p-2 lg:min-h-0" aria-label={ui("Lista de chamados com rolagem independente")}>
              {loading && <div role="status" className="space-y-2 p-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
              {error && <div role="alert" className="rounded-lg border border-danger/40 p-3 text-sm text-danger">{error}</div>}
              {!loading && !error && result?.items.length===0 && (
                <p role="status" className="p-4 text-sm text-muted-foreground">{ui("Nenhum chamado encontrado para esses filtros.")}</p>
              )}
              {!loading && !error && result?.items.map(call=>(
                <button key={call.id} type="button" aria-pressed={selectedId===call.id}
                  onClick={() => {setSelectedId(call.id);setMobileDetail(true);}}
                  className={`w-full space-y-2 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId===call.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted/50"}`}>
                  <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                    <span className="flex items-center gap-1 text-primary"><Clock3 className="h-3.5 w-3.5" />{formatInstant(call.openedAt)}</span>
                    <span className="text-muted-foreground">{ui(STATUS_LABELS[call.status] || call.status)}</span>
                  </span>
                  <span className="block break-words text-sm font-bold">{call.machine?.name || call.machineId} · {call.callReasonSnapshot?.optionNameSnapshot || call.subtype || call.category}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{ui("OS")} {call.workOrderNumber || "—"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ui("Criticidade")}: {ui(CRITICALITY_LABELS[call.criticality] || call.criticality)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{call.failureClassification || ui("Sem classificação")}</span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{call.isSystemTest ? ui("Teste do sistema") : ui("Chamado real")}</span>
                    <span aria-hidden="true">·</span>
                    <span className="min-w-0 truncate">{call.technicianNames?.join(", ") || call.technicianName || ui("Sem mantenedor")}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={call.id}>
                    {ui("ID")}: {call.id}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs">
              <Button variant="outline" size="sm" disabled={loading || offset===0}
                onClick={()=>setOffset(v=>Math.max(0,v-25))}>{ui("Anterior")}</Button>
              <span className="text-muted-foreground">{result && result.total
                ? `${offset+1}–${offset+result.items.length} / ${result.total}` : "—"}</span>
              <Button variant="outline" size="sm" disabled={loading || !result?.hasMore}
                onClick={()=>setOffset(v=>v+25)}>{ui("Próximo")}</Button>
            </div>
          </aside>
          </div>

          <section aria-label={ui("Detalhe do histórico")} className={`min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6 ${mobileDetail ? "block" : "hidden lg:block"}`}>
            {mobileDetail && <Button variant="outline" className="mb-4 lg:hidden" onClick={()=>setMobileDetail(false)}>
              <ArrowLeft className="mr-1 h-4 w-4" />{ui("Voltar à lista")}
            </Button>}
            {selected ? <SummaryDetail call={selected} detail={detail?.id===selected.id ? detail : null} detailLoading={detailLoading} detailError={detailError}/> : (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Wrench className="h-9 w-9" />
                <p className="text-sm">{ui("Selecione uma ocorrência na lista para consultar os detalhes disponíveis.")}</p>
                <p className="text-xs"><CalendarDays className="mr-1 inline h-4 w-4" />{ui("Horários da abertura mais recente para a mais antiga.")}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
