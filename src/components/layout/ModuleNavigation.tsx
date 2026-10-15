import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, LogOut } from "lucide-react";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { logoutModule } from "@/services/moduleAuthService";

const iconClassName =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function ModuleNavigation() {
  const { access, refresh } = useModuleAccess();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const currentModule =
    pathname === "/bi" || pathname.startsWith("/bi/")
      ? "bi"
      : pathname === "/machine-priorities"
        ? "priorities"
        : "operational";
  const current = access?.modules.find((item) => item.id === currentModule);
  const { t } = useLanguage();
  if (!access || (access.workstation.lockedMachineId && currentModule === "operational"))
    return null;

  return (
    <div className="inline-flex items-center gap-2">
      <Link
        to="/hub"
        title={t("Ir para o Hub")}
        aria-label={t("Ir para o Hub")}
        className={iconClassName}
      >
        <LayoutGrid aria-hidden="true" className="h-4 w-4" />
      </Link>
      {currentModule !== "priorities" && current?.passwordRequired && current.authenticated && (
        <button
          type="button"
          title={t("Sair do módulo")}
          aria-label={t("Sair do módulo")}
          className={iconClassName}
          disabled={loggingOut}
          onClick={async () => {
            setLoggingOut(true);
            try {
              await logoutModule(currentModule);
            } catch {
              // Local access is also cleared when the API is unavailable.
            } finally {
              setLoggingOut(false);
              await refresh();
              void navigate({ to: "/hub" });
            }
          }}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
