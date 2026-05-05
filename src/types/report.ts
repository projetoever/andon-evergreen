export interface MachineAttendanceReport {
  machineId: string;
  totalCalls: number;
  lowCriticalityCalls: number;
  mediumCriticalityCalls: number;
  highCriticalityCalls: number;
  averageAndonMinutes: number;
  averageAttendanceMinutes: number;
  averagePostMaintenanceMinutes: number;
  totalAttendanceMinutes: number;
  totalPostMaintenanceMinutes: number;
  totalMachineStoppedMinutes: number;
  callsBySubtype: Record<string, number>;
  lastCallFinishedAt: string | null;
}
