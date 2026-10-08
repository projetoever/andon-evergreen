import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import {
  clearAdminSession,
  getAdminAuthorizationHeader,
  readAdminSession,
  writeAdminSession,
  type AdminSession,
} from "@/services/adminSessionStorage";

const apiClient = createAndonApiClient();
const PASSWORD_KEY = "andonAdminPassword";
const RECOVERY_KEY = "andonAdminRecoveryCode";
const ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASSWORD = "123456";
const LOCAL_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const ADMIN_PASSWORD_MIN_LENGTH = 6;

export interface AdminAuthStatus {
  username: string;
  passwordConfigured: boolean;
  recoveryConfigured: boolean;
  recoveryCodeIssuedAt: string | null;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getLocalAdminPassword() {
  if (!canUseStorage()) return DEFAULT_ADMIN_PASSWORD;
  const storedPassword = window.localStorage.getItem(PASSWORD_KEY)?.trim();
  return storedPassword && storedPassword.length >= ADMIN_PASSWORD_MIN_LENGTH
    ? storedPassword
    : DEFAULT_ADMIN_PASSWORD;
}

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateLocalRecoveryCode() {
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `ADM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function createLocalAdminSession(): AdminSession {
  return {
    token: "local",
    username: ADMIN_USER,
    expiresAt: new Date(Date.now() + LOCAL_SESSION_TTL_MS).toISOString(),
  };
}

export function isValidAdminPasswordFormat(password: string) {
  return password.trim().length >= ADMIN_PASSWORD_MIN_LENGTH;
}

export function isAdminAuthenticated() {
  return Boolean(readAdminSession());
}

export async function getAdminAuthStatus(): Promise<AdminAuthStatus> {
  if (CONFIGURED_DATA_MODE === "local") {
    return {
      username: ADMIN_USER,
      passwordConfigured: Boolean(window.localStorage.getItem(PASSWORD_KEY)),
      recoveryConfigured: Boolean(window.localStorage.getItem(RECOVERY_KEY)),
      recoveryCodeIssuedAt: null,
    };
  }

  return apiClient.get<AdminAuthStatus>("/api/admin-auth/status");
}

export async function loginAdmin(username: string, password: string) {
  if (CONFIGURED_DATA_MODE === "local") {
    const valid = username.trim() === ADMIN_USER && password === getLocalAdminPassword();
    if (valid) writeAdminSession(createLocalAdminSession());
    return valid;
  }

  try {
    const session = await apiClient.post<{ ok: true } & AdminSession>("/api/admin-auth/login", {
      username,
      password,
    });
    writeAdminSession(session);
    return true;
  } catch {
    return false;
  }
}

export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  const normalizedPassword = newPassword.trim();
  if (!isValidAdminPasswordFormat(normalizedPassword)) {
    return {
      ok: false,
      message: `A nova senha deve ter no mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }

  if (CONFIGURED_DATA_MODE === "local") {
    if (currentPassword !== getLocalAdminPassword()) {
      return { ok: false, message: "Senha atual inválida." };
    }
    if (!canUseStorage()) {
      return { ok: false, message: "Não foi possível salvar a senha neste navegador." };
    }
    window.localStorage.setItem(PASSWORD_KEY, normalizedPassword);
    return { ok: true, message: "Senha administrativa alterada com sucesso." };
  }

  return apiClient.request<{ ok: true; message: string }>("/api/admin-auth/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword: normalizedPassword }),
  });
}

export async function generateAdminRecoveryCode(currentPassword: string) {
  if (CONFIGURED_DATA_MODE === "local") {
    if (currentPassword !== getLocalAdminPassword()) {
      throw new Error("Senha administrativa atual inválida.");
    }
    const recoveryCode = generateLocalRecoveryCode();
    window.localStorage.setItem(RECOVERY_KEY, normalizeRecoveryCode(recoveryCode));
    return {
      recoveryCode,
      issuedAt: new Date().toISOString(),
      message:
        "Código de recuperação gerado. Guarde-o fora do ANDON; ele não será exibido novamente.",
    };
  }

  return apiClient.post<{
    recoveryCode: string;
    issuedAt: string;
    message: string;
  }>("/api/admin-auth/recovery-code", { currentPassword });
}

export async function recoverAdminPassword(recoveryCode: string, newPassword: string) {
  const normalizedPassword = newPassword.trim();
  if (!isValidAdminPasswordFormat(normalizedPassword)) {
    throw new Error(
      `A nova senha deve ter no mínimo ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`,
    );
  }

  if (CONFIGURED_DATA_MODE === "local") {
    const expected = window.localStorage.getItem(RECOVERY_KEY);
    if (!expected || expected !== normalizeRecoveryCode(recoveryCode)) {
      throw new Error("Código de recuperação inválido.");
    }
    window.localStorage.setItem(PASSWORD_KEY, normalizedPassword);
    window.localStorage.removeItem(RECOVERY_KEY);
    writeAdminSession(createLocalAdminSession());
    return {
      ok: true,
      username: ADMIN_USER,
      message: "Senha administrativa redefinida.",
    };
  }

  const result = await apiClient.post<
    { ok: true; message: string } & AdminSession
  >("/api/admin-auth/recover", {
    recoveryCode,
    newPassword: normalizedPassword,
  });
  writeAdminSession(result);
  return result;
}

export function logoutAdmin() {
  const authorization = getAdminAuthorizationHeader();
  clearAdminSession();

  if (CONFIGURED_DATA_MODE === "api" && authorization) {
    void apiClient
      .request("/api/admin-auth/logout", {
        method: "POST",
        headers: { Authorization: authorization },
      })
      .catch(() => undefined);
  }
}
