export type AttendanceMode = "name" | "pin" | "rfid";
export type RfidInputTerminator = "enter" | "tab" | "fixed_length";

export interface SystemSettings {
  id: string;
  allowWholeSetCalls: boolean;
  attendanceMode: AttendanceMode;
  rfidReaderMode: "keyboard_hid";
  rfidInputTerminator: RfidInputTerminator;
  rfidCodeLength: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingsPatch {
  allowWholeSetCalls?: boolean;
  attendanceMode?: AttendanceMode;
  rfidReaderMode?: "keyboard_hid";
  rfidInputTerminator?: RfidInputTerminator;
  rfidCodeLength?: number | null;
}
