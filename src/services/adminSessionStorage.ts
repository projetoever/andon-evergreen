const SESSION_KEY = "andonAdminSession";

export interface AdminSession {
  token: string;
  username: string;
  expiresAt: string;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readAdminSession(): AdminSession | null {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AdminSession;
    if (
      !parsed.token ||
      !parsed.username ||
      !parsed.expiresAt ||
      new Date(parsed.expiresAt).getTime() <= Date.now()
    ) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function writeAdminSession(session: AdminSession) {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function getAdminAuthorizationHeader() {
  const session = readAdminSession();
  return session ? `Bearer ${session.token}` : null;
}
