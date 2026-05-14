import type { MachineStatus } from "./machine";

export type AndonStatus = "none" | "open" | "in_progress" | "post_maintenance" | "finished";

export type CallCategory = "maintenance" | "production";

export type MaintenanceSubtype = "electrical" | "mechanical" | "hot_melt";

export type ProductionSubtype = "quality" | "leadership";

export type CallSubtype = MaintenanceSubtype | ProductionSubtype;

export type TechnicianArea = "electrical" | "mechanical" | "hot_melt";

export type CallCriticality = "low" | "medium" | "high";

export type SoundKey = "electrical" | "mechanical" | "hot_melt" | "quality" | "leadership";

export interface AndonCall {
  id: string;
  machineId: string;
  category: CallCategory;
  subtype: CallSubtype;
  status: AndonStatus;
  criticality: CallCriticality;
  machineCondition: MachineStatus;
  openedAt: string;
  attendedAt: string | null;
  currentAttendanceStartedAt: string | null;
  maintenanceCompletedAt: string | null;
  finishedAt: string | null;
  technicianName: string | null;
  technicianNames: string[];
  technicianArea: TechnicianArea | null;
  callWaitingMinutes: number;
  attendanceMinutes: number;
  postMaintenanceMinutes: number;
  maintenanceReturnCount: number;
  totalCallMinutes: number;
  machineStoppedMinutes: number;
  notes: string | null;
  createdBy: "kiosk";
  updatedAt: string;
}

export interface CallTypeOption {
  id: CallSubtype;
  label: string;
  category: CallCategory;
  technicianArea: TechnicianArea | null;
  soundKey: SoundKey;
  colorClass: string;
}
