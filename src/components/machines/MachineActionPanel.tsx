import { ui } from "@/i18n/translate";
import { CheckCheck, RotateCcw, Wrench, XCircle } from "lucide-react";

import { BigButton } from "@/components/common/BigButton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { AndonCall, CallSubtype } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { AndonCategoryConfig } from "@/types/settings";

interface MachineActionPanelProps {
  machine: Machine;
  currentCall: AndonCall | null;
  categories: AndonCategoryConfig[];
  activeCalls: AndonCall[];
  selectedCallId: string | null;
  hasActiveStopOwner: boolean;
  onOpenSubtype: (subtype: CallSubtype) => void;
  onSelectCall: (callId: string) => void;
  onAttend: () => void;
  onCancelCall: () => void;
  onFinish: () => void;
  onCompleteMaintenance: () => void;
  onReturnToMaintenance: () => void;
  maintenanceCompletionDisabled?: boolean;
  maintenanceCompletionHint?: string | null;
  maintenanceCompletionHintTone?: "success" | "warning" | "danger";
}

function readableTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "#071015" : "#FFFFFF";
}

function parseHexColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance({ red, green, blue }: NonNullable<ReturnType<typeof parseHexColor>>) {
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return convert(red) * 0.2126 + convert(green) * 0.7152 + convert(blue) * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const firstColor = parseHexColor(first);
  const secondColor = parseHexColor(second);
  if (!firstColor || !secondColor) return 1;

  const firstLuminance = relativeLuminance(firstColor);
  const secondLuminance = relativeLuminance(secondColor);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function toHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function getActiveAccentColor(categoryColor: string) {
  const color = parseHexColor(categoryColor);
  if (!color) return "#F8FAFC";

  const normalizedColor = toHex(color.red, color.green, color.blue);
  const activeBackgrounds = ["#27313D", "#111827"];
  if (activeBackgrounds.every((background) => contrastRatio(normalizedColor, background) >= 3)) {
    return normalizedColor;
  }

  for (let whiteMix = 0.15; whiteMix <= 0.85; whiteMix += 0.1) {
    const accent = toHex(
      color.red + (255 - color.red) * whiteMix,
      color.green + (255 - color.green) * whiteMix,
      color.blue + (255 - color.blue) * whiteMix,
    );
    if (activeBackgrounds.every((background) => contrastRatio(accent, background) >= 3)) {
      return accent;
    }
  }

  return "#F8FAFC";
}

interface MachineSectorButtonProps {
  category: AndonCategoryConfig;
  activeCall: AndonCall | undefined;
  selectedCallId: string | null;
  className: string;
  onOpenSubtype: (subtype: CallSubtype) => void;
  onSelectCall: (callId: string) => void;
  translate?: (source: string) => string;
}

export function MachineSectorButton({
  category,
  activeCall,
  selectedCallId,
  className,
  onOpenSubtype,
  onSelectCall,
  translate,
}: MachineSectorButtonProps) {
  // Keep this presentational button callable in isolated renderers and unit tests.
  const t = translate ?? ((source: string) => source);
  const selected = activeCall?.id === selectedCallId;
  const callState = !activeCall ? "free" : selected ? "selected" : "active";
  const accentColor = activeCall ? getActiveAccentColor(category.color) : category.color;
  const actionLabel = activeCall
    ? selected
      ? `${t("Selecionado: chamado")} ${category.displayName}`
      : `${t("Selecionar chamado")} ${category.displayName}`
    : `${t("Abrir novo chamado")} ${category.displayName}`;

  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-pressed={activeCall ? selected : undefined}
      data-call-state={callState}
      title={actionLabel}
      onClick={() => (activeCall ? onSelectCall(activeCall.id) : onOpenSubtype(category.id))}
      className={cn(
        "relative isolate overflow-visible rounded-lg border-2 px-2 py-1.5 font-black uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        activeCall
          ? selected
            ? "shadow-lg hover:brightness-125"
            : "border-border shadow-md hover:brightness-125"
          : "shadow-sm hover:brightness-110",
        className,
      )}
      style={{
        backgroundColor: activeCall ? (selected ? "#111827" : "#27313D") : category.color,
        borderColor: !activeCall || selected ? accentColor : undefined,
        color: activeCall ? "#FFFFFF" : readableTextColor(category.color),
      }}
    >
      {selected && (
        <span
          aria-hidden="true"
          data-selection-ring="true"
          className="pointer-events-none absolute -inset-1 rounded-xl border-2 opacity-100 animate-pulse motion-reduce:animate-none"
          style={{
            borderColor: accentColor,
            boxShadow: `0 0 14px ${accentColor}99`,
          }}
        />
      )}
      {selected && (
        <span
          aria-hidden="true"
          data-selected-inset="true"
          className="pointer-events-none absolute inset-0.5 rounded-md border opacity-70"
          style={{ borderColor: accentColor }}
        />
      )}
      <span className="relative flex min-w-0 flex-col items-center justify-center gap-1">
        <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-1.5">
          {selected && (
            <span
              aria-hidden="true"
              data-selected-pulse-dot="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 0 7px ${accentColor}`,
              }}
            />
          )}
          <span className="min-w-0 break-words text-center [overflow-wrap:anywhere]">
            {category.displayName}
          </span>
        </span>
        {activeCall && (
          <span
            data-call-status-badge="true"
            className={cn(
              "inline-flex rounded-full border bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-black leading-none tracking-wide text-white",
              selected ? "border-2" : "border-border",
            )}
            style={{ borderColor: selected ? accentColor : undefined }}
          >
            {selected ? t("Selecionado") : t("Ativo")}
          </span>
        )}
      </span>
    </button>
  );
}

export function ActiveCallsBadge({ count }: { count: number }) {
  const { t } = useLanguage();
  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} ${count === 1 ? ui("chamado ativo") : ui("chamados ativos")}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-500/15 px-2 py-1 text-[10px] font-black uppercase leading-none tracking-wider text-amber-200"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse motion-reduce:animate-none"
      />
      {count} {count === 1 ? t("Ativo") : t("Ativos")}
    </span>
  );
}

export function MachineActionPanel({
  machine,
  currentCall,
  categories,
  activeCalls,
  selectedCallId,
  hasActiveStopOwner,
  onOpenSubtype,
  onSelectCall,
  onAttend,
  onCancelCall,
  onFinish,
  onCompleteMaintenance,
  onReturnToMaintenance,
  maintenanceCompletionDisabled = false,
  maintenanceCompletionHint = null,
  maintenanceCompletionHintTone = "warning",
}: MachineActionPanelProps) {
  const { t } = useLanguage();
  // Size by the viewport, never by attendance provenance or warning text.
  const sectorActionClass = "machine-sector-action text-base lg:text-lg";
  const workflowActionClass =
    "machine-workflow-action w-full px-3 text-sm sm:flex-1 sm:max-w-[46rem] md:text-base";
  return (
    <section
      data-machine-actions
      className="shrink-0 space-y-1.5 rounded-xl border border-border bg-card p-2 shadow-md"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
            {t("Abrir novo chamado")}
          </h3>
          <ActiveCallsBadge count={activeCalls.length} />
        </div>
        <p className="text-xs text-muted-foreground">
          {machine.machineStatus === "stopped" && hasActiveStopOwner
            ? t("Máquina parada: setor livre abre chamado; setor ativo seleciona o chamado.")
            : t("Setor livre abre chamado; setor ativo seleciona o chamado.")}
        </p>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        {categories.map((category) => {
          const activeCall = activeCalls.find((call) => call.subtype === category.id);
          return (
            <MachineSectorButton
              key={category.id}
              category={category}
              activeCall={activeCall}
              selectedCallId={selectedCallId}
              className={sectorActionClass}
              onOpenSubtype={onOpenSubtype}
              onSelectCall={onSelectCall}
              translate={t}
            />
          );
        })}
      </div>

      {currentCall && (
        <div className="flex flex-wrap items-stretch justify-center gap-1.5 border-t border-border pt-1.5">
          {currentCall.status === "open" && (
            <BigButton tone="info" size="md" className={workflowActionClass} onClick={onAttend}>
              <Wrench className="h-4 w-4" /> {t("Atender selecionado")}
            </BigButton>
          )}
          {currentCall.status === "open" &&
            !currentCall.attendedAt &&
            !(currentCall.technicianSessions ?? []).length && (
              <BigButton
                tone="danger"
                size="md"
                className={workflowActionClass}
                onClick={onCancelCall}
              >
                <XCircle className="h-4 w-4" /> {t("Cancelar selecionado")}
              </BigButton>
            )}
          {currentCall.status === "in_progress" && currentCall.category === "maintenance" && (
            <BigButton
              tone="info"
              size="md"
              className={workflowActionClass}
              disabled={maintenanceCompletionDisabled}
              title={maintenanceCompletionHint ?? undefined}
              onClick={onCompleteMaintenance}
            >
              <CheckCheck className="h-4 w-4" />
              <span className="flex min-w-0 flex-col items-center">
                <span>{t("Concluir manutenção")}</span>
                {maintenanceCompletionHint && (
                  <span
                    role={maintenanceCompletionHintTone === "danger" ? "alert" : "status"}
                    className={cn(
                      "text-[10px] font-semibold normal-case leading-tight",
                      maintenanceCompletionHintTone === "danger" ? "text-danger" : "text-warning",
                    )}
                  >
                    {maintenanceCompletionHintTone === "danger"
                      ? ui("Use a estação do atendimento")
                      : maintenanceCompletionHintTone === "success"
                        ? ui("Atendimento legado")
                        : ui("Validar estação ao concluir")}
                    <span className="sr-only">: {maintenanceCompletionHint}</span>
                  </span>
                )}
              </span>
            </BigButton>
          )}
          {currentCall.status === "in_progress" && currentCall.category === "production" && (
            <BigButton tone="success" size="md" className={workflowActionClass} onClick={onFinish}>
              <CheckCheck className="h-4 w-4" /> {t("Finalizar")}
            </BigButton>
          )}
          {currentCall.status === "post_maintenance" && currentCall.category === "maintenance" && (
            <BigButton
              tone="info"
              size="md"
              className={workflowActionClass}
              onClick={onReturnToMaintenance}
            >
              <RotateCcw className="h-4 w-4" /> {t("Voltar à manutenção")}
            </BigButton>
          )}
          {currentCall.status === "post_maintenance" && (
            <BigButton tone="success" size="md" className={workflowActionClass} onClick={onFinish}>
              <CheckCheck className="h-4 w-4" /> {t("Finalizar chamado")}
            </BigButton>
          )}
        </div>
      )}
    </section>
  );
}
