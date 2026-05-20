import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useTicker } from "@/hooks/useTicker";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Bell,
  Wrench,
  CheckCheck,
  CalendarX,
} from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  subtitle?: string;
  tone: "success" | "danger" | "warning" | "info" | "neutral";
  icon: React.ReactNode;
  pulse?: boolean;
}

const toneBg: Record<StatCardProps["tone"], string> = {
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  neutral: "bg-muted text-muted-foreground",
};

function StatCard({ label, value, subtitle, tone, icon, pulse }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex min-h-[72px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm",
        pulse && value > 0 && "ring-2 ring-danger animate-andon-pulse",
      )}
    >
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg md:h-10 md:w-10", toneBg[tone])}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:text-xs">{label}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        <span className="text-2xl font-black leading-none tabular-nums text-foreground">{value}</span>
      </div>
    </div>
  );
}

export function StatusSummaryBar() {
  useTicker(5000); // re-render para atualizar tempos e contadores
  const summary = useDashboardSummary();
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      <StatCard
        label="Máquinas"
        value={summary.totalMachines}
        tone="neutral"
        icon={<Wrench className="h-5 w-5" />}
      />
      <StatCard
        label="Pronta para rodar"
        value={summary.runningMachines}
        tone="success"
        icon={<CheckCircle2 className="h-5 w-5" />}
      />
      <StatCard
        label="Em falha"
        value={summary.stoppedMachines}
        tone="danger"
        icon={<XCircle className="h-5 w-5" />}
      />
      <StatCard
        label="Abertos"
        value={summary.openCalls}
        tone="warning"
        icon={<Bell className="h-5 w-5" />}
      />
      <StatCard
        label="Em atendimento"
        value={summary.inProgressCalls}
        tone="info"
        icon={<Wrench className="h-5 w-5" />}
      />
      <StatCard
        label="Finalizados hoje"
        value={summary.finishedCallsToday}
        tone="success"
        icon={<CheckCheck className="h-5 w-5" />}
      />
      <StatCard
        label="Fora de produção"
        subtitle="Programação"
        value={summary.notScheduledMachines}
        tone="neutral"
        icon={<CalendarX className="h-5 w-5" />}
      />
    </div>
  );
}
