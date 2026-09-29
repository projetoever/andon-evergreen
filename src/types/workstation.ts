export interface Workstation {
  id: string;
  name: string | null;
  active: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkstationUpdate {
  name?: string;
  active?: boolean;
}
