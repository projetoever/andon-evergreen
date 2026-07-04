export type MachineSetId = string;

export interface MachineSet {
  id: MachineSetId;
  machineId: string;
  code: string;
  name: string;
  type?: string | null;
  description?: string | null;
  isActive: boolean;
  displayOrder?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MachineSetDraft {
  code: string;
  name: string;
  type?: string | null;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number | null;
}
