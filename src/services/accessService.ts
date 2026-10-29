import { DEFAULT_ANDON_API_CLIENT_CONFIG } from "@/api/andonApiClient";
import { getCurrentWorkstationId } from "./workstationIdentityService";
import { setCentralCsrf, clearCentralCsrf } from "./centralCsrf";
import type { Workstation } from "@/types/workstation";
export interface AccessUser {
  id: string;
  login: string;
  displayName: string;
  roleLabel: string;
  accountType: "person" | "kiosk";
  active: boolean;
  isPrimaryAdmin: boolean;
  machineScope: "all" | "selected";
  mustChangePassword: boolean;
  authorizationVersion: number;
  permissions: { key: string }[];
  machines: { machineId: string }[];
}
export interface UserDraft {
  login: string;
  displayName: string;
  roleLabel: string;
  accountType: "person" | "kiosk";
  active: boolean;
  machineScope: "all" | "selected";
  permissions: string[];
  machineIds: string[];
  version?: number;
}
export interface AccessPrincipal {
  userId: string;
  login: string;
  displayName: string;
  isPrimaryAdmin: boolean;
  purpose: string;
  permissions?: string[];
  machineScope?: string;
  machineIds?: string[];
}
export interface AccessState {
  csrf: string;
  initialized: boolean;
  principal: AccessPrincipal | null;
}
export interface AccessCatalog {
  permissions: string[];
  roles: string[];
  machines: { id: string; name: string; isActive: boolean }[];
}
export interface ManagedWorkstation extends Workstation {
  admission: {
    status: "pending" | "approved" | "rejected";
    requestedAt: string;
    requestedName: string | null;
    requestReason: string | null;
    requestIpAddress: string | null;
    decidedAt: string | null;
    decisionReason: string | null;
    requester: AccessAccount;
    decidedBy: AccessAccount | null;
  } | null;
  linkedAccount: AccessAccount | null;
  authenticatedAccount: AccessAccount | null;
  lastLogin: {
    account: AccessAccount;
    createdAt: string;
    lastInteractionAt: string;
    expiresAt: string;
    purpose: string;
    state: "valid" | "revoked" | "expired" | "user_inactive" | "workstation_blocked";
  } | null;
}
export interface AccessAccount {
  id: string;
  login: string;
  displayName: string;
  roleLabel: string;
}
let csrf = ""; // Memory only; the session secret is held exclusively in an HttpOnly cookie.
export async function accessRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const base = DEFAULT_ANDON_API_CLIENT_CONFIG.baseUrl;
  if (window.location.protocol !== "https:" || !base.startsWith("https://"))
    throw new Error("https_required");
  const response = await fetch(`${base}/api/access${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      "X-Andon-Workstation-Id": getCurrentWorkstationId() ?? "",
      ...(method !== "GET" ? { "X-Andon-CSRF": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "access_unavailable");
  if (typeof data.csrf === "string") {
    csrf = data.csrf;
    setCentralCsrf(csrf);
  }
  if (path === "/logout" && method === "POST") {
    csrf = "";
    clearCentralCsrf();
  }
  return data as T;
}
