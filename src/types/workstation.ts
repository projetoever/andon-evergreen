export interface Workstation {
  id: string;
  name: string | null;
  active: boolean;
  pendingApproval?: boolean;
  allowOperational: boolean;
  allowBi: boolean;
  allowPriorities: boolean;
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
  allowPriorities?: boolean;
}
