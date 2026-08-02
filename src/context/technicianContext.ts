import { createContext } from "react";
import type { TechnicianConfigDraft } from "@/services/technicianConfigService";
import type { TechnicianConfig } from "@/types/settings";

export interface TechnicianContextValue {
  technicians: TechnicianConfig[];
  isLoading: boolean;
  error: string | null;
  refreshTechnicians: () => Promise<void>;
  createTechnician: (draft: TechnicianConfigDraft) => Promise<TechnicianConfig>;
  updateTechnician: (
    id: string,
    patch: Partial<TechnicianConfigDraft>,
  ) => Promise<TechnicianConfig>;
  findTechnicianByName: (name: string) => TechnicianConfig | undefined;
}

export const TechnicianContext = createContext<TechnicianContextValue | null>(null);
