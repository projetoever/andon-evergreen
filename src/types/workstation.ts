export interface Workstation {
  id: string;
  name: string | null;
  active: boolean;
  allowOperational: boolean;
  allowBi: boolean;
  lastIpAddress: string | null;
  lockedMachineId: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkstationUpdate {
  name?: string;
  active?: boolean;
  allowOperational?: boolean;
  allowBi?: boolean;
}
