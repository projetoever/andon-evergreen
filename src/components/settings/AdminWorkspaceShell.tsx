import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { HubAdminSection } from "@/types/modules";
import { ArrowLeft, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";

export type AdminWorkspaceNavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  description?: string;
};

export interface AdminWorkspaceShellProps {
  brand: string;
  title: string;
  subtitle: string;
  ariaLabel: string;
  navLabel: string;
  items: readonly AdminWorkspaceNavigationItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  backLabel: string;
  headerActions?: ReactNode;
  alert?: ReactNode;
  hubNavigation?: boolean;
  /** Only opt-in workspaces reset the content scroll when changing tabs. */
  resetContentScrollOnTabChange?: boolean;
  children: ReactNode;
}

/** One identical FULL-SCREEN admin frame used by ANDON and Hub.
 * Only the authorized parent page can mount this shell. It never owns auth,
 * session, credentials, write rights or workstation identity.
 */
export function AdminWorkspaceShell({
  brand, title, subtitle, ariaLabel, navLabel,
  items, activeId, onSelect, onBack, backLabel,
  headerActions, alert, hubNavigation = false, resetContentScrollOnTabChange = false, children,
}: AdminWorkspaceShellProps) {
  useInterfaceLanguage();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resetContentScrollOnTabChange && contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
  }, [activeId, resetContentScrollOnTabChange]);
  const selected = items.find(item => item.id === activeId) ?? items[0];
  const groups = [...new Set(items.map(item => item.group || "Administração"))];
  const BrandIcon = ShieldCheck;
  return (
    <section
      aria-label={ariaLabel}
      className="andon-screen-enter h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground"
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-border bg-card/50 lg:flex lg:flex-col">
          <div className="border-b border-border px-5 py-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <BrandIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">{brand}</p>
                <p className="text-base font-black leading-tight">{title}</p>
              </div>
            </div>
          </div>
          <nav aria-label={navLabel} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {groups.map(group => (
              <div key={group} className="space-y-1">
                <p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{ui(group)}</p>
                {items.filter(item => (item.group || "Administração") === group).map(item => {
                  const Icon = item.icon;
                  const active = item.id === activeId;
                  return (
                    <div key={item.id}>
                      {hubNavigation ? (
                        <Link to="/hub/admin" search={{ section: item.id as HubAdminSection }}
                          data-audit-action={`admin.tab.${item.id}`}
                          aria-current={active ? "page" : undefined}
                          title={item.description}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}>
                          <Icon className="h-4 w-4 shrink-0"/>
                          <span className="min-w-0 whitespace-normal break-words text-sm font-bold leading-tight">{item.label}</span>
                        </Link>
                      ) : (
                        <button type="button" aria-current={active ? "page" : undefined}
                          data-audit-action={`admin.tab.${item.id}`}
                          title={item.description}
                          onClick={() => onSelect(item.id)}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}>
                          <Icon className="h-4 w-4 shrink-0"/>
                          <span className="min-w-0 whitespace-normal break-words text-sm font-bold leading-tight">{item.label}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t border-border p-3">
            <button type="button" onClick={onBack}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ArrowLeft className="h-4 w-4 shrink-0" />{backLabel}
            </button>
          </div>
        </aside>

        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border bg-card/70 px-4 py-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BrandIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{brand}</p>
              <p className="truncate text-sm font-black">{title}</p>
            </div>
          </div>
          <button type="button" aria-label={backLabel} onClick={onBack}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </header>

        <nav aria-label={navLabel}
          className="flex min-w-0 gap-2 overflow-x-auto border-b border-border bg-background px-3 py-2 lg:hidden">
          {items.map(item => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              hubNavigation ? (
                <Link key={item.id} to="/hub/admin" search={{ section: item.id as HubAdminSection }}
                  data-audit-action={`admin.tab.${item.id}`}
                  aria-current={active ? "page" : undefined}
                  title={item.description}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                  )}>
                  <Icon className="h-4 w-4 shrink-0"/>{item.label}
                </Link>
              ) : (
                <button key={item.id} type="button" onClick={() => onSelect(item.id)}
                  data-audit-action={`admin.tab.${item.id}`}
                  aria-current={active ? "page" : undefined}
                  title={item.description}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                  )}>
                  <Icon className="h-4 w-4 shrink-0"/>{item.label}
                </button>
              )
            );
          })}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-start-1">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 lg:px-6">
            <div className="min-w-0">
              <h1 className="text-base font-black text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{ui(selected?.group || "Administração")}</p>
              <h2 className="text-lg font-black text-foreground">{selected?.label || title}</h2>
              {selected?.description && <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>}
            </div>
            {headerActions && <div className="flex flex-wrap items-center gap-2">{headerActions}</div>}
          </div>
          <div ref={contentScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/10 p-3 sm:p-4 lg:p-6 xl:p-8">
            <div className="mx-auto w-full max-w-none space-y-4">
              {alert}
              {children}
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}
