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
import type { ModuleAccess } from "@/types/modules";

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
  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current;
    try {
      const next = await loadModuleAccess();
      if (requestRevision !== revision.current) return;
      setAccess(next);
      setError(null);
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
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("andon:module-forbidden", onPolicyChange);
      window.removeEventListener("andon:workstation-inactive", onPolicyChange);
      window.removeEventListener("andon:screen-lock-changed", onPolicyChange);
      revision.current += 1;
    };
  }, [pathname, refresh]);

  return (
    <ModuleAccessContext.Provider
      value={{ access, error, checking: checkedPath !== pathname, refresh }}
    >
      {children}
    </ModuleAccessContext.Provider>
  );
}

export const useModuleAccess = () => useContext(ModuleAccessContext);
