import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useTicker } from "@/hooks/useTicker";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Bell,
  Wrench,
  CheckCheck,
  AlertTriangle,
} from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
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

function StatCard({ label, value, tone, icon, pulse }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-4 rounded-xl border border-border bg-card px-6 py-4 shadow-sm",
        pulse && value > 0 && "ring-2 ring-danger animate-andon-pulse",
      )}
    >
      <div className={cn("flex h-14 w-14 items-center justify-center rounded-lg", toneBg[tone])}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
      </div>
    </div>
  );
}

export function StatusSummaryBar() {
  useTicker(5000); // re-render para atualizar criticalCalls
  const summary = useDashboardSummary();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <StatCard
        label="Máquinas"
        value={summary.totalMachines}
        tone="neutral"
        icon={<Wrench className="h-7 w-7" />}
      />
      <StatCard
        label="Rodando"
        value={summary.runningMachines}
        tone="success"
        icon={<CheckCircle2 className="h-7 w-7" />}
      />
      <StatCard
        label="Paradas"
        value={summary.stoppedMachines}
        tone="danger"
        icon={<XCircle className="h-7 w-7" />}
      />
      <StatCard
        label="Abertos"
        value={summary.openCalls}
        tone="warning"
        icon={<Bell className="h-7 w-7" />}
      />
      <StatCard
        label="Em atendimento"
        value={summary.inProgressCalls}
        tone="info"
        icon={<Wrench className="h-7 w-7" />}
      />
      <StatCard
        label="Finalizados hoje"
        value={summary.finishedCallsToday}
        tone="success"
        icon={<CheckCheck className="h-7 w-7" />}
      />
      <StatCard
        label="Críticos"
        value={summary.criticalCalls}
        tone="danger"
        icon={<AlertTriangle className="h-7 w-7" />}
        pulse
      />
    </div>
  );
}
