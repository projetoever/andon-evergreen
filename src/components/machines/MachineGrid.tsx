import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import { cn } from "@/lib/utils";
import { useAndon } from "@/context/AndonProvider";
import { MachineCard } from "./MachineCard";

const MAX_DASHBOARD_CARDS = 14;
const AUTO_RETURN_MS = 30_000;

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
    if (!isStopped && isOpen) return 2;
    if (isStopped && !call) return 3;
    if (isStopped && isAttending) return 4;
    if (!isStopped && isAttending) return 5;
    return 10;
  }

  if (isStopped && isOpen) return 6;
  if (!isStopped && isOpen) return 7;
  if (isStopped && !call) return 8;
  if (isStopped && isAttending) return 9;
  if (!isStopped && isAttending) return 10;
  return 11;
}

function chunkMachines(machines: Machine[]): Machine[][] {
  const pages: Machine[][] = [];

  for (let index = 0; index < machines.length; index += MAX_DASHBOARD_CARDS) {
    pages.push(machines.slice(index, index + MAX_DASHBOARD_CARDS));
  }

  return pages.length > 0 ? pages : [[]];
}

export function MachineGrid({ machines, className }: MachineGridProps) {
  const { calls } = useAndon();
  const [pageIndex, setPageIndex] = useState(0);

  const sortedMachines = useMemo(() => {
    const byNumber = machines.slice().sort(compareByMachineNumber);

    if (byNumber.length <= MAX_DASHBOARD_CARDS) {
      return byNumber;
    }

    return byNumber.sort((a, b) => {
      const priorityDiff = getDashboardPriority(a, calls) - getDashboardPriority(b, calls);
      return priorityDiff || compareByMachineNumber(a, b);
    });
  }, [calls, machines]);

  const pages = useMemo(() => chunkMachines(sortedMachines), [sortedMachines]);
  const hasOverflow = pages.length > 1;
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

  function handleSlideClick() {
    setPageIndex((current) => (current + 1) % pages.length);
  }

  return (
    <div
      className={cn(
        "relative h-full min-h-0 overflow-hidden p-2",
        hasOverflow && "pl-10",
        className,
      )}
    >
      {hasOverflow && (
        <button
          type="button"
          onClick={handleSlideClick}
          className="absolute left-1 top-1/2 z-20 inline-flex -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-r-xl border border-border bg-card/90 px-1.5 py-3 text-[10px] font-black uppercase tracking-wide text-muted-foreground opacity-65 shadow-lg backdrop-blur transition hover:opacity-100 hover:text-foreground"
          title={pageIndex === 0 ? `Ver ${overflowCount} máquina(s) restante(s)` : "Voltar aos cards principais"}
          aria-label={pageIndex === 0 ? `Ver ${overflowCount} máquina(s) restante(s)` : "Voltar aos cards principais"}
        >
          {pageIndex === 0 ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          <span className="leading-none">{pageIndex === 0 ? `+${overflowCount}` : "1"}</span>
        </button>
      )}

      <div className="h-full min-h-0 overflow-hidden">
        <div
          className="flex h-full min-h-0 transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${pageIndex * 100}%)` }}
        >
          {pages.map((page, index) => (
            <div key={index} className="h-full min-w-full shrink-0">
              <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[repeat(7,minmax(0,1fr))] items-stretch gap-1.5 overflow-visible sm:grid-cols-3 sm:grid-rows-[repeat(5,minmax(0,1fr))] md:grid-cols-4 md:grid-rows-[repeat(4,minmax(0,1fr))] lg:grid-cols-5 lg:grid-rows-[repeat(3,minmax(0,1fr))] xl:grid-cols-7 xl:grid-rows-2 2xl:gap-2">
                {page.map((machine) => (
                  <MachineCard key={machine.id} machine={machine} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
