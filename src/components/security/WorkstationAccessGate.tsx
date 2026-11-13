import { systemMessage } from "@/i18n/translate";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { HubIdentityPanel } from "./HubIdentityPanel";
import { ModuleLoginPanel } from "./ModuleLoginPanel";
import { workstationGateDecision } from "./workstationGateDecision";

/** The API independently enforces the same session, workstation and module policy. */
export function WorkstationAccessGate({ children }: { children: ReactNode }) {
  const { access, error, checking: checkingRoute, refresh } = useModuleAccess();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const module =
    path === "/bi" || path.startsWith("/bi/")
      ? "bi"
      : path === "/machine-priorities"
        ? "priorities"
        : "operational";
  const definition = access?.modules.find((item) => item.id === module);
  const decision = workstationGateDecision(access, module, checkingRoute, error);

  // An authenticated account with no grant should see its authorized Hub
  // modules, not a misleading prompt to "approve this workstation".
  const returnToHub = decision === "denied" && access?.workstation.active === true;
  useEffect(() => {
    if (returnToHub) void navigate({ to: "/hub", replace: true });
  }, [returnToHub, navigate]);

  if (decision === "allowed") return <>{children}</>;
  if (decision === "module-login" && definition && module !== "priorities")
    return <ModuleLoginPanel key={module} module={module} name={definition.name} />;

  if (decision === "checking")
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <section role="status" aria-label={t("Verificando workstation")}
          className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
          <p className="text-center text-sm font-semibold">
            {t("Validando a identidade deste navegador com o servidor.")}
          </p>
          <div aria-hidden="true" className="space-y-3">
            <Skeleton className="mx-auto h-7 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            <Skeleton className="mx-auto h-4 w-3/4 motion-reduce:animate-none" />
          </div>
        </section>
      </main>
    );

  if (returnToHub)
    return (
      <main role="status" className="min-h-dvh bg-background p-6 text-muted-foreground">
        {t("Ver módulos disponíveis")}
      </main>
    );

  const deniedText = access?.workstation.pendingApproval
    ? "Workstation aguardando aprovação do administrador do Hub."
    : access?.workstation.active === false
      ? "Solicite ao administrador a liberação desta workstation."
      : "Acesso restrito ao perfil do usuário conectado.";

  // Central identification reuses the existing secure /api/access login and
  // admission flow, so deep links can authenticate without an intermediate
  // full-screen denial. The backend must still approve station and module.
  return (
    <main className="min-h-dvh bg-background">
      <Dialog open>
        <DialogContent
          hideDefaultClose
          className="max-h-[92dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto border-0 bg-transparent p-0 shadow-none"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle className="sr-only">
            {t(decision === "identity" ? "Identifique-se para acessar o Hub" : "Acesso indisponível")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("Autenticação necessária para liberar os módulos autorizados nesta workstation.")}
          </DialogDescription>
          {decision === "identity" && access ? (
            <>
              <div className="flex justify-end px-1 pt-1"><LanguageSelector compact /></div>
              <HubIdentityPanel access={access} onChanged={refresh} />
            </>
          ) : (
            <section role="alert" className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
              <p className="text-sm text-muted-foreground">
                {error ? systemMessage(error) : t(deniedText)}
              </p>
              {access?.workstation.active === false && (
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {access.workstation.id}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
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
            </section>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
