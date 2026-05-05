import type { AndonCall, CallCriticality } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { MachineAttendanceReport } from "@/types/report";

function getAverage(total: number, count: number): number {
  if (count === 0) return 0;
  return Math.round(total / count);
}

function getCriticality(call: AndonCall): CallCriticality {
  return call.criticality ?? "medium";
}

export function buildMachineAttendanceReports(
  calls: AndonCall[],
  machines: Machine[],
): MachineAttendanceReport[] {
  return machines.map((machine) => {
    const finishedCalls = calls.filter(
      (call) => call.machineId === machine.id && call.status === "finished",
    );

    const report: MachineAttendanceReport = {
      machineId: machine.id,
      totalCalls: finishedCalls.length,
      lowCriticalityCalls: 0,
      mediumCriticalityCalls: 0,
      highCriticalityCalls: 0,
      averageAndonMinutes: 0,
      averageAttendanceMinutes: 0,
      averagePostMaintenanceMinutes: 0,
      totalAttendanceMinutes: 0,
      totalPostMaintenanceMinutes: 0,
      totalMachineStoppedMinutes: 0,
      callsBySubtype: {},
      lastCallFinishedAt: null,
    };

    let totalAndonMinutes = 0;
    for (const call of finishedCalls) {
      const criticality = getCriticality(call);
      if (criticality === "low") report.lowCriticalityCalls += 1;
      if (criticality === "medium") report.mediumCriticalityCalls += 1;
      if (criticality === "high") report.highCriticalityCalls += 1;

      const postMaintenanceMinutes = call.postMaintenanceMinutes ?? 0;
      totalAndonMinutes += call.callWaitingMinutes;
      report.totalAttendanceMinutes += call.attendanceMinutes;
      report.totalPostMaintenanceMinutes += postMaintenanceMinutes;
      report.totalMachineStoppedMinutes += call.machineStoppedMinutes;
      report.callsBySubtype[call.subtype] = (report.callsBySubtype[call.subtype] ?? 0) + 1;

      if (
        !report.lastCallFinishedAt ||
        (call.finishedAt && new Date(call.finishedAt) > new Date(report.lastCallFinishedAt))
      ) {
        report.lastCallFinishedAt = call.finishedAt;
      }
    }

    report.averageAndonMinutes = getAverage(totalAndonMinutes, report.totalCalls);
    report.averageAttendanceMinutes = getAverage(report.totalAttendanceMinutes, report.totalCalls);
    report.averagePostMaintenanceMinutes = getAverage(
      report.totalPostMaintenanceMinutes,
      report.totalCalls,
    );

    return report;
  });
}
