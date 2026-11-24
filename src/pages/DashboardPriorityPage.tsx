import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CalendarDays,
  CircleHelp,
  Filter,
  GripVertical,
  History,
  ListOrdered,
  RefreshCw,
  Search,
  LogOut,
  Save,
  Undo2,
} from "lucide-react";
import { toast } from "@/i18n/toast";

import { DashboardPriorityLoginModal } from "@/components/priority/DashboardPriorityLoginModal";
import { ProductionModeCredentialModal } from "@/components/machines/ProductionModeCredentialModal";
import { accessRequest, type AccessState } from "@/services/accessService";
import { PrioritySectionNav, type PrioritySectionId } from "@/components/priority/PrioritySectionNav";
import { PriorityActivationBadge, PriorityProductionBadge } from "@/components/priority/PriorityMachineBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reorderVisiblePriorityIds } from "@/utils/priorityFilteredOrder";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleNavigation } from "@/components/layout/ModuleNavigation";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import {
  getDashboardPriorityOrder,
  getDashboardPriorityHistory,
  type DashboardPriorityAuditEntry,
  getStoredDashboardPrioritySession,
  isDashboardPriorityAuthenticated,
  logoutDashboardPriority,
  saveDashboardPriorityOrder,
  type DashboardPriorityMachine,
} from "@/services/dashboardPriorityService";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";
import { loadFromStorage } from "@/services/localStorageService";
import type { Machine, ProductionMode } from "@/types/machine";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTimeUtils";

export function DashboardPriorityPage() {
  useInterfaceLanguage();
  const navigate = useNavigate();
  const { access } = useModuleAccess();
  const returnTo = "/hub";
  const centralReadOnly = !access || (access.centralAccessEnabled === true &&
    (access.prioritiesWriteEnabled !== true || access.principal?.machineScope !== "all"));
  const passwordRequired =
    access?.modules.find((item) => item.id === "priorities")?.passwordRequired !== false;
  const leavingAfterLogout = useRef(false);
  const [authenticated, setAuthenticated] = useState(
    () => !passwordRequired || isDashboardPriorityAuthenticated(),
  );
  const [loginOpen, setLoginOpen] = useState(
    () => passwordRequired && !isDashboardPriorityAuthenticated(),
  );
  const [rows, setRows] = useState<DashboardPriorityMachine[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [lastOrderUpdatedAt, setLastOrderUpdatedAt] = useState<string | null>(null);
  const [lastOrderUpdatedBy, setLastOrderUpdatedBy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [activityFilter, setActivityFilter] = useState<"all" | "active" | "inactive">("all");
  const [productionFilter, setProductionFilter] = useState<"all" | "scheduled" | "not_scheduled" | "unknown">("all");
  // Preserve the existing editing flow as the initial section while introducing
  // the five-panel shell. No operational machine state is inferred by this UI.
  const [activeSection, setActiveSection] = useState<PrioritySectionId>("sequence");
  const [pendingSchedule, setPendingSchedule] = useState<{
    machineId: string; currentMode: ProductionMode; requestedMode: ProductionMode;
  } | null>(null);
  const [scheduleCheckingId, setScheduleCheckingId] = useState<string | null>(null);
  const scheduleSubmittingRef = useRef(false);
  const [scheduleRequester, setScheduleRequester] = useState<{
    fullScope: boolean; machineIds: string[]; canWrite: boolean;
  } | null>(null);
  const [historyItems, setHistoryItems] = useState<DashboardPriorityAuditEntry[]>([]);
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const currentIds = rows.map((row) => row.id);
  const hasUnsavedChanges = currentIds.join("|") !== savedIds.join("|");
  useBlocker({
    shouldBlockFn: () =>
      hasUnsavedChanges &&
      !leavingAfterLogout.current &&
      !window.confirm(ui("Descartar as alterações de prioridade ainda não salvas?")),
    enableBeforeUnload: hasUnsavedChanges,
  });

  const activePriorityRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    rows
      .filter((row) => row.isActive)
      .slice(0, 5)
      .forEach((row, index) => ranks.set(row.id, index + 1));
    return ranks;
  }, [rows]);

  // Filters apply immediately to the visible list. The order write always sends
  // the full machine catalog; hidden rows are never dropped from the snapshot.
  const activeFilterCount = Number(Boolean(searchQuery.trim())) +
    Number(activityFilter !== "all") + Number(productionFilter !== "all");
  const visibleRows = useMemo(() => rows.filter((machine) => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return (!query || machine.name.toLocaleLowerCase().includes(query) ||
        machine.id.toLocaleLowerCase().includes(query)) &&
      (activityFilter === "all" || (activityFilter === "active" ? machine.isActive : !machine.isActive)) &&
      (productionFilter === "all" ||
        (productionFilter === "unknown" ? machine.productionMode == null
          : machine.productionMode === productionFilter));
  }), [rows, searchQuery, activityFilter, productionFilter]);

  const loadOrder = useCallback(async () => {
    if (passwordRequired && !isDashboardPriorityAuthenticated()) {
      setAuthenticated(false);
      setLoginOpen(true);
      return;
    }

    setIsLoading(true);
    setLoadingError(null);
    try {
      const localMachines =
        CONFIGURED_DATA_MODE === "local"
          ? loadFromStorage<Machine[]>(LOCAL_STORAGE_KEYS.machines, [])
          : [];
      const snapshot = await getDashboardPriorityOrder(localMachines);
      setRows(snapshot.machines);
      setSavedIds(snapshot.machines.map((machine) => machine.id));
      setLastOrderUpdatedAt(snapshot.lastOrderUpdatedAt);
      setLastOrderUpdatedBy(snapshot.lastOrderUpdatedBy);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Não foi possível carregar a sequência.");
      if (error instanceof Error && /sessão|autentica/i.test(error.message)) {
        setAuthenticated(false);
        setLoginOpen(true);
      }
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar a sequência.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [passwordRequired]);

  useEffect(() => {
    const authenticatedNow = !passwordRequired || isDashboardPriorityAuthenticated();
    setAuthenticated(authenticatedNow);
    setLoginOpen(!authenticatedNow);
  }, [passwordRequired]);

  useEffect(() => {
    if (authenticated) void loadOrder();
  }, [authenticated, loadOrder]);

  const operationalGranted = access?.modules.some((item) =>
    item.id === "operational" && item.available && item.enabled && item.allowed) === true &&
    access?.workstation.allowOperational === true;

  useEffect(() => {
    if (activeSection !== "production" || access?.centralAccessEnabled !== true ||
        !operationalGranted) {
      setScheduleRequester(null);
      return;
    }
    let canceled = false;
    setScheduleRequester(null);
    void accessRequest<AccessState>("/session").then((state) => {
      if (canceled) return;
      const principal = state.principal;
      const permitted = principal?.purpose === "normal" &&
        (principal.isPrimaryAdmin === true ||
          principal.permissions?.includes("production.schedule.request") === true ||
          principal.permissions?.includes("production.schedule.write") === true) &&
        (principal.isPrimaryAdmin === true ||
          principal.permissions?.includes("andon.read") === true);
      setScheduleRequester(permitted && principal
        ? { fullScope: principal.machineScope === "all",
            machineIds: principal.machineIds ?? [],
            canWrite: principal.isPrimaryAdmin === true ||
              principal.permissions?.includes("production.schedule.write") === true } : null);
    }).catch(() => { if (!canceled) setScheduleRequester(null); });
    return () => { canceled = true; };
  }, [activeSection, access?.centralAccessEnabled, access?.principal?.userId,
    operationalGranted]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const snapshot = await getDashboardPriorityHistory();
      setHistoryItems(snapshot.entries);
      setHistoryTruncated(snapshot.truncated);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : ui("Não foi possível carregar o histórico."));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated && activeSection === "history") void loadHistory();
  }, [authenticated, activeSection, loadHistory]);

  function moveRow(sourceIndex: number, targetIndex: number) {
    if (centralReadOnly || isSaving) return;
    if (sourceIndex < 0 || targetIndex < 0 ||
        sourceIndex >= visibleRows.length || targetIndex >= visibleRows.length ||
        sourceIndex === targetIndex) return;
    moveById(visibleRows[sourceIndex].id, visibleRows[targetIndex].id);
  }

  function moveById(sourceId: string, targetId: string) {
    if (centralReadOnly || isSaving) return;
    const visibleIds = visibleRows.map((row) => row.id);
    setRows((current) => {
      const nextIds = reorderVisiblePriorityIds(
        current.map((row) => row.id), visibleIds, sourceId, targetId,
      );
      const byId = new Map(current.map((row) => [row.id, row]));
      return nextIds.map((id) => byId.get(id)!);
    });
  }

  async function handleSave() {
    if (centralReadOnly || !hasUnsavedChanges || isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveDashboardPriorityOrder(rows.map((row) => row.id), savedIds);
      setSavedIds(rows.map((row) => row.id));
      setLastOrderUpdatedAt(result.lastOrderUpdatedAt);
      setLastOrderUpdatedBy(result.lastOrderUpdatedBy);
      toast.success("Sequência visual de prioridades salva.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(/priority_order_changed|priority_machine_catalog_changed/.test(message)
        ? ui("A sequência foi alterada em outra estação. Recarregue e revise antes de salvar.")
        : message || ui("Não foi possível salvar a sequência."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    if (
      hasUnsavedChanges &&
      !window.confirm(ui("Descartar as alterações de prioridade ainda não salvas?"))
    )
      return;
    leavingAfterLogout.current = true;
    await logoutDashboardPriority();
    setAuthenticated(false);
    setRows([]);
    setSavedIds([]);
    void navigate({ to: returnTo });
  }

  async function requestScheduleChange(machine: DashboardPriorityMachine) {
    if (scheduleSubmittingRef.current || scheduleCheckingId || pendingSchedule || isLoading || isSaving ||
        !machine.isActive || !machine.productionMode ||
        access?.centralAccessEnabled !== true) return;
    if (hasUnsavedChanges) {
      toast.error(ui("Salve ou descarte as alterações de prioridade antes de alterar a programação."));
      return;
    }
    const operational = access.modules.find((item) => item.id === "operational");
    if (!operational?.available || !operational.enabled || !operational.allowed ||
        !access.workstation.allowOperational) {
      toast.error(ui("A programação exige acesso autorizado ao ANDON operacional."));
      return;
    }
    // Synchronous guard also covers rapid consecutive clicks before React paints.
    scheduleSubmittingRef.current = true;
    setScheduleCheckingId(machine.id);
    try {
      // Recheck the live session before choosing the explicit write route.
      // Request-only accounts still require one-shot credential approval.
      const state = await accessRequest<AccessState>("/session");
      const principal = state.principal;
      const permitted = principal?.purpose === "normal" &&
        (principal.isPrimaryAdmin === true ||
          principal.permissions?.includes("production.schedule.request") === true ||
          principal.permissions?.includes("production.schedule.write") === true) &&
        (principal.machineScope === "all" ||
          principal.machineIds?.includes(machine.id) === true) &&
        (principal.isPrimaryAdmin === true ||
          principal.permissions?.includes("andon.read") === true);
      if (!permitted) {
        toast.error(ui("Você não tem permissão para alterar a programação desta máquina."));
        return;
      }
      const target = machine.productionMode === "scheduled" ? "not_scheduled" : "scheduled";
      const canWrite = principal!.isPrimaryAdmin === true ||
        principal!.permissions?.includes("production.schedule.write") === true;
      if (canWrite) {
        // Backend revalidates the session, permission, machine scope, CSRF,
        // workstation, expected mode (409), transaction and audit.
        await accessRequest("/machines/production-mode/session", "POST", {
          machineId: machine.id,
          expectedProductionMode: machine.productionMode,
          productionMode: target,
        });
        toast.success(ui("Programação de produção atualizada com autorização."));
        await loadOrder();
      } else {
        // Request-only operator: an authorized second person must approve.
        setPendingSchedule({
          machineId: machine.id,
          currentMode: machine.productionMode,
          requestedMode: target,
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message.includes("production_mode_changed")) {
        toast.error(ui("A programação foi alterada em outra estação. Atualizando o estado."));
        void loadOrder();
      } else if (/permission_denied|machine_scope_denied|authentication_required|workstation_denied/.test(message)) {
        setScheduleRequester(null);
        toast.error(ui("Sua sessão ou permissão não permite alterar esta máquina."));
      } else {
        toast.error(ui("Não foi possível alterar a programação. Confira a conexão e tente novamente."));
      }
    } finally {
      scheduleSubmittingRef.current = false;
      setScheduleCheckingId(null);
    }
  }

  const session = getStoredDashboardPrioritySession();

  return (
    <div className="andon-screen-enter min-h-dvh bg-background px-3 pb-6 pt-4 text-foreground sm:px-5">
      <div className="mx-auto max-w-[1800px] space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <ListOrdered className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                {ui("ANDON · Organização visual")}
              </p>
              <h1 className="text-xl font-black sm:text-2xl">{ui("Prioridade de produção")}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm"
              disabled={isLoading || isSaving}
              onClick={() => {
                if (!hasUnsavedChanges ||
                    window.confirm(ui("Descartar as alterações de prioridade ainda não salvas?")))
                  void loadOrder();
              }}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
              {ui("Atualizar")}
            </Button>
            <LanguageSelector compact />
            <ModuleNavigation showModuleLinks />
            {session?.username && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                {session.username}
              </span>
            )}
            {passwordRequired && (
              <Button type="button" variant="outline" size="sm" onClick={() => void handleLogout()}>
                <LogOut className="mr-2 h-4 w-4" />
                {ui("Sair")}
              </Button>
            )}
          </div>
        </header>

        <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CircleHelp className="h-4 w-4 text-primary" aria-hidden="true" />
            {ui("Como interpretar as prioridades")}
          </summary>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>{ui("Arraste as máquinas ou use ↑/↓. As cinco primeiras máquinas ativas recebem destaque no Dashboard.")}</p>
            <p>{ui("Prioridade define a posição da máquina na sequência visual. Máquina ativa indica disponibilidade no cadastro. Produção programada determina a janela operacional e é um estado diferente.")}</p>
            <p>{ui("Somente usuários autorizados podem salvar uma sequência. As cinco primeiras máquinas ativas recebem P1 a P5 no Dashboard.")}</p>
            <p>{ui("Os filtros alteram somente a lista exibida. A gravação preserva a sequência completa e as máquinas ocultas.")}</p>
          </div>
        </details>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
          <PrioritySectionNav activeSection={activeSection} onSectionChange={setActiveSection} />
          <main id="priority-main" className="min-w-0 space-y-3">
            {hasUnsavedChanges && activeSection !== "sequence" && (
              <div role="status" className="rounded-lg border border-border bg-card p-3 text-sm">
                <p>{ui("Existem alterações de prioridade não salvas.")}</p>
                <Button type="button" variant="outline" className="mt-2"
                  onClick={() => setActiveSection("sequence")}>
                  {ui("Voltar para a sequência")}
                </Button>
              </div>
            )}
            {activeSection === "sequence" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span>
            {rows.length}
            {ui(" máquina(s) na sequência · ")}
            {rows.filter((row) => row.isActive).length}
            {ui(" ativa(s)")}
          </span>
          <span>
            {lastOrderUpdatedAt
              ? ui("Última atualização: {0}{1}", {
                  0: formatDateTime(lastOrderUpdatedAt),
                  1: lastOrderUpdatedBy ? ` · ${lastOrderUpdatedBy}` : "",
                })
              : ui("Sequência ainda não salva manualmente")}
          </span>
        </div>

        {centralReadOnly && (
          <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            {ui("Somente leitura")}: {ui("A edição de prioridades pela autenticação central ainda não está liberada.")}
          </p>
        )}
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>{ui("Filtros e máquinas")}</span>
                {activeFilterCount > 0 && (
                  <span role="status"
                    className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">
                    {ui("Filtros ativos: {0}", { 0: activeFilterCount })}
                  </span>
                )}
              </div>
              <Button type="button" size="sm" variant="ghost"
                aria-expanded={filtersExpanded} aria-controls="priority-filters"
                onClick={() => setFiltersExpanded(value => !value)}>
                {ui(filtersExpanded ? "Ocultar filtros" : "Mostrar filtros")}
                <ChevronDown aria-hidden="true"
                  className={cn("ml-1 h-4 w-4 transition-transform", filtersExpanded && "rotate-180")} />
              </Button>
            </div>
            {activeFilterCount > 0 && (
              <p role="status" className="mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                {ui("Os filtros já estão aplicados à lista exibida; a sequência completa permanece preservada.")}
              </p>
            )}
            <div id="priority-filters" className={filtersExpanded ? "mt-3" : "hidden"}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                  <span>{ui("Buscar máquina por nome ou ID")}</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input type="search" maxLength={100} value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="min-h-10 rounded-lg border-border pl-9"
                      placeholder={ui("Nome ou ID")} />
                  </div>
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                  <span>{ui("Ativação da máquina")}</span>
                  <select value={activityFilter}
                    onChange={(event) => setActivityFilter(event.target.value as typeof activityFilter)}
                    className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                    <option value="all">{ui("Todas as máquinas")}</option>
                    <option value="active">{ui("Máquinas ativas")}</option>
                    <option value="inactive">{ui("Máquinas inativas")}</option>
                  </select>
                </label>
                <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                  <span>{ui("Filtrar programação")}</span>
                  <select value={productionFilter}
                    onChange={(event) => setProductionFilter(event.target.value as typeof productionFilter)}
                    className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                    <option value="all">{ui("Todas as situações")}</option>
                    <option value="scheduled">{ui("Produção Programada")}</option>
                    <option value="not_scheduled">{ui("Fora de Produção")}</option>
                    <option value="unknown">{ui("Estado desconhecido")}</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {ui("A busca e os filtros são aplicados imediatamente, sem alterar a ordem salva.")}
                </p>
                <Button type="button" size="sm" variant="outline"
                  disabled={activeFilterCount === 0}
                  onClick={() => {
                    setSearchQuery("");
                    setActivityFilter("all");
                    setProductionFilter("all");
                  }}>
                  {ui("Limpar filtros")}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <strong className="text-foreground">{ui("Sequência de Prioridades")}</strong>
            <span aria-live="polite">
              {ui("Exibindo {0} de {1} máquinas", { 0: visibleRows.length, 1: rows.length })}
            </span>
          </div>
          {isLoading ? (
            <div role="status" aria-label={ui("Carregando sequência...")}
              className="space-y-3 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} aria-hidden="true" className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Skeleton className="h-9 w-9 shrink-0 motion-reduce:animate-none" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
                    <Skeleton className="h-3 w-1/3 motion-reduce:animate-none" />
                  </div>
                  <Skeleton className="h-9 w-16 shrink-0 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ) : loadingError ? (
            <div role="alert" className="space-y-3 p-6 text-sm">
              <p className="text-danger">{loadingError}</p>
              <Button type="button" variant="outline" onClick={() => void loadOrder()}>
                {ui("Tentar novamente")}
              </Button>
            </div>
          ) : visibleRows.length === 0 ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              {rows.length === 0 ? ui("Nenhuma máquina disponível para ordenar.") : ui("Nenhuma máquina corresponde aos filtros.")}
            </p>
          ) : (
            <div className="space-y-2 p-2 sm:p-3">
              {visibleRows.map((row, index) => {
                const activeRank = activePriorityRanks.get(row.id) ?? null;
                return (
                  <div
                    key={row.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = draggedId || event.dataTransfer.getData("text/plain");
                      if (!centralReadOnly && sourceId) moveById(sourceId, row.id);
                      setDraggedId(null);
                    }}
                    className={cn(
                      "grid min-w-0 grid-cols-[32px_32px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:bg-muted/30 sm:grid-cols-[42px_34px_minmax(0,1fr)_auto]",
                      draggedId === row.id && "opacity-50",
                      activeRank !== null && "border-primary/30 bg-primary/[0.04]",
                      !row.isActive && "border-dashed bg-muted/20",
                    )}
                  >
                    <div className="text-center font-mono text-sm font-black text-primary">
                      <span className="sr-only">{ui("Posição")} </span>
                      {rows.findIndex((machine) => machine.id === row.id) + 1}
                    </div>

                    <button
                      type="button"
                      draggable={!centralReadOnly}
                      onDragStart={(event) => {
                        if (centralReadOnly) return;
                        setDraggedId(row.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", row.id);
                      }}
                      onDragEnd={() => setDraggedId(null)}
                      title={ui("Arrastar para reorganizar")}
                      aria-label={ui("Arrastar {0}", { 0: row.name })}
                      className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words text-sm font-bold sm:text-base">{row.name}</p>
                        {activeRank !== null && (
                          <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-black text-primary"
                            aria-label={ui("Prioridade {0}", { 0: activeRank })}>
                            P{activeRank}
                          </span>
                        )}
                      </div>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {ui("ID")}: {row.id}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityActivationBadge active={row.isActive} />
                        <PriorityProductionBadge mode={row.productionMode} />
                      </div>
                    </div>

                    <div className="col-span-3 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-2 sm:col-span-1 sm:border-0 sm:pt-0">
                      {access?.centralAccessEnabled === true &&
                        access.globalHistory?.available === true &&
                        access.globalHistory.allowed === true && (
                        <Button type="button" variant="outline" size="sm"
                          aria-label={ui("Consultar histórico de {0}", { 0: row.name })}
                          onClick={() => void navigate({ to: "/history", search: { machineId: row.id } })}>
                          <History className="mr-1 h-4 w-4" aria-hidden="true" />
                          {ui("Histórico")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={centralReadOnly || isSaving || index === 0}
                        onClick={() => moveRow(index, index - 1)}
                        aria-label={ui("Mover {0} para cima", { 0: row.name })}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={centralReadOnly || isSaving || index === visibleRows.length - 1}
                        onClick={() => moveRow(index, index + 1)}
                        aria-label={ui("Mover {0} para baixo", { 0: row.name })}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      {!centralReadOnly && visibleRows.length > 2 && (
                        <Button type="button" variant="outline" size="sm"
                          disabled={isSaving || index === 0}
                          onClick={() => moveRow(index, 0)}
                          aria-label={ui("Mover {0} para o início do filtro", { 0: row.name })}>
                          {ui("Topo")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {!centralReadOnly && <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur">
          <p className="text-xs text-muted-foreground">
            {hasUnsavedChanges
              ? ui("Alterações não salvas. O Dashboard ainda usa a sequência anterior.")
              : ui("Sequência sincronizada.")}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={isSaving || isLoading}
              onClick={() => {
                if (!hasUnsavedChanges ||
                    window.confirm(ui("Descartar as alterações de prioridade ainda não salvas?")))
                  void loadOrder();
              }}>
              {ui("Recarregar sequência")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!hasUnsavedChanges || isSaving}
              onClick={() => {
                const byId = new Map(rows.map((row) => [row.id, row]));
                setRows(
                  savedIds
                    .map((id) => byId.get(id))
                    .filter((row): row is DashboardPriorityMachine => Boolean(row)),
                );
              }}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              {ui("Descartar")}
            </Button>
            <Button
              type="button"
              disabled={!hasUnsavedChanges || isSaving}
              onClick={() => void handleSave()}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? ui("Salvando...") : ui("Salvar sequência")}
            </Button>
          </div>
        </div>}
              </>
            )}

            {activeSection === "overview" && (
              <section className="space-y-4" aria-label={ui("Visão Geral")}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{ui("Máquinas na sequência")}</p>
                    <p className="mt-2 text-3xl font-black tabular-nums">{isLoading || loadingError ? "—" : rows.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{ui("Máquinas ativas")}</p>
                    <p className="mt-2 text-3xl font-black tabular-nums">
                      {isLoading || loadingError ? "—" : rows.filter((machine) => machine.isActive).length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{ui("Máquinas inativas")}</p>
                    <p className="mt-2 text-3xl font-black tabular-nums">
                      {isLoading || loadingError ? "—" : rows.filter((machine) => !machine.isActive).length}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h2 className="mb-3 text-base font-bold">{ui("Cinco primeiras máquinas ativas")}</h2>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {ui("O destaque P1–P5 é determinado pela ordem das máquinas ativas, não pela programação de produção.")}
                  </p>
                  {isLoading ? (
                    <p role="status">{ui("Carregando sequência...")}</p>
                  ) : loadingError ? (
                    <p role="alert" className="text-danger">{loadingError}</p>
                  ) : (
                    <ol className="space-y-2">
                      {rows.filter((machine) => machine.isActive).slice(0, 5).map((machine) => (
                        <li key={machine.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
                          <span className="font-bold text-primary">P{activePriorityRanks.get(machine.id)}</span>
                          <span className="min-w-0 flex-1 font-semibold">{machine.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">ID {machine.id}</span>
                        </li>
                      ))}
                      {!rows.some((machine) => machine.isActive) && (
                        <li className="text-sm text-muted-foreground">{ui("Nenhuma máquina ativa na sequência.")}</li>
                      )}
                    </ol>
                  )}
                </div>
                <Button type="button" variant="outline" onClick={() => setActiveSection("sequence")}>
                  {ui("Abrir sequência de prioridades")}
                </Button>
              </section>
            )}

            {activeSection === "production" && (
              <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
                aria-label={ui("Produção Programada")}>
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  {ui("Produção Programada")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {ui("Programação é independente da ordem de prioridades e da ativação cadastral. Os estados exibidos vêm do cadastro oficial de máquinas.")}
                </p>
                {isLoading ? (
                  <p role="status">{ui("Carregando sequência...")}</p>
                ) : loadingError ? (
                  <p role="alert" className="text-danger">{loadingError}</p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-3" role="group"
                      aria-label={ui("Resumo da programação")}>
                      {[
                        {
                          label: ui("Produção Programada"),
                          count: rows.filter((row) => row.productionMode === "scheduled").length,
                          tone: "border-emerald-500/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
                        },
                        {
                          label: ui("Fora de Produção"),
                          count: rows.filter((row) => row.productionMode === "not_scheduled").length,
                          tone: "border-amber-500/70 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200",
                        },
                        {
                          label: ui("Estado desconhecido"),
                          count: rows.filter((row) => row.productionMode == null).length,
                          tone: "border-border bg-muted text-foreground",
                        },
                      ].map((item) => (
                        <div key={item.label} className={cn("rounded-lg border-2 p-3", item.tone)}>
                          <p className="text-sm font-bold">{item.label}</p>
                          <p className="mt-1 text-2xl font-black tabular-nums">{item.count}</p>
                        </div>
                      ))}
                    </div>
                    {scheduleRequester && (
                      <p className="text-xs text-muted-foreground" role="status">
                        {scheduleRequester.canWrite
                          ? ui("Sua sessão permite alterar diretamente a programação das máquinas autorizadas.")
                          : ui("A programação exige aprovação de uma pessoa com permissão de escrita.")}
                      </p>
                    )}
                    <ul className="space-y-2">
                      {rows.map((machine) => (
                        <li key={machine.id} className={cn(
                          "flex flex-wrap items-center gap-3 rounded-lg border border-l-4 px-3 py-3 text-sm",
                          machine.productionMode === "scheduled"
                            ? "border-emerald-500/50 border-l-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30"
                            : machine.productionMode === "not_scheduled"
                              ? "border-amber-500/50 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/30"
                              : "border-border bg-muted/30",
                        )}>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words font-bold">{machine.name}</p>
                            <p className="break-all font-mono text-xs text-muted-foreground">{ui("ID")}: {machine.id}</p>
                            <PriorityActivationBadge active={machine.isActive} />
                          </div>
                          <div className="flex min-w-[150px] flex-col items-start gap-1 sm:items-end">
                            <PriorityProductionBadge mode={machine.productionMode} />
                            <p className="text-xs text-muted-foreground">
                              {machine.productionModeChangedAt
                                ? ui("Última alteração: {0}", { 0: formatDateTime(machine.productionModeChangedAt) })
                                : ui("Horário da alteração indisponível")}
                            </p>
                          </div>
                          {scheduleRequester && machine.productionMode && machine.isActive &&
                            (scheduleRequester.fullScope || scheduleRequester.machineIds.includes(machine.id)) && (
                            <Button type="button" variant="outline" size="sm"
                              disabled={isLoading || isSaving || Boolean(scheduleCheckingId) || Boolean(pendingSchedule) || hasUnsavedChanges}
                              onClick={() => void requestScheduleChange(machine)}>
                              {scheduleCheckingId === machine.id ? ui("Atualizando programação...") :
                                machine.productionMode === "scheduled"
                                  ? ui("Retirar da programação") : ui("Programar produção")}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {rows.length === 0 && (
                      <p role="status" className="text-sm text-muted-foreground">{ui("Nenhuma máquina disponível para ordenar.")}</p>
                    )}
                  </>
                )}
              </section>
            )}

            {activeSection === "history" && (
              <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
                aria-label={ui("Histórico e Auditoria")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold">{ui("Histórico e Auditoria")}</h2>
                  <Button type="button" variant="outline" size="sm" disabled={historyLoading}
                    onClick={() => void loadHistory()}>{ui("Atualizar histórico")}</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {ui("Mostramos até 100 alterações recentes da sequência, respeitando seu escopo de máquinas. A autoria global não é exibida para escopos parciais.")}
                </p>
                <p className="text-sm">
                  {lastOrderUpdatedAt
                    ? ui("Última atualização: {0}{1}", {
                        0: formatDateTime(lastOrderUpdatedAt),
                        1: lastOrderUpdatedBy ? ` · ${lastOrderUpdatedBy}` : "",
                      })
                    : access?.centralAccessEnabled && access?.principal?.machineScope !== "all"
                      ? ui("Dados de alteração global ocultos para este escopo de máquinas.")
                      : ui("Sequência ainda não salva manualmente")}
                </p>
                {historyLoading ? (
                  <p role="status" className="text-sm">{ui("Carregando histórico...")}</p>
                ) : historyError ? (
                  <p role="alert" className="text-sm text-danger">{historyError}</p>
                ) : historyItems.length === 0 ? (
                  <p role="status" className="text-sm text-muted-foreground">{ui("Nenhuma alteração de prioridade encontrada.")}</p>
                ) : (
                  <>
                    <ol className="space-y-2">
                      {historyItems.map((entry) => (
                        <li key={entry.id} className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">
                              {rows.find((machine) => machine.id === entry.machineId)?.name ?? entry.machineId}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDateTime(entry.changedAt)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {ui("Posição: {0} → {1}", {
                              0: entry.previousOrder ?? "—", 1: entry.newOrder ?? "—",
                            })}
                            {entry.changedBy ? ` · ${entry.changedBy}` : ""}
                          </p>
                          {(entry.previousPriorityRank !== entry.newPriorityRank) && (
                            <p className="text-xs text-muted-foreground">
                              {ui("Destaque: {0} → {1}", {
                                0: entry.previousPriorityRank ?? "—",
                                1: entry.newPriorityRank ?? "—",
                              })}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                    {historyTruncated && <p className="text-sm text-muted-foreground">
                      {ui("A lista mostra somente as 100 alterações mais recentes.")}
                    </p>}
                  </>
                )}
              </section>
            )}

            {activeSection === "help" && (
              <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6"
                aria-label={ui("Ajuda e Orientações")}>
                <h2 className="text-base font-bold">{ui("Como interpretar as prioridades")}</h2>
                <p className="text-sm text-muted-foreground">
                  {ui("Prioridade define a posição da máquina na sequência visual. Máquina ativa indica disponibilidade no cadastro. Produção programada determina a janela operacional e é um estado diferente.")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ui("Somente usuários autorizados podem salvar uma sequência. As cinco primeiras máquinas ativas recebem P1 a P5 no Dashboard.")}
                </p>
              </section>
            )}
          </main>
        </div>
      </div>

      {pendingSchedule && (
        <ProductionModeCredentialModal
          open
          machineId={pendingSchedule.machineId}
          currentMode={pendingSchedule.currentMode}
          requestedMode={pendingSchedule.requestedMode}
          onOpenChange={(open) => { if (!open) setPendingSchedule(null); }}
          onSuccess={() => {
            toast.success(ui("Programação de produção atualizada com autorização."));
            void loadOrder();
          }}
        />
      )}
      <DashboardPriorityLoginModal
        open={loginOpen}
        onOpenChange={(open) => {
          setLoginOpen(open);
          if (!open && passwordRequired && !isDashboardPriorityAuthenticated())
            void navigate({ to: returnTo });
        }}
        onSuccess={() => setAuthenticated(true)}
      />
    </div>
  );
}
