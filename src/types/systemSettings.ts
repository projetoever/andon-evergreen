export type AttendanceMode = "name" | "pin" | "rfid";
export type RfidInputTerminator = "enter" | "tab" | "fixed_length";
export type DashboardMachineOrderMode = "default" | "priority";
import type { VisualPaletteDraft } from "@/theme/andonVisualPalette";

export interface SystemSettings {
  id: string;
  clientName: string;
  clientUnit: string;
  allowWholeSetCalls: boolean;
  virtualKeyboardEnabled: boolean;
  requireWorkOrderAtOpen: boolean;
  restrictMaintenanceCompletionToAttendanceWorkstation: boolean;
  dashboardSoundMuteTimerEnabled: boolean;
  dashboardSoundMuteDurationMinutes: number;
  dashboardSoundAutoMuteTimerEnabled: boolean;
  dashboardSoundActiveDurationMinutes: number;
  dashboardSoundMuted: boolean;
  dashboardSoundMutedAt: string | null;
  dashboardSoundMutedUntil: string | null;
  dashboardSoundMuteReason: "manual" | "auto" | null;
  dashboardMachineOrderMode: DashboardMachineOrderMode;
  attendanceMode: AttendanceMode;
  rfidReaderMode: "keyboard_hid";
  rfidInputTerminator: RfidInputTerminator;
  rfidCodeLength: number | null;
  filterTechniciansByCurrentShift: boolean;
  /** Read-only in UX-12/2A: centrally stored only after a future audited write API is enabled. */
  andonVisualPalette?: VisualPaletteDraft;
  andonVisualPaletteRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingsPatch {
  clientName?: string;
  clientUnit?: string;
  allowWholeSetCalls?: boolean;
  virtualKeyboardEnabled?: boolean;
  requireWorkOrderAtOpen?: boolean;
  restrictMaintenanceCompletionToAttendanceWorkstation?: boolean;
  dashboardSoundMuteTimerEnabled?: boolean;
  dashboardSoundMuteDurationMinutes?: number;
  dashboardSoundAutoMuteTimerEnabled?: boolean;
  dashboardSoundActiveDurationMinutes?: number;
  dashboardSoundMuted?: boolean;
  dashboardMachineOrderMode?: DashboardMachineOrderMode;
  attendanceMode?: AttendanceMode;
  rfidReaderMode?: "keyboard_hid";
  rfidInputTerminator?: RfidInputTerminator;
  rfidCodeLength?: number | null;
  filterTechniciansByCurrentShift?: boolean;
}
