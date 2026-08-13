import type { MachineStatus } from "./machine";

export type AndonStatus = "none" | "open" | "in_progress" | "post_maintenance" | "finished" | "cancelled";

export type CallCategory = "maintenance" | "production";

export type CallOrigin = "kiosk" | "installer_health_check";

export type MaintenanceSubtype = "electrical" | "mechanical" | "hot_melt";

export type ProductionSubtype = "quality" | "leadership";

export type CallSubtype = MaintenanceSubtype | ProductionSubtype | (string & {});

export type TechnicianArea = CallSubtype;

export type CallCriticality = "low" | "medium" | "high";

export type SoundKey = CallSubtype;

export type TechnicianSessionEndReason = "handover" | "support_finished" | "final_call" | "transferred" | "break" | "manual" | "other";


export type TechnicianTimeAllocationSource =
  | "registered_session"
  | "full_period_final_selection"
  | "single_responsible_full_period"
  | "unassigned_time";

export interface TechnicianTimeAllocation {
  technicianId?: string;
  technicianName: string;
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  source: TechnicianTimeAllocationSource;
}

export interface TechnicianAttendanceSession {
  id: string;
  callId: string;
  machineId: string;
  technicianId?: string;
  technicianName: string;
  technicalArea?: TechnicianArea;
  shiftId?: string;
  shiftName?: string;
  startedAt: string;
  endedAt?: string;
  notes?: string;
  endReason?: TechnicianSessionEndReason;
  productionModeAtStart?: "scheduled" | "not_scheduled";
  productionModeAtEnd?: "scheduled" | "not_scheduled";
  machineStatusAtStart?: MachineStatus;
  machineStatusAtEnd?: MachineStatus;
}

export interface AndonCall {
  id: string;
  machineId: string;
  machineSetId?: string | null;
  machineSetCodeSnapshot?: string | null;
  machineSetNameSnapshot?: string | null;
  machineSetTypeSnapshot?: string | null;
  machineSubsetId?: string | null;
  machineSubsetCodeSnapshot?: string | null;
  machineSubsetNameSnapshot?: string | null;
  machineSubsetTypeSnapshot?: string | null;
  confirmedMachineSetId?: string | null;
  confirmedMachineSetCodeSnapshot?: string | null;
  confirmedMachineSetNameSnapshot?: string | null;
  confirmedMachineSetTypeSnapshot?: string | null;

  confirmedMachineSubsetId?: string | null;
  confirmedMachineSubsetCodeSnapshot?: string | null;
  confirmedMachineSubsetNameSnapshot?: string | null;
  confirmedMachineSubsetTypeSnapshot?: string | null;

  assetConfirmedAt?: string | null;
  assetConfirmedBy?: string | null;
  assetLocationChanged?: boolean;
  assetChangeReason?: string | null;

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
  technicianSessions?: TechnicianAttendanceSession[];
  technicianTimeAllocations?: TechnicianTimeAllocation[];
  technicianArea: TechnicianArea | null;
  callWaitingMinutes: number;
  attendanceMinutes: number;
  postMaintenanceMinutes: number;
  maintenanceReturnCount: number;
  totalCallMinutes: number;
  machineStoppedMinutes: number;
  productionModeAtOpen?: "scheduled" | "not_scheduled";
  productionModeAtAttend?: "scheduled" | "not_scheduled";
  productionModeAtFinish?: "scheduled" | "not_scheduled";
  machineStatusAtOpen?: MachineStatus;
  machineStatusAtAttend?: MachineStatus;
  machineStatusAtFinish?: MachineStatus;
  notes: string | null;
  createdBy: string | null;
  origin: CallOrigin;
  isSystemTest: boolean;
  updatedAt: string;
}

export interface CallTypeOption {
  id: CallSubtype;
  label: string;
  category: CallCategory;
  technicianArea: TechnicianArea | null;
  soundKey: SoundKey;
  colorClass: string;
  color: string;
  active: boolean;
  displayOrder: number;
}
