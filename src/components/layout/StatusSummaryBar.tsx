import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useLanguage } from "@/i18n/LanguageProvider";
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
        "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm",
        pulse && value > 0 && "ring-2 ring-danger animate-andon-pulse",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md md:h-10 md:w-10", toneBg[tone])}>
        {icon}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        <span className="text-xl font-bold tabular-nums leading-tight text-foreground md:text-2xl">{value}</span>
      </div>
    </div>
  );
}

export function StatusSummaryBar() {
  useTicker(5000); // re-render para atualizar tempos e contadores
  const summary = useDashboardSummary();
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      <StatCard
        label={t("Máquinas")}
        value={summary.totalMachines}
        tone="neutral"
        icon={<Wrench className="h-5 w-5" />}
      />
      <StatCard
        label={t("Pronta para rodar")}
        value={summary.runningMachines}
        tone="success"
        icon={<CheckCircle2 className="h-5 w-5" />}
      />
      <StatCard
        label={t("Em falha")}
        value={summary.stoppedMachines}
        tone="danger"
        icon={<XCircle className="h-5 w-5" />}
      />
      <StatCard
        label={t("Abertos")}
        value={summary.openCalls}
        tone="warning"
        icon={<Bell className="h-5 w-5" />}
      />
      <StatCard
        label={t("Em atendimento")}
        value={summary.inProgressCalls}
        tone="info"
        icon={<Wrench className="h-5 w-5" />}
      />
      <StatCard
        label={t("Finalizados hoje")}
        value={summary.finishedCallsToday}
        tone="success"
        icon={<CheckCheck className="h-5 w-5" />}
      />
      <StatCard
        label={t("Fora de produção")}
        subtitle={t("Programação")}
        value={summary.notScheduledMachines}
        tone="neutral"
        icon={<CalendarX className="h-5 w-5" />}
      />
    </div>
  );
}
