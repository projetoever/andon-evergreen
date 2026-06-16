import { useMemo } from "react";
import { useAndon } from "@/context/AndonProvider";
import { isToday } from "@/utils/dateTimeUtils";
import { calculateCallWaitingMinutes, calculateMachineStoppedMinutes } from "@/utils/durationUtils";
import type { DashboardSummary } from "@/types/history";

export function useDashboardSummary(): DashboardSummary {
  const { machines, calls, settings } = useAndon();
  return useMemo(() => {
    const activeMachines = machines.filter((machine) => machine.isActive);
    const totalMachines = activeMachines.length;
    const runningMachines = activeMachines.filter(
      (m) => m.machineStatus === "running" && m.productionMode === "scheduled",
    ).length;
    const stoppedMachines = activeMachines.filter(
      (m) => m.machineStatus === "stopped" && m.productionMode === "scheduled",
    ).length;
    const notScheduledMachines = activeMachines.filter(
      (m) => m.productionMode === "not_scheduled",
    ).length;
    const openCalls = calls.filter((c) => c.status === "open").length;
    const inProgressCalls = calls.filter((c) => c.status === "in_progress").length;
    const finishedCallsToday = calls.filter(
      (c) => c.status === "finished" && isToday(c.finishedAt),
    ).length;
    const now = new Date().toISOString();
    let criticalCalls = 0;
    for (const c of calls) {
      if (c.status !== "open" && c.status !== "in_progress") continue;
      const waiting = calculateCallWaitingMinutes(c, now);
      if (waiting >= settings.alertRules.callOpenCriticalMinutes) {
        criticalCalls += 1;
      }
    }
    for (const m of activeMachines) {
      if (m.productionMode !== "scheduled") continue;
      const stopped = calculateMachineStoppedMinutes(m, now);
      if (stopped >= settings.alertRules.machineStoppedCriticalMinutes) {
        criticalCalls += 1;
      }
    }
    return {
      totalMachines,
      runningMachines,
      stoppedMachines,
      openCalls,
      inProgressCalls,
      finishedCallsToday,
      criticalCalls,
      notScheduledMachines,
    };
  }, [machines, calls, settings]);
}
