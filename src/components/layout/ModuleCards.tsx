import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BarChart3, Factory, ListOrdered, Lock } from "lucide-react";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { ModuleDefinition } from "@/types/modules";

const icons = { factory: Factory, chart: BarChart3, priority: ListOrdered };

/**
 * Keep the three modules visible in the Hub, including those denied by the
 * logged-in user's central permissions. A denied module must not create a
 * Link or a click handler: access remains enforced on the API and routes.
 */
export function ModuleCards({
  onNavigate,
}: {
  onNavigate?: (module: ModuleDefinition) => boolean;
}) {
  const { access } = useModuleAccess();
  const { t } = useLanguage();
  const modules = access?.modules ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {modules.map((module) => {
        const Icon = icons[module.icon];
        const permitted = module.available && module.enabled && module.allowed;
        const deniedReason = !module.available || !module.enabled
          ? t("Módulo indisponível nesta instalação.")
          : t("Acesso restrito ao perfil do usuário conectado.");
        const children = (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className={"inline-flex h-12 w-12 items-center justify-center rounded-xl " +
                (permitted ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                <Icon className="h-6 w-6" />
              </span>
              {permitted && !module.passwordRequired
                ? <ArrowUpRight className="h-5 w-5 text-primary" />
                : <Lock className={"h-5 w-5 " + (permitted ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />}
            </div>
            <h2 className="mt-6 text-xl font-black tracking-tight">{t(module.name)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(module.description)}
            </p>
            <p className={"mt-6 text-xs font-bold uppercase tracking-wide " +
              (permitted ? "text-primary" : "text-muted-foreground")}>
              {permitted
                ? t(module.passwordRequired ? "Entrar com credencial do módulo" : "Abrir módulo")
                : <span className="inline-flex items-center gap-2"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{deniedReason}</span>}
            </p>
          </>
        );
        return permitted ? (
          <Link
            key={module.id}
            to={module.route}
            onClick={(event) => {
              if (onNavigate && !onNavigate(module)) event.preventDefault();
            }}
            className="block min-w-0 rounded-xl border border-border bg-card p-6 text-left shadow-sm transition hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {children}
          </Link>
        ) : (
          <div
            key={module.id}
            aria-disabled="true"
            title={deniedReason}
            className="block min-w-0 cursor-not-allowed rounded-xl border border-border/60 bg-card/60 p-6 text-left opacity-55"
          >
            {children}
          </div>
        );
      })}
      {access && modules.length === 0 && (
        <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground md:col-span-3">
          {t("Nenhuma informação de módulos disponível. Tente novamente.")}
        </p>
      )}
    </div>
  );
}
