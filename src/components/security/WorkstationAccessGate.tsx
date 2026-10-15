import { systemMessage } from "@/i18n/translate";
import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { ModuleLoginPanel } from "./ModuleLoginPanel";

/** The API independently enforces the same policy on every identified request. */
export function WorkstationAccessGate({ children }: { children: ReactNode }) {
  const { access, error, checking: checkingRoute, refresh } = useModuleAccess();
  const { t } = useLanguage();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const module =
    path === "/bi" || path.startsWith("/bi/")
      ? "bi"
      : path === "/machine-priorities"
        ? "priorities"
        : "operational";
  const definition = access?.modules.find((item) => item.id === module);
  const allowed = access?.modules.some(
    (item) => item.id === module && item.allowed && item.enabled && item.available,
  );
  if (!checkingRoute && access?.workstation.active && allowed) {
    if (module !== "priorities" && definition?.passwordRequired && !definition.authenticated)
      return <ModuleLoginPanel key={module} module={module} name={definition.name} />;
    return <>{children}</>;
  }
  const checking = checkingRoute || (!access && !error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div
        role="alert"
        className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
      >
        <h1 className="text-xl font-bold">
          {t(
            checking
              ? "Verificando workstation"
              : error
                ? "Acesso indisponível"
                : "Acesso ao módulo restrito",
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {(error ? systemMessage(error) : null) ??
            t(
              checking
                ? "Validando a identidade deste navegador com o servidor."
                : access?.workstation.pendingApproval
                  ? "Workstation aguardando aprovação do administrador do Hub."
                  : "Solicite ao administrador a liberação desta workstation.",
            )}
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {access?.workstation.id}
        </p>
        {!checking && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => void refresh()}>
              {t("Verificar novamente")}
            </Button>
            <Button asChild>
              <Link to="/hub">{t("Ver módulos disponíveis")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/hub/admin">{t("Acesso administrativo")}</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
