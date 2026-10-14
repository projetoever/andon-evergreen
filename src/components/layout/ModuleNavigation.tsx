import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import { ModuleCards } from "./ModuleCards";

export function ModuleNavigation() {
  const [open, setOpen] = useState(false);
  const { access } = useModuleAccess();
  const { t } = useLanguage();
  if (!access?.hubEnabled || access.workstation.lockedMachineId) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={t("Módulos")}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden xl:inline">{t("Módulos")}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
