import { X } from "lucide-react";

import type {
  AnalyticsDrilldownResult,
  AnalyticsDrilldownSelection,
} from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function BiAnalyticsDrillDown({
  selection,
  result,
  loading,
  error,
  classificationLabels,
  sectorLabels,
  onClose,
}: {
  selection: AnalyticsDrilldownSelection;
  result: AnalyticsDrilldownResult | null;
  loading: boolean;
  error: string | null;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
  onClose: () => void;
}) {
  const timeZone = result?.meta.timeZone ?? "America/Sao_Paulo";

  return (
    <section className="rounded-xl border border-primary/40 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide">
            Drill-down · {selection.label}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Registros analíticos que sustentam o ponto selecionado
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-muted"
          aria-label="Fechar detalhamento"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Carregando registros…
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && result && (
        result.items.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Ocorrência</th>
                  <th className="px-3 py-3">Máquina</th>
                  <th className="px-3 py-3">Setor</th>
                  <th className="px-3 py-3">Classificação</th>
                  <th className="px-3 py-3">Duração</th>
                  <th className="px-3 py-3">OS / chamado</th>
                  <th className="px-3 py-3">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.items.map((item) => (
                  <tr key={`${item.kind}-${item.id}`} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone,
                      }).format(new Date(item.occurredAt))}
                    </td>
                    <td className="px-3 py-3 font-semibold">{item.machineName}</td>
                    <td className="px-3 py-3">
                      {item.subtype
                        ? sectorLabels.get(item.subtype) ?? item.subtype
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {item.classification
                        ? classificationLabels.get(item.classification) ?? item.classification
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">
                      {formatMinutes(item.durationMinutes)}
                    </td>
                    <td className="px-3 py-3">
                      <div>{item.workOrderNumber || "Sem OS"}</div>
                      <div className="mt-1 max-w-40 truncate font-mono text-xs text-muted-foreground">
                        {item.callId || "evento sem chamado"}
                      </div>
                    </td>
                    <td className="max-w-md px-3 py-3 text-muted-foreground">
                      {item.description || "Sem descrição"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum registro encontrado para este detalhamento
          </div>
        )
      )}
    </section>
  );
}
