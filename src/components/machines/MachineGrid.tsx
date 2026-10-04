import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Factory } from "lucide-react";
import type { Machine } from "@/types/machine";
import type { DashboardMachineOrderMode } from "@/types/systemSettings";
import { cn } from "@/lib/utils";
import { useAndon } from "@/context/AndonProvider";
import { EmptyState } from "@/components/common/EmptyState";
import {
  MAX_DASHBOARD_CARDS,
  compareByMachineNumber,
  compareByProductionPriority,
  getDashboardPrioritySignature,
  getProductionPrioritySignature,
  splitMachinesByDashboardPriority,
  splitMachinesByProductionPriority,
} from "@/utils/dashboardPriorityUtils";
import { MachineCard } from "./MachineCard";

const AUTO_RETURN_MS = 30_000;
const GRID_CLASS =
  "grid h-full min-h-0 grid-cols-2 grid-rows-[repeat(7,minmax(0,1fr))] items-stretch gap-1.5 overflow-visible p-2 sm:grid-cols-3 sm:grid-rows-[repeat(5,minmax(0,1fr))] md:grid-cols-4 md:grid-rows-[repeat(4,minmax(0,1fr))] lg:grid-cols-5 lg:grid-rows-[repeat(3,minmax(0,1fr))] xl:grid-cols-7 xl:grid-rows-2 2xl:gap-2";

interface MachineGridProps {
  machines: Machine[];
  className?: string;
  orderMode?: DashboardMachineOrderMode;
}

function MachinePageGrid({
  machines,
  priorityRanks,
}: {
  machines: Machine[];
  priorityRanks: Map<string, number>;
}) {
  const groupedPriorityMachines = machines.filter((machine) =>
    priorityRanks.has(machine.id),
  );
  const remainingMachines = machines.filter((machine) => !priorityRanks.has(machine.id));
  const hasPriorityGroup =
    groupedPriorityMachines.length > 0 &&
    groupedPriorityMachines.every(
      (machine, index) => machines[index]?.id === machine.id,
    );

  function renderMachineCard(machine: Machine) {
    return (
      <MachineCard
        key={machine.id}
        machine={machine}
        productionPriorityRank={priorityRanks.get(machine.id) ?? null}
      />
    );
  }

  return (
    <div className={GRID_CLASS}>
      {hasPriorityGroup ? (
        <>
          <div
            className="contents lg:relative lg:grid lg:min-h-0 lg:gap-1.5 2xl:gap-2"
            style={{
              gridColumn: `span ${groupedPriorityMachines.length} / span ${groupedPriorityMachines.length}`,
              gridTemplateColumns: `repeat(${groupedPriorityMachines.length}, minmax(0, 1fr))`,
            }}
            data-production-priority-group="true"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 hidden rounded-[1rem] border-2 border-orange-500/70 shadow-[0_0_0_1px_rgba(249,115,22,0.10)] lg:block"
            />
            {groupedPriorityMachines.map(renderMachineCard)}
          </div>
          {remainingMachines.map(renderMachineCard)}
        </>
      ) : (
        machines.map(renderMachineCard)
      )}
    </div>
  );
}

export function MachineGrid({
  machines,
  className,
  orderMode = "default",
}: MachineGridProps) {
  const { calls } = useAndon();
  const [pageIndex, setPageIndex] = useState(0);

  const orderedMachines = useMemo(
    () =>
      machines
        .slice()
        .sort(orderMode === "priority" ? compareByProductionPriority : compareByMachineNumber),
    [machines, orderMode],
  );
  const hasOverflow = orderedMachines.length > MAX_DASHBOARD_CARDS;

  const priorityRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    if (orderMode !== "priority") return ranks;

    orderedMachines.slice(0, 5).forEach((machine, index) => {
      ranks.set(machine.id, index + 1);
    });
    return ranks;
  }, [orderMode, orderedMachines]);

  const pages = useMemo(() => {
    if (!hasOverflow) return [orderedMachines];
    return orderMode === "priority"
      ? splitMachinesByProductionPriority(orderedMachines, calls)
      : splitMachinesByDashboardPriority(orderedMachines, calls);
  }, [calls, hasOverflow, orderMode, orderedMachines]);

  const prioritySignature = useMemo(
    () =>
      orderMode === "priority"
        ? getProductionPrioritySignature(orderedMachines, calls)
        : getDashboardPrioritySignature(orderedMachines, calls),
    [calls, orderMode, orderedMachines],
  );

  const overflowCount = Math.max(0, orderedMachines.length - MAX_DASHBOARD_CARDS);

  useEffect(() => {
    if (pageIndex <= pages.length - 1) return;
    setPageIndex(0);
  }, [pageIndex, pages.length]);

  useEffect(() => {
    setPageIndex(0);
  }, [prioritySignature]);

  useEffect(() => {
    if (pageIndex === 0) return;

    const timer = window.setTimeout(() => setPageIndex(0), AUTO_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [pageIndex]);

  if (orderedMachines.length === 0) {
    return (
      <div className={cn("flex h-full min-h-0 items-center justify-center", className)}>
        <EmptyState
          icon={<Factory className="h-12 w-12" />}
          title="Nenhuma máquina cadastrada"
          description="Abra as configurações administrativas para cadastrar a primeira máquina do ANDON."
        />
      </div>
    );
  }

  if (!hasOverflow) {
    return (
      <div className={cn("h-full min-h-0", className)}>
        <MachinePageGrid machines={orderedMachines} priorityRanks={priorityRanks} />
      </div>
    );
  }

  function handleSlideClick() {
    setPageIndex((current) => (current + 1) % pages.length);
  }

  return (
    <div className={cn("relative h-full min-h-0 overflow-hidden", className)}>
      <button
        type="button"
        onClick={handleSlideClick}
        className="absolute right-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-card/95 px-1.5 py-3 text-muted-foreground opacity-70 shadow-lg backdrop-blur transition hover:opacity-100 hover:text-foreground"
        title={
          pageIndex === 0
            ? `Ver ${overflowCount} máquina(s) restante(s)`
            : "Voltar aos cards principais"
        }
        aria-label={
          pageIndex === 0
            ? `Ver ${overflowCount} máquina(s) restante(s)`
            : "Voltar aos cards principais"
        }
      >
        {pageIndex === 0 ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <ChevronLeft className="h-5 w-5" />
        )}
      </button>

      <div className="h-full min-h-0 w-full overflow-hidden">
        <div
          className="flex h-full min-h-0 w-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${pageIndex * 100}%)` }}
        >
          {pages.map((page, index) => (
            <div key={index} className="h-full min-h-0 w-full min-w-full shrink-0">
              <MachinePageGrid machines={page} priorityRanks={priorityRanks} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
