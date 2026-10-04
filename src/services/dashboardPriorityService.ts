import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { Machine } from "@/types/machine";

const apiClient = createAndonApiClient();
const SESSION_KEY = "andon.dashboardPriority.session";
const LOCAL_CONFIG_KEY = "andon.dashboardPriority.localConfig";
const LOCAL_ORDER_KEY = "andon.dashboardPriority.localOrder";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface DashboardPriorityAccessStatus {
  configured: boolean;
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
}

export interface DashboardPriorityOrderSnapshot {
  machines: DashboardPriorityMachine[];
  lastOrderUpdatedAt: string | null;
  lastOrderUpdatedBy: string | null;
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
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_CONFIG_KEY);
    return raw
      ? (JSON.parse(raw) as {
          username: string;
          password: string;
          lastOrderUpdatedAt?: string | null;
          lastOrderUpdatedBy?: string | null;
        })
      : null;
  } catch {
    return null;
  }
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
    window.localStorage.setItem(
      LOCAL_CONFIG_KEY,
      JSON.stringify({
        username: username.trim(),
        password,
        lastOrderUpdatedAt: current?.lastOrderUpdatedAt ?? null,
        lastOrderUpdatedBy: current?.lastOrderUpdatedBy ?? null,
      }),
    );
    clearSession();
    return { configured: true, username: username.trim() };
  }

  clearSession();
  return apiClient.request<{ configured: true; username: string }>(
    "/api/dashboard-priority/credentials",
    {
      method: "PUT",
      body: JSON.stringify({ username, password }),
      headers: { "Content-Type": "application/json" },
    },
  );
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
  if (!session) throw new Error("Sessão de prioridades necessária.");

  if (CONFIGURED_DATA_MODE === "local") {
    let orderIds: string[] = [];
    if (typeof window !== "undefined") {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(LOCAL_ORDER_KEY) ?? "[]");
        orderIds = Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === "string")
          : [];
      } catch {
        orderIds = [];
      }
    }
    const config = readLocalConfig();
    return {
      machines: sortPriorityMachines(currentMachines, orderIds),
      lastOrderUpdatedAt: config?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: config?.lastOrderUpdatedBy ?? null,
    };
  }

  return apiClient.request<DashboardPriorityOrderSnapshot>("/api/dashboard-priority/order", {
    method: "GET",
    headers: { Authorization: `Bearer ${session.token}` },
  });
}

export async function saveDashboardPriorityOrder(machineIds: string[]) {
  const session = readSession();
  if (!session) throw new Error("Sessão de prioridades necessária.");

  if (CONFIGURED_DATA_MODE === "local") {
    const updatedAt = new Date().toISOString();
    window.localStorage.setItem(LOCAL_ORDER_KEY, JSON.stringify(machineIds));
    const config = readLocalConfig();
    if (config) {
      window.localStorage.setItem(
        LOCAL_CONFIG_KEY,
        JSON.stringify({
          ...config,
          lastOrderUpdatedAt: updatedAt,
          lastOrderUpdatedBy: session.username,
        }),
      );
    }
    return {
      ok: true,
      lastOrderUpdatedAt: updatedAt,
      lastOrderUpdatedBy: session.username,
    };
  }

  return apiClient.request<{
    ok: true;
    lastOrderUpdatedAt: string;
    lastOrderUpdatedBy: string;
  }>("/api/dashboard-priority/order", {
    method: "PUT",
    body: JSON.stringify({ machineIds }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
  });
}
