import {
  DatabaseZap,
  Gauge,
  LayoutDashboard,
  ShieldAlert,
  Wrench,
} from "lucide-react";

export type BiWorkspaceTab =
  | "overview"
  | "reliability"
  | "failures"
  | "maintenance"
  | "data-quality";

const TABS: Array<{
  id: BiWorkspaceTab;
  label: string;
  icon: typeof LayoutDashboard;
  activeClass: string;
}> = [
  {
    id: "overview",
    label: "Visão Geral",
    icon: LayoutDashboard,
    activeClass: "border-amber-400/60 bg-amber-500/10 text-amber-200",
  },
  {
    id: "reliability",
    label: "Confiabilidade",
    icon: Gauge,
    activeClass: "border-emerald-400/60 bg-emerald-500/10 text-emerald-200",
  },
  {
    id: "failures",
    label: "Falhas",
    icon: ShieldAlert,
    activeClass: "border-red-400/60 bg-red-500/10 text-red-200",
  },
  {
    id: "maintenance",
    label: "Manutenção",
    icon: Wrench,
    activeClass: "border-sky-400/60 bg-sky-500/10 text-sky-200",
  },
  {
    id: "data-quality",
    label: "Qualidade do Dado",
    icon: DatabaseZap,
    activeClass: "border-amber-400/60 bg-amber-500/10 text-amber-200",
  },
];

export function BiWorkspaceTabs({
  activeTab,
  onChange,
  attentionCount = 0,
}: {
  activeTab: BiWorkspaceTab;
  onChange: (tab: BiWorkspaceTab) => void;
  attentionCount?: number;
}) {
  return (
    <nav
      className="grid shrink-0 grid-cols-5 gap-2 rounded-xl border border-border bg-card/70 p-2"
      aria-label="Áreas do ANDON BI"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        const showAttention = tab.id === "data-quality" && attentionCount > 0;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              "relative inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black uppercase tracking-wide transition",
              active
                ? tab.activeClass
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden lg:inline">{tab.label}</span>
            {showAttention && (
              <span className="absolute right-2 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white">
                {attentionCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
