import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { Machine, ProductionMode } from "@/types/machine";
import { getCurrentWorkstationId } from "./workstationIdentityService";

const apiClient = createAndonApiClient();
const SESSION_KEY = "andon.dashboardPriority.session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
let localConfig: {
  username: string;
  password: string;
  lastOrderUpdatedAt?: string | null;
  lastOrderUpdatedBy?: string | null;
  priorityHighlightCount?: number;
} | null = null;
let localOrderIds: string[] = [];
let localPasswordRequired = true;
export const localPriorityPasswordRequired = () => localPasswordRequired;

export interface DashboardPriorityAccessStatus {
  configured: boolean;
  passwordRequired: boolean;
  username: string | null;
  lastOrderUpdatedAt: string | null;
  lastOrderUpdatedBy: string | null;
}

export interface DashboardPrioritySession {
  token: string;
  expiresAt: string;
  username: string;
}

export interface DashboardPriorityMachine {
  id: string;
  name: string;
  isActive: boolean;
  priorityOrder: number | null;
  displayOrder: number | null;
  productionMode: ProductionMode | null;
  productionModeChangedAt: string | null;
}

export interface DashboardPriorityAuditEntry {
  id: string;
  machineId: string;
  changedAt: string;
  changedBy: string | null;
  previousOrder: number | null;
  newOrder: number | null;
  previousPriorityRank: number | null;
  newPriorityRank: number | null;
}

export interface DashboardPriorityAuditSnapshot {
  entries: DashboardPriorityAuditEntry[];
  truncated: boolean;
}

export interface DashboardPriorityOrderSnapshot {
  machines: DashboardPriorityMachine[];
  lastOrderUpdatedAt: string | null;
  lastOrderUpdatedBy: string | null;
  priorityHighlightCount: number;
}

function readSession(): DashboardPrioritySession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardPrioritySession;
    if (!parsed.token || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: DashboardPrioritySession) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

function readLocalConfig() {
  return localConfig;
}

function fallbackOrder(machine: Pick<Machine, "id" | "displayOrder" | "priorityOrder">) {
  if (machine.priorityOrder != null) return machine.priorityOrder;
  if (machine.displayOrder != null) return machine.displayOrder;
  const numericId = Number(machine.id);
  return Number.isFinite(numericId) ? numericId : Number.MAX_SAFE_INTEGER;
}

function sortPriorityMachines(machines: Machine[], orderIds: string[] = []) {
  const explicitOrder = new Map(orderIds.map((id, index) => [id, index + 1]));
  return machines
    .map((machine) => ({
      id: machine.id,
      name: machine.name,
      isActive: machine.isActive,
      priorityOrder: explicitOrder.get(machine.id) ?? machine.priorityOrder ?? null,
      displayOrder: machine.displayOrder ?? null,
      productionMode: machine.productionMode === "scheduled" || machine.productionMode === "not_scheduled" ? machine.productionMode : null,
      productionModeChangedAt: machine.productionModeChangedAt ?? null,
    }))
    .sort((current, next) => {
      const currentOrder =
        explicitOrder.get(current.id) ??
        fallbackOrder(current);
      const nextOrder =
        explicitOrder.get(next.id) ??
        fallbackOrder(next);

      return (
        currentOrder - nextOrder ||
        current.id.localeCompare(next.id, "pt-BR", { numeric: true })
      );
    });
}

export function getStoredDashboardPrioritySession() {
  return readSession();
}

export function isDashboardPriorityAuthenticated() {
  return Boolean(readSession());
}

export async function getDashboardPriorityAccessStatus(): Promise<DashboardPriorityAccessStatus> {
  if (CONFIGURED_DATA_MODE === "local") {
    const config = readLocalConfig();
    return {
      configured: Boolean(config?.username && config?.password),
      passwordRequired: localPasswordRequired,
      username: config?.username ?? null,
      lastOrderUpdatedAt: config?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: config?.lastOrderUpdatedBy ?? null,
    };
  }

  return apiClient.get<DashboardPriorityAccessStatus>("/api/dashboard-priority/access-status");
}

export async function configureDashboardPriorityCredentials(username: string, password: string) {
  if (CONFIGURED_DATA_MODE === "local") {
    const current = readLocalConfig();
    localConfig = {
      username: username.trim(),
      password,
      lastOrderUpdatedAt: current?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: current?.lastOrderUpdatedBy ?? null,
    };
    clearSession();
    return { configured: true, username: username.trim() };
  }

  clearSession();
  const saved = await apiClient.request<{ configured: true; username: string }>(
    "/api/dashboard-priority/credentials",
    {
      method: "PUT",
      body: JSON.stringify({ username, password }),
      headers: { "Content-Type": "application/json" },
    },
  );
  const confirmed = await apiClient.get<DashboardPriorityAccessStatus>(
    "/api/dashboard-priority/access-status",
  );
  if (!confirmed.configured || confirmed.username !== saved.username) {
    throw new Error("O servidor não confirmou a persistência das credenciais de prioridades.");
  }
  return saved;
}

export async function setDashboardPriorityPasswordRequired(passwordRequired: boolean) {
  if (CONFIGURED_DATA_MODE === "local") {
    if (passwordRequired && !localConfig?.password) throw new Error("Configure as credenciais antes de exigir senha.");
    localPasswordRequired = passwordRequired;
  } else await apiClient.patch("/api/dashboard-priority/access-policy", { passwordRequired });
  clearSession();
}

export async function loginDashboardPriority(username: string, password: string) {
  if (CONFIGURED_DATA_MODE === "local") {
    const config = readLocalConfig();
    if (!config || config.username !== username.trim() || config.password !== password) {
      throw new Error("Usuário ou senha inválidos.");
    }
    const session = {
      token: "local",
      username: config.username,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    writeSession(session);
    return session;
  }

  const session = await apiClient.post<DashboardPrioritySession>(
    "/api/dashboard-priority/login",
    { username, password },
  );
  writeSession(session);
  return session;
}

export async function logoutDashboardPriority() {
  const session = readSession();
  clearSession();
  if (!session || CONFIGURED_DATA_MODE === "local") return;

  try {
    await apiClient.request("/api/dashboard-priority/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
    });
  } catch {
    // A sessão local deve ser encerrada mesmo se o servidor já a tiver expirado.
  }
}

export async function getDashboardPriorityOrder(
  currentMachines: Machine[] = [],
): Promise<DashboardPriorityOrderSnapshot> {
  const session = readSession();

  if (CONFIGURED_DATA_MODE === "local") {
    if (localPasswordRequired && !session) throw new Error("Sessão de prioridades necessária.");
    const orderIds = localOrderIds;
    const config = readLocalConfig();
    return {
      machines: sortPriorityMachines(currentMachines, orderIds),
      lastOrderUpdatedAt: config?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: config?.lastOrderUpdatedBy ?? null,
      priorityHighlightCount: config?.priorityHighlightCount ?? 5,
    };
  }

  return apiClient.request<DashboardPriorityOrderSnapshot>("/api/dashboard-priority/order", {
    method: "GET",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  });
}

export async function saveDashboardPriorityOrder(
  machineIds: string[], expectedMachineIds: string[],
  priorityHighlightCount?: number, expectedPriorityHighlightCount?: number,
) {
  const session = readSession();

  if (CONFIGURED_DATA_MODE === "local") {
    if (localPasswordRequired && !session) throw new Error("Sessão de prioridades necessária.");
    const username = session?.username ?? `workstation:${getCurrentWorkstationId()}`;
    const config = readLocalConfig();
    const oldCount = config?.priorityHighlightCount ?? 5;
    if (priorityHighlightCount !== undefined && (
      !Number.isInteger(priorityHighlightCount) || priorityHighlightCount < 1 ||
      priorityHighlightCount > machineIds.length
    )) throw new Error("Quantidade de destaques inválida.");
    if (priorityHighlightCount !== undefined && expectedPriorityHighlightCount !== oldCount)
      throw new Error("priority_highlight_changed");
    const updatedAt = new Date().toISOString();
    localOrderIds = [...machineIds];
    localConfig = {
      username: config?.username ?? username,
      password: config?.password ?? "",
      ...config,
      lastOrderUpdatedAt: updatedAt,
      lastOrderUpdatedBy: username,
      priorityHighlightCount: priorityHighlightCount ?? oldCount,
    };
    return {
      ok: true,
      lastOrderUpdatedAt: updatedAt,
      lastOrderUpdatedBy: username,
      priorityHighlightCount: priorityHighlightCount ?? oldCount,
    };
  }

  return apiClient.request<{
    ok: true;
    lastOrderUpdatedAt: string;
    lastOrderUpdatedBy: string;
    priorityHighlightCount: number;
  }>("/api/dashboard-priority/order", {
    method: "PUT",
    body: JSON.stringify({ machineIds, expectedMachineIds,
      ...(priorityHighlightCount !== undefined ? { priorityHighlightCount, expectedPriorityHighlightCount } : {}),
    }),
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
  });
}

export async function getDashboardPriorityHistory(): Promise<DashboardPriorityAuditSnapshot> {
  const session = readSession();
  if (CONFIGURED_DATA_MODE === "local") {
    if (localPasswordRequired && !session) throw new Error("Sessão de prioridades necessária.");
    // Offline/local simulation has no verified server audit records.
    return { entries: [], truncated: false };
  }
  return apiClient.request<DashboardPriorityAuditSnapshot>("/api/dashboard-priority/history", {
    method: "GET",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  });
}
