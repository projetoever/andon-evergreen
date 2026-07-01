import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import { cn } from "@/lib/utils";
import { useAndon } from "@/context/AndonProvider";
import { MachineCard } from "./MachineCard";

const MAX_DASHBOARD_CARDS = 14;
const AUTO_RETURN_MS = 30_000;
const GRID_CLASS =
  "grid h-full min-h-0 grid-cols-2 grid-rows-[repeat(7,minmax(0,1fr))] items-stretch gap-1.5 overflow-visible p-2 sm:grid-cols-3 sm:grid-rows-[repeat(5,minmax(0,1fr))] md:grid-cols-4 md:grid-rows-[repeat(4,minmax(0,1fr))] lg:grid-cols-5 lg:grid-rows-[repeat(3,minmax(0,1fr))] xl:grid-cols-7 xl:grid-rows-2 2xl:gap-2";

interface MachineGridProps {
  machines: Machine[];
  className?: string;
}

function getMachineNumber(machine: Machine): number {
  const value = Number(machine.id);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function compareByMachineNumber(a: Machine, b: Machine): number {
  return getMachineNumber(a) - getMachineNumber(b) || a.id.localeCompare(b.id, "pt-BR", { numeric: true });
}

function getCurrentCall(machine: Machine, calls: AndonCall[]): AndonCall | null {
  if (!machine.currentCallId) return null;
  return calls.find((call) => call.id === machine.currentCallId) ?? null;
}

function isActiveAttendance(call: AndonCall | null): boolean {
  return call?.status === "in_progress" || call?.status === "post_maintenance";
}

function getDashboardPriority(machine: Machine, calls: AndonCall[]): number {
  const call = getCurrentCall(machine, calls);
  const isScheduled = machine.productionMode === "scheduled";
  const isStopped = machine.machineStatus === "stopped";
  const isOpen = call?.status === "open";
  const isAttending = isActiveAttendance(call);

  if (isScheduled) {
    if (isStopped && isOpen) return 1;
    if (isStopped && !call) return 2;
    if (isStopped && isAttending) return 3;
    if (!isStopped && isAttending) return 4;
    if (!isStopped && isOpen) return 5;
    return 9;
  }

  if (isStopped && isOpen) return 6;
  if (isStopped && !call) return 7;
  if (isStopped && isAttending) return 8;
  if (!isStopped && isAttending) return 9;
  if (!isStopped && isOpen) return 10;
  return 10;
}

function chunkMachines(machines: Machine[]): Machine[][] {
  const pages: Machine[][] = [];

  for (let index = 0; index < machines.length; index += MAX_DASHBOARD_CARDS) {
    pages.push(machines.slice(index, index + MAX_DASHBOARD_CARDS));
  }

  return pages.length > 0 ? pages : [[]];
}

function MachinePageGrid({ machines }: { machines: Machine[] }) {
  return (
    <div className={GRID_CLASS}>
      {machines.map((machine) => (
        <MachineCard key={machine.id} machine={machine} />
      ))}
    </div>
  );
}

export function MachineGrid({ machines, className }: MachineGridProps) {
  const { calls } = useAndon();
  const [pageIndex, setPageIndex] = useState(0);

  const numericMachines = useMemo(() => machines.slice().sort(compareByMachineNumber), [machines]);
  const hasOverflow = numericMachines.length > MAX_DASHBOARD_CARDS;

  const sortedMachines = useMemo(() => {
    if (!hasOverflow) return numericMachines;

    return numericMachines.slice().sort((a, b) => {
      const priorityDiff = getDashboardPriority(a, calls) - getDashboardPriority(b, calls);
      return priorityDiff || compareByMachineNumber(a, b);
    });
  }, [calls, hasOverflow, numericMachines]);

  const pages = useMemo(() => chunkMachines(sortedMachines), [sortedMachines]);
  const overflowCount = Math.max(0, sortedMachines.length - MAX_DASHBOARD_CARDS);

  useEffect(() => {
    if (pageIndex <= pages.length - 1) return;
    setPageIndex(0);
  }, [pageIndex, pages.length]);

  useEffect(() => {
    if (pageIndex === 0) return;

    const timer = window.setTimeout(() => setPageIndex(0), AUTO_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [pageIndex]);

  if (!hasOverflow) {
    return (
      <div className={cn("h-full min-h-0", className)}>
        <MachinePageGrid machines={numericMachines} />
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
        className="absolute left-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-card/95 px-1.5 py-3 text-muted-foreground opacity-70 shadow-lg backdrop-blur transition hover:opacity-100 hover:text-foreground"
        title={pageIndex === 0 ? `Ver ${overflowCount} máquina(s) restante(s)` : "Voltar aos cards principais"}
        aria-label={pageIndex === 0 ? `Ver ${overflowCount} máquina(s) restante(s)` : "Voltar aos cards principais"}
      >
        {pageIndex === 0 ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
      </button>

      <div className="h-full min-h-0 w-full overflow-hidden">
        <div
          className="flex h-full min-h-0 w-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${pageIndex * 100}%)` }}
        >
          {pages.map((page, index) => (
            <div key={index} className="h-full min-h-0 w-full min-w-full shrink-0">
              <MachinePageGrid machines={page} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
