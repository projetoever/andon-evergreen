import type { FailureClassification } from "@/types/machine";
import type { FailureClassificationConfig } from "@/types/settings";

const KEY = "andonFailureClassificationConfig";

export const DEFAULT_FAILURE_CLASSIFICATIONS: FailureClassificationConfig[] = [
  { id: "electrical_failure", label: "Falha elétrica", isActive: true },
  { id: "mechanical_failure", label: "Falha mecânica", isActive: true },
  { id: "automation_sensor_failure", label: "Falha de automação / sensor", isActive: true },
  { id: "operational_failure", label: "Falha operacional", isActive: true },
  { id: "process_failure", label: "Falha de processo", isActive: true },
  { id: "quality_failure", label: "Falha de qualidade", isActive: true },
  { id: "manual_intervention", label: "Intervenção manual", isActive: true },
  { id: "simulation_test", label: "Simulação / teste", isActive: true },
  { id: "unidentified_stop", label: "Parada sem causa identificada", isActive: true },
  { id: "other", label: "Outro", isActive: true },
];

export function getFailureClassificationConfigs(): FailureClassificationConfig[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_FAILURE_CLASSIFICATIONS;
  try {
    const parsed = JSON.parse(raw) as FailureClassificationConfig[];
    return parsed.length ? parsed : DEFAULT_FAILURE_CLASSIFICATIONS;
  } catch {
    return DEFAULT_FAILURE_CLASSIFICATIONS;
  }
}

export function saveFailureClassificationConfigs(configs: FailureClassificationConfig[]) {
  localStorage.setItem(KEY, JSON.stringify(configs));
}

export function isKnownClassification(value: string): value is FailureClassification {
  return [...DEFAULT_FAILURE_CLASSIFICATIONS.map((x) => x.id), "operational_process_failure"].includes(value);
}
