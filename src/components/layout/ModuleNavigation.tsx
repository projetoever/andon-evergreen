import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { ModuleCards } from "./ModuleCards";
import { logoutModule } from "@/services/moduleAuthService";

export function ModuleNavigation() {
  const [open, setOpen] = useState(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={t("Módulos")}>
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden xl:inline">{t("Módulos")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Módulos")}</DialogTitle>
          <DialogDescription>{t("Selecione seu módulo de trabalho")}</DialogDescription>
        </DialogHeader>
        <ModuleCards
          onNavigate={() => {
            setOpen(false);
            return true;
          }}
        />
        <Button variant="outline" asChild>
          <Link to="/hub" onClick={() => setOpen(false)}>
            {t("Ir para o Hub")}
          </Link>
        </Button>
        {currentModule !== "priorities" && current?.passwordRequired && current.authenticated && (
          <Button
            variant="outline"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await logoutModule(currentModule);
              } catch {
                /* Clear local access even when the service is unavailable. */
              } finally {
                setLoggingOut(false);
                setOpen(false);
                await refresh();
                void navigate({ to: "/hub" });
              }
            }}
          >
            Sair do módulo
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
