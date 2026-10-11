import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type {
  AnalyticsDrilldownResult,
  AnalyticsDrilldownSelection,
} from "@/types/analytics";

const PAGE_SIZE = 7;

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
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
  const [page, setPage] = useState(0);
  const timeZone = result?.meta.timeZone ?? "America/Sao_Paulo";

  useEffect(() => {
    setPage(0);
  }, [selection.dimension, selection.value, result]);

  const totalPages = Math.max(
    1,
    Math.ceil((result?.items.length ?? 0) / PAGE_SIZE),
  );
  const items = useMemo(
    () =>
      result?.items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) ?? [],
    [page, result],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-primary/40 bg-card p-5 shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4">
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
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
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
          <>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              <table className="h-full w-full table-fixed text-left text-xs">
                <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-[12%] px-3 py-2">Ocorrência</th>
                    <th className="w-[13%] px-3 py-2">Máquina</th>
                    <th className="w-[12%] px-3 py-2">Setor</th>
                    <th className="w-[15%] px-3 py-2">Classificação</th>
                    <th className="w-[10%] px-3 py-2">Duração</th>
                    <th className="w-[16%] px-3 py-2">OS / chamado</th>
                    <th className="px-3 py-2">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={`${item.kind}-${item.id}`} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone,
                        }).format(new Date(item.occurredAt))}
                      </td>
                      <td className="truncate px-3 py-2 font-semibold">{item.machineName}</td>
                      <td className="truncate px-3 py-2">
                        {item.subtype
                          ? sectorLabels.get(item.subtype) ?? item.subtype
                          : "—"}
                      </td>
                      <td className="truncate px-3 py-2">
                        {item.classification
                          ? classificationLabels.get(item.classification) ??
                            item.classification
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">
                        {formatMinutes(item.durationMinutes)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="truncate">{item.workOrderNumber || "Sem OS"}</div>
                        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                          {item.callId || "evento sem chamado"}
                        </div>
                      </td>
                      <td className="truncate px-3 py-2 text-muted-foreground">
                        {item.description || "Sem descrição"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex shrink-0 items-center justify-between text-xs text-muted-foreground">
              <span>
                {result.items.length} registro(s) · página {page + 1}/{totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 font-bold text-foreground disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages - 1, current + 1))
                  }
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 font-bold text-foreground disabled:opacity-40"
                >
                  Próxima
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Nenhum registro encontrado para este detalhamento
          </div>
        )
      )}
    </section>
  );
}
