export interface SystemSettings {
  id: string;
  allowWholeSetCalls: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingsPatch {
  allowWholeSetCalls: boolean;
}
