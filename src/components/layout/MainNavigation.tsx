import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Bell, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/active-calls", label: "Chamados Ativos", icon: Bell, exact: false },
  { to: "/history", label: "Histórico", icon: History, exact: false },
  { to: "/settings", label: "Configurações", icon: Settings, exact: false },
] as const;

export function MainNavigation() {
  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1920px] gap-2 px-8">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={cn(
                "flex items-center gap-3 border-b-4 border-transparent px-6 py-4 text-base font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
                "data-[status=active]:border-primary data-[status=active]:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
