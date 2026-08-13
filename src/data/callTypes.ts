import type { CallTypeOption } from "@/types/andon";

export const CALL_TYPE_OPTIONS: CallTypeOption[] = [
  {
    id: "electrical",
    label: "Elétrica",
    category: "maintenance",
    technicianArea: "electrical",
    soundKey: "electrical",
    colorClass: "bg-warning text-warning-foreground",
    color: "#F5B700",
    active: true,
    displayOrder: 10,
  },
  {
    id: "mechanical",
    label: "Mecânica",
    category: "maintenance",
    technicianArea: "mechanical",
    soundKey: "mechanical",
    colorClass: "bg-warning text-warning-foreground",
    color: "#F59E0B",
    active: true,
    displayOrder: 20,
  },
  {
    id: "hot_melt",
    label: "Hot Melt",
    category: "maintenance",
    technicianArea: "hot_melt",
    soundKey: "hot_melt",
    colorClass: "bg-warning text-warning-foreground",
    color: "#F97316",
    active: true,
    displayOrder: 30,
  },
  {
    id: "quality",
    label: "Qualidade",
    category: "production",
    technicianArea: null,
    soundKey: "quality",
    colorClass: "bg-info text-info-foreground",
    color: "#0EA5E9",
    active: true,
    displayOrder: 40,
  },
  {
    id: "leadership",
    label: "Liderança",
    category: "production",
    technicianArea: null,
    soundKey: "leadership",
    colorClass: "bg-info text-info-foreground",
    color: "#8B5CF6",
    active: true,
    displayOrder: 50,
  },
];

export function getCallTypeOption(subtype: string): CallTypeOption | undefined {
  return CALL_TYPE_OPTIONS.find((opt) => opt.id === subtype);
}

export function replaceCallTypeOptions(options: CallTypeOption[]) {
  CALL_TYPE_OPTIONS.splice(
    0,
    CALL_TYPE_OPTIONS.length,
    ...options.slice().sort((current, next) => current.displayOrder - next.displayOrder),
  );
}
