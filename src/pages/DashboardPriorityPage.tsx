import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GripVertical,
  ListOrdered,
  LogOut,
  Save,
  Undo2,
} from "lucide-react";
import { toast } from "@/i18n/toast";

import { DashboardPriorityLoginModal } from "@/components/priority/DashboardPriorityLoginModal";
import { ProductionModeCredentialModal } from "@/components/machines/ProductionModeCredentialModal";
import { accessRequest, type AccessState } from "@/services/accessService";
import { PrioritySectionNav, type PrioritySectionId } from "@/components/priority/PrioritySectionNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleNavigation } from "@/components/layout/ModuleNavigation";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import {
  getDashboardPriorityOrder,
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
  const centralReadOnly = access?.centralAccessEnabled === true &&
    (access?.prioritiesWriteEnabled !== true || access?.principal?.machineScope !== "all");
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
  // Preserve the existing editing flow as the initial section while introducing
  // the five-panel shell. No operational machine state is inferred by this UI.
  const [activeSection, setActiveSection] = useState<PrioritySectionId>("sequence");
  const [pendingSchedule, setPendingSchedule] = useState<{
    machineId: string; currentMode: ProductionMode; requestedMode: ProductionMode;
  } | null>(null);
  const [scheduleCheckingId, setScheduleCheckingId] = useState<string | null>(null);

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

  function moveRow(sourceIndex: number, targetIndex: number) {
    if (centralReadOnly) return;
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex >= rows.length ||
      targetIndex >= rows.length ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    setRows((current) => {
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function moveById(sourceId: string, targetId: string) {
    const sourceIndex = rows.findIndex((row) => row.id === sourceId);
    const targetIndex = rows.findIndex((row) => row.id === targetId);
    moveRow(sourceIndex, targetIndex);
  }

  async function handleSave() {
    if (centralReadOnly || !hasUnsavedChanges || isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveDashboardPriorityOrder(rows.map((row) => row.id));
      setSavedIds(rows.map((row) => row.id));
      setLastOrderUpdatedAt(result.lastOrderUpdatedAt);
      setLastOrderUpdatedBy(result.lastOrderUpdatedBy);
      toast.success("Sequência visual de prioridades salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a sequência.");
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
    if (scheduleCheckingId || pendingSchedule || isLoading || isSaving ||
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
    setScheduleCheckingId(machine.id);
    try {
      // The terminal session is checked afresh. The actual write requires a
      // DIFFERENT credential-verified approver and a backend expected-mode CAS.
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
      // Confirmation is the explicit credential form below. No state is
      // changed by requesting the form.
      setPendingSchedule({
        machineId: machine.id,
        currentMode: machine.productionMode,
        requestedMode: machine.productionMode === "scheduled" ? "not_scheduled" : "scheduled",
      });
    } catch {
      toast.error(ui("Não foi possível verificar sua permissão. Tente novamente."));
    } finally {
      setScheduleCheckingId(null);
    }
  }

  const session = getStoredDashboardPrioritySession();

  return (
    <div className="andon-screen-enter min-h-dvh bg-background p-3 md:p-5">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={ui("Voltar")}
              onClick={() => void navigate({ to: returnTo })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListOrdered className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                {ui("Organização visual")}
              </p>
              <h1 className="text-xl font-black">{ui("Prioridade de produção")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {ui(
                  "Arraste as máquinas ou use ↑/↓. As cinco primeiras máquinas ativas recebem destaque no Dashboard.",
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LanguageSelector compact />
            <ModuleNavigation showModuleLinks />
            {session?.username && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                {session.username}
              </span>
            )}
            {passwordRequired && (
              <Button type="button" variant="outline" onClick={() => void handleLogout()}>
                <LogOut className="mr-2 h-4 w-4" />
                {ui("Sair")}
              </Button>
            )}
          </div>
        </header>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <PrioritySectionNav activeSection={activeSection} onSectionChange={setActiveSection} />
          <main id="priority-main" className="min-w-0 space-y-4">
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
          ) : rows.length === 0 ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">
              {ui("Nenhuma máquina disponível para ordenar.")}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((row, index) => {
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
                      "grid grid-cols-[42px_34px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 transition",
                      draggedId === row.id && "opacity-50",
                      activeRank !== null && "bg-primary/[0.04]",
                      !row.isActive && "opacity-55",
                    )}
                  >
                    <div className="text-center font-mono text-sm font-black text-muted-foreground">
                      {index + 1}
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

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black">{row.name}</p>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ID {row.id}
                        </span>
                        {activeRank !== null && (
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
                            {ui("P")}
                            {activeRank}
                          </span>
                        )}
                        {!row.isActive && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                            {ui("INATIVA")}
                          </span>
                        )}
                        {row.productionMode && (
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold",
                            row.productionMode === "scheduled"
                              ? "border-success/40 bg-success/10 text-foreground"
                              : "border-border bg-muted text-muted-foreground")}>
                            {ui(row.productionMode === "scheduled" ? "Produção Programada" : "Fora de Produção")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={centralReadOnly || index === 0}
                        onClick={() => moveRow(index, index - 1)}
                        aria-label={ui("Mover {0} para cima", { 0: row.name })}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={centralReadOnly || index === rows.length - 1}
                        onClick={() => moveRow(index, index + 1)}
                        aria-label={ui("Mover {0} para baixo", { 0: row.name })}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
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
              <section className="space-y-4 rounded-xl border border-border bg-card p-5"
                aria-label={ui("Produção Programada")}>
                <h2 className="text-base font-bold">{ui("Produção Programada")}</h2>
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
                        { label: ui("Produção Programada"), count: rows.filter((row) => row.productionMode === "scheduled").length },
                        { label: ui("Fora de Produção"), count: rows.filter((row) => row.productionMode === "not_scheduled").length },
                        { label: ui("Estado desconhecido"), count: rows.filter((row) => row.productionMode == null).length },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg border border-border bg-background p-3">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="mt-1 text-2xl font-black tabular-nums">{item.count}</p>
                        </div>
                      ))}
                    </div>
                    <ul className="divide-y divide-border">
                      {rows.map((machine) => (
                        <li key={machine.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{machine.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">ID {machine.id}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {machine.productionMode === "scheduled"
                                ? ui("Produção Programada")
                                : machine.productionMode === "not_scheduled"
                                  ? ui("Fora de Produção") : ui("Estado desconhecido")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {machine.productionModeChangedAt
                                ? ui("Última alteração: {0}", { 0: formatDateTime(machine.productionModeChangedAt) })
                                : ui("Horário da alteração indisponível")}
                            </p>
                          </div>
                          {access?.centralAccessEnabled === true && machine.productionMode && machine.isActive && (
                            <Button type="button" variant="outline" size="sm"
                              disabled={isLoading || isSaving || Boolean(scheduleCheckingId) || Boolean(pendingSchedule) || hasUnsavedChanges}
                              onClick={() => void requestScheduleChange(machine)}>
                              {scheduleCheckingId === machine.id ? ui("Verificando permissão...") :
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
              <section className="rounded-xl border border-border bg-card p-5"
                aria-label={ui("Histórico e Auditoria")}>
                <h2 className="text-base font-bold">{ui("Última alteração da sequência")}</h2>
                <p className="mt-3 text-sm">
                  {lastOrderUpdatedAt
                    ? ui("Última atualização: {0}{1}", {
                        0: formatDateTime(lastOrderUpdatedAt),
                        1: lastOrderUpdatedBy ? ` · ${lastOrderUpdatedBy}` : "",
                      })
                    : access?.centralAccessEnabled && access?.principal?.machineScope !== "all"
                      ? ui("Dados de alteração global ocultos para este escopo de máquinas.")
                      : ui("Sequência ainda não salva manualmente")}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {ui("Este resumo não é o histórico completo de auditoria. O detalhamento auditável será disponibilizado após validação dos acessos.")}
                </p>
              </section>
            )}

            {activeSection === "help" && (
              <section className="space-y-3 rounded-xl border border-border bg-card p-5"
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
