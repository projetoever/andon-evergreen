/**
 * UX-13 — dashboard intensity is a browser-local visual preference.
 * It never modifies machine status, alarm tone, sound, API or global palette.
 */
export const DASHBOARD_ATTENTION_STORAGE_KEY = "andon.dashboardAttention.v1";
export type DashboardAttentionMode = "discreet" | "highlighted";
export const DEFAULT_DASHBOARD_ATTENTION_MODE: DashboardAttentionMode = "discreet";

export function parseDashboardAttentionMode(value: unknown): DashboardAttentionMode {
  return value === "highlighted" ? "highlighted" : DEFAULT_DASHBOARD_ATTENTION_MODE;
}
