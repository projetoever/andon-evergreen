import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileWarning, Pencil, Save } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { useAndon } from "@/context/AndonProvider";
import { getFailureClassificationConfigs } from "@/services/failureClassificationConfigService";
import type { FailureClassification } from "@/types/machine";
import type { FailureClassificationConfig } from "@/types/settings";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { diffMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import {
  calculateProductionModeBreakdownForPeriod,
  formatBreakdownDuration,
} from "@/utils/timeBreakdownUtils";

interface MachineFailureHistoryPageProps {
  machineId: string;
}

const PLACEHOLDER_CLASSIFICATION: FailureClassification = "real_machine_failure";

function getFailureClassificationFromLegacy(): FailureClassification {
  return PLACEHOLDER_CLASSIFICATION;
}

function getFailureClassificationLabel(
  classification: FailureClassification | undefined,
  catalogByValue: Map<string, FailureClassificationConfig>,
) {
  const value = classification ?? getFailureClassificationFromLegacy();
  return catalogByValue.get(value)?.label ?? `Classificação não cadastrada (${value})`;
}

export function MachineFailureHistoryPage({ machineId }: MachineFailureHistoryPageProps) {
  const { machines, updateMachineStopEventDescription } = useAndon();
  const machine = machines.find((item) => item.id === machineId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingClassification, setEditingClassification] = useState<FailureClassification>(
    PLACEHOLDER_CLASSIFICATION,
  );
  const [classifications, setClassifications] = useState<FailureClassificationConfig[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);
    void getFailureClassificationConfigs()
      .then((catalog) => {
        if (active) setClassifications(catalog);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(
          error instanceof Error ? error.message : "Falha ao carregar o catálogo central.",
        );
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const catalogByValue = useMemo(
    () => new Map(classifications.map((item) => [item.value, item])),
    [classifications],
  );

  if (!machine) {
    return (
      <EmptyState
        icon={<FileWarning className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  const history = machine.stopHistory
    .slice()
    .sort((a, b) => new Date(b.stoppedAt).getTime() - new Date(a.stoppedAt).getTime());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center gap-3">
          <Link
            to="/machines/$machineId"
            params={{ machineId }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-11 md:w-11"
            aria-label="Voltar para a máquina"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Máquina {machine.id}
            </div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">
              Histórico de Falhas
            </h1>
            <p className="text-sm text-muted-foreground">{machine.name}</p>
          </div>
        </div>
      </div>

      {catalogLoading && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          Carregando catálogo central de classificações...
        </p>
      )}
      {catalogError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p className="font-bold">Catálogo central de classificações indisponível.</p>
          <p>{catalogError}</p>
        </div>
      )}

      {history.length === 0 ? (
        <EmptyState
          icon={<FileWarning className="h-12 w-12" />}
          title="Sem falhas registradas"
          description="Quando houver falhas para esta máquina, elas aparecerão aqui."
        />
      ) : (
        <div className="space-y-2.5">
          {history.map((event) => {
            const now = new Date();
            const periodEnd = event.resumedAt ?? now.toISOString();
            const duration = event.resumedAt
              ? event.durationMinutes
              : diffMinutes(event.stoppedAt, periodEnd);
            const productionBreakdown = calculateProductionModeBreakdownForPeriod({
              periodStart: event.stoppedAt,
              periodEnd,
              productionHistory: machine.productionHistory,
              fallbackProductionMode:
                event.productionModeAtStart ?? event.productionModeAtEnd ?? machine.productionMode,
              now,
            });
            const selectableClassifications = classifications.filter(
              (option) => option.active || option.value === editingClassification,
            );

            return (
              <article key={event.id} className="rounded-xl border border-border bg-card p-4">
                <dl className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Início</dt>
                    <dd className="font-mono text-sm">{formatDateTime(event.stoppedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Retorno</dt>
                    <dd className="font-mono text-sm">
                      {event.resumedAt ? formatDateTime(event.resumedAt) : "Em aberto"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Duração</dt>
                    <dd className="font-bold">{formatDurationMinutes(duration)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      Classificação da ocorrência
                    </dt>
                    <dd className="font-bold">
                      {getFailureClassificationLabel(event.failureClassification, catalogByValue)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Status</dt>
                    <dd className="font-bold">{event.resumedAt ? "Finalizada" : "Em aberto"}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs uppercase text-muted-foreground">
                      Descrição da ocorrência
                    </dt>
                    <dd className="text-foreground">
                      {editingId === event.id ? (
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Classificação da ocorrência
                          </label>
                          <select
                            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                            value={editingClassification}
                            onChange={(changeEvent) =>
                              setEditingClassification(changeEvent.target.value)
                            }
                            disabled={catalogLoading || Boolean(catalogError)}
                          >
                            {selectableClassifications.map((option) => (
                              <option key={option.id} value={option.value}>
                                {option.label}
                                {option.active ? "" : " (Inativa)"}
                              </option>
                            ))}
                          </select>
                          {editingClassification === PLACEHOLDER_CLASSIFICATION && (
                            <p className="text-xs font-bold text-amber-500">
                              Selecione uma classificação específica para a ocorrência.
                            </p>
                          )}
                          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Descrição da ocorrência
                          </label>
                          <textarea
                            className="min-h-[88px] rounded-xl border border-border bg-background p-3 text-sm"
                            value={editingText}
                            onChange={(changeEvent) => setEditingText(changeEvent.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (editingClassification === PLACEHOLDER_CLASSIFICATION) {
                                  toast.error(
                                    "Selecione uma classificação específica para a ocorrência.",
                                  );
                                  return;
                                }
                                updateMachineStopEventDescription(
                                  machine.id,
                                  event.id,
                                  editingText.trim(),
                                  editingClassification,
                                );
                                setEditingId(null);
                              }}
                              className="inline-flex items-center gap-2 self-start rounded-xl bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-secondary-foreground"
                              disabled={catalogLoading || Boolean(catalogError)}
                            >
                              <Save className="h-4 w-4" />
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-bold uppercase tracking-wider"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <span>{event.failureDescription || "Sem descrição"}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(event.id);
                              setEditingText(event.failureDescription || "");
                              setEditingClassification(
                                event.failureClassification ?? PLACEHOLDER_CLASSIFICATION,
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold uppercase tracking-wider"
                            disabled={catalogLoading || Boolean(catalogError)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>
                        </div>
                      )}
                    </dd>
                  </div>
                </dl>
                <section className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Impacto da falha
                  </h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <dt>Parada produtiva</dt>
                      <dd className="font-bold">
                        {formatBreakdownDuration(productionBreakdown.scheduledSeconds)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt>Em falha sem produção programada</dt>
                      <dd className="font-bold">
                        {formatBreakdownDuration(productionBreakdown.notScheduledSeconds)}
                      </dd>
                    </div>
                  </dl>
                </section>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
