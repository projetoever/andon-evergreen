import { ui } from "@/i18n/translate";
import type { AnalyticsProductionMetrics } from "@/types/analytics";

/** Explains missing samples without converting missing reliability metrics to zero. */
export function explainMissingMtbf(scheduled: AnalyticsProductionMetrics) {
  switch (scheduled.mtbfAvailabilityReason) {
    case "dimension_filtered":
      return ui("MTBF indisponível com filtro de setor ou classificação");
    case "insufficient_schedule":
      return ui("Sem histórico completo de produção programada");
    case "no_programmed_minutes":
      return ui("Sem minutos de produção programada no período");
    case "pending_attribution":
      return ui("{0} episódio(s) com responsabilidade pendente ou mista", {
        0: scheduled.pendingAttributionEpisodes ?? 0,
      });
    case "no_maintenance_failures":
      return ui("Nenhuma falha de manutenção confirmada na programação");
    default:
      return ui("{0} falha(s) de manutenção · {1} pendente(s)/misto(s)", {
        0: scheduled.productionFailureEpisodes,
        1: scheduled.pendingAttributionEpisodes ?? 0,
      });
  }
}

export function explainMissingMttr(scheduled: AnalyticsProductionMetrics) {
  switch (scheduled.mttrAvailabilityReason) {
    case "pending_attribution":
      return ui("{0} parada(s) encerrada(s) ainda sem responsabilidade confirmada", {
        0: scheduled.closedPendingRestorationEpisodes ?? 0,
      });
    case "awaiting_restoration":
      return ui("{0} parada(s) de manutenção ainda em andamento", {
        0: scheduled.openMaintenanceEpisodes ?? 0,
      });
    default:
      return ui("Nenhuma parada de manutenção encerrada com amostra válida");
  }
}
