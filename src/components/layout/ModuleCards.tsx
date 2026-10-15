import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BarChart3, Factory, ListOrdered, Lock } from "lucide-react";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { ModuleDefinition } from "@/types/modules";

const icons = { factory: Factory, chart: BarChart3, priority: ListOrdered };
export function ModuleCards({
  onNavigate,
}: {
  onNavigate?: (module: ModuleDefinition) => boolean;
}) {
  const { access } = useModuleAccess();
  const { t } = useLanguage();
  const modules =
    access?.modules.filter((module) => module.available && module.enabled && module.allowed) ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {modules.map((module) => {
        const Icon = icons[module.icon];
        return (
          <Link
            key={module.id}
            to={module.route}
            onClick={(event) => {
              if (onNavigate && !onNavigate(module)) event.preventDefault();
            }}
            className="block min-w-0 rounded-xl border border-border bg-card p-6 text-left shadow-sm transition hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </span>
              {module.passwordRequired ? (
                <Lock className="h-5 w-5 text-primary" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-primary" />
              )}
            </div>
            <h2 className="mt-6 text-xl font-black tracking-tight">{t(module.name)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(module.description)}
            </p>
            <p className="mt-6 text-xs font-bold uppercase tracking-wide text-primary">
              {t(module.passwordRequired ? "Entrar com credencial do módulo" : "Abrir módulo")}
            </p>
          </Link>
        );
      })}
      {access && modules.length === 0 && (
        <p
          role="status"
          className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground md:col-span-3"
        >
          {t(
            "Nenhum módulo liberado para esta workstation. Solicite a liberação ao administrador do Hub.",
          )}
        </p>
      )}
    </div>
  );
}
