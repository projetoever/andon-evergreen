import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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

  // Never render the obsolete full-page "restricted module" intermediary.
  // A denied or temporarily unreachable route goes to the Hub, where the
  // server-approved workstation and available modules are shown safely.
  const returnToHub = decision === "denied" || decision === "error";
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
        {t("Retornando ao Hub para verificar os módulos autorizados…")}
      </main>
    );

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
          {access && (
            <>
              <div className="flex justify-end px-1 pt-1"><LanguageSelector compact /></div>
              <HubIdentityPanel access={access} onChanged={refresh} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
