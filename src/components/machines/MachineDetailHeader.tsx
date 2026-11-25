import { Link } from "@tanstack/react-router";
import { ArrowLeft, History, Lock, Unlock, Volume2, VolumeX } from "lucide-react";
import type { Machine } from "@/types/machine";
import { MachineStatusBadge } from "./MachineStatusBadge";
import { AndonStatusBadge } from "./AndonStatusBadge";
import { ProductionModeBadge } from "./ProductionModeBadge";
import { ClockDisplay } from "@/components/common/ClockDisplay";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageProvider";
import { ModuleNavigation } from "@/components/layout/ModuleNavigation";

interface MachineDetailHeaderProps {
  machine: Machine;
  machineSoundEnabled: boolean;
  screenLocked: boolean;
  historyAllowed: boolean;
  onToggleMachineSound: () => void;
  onToggleScreenLock: () => void;
}

export function MachineDetailHeader({
  machine,
  machineSoundEnabled,
  screenLocked,
  historyAllowed,
  onToggleMachineSound,
  onToggleScreenLock,
}: MachineDetailHeaderProps) {
  const { t } = useLanguage();
  const machineName = machine.name?.trim() || machine.id;
  return (
    <header
      className="grid min-w-0 shrink-0 grid-cols-1 gap-3 rounded-xl border border-border bg-card px-3 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start"
      aria-label={t("Máquina")}
    >
      {/* Keep the machine identity wide; never constrain it to an 8rem column. */}
      <div className="flex min-w-0 items-start gap-3">
        {!screenLocked && (
          <Link
            to="/andon"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("Voltar ao painel")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("Máquina")}
          </p>
          <h1
            className="line-clamp-2 min-w-0 break-words text-2xl font-black leading-tight tracking-tight text-foreground sm:text-3xl 2xl:text-4xl [overflow-wrap:anywhere]"
            title={machineName}
            aria-label={machineName}
          >
            {machineName}
          </h1>
          <p
            className="min-w-0 text-xs text-muted-foreground sm:text-sm"
            title={machine.id}
          >
            <span className="font-semibold">{t("ID")}:</span>{" "}
            <span className="break-all font-mono">{machine.id}</span>
          </p>
        </div>
      </div>

      {/* Controls can wrap independently of the name. Their handlers and grants are unchanged. */}
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:max-w-[min(52vw,52rem)] xl:justify-end">
        <ClockDisplay />
        {!screenLocked && <ModuleNavigation />}
        <button
          type="button"
          onClick={onToggleMachineSound}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
          title={machineSoundEnabled ? t("Som do ANDON: Ativo") : t("Som do ANDON: Silenciado")}
          aria-label={
            machineSoundEnabled ? t("Som do ANDON: Ativo") : t("Som do ANDON: Silenciado")
          }
        >
          {machineSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {machineSoundEnabled ? t("Som do ANDON: Ativo") : t("Som do ANDON: Silenciado")}
        </button>
        <div className="inline-flex shrink-0 items-center gap-1.5">
          {historyAllowed && <Link
            to="/machines/$machineId/call-history"
            params={{ machineId: machine.id }}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-background px-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground transition hover:bg-accent hover:text-foreground md:h-10"
            title={t("Histórico da máquina")}
            aria-label={t("Histórico da máquina")}
          >
            <History className="h-4 w-4" />
            {t("Histórico")}
          </Link>}
          <button
            type="button"
            onClick={onToggleScreenLock}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-bold uppercase tracking-wide transition md:h-10",
              screenLocked
                ? "border-warning/60 bg-warning/15 text-warning hover:bg-warning/25"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            title={
              screenLocked
                ? t("Tela fixada: clique para desbloquear")
                : t("Fixar tela desta máquina")
            }
            aria-label={
              screenLocked
                ? t("Tela fixada: clique para desbloquear")
                : t("Fixar tela desta máquina")
            }
          >
            {screenLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            {screenLocked ? t("Tela fixada") : t("Fixar tela")}
          </button>
        </div>
      </div>

      {/* Status badges are independent; none can compress the machine name. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 xl:col-span-2">
        <MachineStatusBadge status={machine.machineStatus} className="text-xs md:text-sm" />
        <AndonStatusBadge status={machine.andonStatus} className="text-xs md:text-sm" />
        <ProductionModeBadge
          productionMode={machine.productionMode}
          className="text-xs md:text-sm"
        />
      </div>
    </header>
  );
}
