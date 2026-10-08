export type AttendanceMode = "name" | "pin" | "rfid";
export type RfidInputTerminator = "enter" | "tab" | "fixed_length";
export type DashboardMachineOrderMode = "default" | "priority";

export interface SystemSettings {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingsPatch {
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
