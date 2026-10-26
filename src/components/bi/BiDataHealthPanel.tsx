import { getInterfaceLocale, ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { ChevronLeft, ChevronRight, ExternalLink, AlertTriangle } from "lucide-react";
import type {
  AnalyticsAssetReliability,
  AnalyticsDataQualityCategory,
  AnalyticsDataQualityDetails,
} from "@/types/analytics";

const LABELS: Record<AnalyticsDataQualityCategory, string> = {
  get "active-calls"() {
    return ui("Chamados ativos > 24h");
  },
  get "open-events"() {
    return ui("Paradas físicas > 24h");
  },
  get "active-sessions"() {
    return ui("Sessões técnicas > 24h");
  },
  get "unclassified-calls"() {
    return ui("Concluídos sem classificação");
  },
  get "unlinked-events"() {
    return ui("Eventos sem chamado");
  },
};

function duration(value: number | null) {
  if (value === null) return "—";
  const t = Math.max(0, Math.round(value));
  const h = Math.floor(t / 60);
  return h ? String(h) + ui("h") + " " + String(t % 60) + ui("min") : String(t) + ui("min");
}

export function BiDataHealthPanel({
  data,
  loading,
  error,
  details,
  detailsLoading,
  detailsError,
  category,
  page,
  onCategoryChange,
  onPageChange,
  onMachineSelect,
}: {
  data: AnalyticsAssetReliability | null;
  loading: boolean;
  error: string | null;
  details: AnalyticsDataQualityDetails | null;
  detailsLoading: boolean;
  detailsError: string | null;
  category: AnalyticsDataQualityCategory;
  page: number;
  onCategoryChange: (category: AnalyticsDataQualityCategory) => void;
  onPageChange: (page: number) => void;
  onMachineSelect: (id: string, name: string) => void;
}) {
  useInterfaceLanguage();
  if (loading && !data)
    return <div className="h-full animate-pulse rounded-xl border border-border bg-card" />;
  if (error)
    return (
      <div className="h-full rounded-xl border border-red-500/30 bg-card p-4 text-sm text-red-200">
        {systemMessage(error)}
      </div>
    );
  if (!data) return null;

  const health = data.dataHealth;
  const counts: Record<AnalyticsDataQualityCategory, number | null> = {
    "active-calls": health.activeCallsOver24h,
    "open-events": health.openFailureEventsOver24h,
    "active-sessions": health.activeSessionsOver24h,
    "unclassified-calls": health.finishedCallsMissingClassification,
    "unlinked-events": health.standaloneFailureEvents,
  };
  const categories = Object.keys(LABELS) as AnalyticsDataQualityCategory[];
  const tz = details?.meta.timeZone ?? data.meta.timeZone;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(getInterfaceLocale(), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));

  return (
    <section className="flex min-w-0 flex-col lg:h-full lg:min-h-0 gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide">
            {ui("Qualidade dos dados · Investigação")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui(
              "Selecione uma categoria para investigar os registros. Sem alterações operacionais.",
            )}
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {ui("Dados do ambiente conectado · somente leitura")}
        </span>
      </header>
      <div className="grid shrink-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {categories.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={category === type}
            onClick={() => onCategoryChange(type)}
            className={
              category === type
                ? "rounded-lg border border-amber-400/70 bg-amber-500/10 p-3 text-left"
                : "rounded-lg border border-border bg-background/30 p-3 text-left hover:bg-muted/50"
            }
          >
            <div className="truncate text-[11px] font-black uppercase text-muted-foreground">
              {LABELS[type]}
            </div>
            <div className="mt-2 text-xl font-black tabular-nums">{counts[type] ?? "—"}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {type === "unclassified-calls" || type === "unlinked-events"
                ? ui("Período filtrado")
                : ui("Snapshot atual")}
            </div>
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(270px,0.65fr)]">
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-background/20 p-3">
          <div className="mb-2 flex shrink-0 justify-between">
            <h3 className="text-xs font-black uppercase tracking-wide">{LABELS[category]}</h3>
            <span className="text-[11px] text-muted-foreground">
              {detailsLoading
                ? ui("Consultando...")
                : String(details?.total ?? 0) + ui(" registro(s)")}
            </span>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto lg:overflow-hidden rounded-lg border border-border">
            {detailsLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {ui("Carregando ocorrências...")}
              </div>
            ) : detailsError ? (
              <div role="alert" className="p-3 text-xs text-red-300">
                {systemMessage(detailsError)}
              </div>
            ) : details?.items.length ? (
              <table className="w-full min-w-[48rem] lg:min-w-0 table-fixed text-left text-xs">
                <thead className="border-b border-border bg-background/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="w-[21%] px-2 py-2">{ui("Máquina")}</th>
                    <th className="w-[18%] px-2 py-2">{ui("Data")}</th>
                    <th className="w-[13%] px-2 py-2">{ui("Idade")}</th>
                    <th className="w-[29%] px-2 py-2">{ui("Registro / OS")}</th>
                    <th className="px-2 py-2">{ui("Histórico")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {details.items.map((item) => (
                    <tr key={item.id} className="h-[51px]">
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-bold hover:text-sky-300"
                          title={ui("Abrir Machine 360")}
                          onClick={() => onMachineSelect(item.machineId, item.machineName)}
                        >
                          {item.machineName}
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          {item.machineIsActive ? ui("Ativa") : ui("Inativa")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 text-[11px]">{date(item.startedAt)}</td>
                      <td className="whitespace-nowrap px-2 font-bold">
                        {duration(item.ageMinutes)}
                      </td>
                      <td className="px-2">
                        <div className="truncate" title={item.technicianName ?? item.status}>
                          {item.technicianName ?? item.status}
                        </div>
                        <div
                          className="truncate font-mono text-[10px] text-muted-foreground"
                          title={item.id}
                        >
                          {item.workOrderNumber ? "OS " + item.workOrderNumber + " · " : ""}
                          {item.id}
                        </div>
                      </td>
                      <td className="px-2">
                        <a
                          href={
                            "/machines/" +
                            encodeURIComponent(item.machineId) +
                            "/" +
                            (item.kind === "open-events" || item.kind === "unlinked-events"
                              ? "failure-history"
                              : "call-history")
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          title={ui(
                            "Abre o histórico da máquina, não um evento específico. Localize pelo ID informado.",
                          )}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold text-sky-300 hover:bg-muted"
                        >
                          {ui("Abrir ")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {ui("Nenhum registro nessa categoria e filtro.")}
              </div>
            )}
          </div>
          <footer className="mt-2 flex min-h-7 shrink-0 flex-wrap gap-2 items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {details
                ? ui("Página ") +
                  details.page +
                  "/" +
                  details.totalPages +
                  ui(" · identifique o registro pelo ID")
                : ui("Aguardando dados")}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={ui("Página anterior")}
                disabled={!details || page <= 1 || detailsLoading}
                onClick={() => onPageChange(page - 1)}
                className="rounded border border-border p-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={ui("Próxima página")}
                disabled={!details || page >= details.totalPages || detailsLoading}
                onClick={() => onPageChange(page + 1)}
                className="rounded border border-border p-1.5 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </div>
        <aside className="min-h-0 rounded-lg border border-border bg-background/20 p-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            {ui("Leitura do alerta")}
          </div>
          <div className="mt-3 space-y-3 text-xs leading-5 text-muted-foreground">
            <p>
              {ui(
                "Chamados, eventos e sessões em aberto são snapshots atuais. Não dependem do período histórico nem da classificação escolhida.",
              )}
            </p>
            <p>
              {ui(
                "Concluídos sem classificação e eventos sem vínculo respeitam a janela. Eventos órfãos não recebem setor presumido.",
              )}
            </p>
            <p>
              {ui("Clicar no nome da máquina abre Machine 360. O botão ")}
              <strong className="text-foreground">{ui("Abrir")}</strong>
              {ui(
                " consulta o histórico da máquina em outra aba; use o ID para identificar o registro.",
              )}
            </p>
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-2 text-amber-200">
              {ui(
                "Em ambiente de homologação, testes manuais não marcados como testes de sistema também aparecem nas métricas. Confirme a origem dos registros antes de interpretar como perdas reais.",
              )}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
