import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { loadModuleAccess } from "@/services/moduleService";
import { accessRequest, type AccessState } from "@/services/accessService";
import type { ModuleAccess } from "@/types/modules";
import { toast } from "@/i18n/toast";
import { persistentSessionMismatch, PERSISTENCE_NOT_ACTIVE, rememberConfirmedPersistentSession } from "@/services/persistentSessionStatus";

const ModuleAccessContext = createContext<{
  access: ModuleAccess | null;
  error: string | null;
  checking: boolean;
  refresh: () => Promise<void>;
}>({ access: null, error: null, checking: true, refresh: async () => {} });

/** Lightweight identity and policy only: no machine snapshots, technician polling or audio. */
export function ModuleAccessProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const revision = useRef(0);
  const warnedNonPersistent = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current;
    try {
      const next = await loadModuleAccess();
      if (requestRevision !== revision.current) return;
      setAccess(next);
      setError(null);
      const principal = next.principal;
      // Record only that the server has confirmed a durable login once.
      // This is a display diagnostic, not an authentication credential.
      if (principal?.purpose === "normal" && principal.persistentOperational === true)
        rememberConfirmedPersistentSession();
      if (persistentSessionMismatch(principal)) {
        const warningKey = `${principal!.userId}:${next.workstation.id}`;
        if (warnedNonPersistent.current !== warningKey) {
          warnedNonPersistent.current = warningKey;
          toast.warning(PERSISTENCE_NOT_ACTIVE, { duration: 10_000 });
        }
      } else warnedNonPersistent.current = null;
    } catch (cause) {
      if (requestRevision !== revision.current) return;
      setAccess(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar o acesso.");
    } finally {
      if (requestRevision === revision.current) setCheckedPath(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onPolicyChange = () => void refresh();
    window.addEventListener("andon:module-forbidden", onPolicyChange);
    window.addEventListener("andon:workstation-inactive", onPolicyChange);
    window.addEventListener("andon:screen-lock-changed", onPolicyChange);
    window.addEventListener("andon:module-session-changed", onPolicyChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("andon:module-forbidden", onPolicyChange);
      window.removeEventListener("andon:workstation-inactive", onPolicyChange);
      window.removeEventListener("andon:screen-lock-changed", onPolicyChange);
      window.removeEventListener("andon:module-session-changed", onPolicyChange);
      revision.current += 1;
    };
  }, [pathname, refresh]);

  // Recover transient API failures without returning to Hub or asking for
  // another password. A failed check cannot authorize a module: the gate
  // remains closed until the next successful server response.
  useEffect(() => {
    if (!error) return;
    const timer = window.setInterval(() => void refresh(), 5_000);
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [error, refresh]);

  useEffect(() => {
    if (!access?.centralAccessEnabled || access.principal?.purpose !== "normal") return;
    // Extend idle time only after real input. Polling and route refreshes never keep a session alive.
    let lastRecordedAt = 0;
    const record = () => {
      if (Date.now() - lastRecordedAt < 60_000) return;
      lastRecordedAt = Date.now();
      void accessRequest("/interaction", "POST", {}).catch(() => void refresh());
    };
    window.addEventListener("pointerdown", record);
    window.addEventListener("keydown", record);
    return () => {
      window.removeEventListener("pointerdown", record);
      window.removeEventListener("keydown", record);
    };
  }, [access?.centralAccessEnabled, access?.principal?.purpose, refresh]);

  useEffect(() => {
    if (!access?.centralAccessEnabled || access.principal?.purpose !== "normal") return;
    // Presence polling observes a visible terminal; it must NEVER call /interaction
    // or extend the human session's 30-minute idle / 12-hour absolute limits.
    let mounted = true;
    let inFlight = false;
    let csrfLoaded = false;
    let lastVerifiedAt = 0;
    const heartbeat = async () => {
      if (!mounted || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        // Browsers cap durable cookies (typically ~400 days), so renew the
        // server-validated HttpOnly cookie periodically for ONLY an already
        // authenticated persistent session. This is never a password login,
        // and it never extends ordinary timed sessions via /interaction.
        const renewPersistentCookie = access.principal?.persistentOperational === true &&
          Date.now() - lastVerifiedAt >= 12 * 60 * 60 * 1000;
        if (!csrfLoaded || renewPersistentCookie) {
          const current = await accessRequest<AccessState>("/session");
          if (!mounted || current.principal?.purpose !== "normal") return;
          if (renewPersistentCookie && current.principal.persistentOperational !== true) {
            void refresh(); // Revoked/downgraded sessions must not remain displayed as durable.
            return;
          }
          csrfLoaded = true;
          lastVerifiedAt = Date.now();
        }
        if (mounted) await accessRequest("/heartbeat", "POST", {});
      } catch {
        // Loss of connectivity must naturally degrade presence to offline.
        // Never silently reauthenticate or keep a revoked session alive.
      } finally {
        inFlight = false;
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    const onVisible = () => void heartbeat();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [access?.centralAccessEnabled, access?.principal?.purpose,
    access?.principal?.persistentOperational, refresh]);

  return (
    <ModuleAccessContext.Provider
      value={{ access, error, checking: checkedPath !== pathname, refresh }}
    >
      {children}
    </ModuleAccessContext.Provider>
  );
}

export const useModuleAccess = () => useContext(ModuleAccessContext);
