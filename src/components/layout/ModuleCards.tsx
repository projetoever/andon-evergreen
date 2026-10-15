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
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {access?.modules.map((module) => {
        const Icon = icons[module.icon];
        const allowed = module.available && module.enabled && module.allowed;
        const content = (
          <>
            <div className="flex items-center justify-between gap-3">
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${allowed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                <Icon className="h-6 w-6" />
              </span>
              {allowed ? (
                <ArrowUpRight className="h-5 w-5 text-primary" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <h2 className="mt-6 text-xl font-black tracking-tight">{t(module.name)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(module.description)}
            </p>
            <p
              className={`mt-6 text-xs font-bold uppercase tracking-wide ${allowed ? "text-primary" : "text-muted-foreground"}`}
            >
              {t(
                !module.available
                  ? "Indisponível nesta versão"
                  : !module.enabled
                    ? "Desativado na instalação"
                    : !module.allowed
                      ? "Acesso restrito nesta workstation"
                      : module.id === "priorities"
                        ? "Entrar com credencial de prioridades"
                        : "Abrir módulo",
              )}
            </p>
          </>
        );
        const classes =
          "block min-w-0 rounded-xl border border-border bg-card p-6 text-left shadow-sm";
        return allowed ? (
          <Link
            key={module.id}
            to={module.route}
            onClick={(event) => {
              if (onNavigate && !onNavigate(module)) event.preventDefault();
            }}
            className={`${classes} transition hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {content}
          </Link>
        ) : (
          <div key={module.id} aria-disabled="true" className={`${classes} opacity-60`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
