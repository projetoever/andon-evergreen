import type { PasswordModule } from "@/types/modules";

export interface ModuleSession {
  token: string;
  username: string;
  expiresAt: string;
}
const key = (module: PasswordModule) => `andon.moduleSession.${module}`;
export function readModuleSession(module: PasswordModule): ModuleSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(module));
    if (!raw) return null;
    const session = JSON.parse(raw) as ModuleSession;
    const expiresAt = Date.parse(session.expiresAt);
    if (
      !session.token ||
      !session.username ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(key(module));
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
export function writeModuleSession(module: PasswordModule, session: ModuleSession) {
  if (typeof window !== "undefined")
    window.sessionStorage.setItem(key(module), JSON.stringify(session));
}
export function clearModuleSession(module: PasswordModule) {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(key(module));
}
export function getModuleAuthorizationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const module of ["operational", "bi"] as const) {
    const session = readModuleSession(module);
    if (session)
      headers[module === "bi" ? "X-Andon-Bi-Token" : "X-Andon-Operational-Token"] = session.token;
  }
  return headers;
}
