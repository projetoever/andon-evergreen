import type { TechnicianArea } from "./andon";

export interface Technician {
  id: string;
  name: string;
  area: TechnicianArea;
  active: boolean;
}
