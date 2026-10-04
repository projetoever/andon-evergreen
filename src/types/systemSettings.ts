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
  dashboardMachineOrderMode: DashboardMachineOrderMode;
  attendanceMode: AttendanceMode;
  rfidReaderMode: "keyboard_hid";
  rfidInputTerminator: RfidInputTerminator;
  rfidCodeLength: number | null;
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
  dashboardMachineOrderMode?: DashboardMachineOrderMode;
  attendanceMode?: AttendanceMode;
  rfidReaderMode?: "keyboard_hid";
  rfidInputTerminator?: RfidInputTerminator;
  rfidCodeLength?: number | null;
}
