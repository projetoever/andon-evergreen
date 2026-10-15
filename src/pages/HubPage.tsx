import { Link } from "@tanstack/react-router";
import { LayoutGrid, Settings } from "lucide-react";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { ModuleCards } from "@/components/layout/ModuleCards";
import { Button } from "@/components/ui/button";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";

export function HubPage() {
  const { access, error, refresh } = useModuleAccess();
  const { t } = useLanguage();
  return (
    <main className="min-h-dvh bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              <LayoutGrid className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                ANDON EVERGREEN
              </p>
              <h1 className="text-2xl font-black">HUB</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSelector />
            <Button variant="outline" asChild>
              <Link to="/hub/admin">
                <Settings className="mr-2 h-4 w-4" />
                {t("Administração do Hub")}
              </Link>
            </Button>
          </div>
        </header>
        <section className="space-y-3 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            {t("Central de módulos")}
          </p>
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            {t("Selecione seu módulo de trabalho")}
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            {t("Operação, indicadores e prioridades em um só lugar.")}
          </p>
        </section>
        {!access && (
          <div role="status" className="space-y-3 rounded-xl border border-border bg-card p-6">
            <p>{error ?? t("Verificando workstation")}</p>
            {error && <Button onClick={() => void refresh()}>{t("Verificar novamente")}</Button>}
          </div>
        )}
        {access && (
          <>
            {!access.workstation.active && (
              <p role="alert" className="text-danger">
                {t("Solicite ao administrador a liberação desta workstation.")}
              </p>
            )}
            <ModuleCards />
            <footer className="flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
              <span>
                {t("Workstation")}: {access.workstation.name || access.workstation.id.slice(-8)}
              </span>
              <span>{t("Permissões administradas pelo Hub")}</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
