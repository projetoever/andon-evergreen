import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { toast } from "sonner";

import { DashboardPriorityLoginModal } from "@/components/priority/DashboardPriorityLoginModal";
import { Button } from "@/components/ui/button";
import { useAndon } from "@/context/AndonProvider";
import {
  getDashboardPriorityOrder,
  getStoredDashboardPrioritySession,
  isDashboardPriorityAuthenticated,
  logoutDashboardPriority,
  saveDashboardPriorityOrder,
  type DashboardPriorityMachine,
} from "@/services/dashboardPriorityService";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTimeUtils";

export function DashboardPriorityPage() {
  const navigate = useNavigate();
  const { machines } = useAndon();
  const [authenticated, setAuthenticated] = useState(() =>
    isDashboardPriorityAuthenticated(),
  );
  const [loginOpen, setLoginOpen] = useState(() => !isDashboardPriorityAuthenticated());
  const [rows, setRows] = useState<DashboardPriorityMachine[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [lastOrderUpdatedAt, setLastOrderUpdatedAt] = useState<string | null>(null);
  const [lastOrderUpdatedBy, setLastOrderUpdatedBy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentIds = rows.map((row) => row.id);
  const hasUnsavedChanges = currentIds.join("|") !== savedIds.join("|");

  const activePriorityRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    rows
      .filter((row) => row.isActive)
      .slice(0, 5)
      .forEach((row, index) => ranks.set(row.id, index + 1));
    return ranks;
  }, [rows]);

  async function loadOrder() {
    if (!isDashboardPriorityAuthenticated()) {
      setAuthenticated(false);
      setLoginOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const snapshot = await getDashboardPriorityOrder(machines);
      setRows(snapshot.machines);
      setSavedIds(snapshot.machines.map((machine) => machine.id));
      setLastOrderUpdatedAt(snapshot.lastOrderUpdatedAt);
      setLastOrderUpdatedBy(snapshot.lastOrderUpdatedBy);
    } catch (error) {
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
  }

  useEffect(() => {
    if (authenticated) void loadOrder();
  }, [authenticated]);

  function moveRow(sourceIndex: number, targetIndex: number) {
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
    if (!hasUnsavedChanges || isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveDashboardPriorityOrder(rows.map((row) => row.id));
      setSavedIds(rows.map((row) => row.id));
      setLastOrderUpdatedAt(result.lastOrderUpdatedAt);
      setLastOrderUpdatedBy(result.lastOrderUpdatedBy);
      toast.success("Sequência visual de prioridades salva.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar a sequência.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    await logoutDashboardPriority();
    setAuthenticated(false);
    setRows([]);
    setSavedIds([]);
    void navigate({ to: "/" });
  }

  const session = getStoredDashboardPrioritySession();

  return (
    <div className="min-h-dvh bg-background p-3 md:p-5">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button type="button" variant="outline" size="icon" onClick={() => void navigate({ to: "/" })}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListOrdered className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                Organização visual
              </p>
              <h1 className="text-xl font-black">Prioridade de produção</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Arraste as máquinas ou use ↑/↓. As cinco primeiras máquinas ativas recebem destaque no Dashboard.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {session?.username && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                {session.username}
              </span>
            )}
            <Button type="button" variant="outline" onClick={() => void handleLogout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span>
            {rows.length} máquina(s) na sequência · {rows.filter((row) => row.isActive).length} ativa(s)
          </span>
          <span>
            {lastOrderUpdatedAt
              ? `Última atualização: ${formatDateTime(lastOrderUpdatedAt)}${
                  lastOrderUpdatedBy ? ` · ${lastOrderUpdatedBy}` : ""
                }`
              : "Sequência ainda não salva manualmente"}
          </span>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando sequência...
            </div>
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
                      const sourceId =
                        draggedId || event.dataTransfer.getData("text/plain");
                      if (sourceId) moveById(sourceId, row.id);
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
                      draggable
                      onDragStart={(event) => {
                        setDraggedId(row.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", row.id);
                      }}
                      onDragEnd={() => setDraggedId(null)}
                      title="Arrastar para reorganizar"
                      aria-label={`Arrastar ${row.name}`}
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
                            P{activeRank}
                          </span>
                        )}
                        {!row.isActive && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                            INATIVA
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => moveRow(index, index - 1)}
                        aria-label={`Mover ${row.name} para cima`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={index === rows.length - 1}
                        onClick={() => moveRow(index, index + 1)}
                        aria-label={`Mover ${row.name} para baixo`}
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

        <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur">
          <p className="text-xs text-muted-foreground">
            {hasUnsavedChanges
              ? "Alterações não salvas. O Dashboard ainda usa a sequência anterior."
              : "Sequência sincronizada."}
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
              Descartar
            </Button>
            <Button
              type="button"
              disabled={!hasUnsavedChanges || isSaving}
              onClick={() => void handleSave()}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar sequência"}
            </Button>
          </div>
        </div>
      </div>

      <DashboardPriorityLoginModal
        open={loginOpen}
        onOpenChange={(open) => {
          setLoginOpen(open);
          if (!open && !authenticated) void navigate({ to: "/" });
        }}
        onSuccess={() => setAuthenticated(true)}
      />
    </div>
  );
}
