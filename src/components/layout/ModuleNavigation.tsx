import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { BarChart3, Factory, History, LayoutGrid, ListOrdered, LogOut } from "lucide-react";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { logoutModule } from "@/services/moduleAuthService";
import type { ModuleId } from "@/types/modules";
import { navigationModuleForPath } from "@/utils/moduleNavigationRoute";

const iconClassName =
  "inline-flex h-11 w-11 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/** The opt-in is enabled by each module during its own refinement. */
const moduleLinks = [
  { id: "operational", to: "/andon", icon: Factory, label: "Abrir ANDON operacional" },
  { id: "bi", to: "/bi", icon: BarChart3, label: "Abrir ANDON BI" },
  { id: "priorities", to: "/machine-priorities", icon: ListOrdered, label: "Organizar prioridade de produção" },
] as const satisfies ReadonlyArray<{
  id: ModuleId;
  to: "/andon" | "/bi" | "/machine-priorities";
  icon: typeof Factory;
  label: string;
}>;

/** Never display links if the server did not explicitly grant the target module. */
export function ModuleNavigation({ showModuleLinks = false }: { showModuleLinks?: boolean } = {}) {
  const { access, refresh } = useModuleAccess();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const currentModule = navigationModuleForPath(pathname);
  // Global History is independently granted by the server, not an operational
  // module session. Do not infer an ANDON logout from the /history pathname.
  const current = currentModule === "history"
    ? undefined
    : access?.modules.find((item) => item.id === currentModule);
  const { t } = useLanguage();
  if (!access || (access.workstation.lockedMachineId && currentModule === "operational"))
    return null;

  return (
    <div className="inline-flex items-center gap-2">
      {showModuleLinks && moduleLinks.map((target) => {
        const grant = access.modules.find((module) => module.id === target.id);
        if (target.id === currentModule || !grant?.available || !grant.enabled || !grant.allowed) return null;
        const Icon = target.icon;
        return (
          <Link key={target.id} to={target.to} data-audit-action={`navigate.${target.id}`} title={t(target.label)}
            aria-label={t(target.label)} className={iconClassName}>
            <Icon aria-hidden="true" className="h-4 w-4" />
          </Link>
        );
      })}
      {showModuleLinks && currentModule !== "history" &&
        access.centralAccessEnabled === true &&
        access.globalHistory?.available === true &&
        access.globalHistory.allowed === true && (
          <Link to="/history" data-audit-action="navigate.history" title={t("Histórico Global")}
            aria-label={t("Histórico Global")} className={iconClassName}>
            <History aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      <Link
        to="/hub"
        data-audit-action="navigate.hub"
        title={t("Ir para o Hub")}
        aria-label={t("Ir para o Hub")}
        className={iconClassName}
      >
        <LayoutGrid aria-hidden="true" className="h-4 w-4" />
      </Link>
      {(currentModule === "operational" || currentModule === "bi") &&
        current?.passwordRequired && current.authenticated && (
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
