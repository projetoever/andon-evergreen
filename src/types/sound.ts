import type { CallSubtype } from "./andon";

export const DEFAULT_SOUND_MACHINE_ID = "default" as const;

export type SoundMachineId = string | typeof DEFAULT_SOUND_MACHINE_ID;

export interface AndonSoundConfig {
  id: string;
  machineId: SoundMachineId;
  subtype: CallSubtype;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
}
