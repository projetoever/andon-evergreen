import type { CallTypeOption } from "@/types/andon";

export const CALL_TYPE_OPTIONS: CallTypeOption[] = [
  {
    id: "electrical",
    label: "Elétrica",
    category: "maintenance",
    technicianArea: "electrical",
    soundKey: "electrical",
    colorClass: "bg-warning text-warning-foreground",
  },
  {
    id: "mechanical",
    label: "Mecânica",
    category: "maintenance",
    technicianArea: "mechanical",
    soundKey: "mechanical",
    colorClass: "bg-warning text-warning-foreground",
  },
  {
    id: "hot_melt",
    label: "Hot Melt",
    category: "maintenance",
    technicianArea: "hot_melt",
    soundKey: "hot_melt",
    colorClass: "bg-warning text-warning-foreground",
  },
  {
    id: "quality",
    label: "Qualidade",
    category: "production",
    technicianArea: null,
    soundKey: "quality",
    colorClass: "bg-info text-info-foreground",
  },
  {
    id: "leadership",
    label: "Liderança",
    category: "production",
    technicianArea: null,
    soundKey: "leadership",
    colorClass: "bg-info text-info-foreground",
  },
];

export function getCallTypeOption(subtype: string): CallTypeOption | undefined {
  return CALL_TYPE_OPTIONS.find((opt) => opt.id === subtype);
}
