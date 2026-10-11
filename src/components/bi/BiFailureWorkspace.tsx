import type {
  AnalyticsDrilldownSelection,
  AnalyticsOverview,
} from "@/types/analytics";

export function BiFailureWorkspace({
  overview,
  classificationLabels,
  sectorLabels,
  onDrilldown,
}: {
  overview: AnalyticsOverview | null;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
  onDrilldown: (selection: AnalyticsDrilldownSelection) => void;
}) {
  const classificationData = (overview?.classificationPareto ?? [])
    .slice(0, 8)
    .map((item) => ({
      ...item,
      value: item.label,
      label: classificationLabels.get(item.label) ?? item.label,
    }));

  const sectorData = (overview?.sectorDistribution ?? [])
    .slice(0, 8)
    .map((item) => ({
      ...item,
      value: item.label,
      label: sectorLabels.get(item.label) ?? item.label,
    }));

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="shrink-0">
          <h2 className="text-sm font-black uppercase tracking-wide">
            Pareto de classificações
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Diagnóstico registrado na conclusão dos chamados
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-3">
          {classificationData.length ? (
            classificationData.map((item, index) => {
              const max = classificationData[0]?.count || 1;

              return (
                <button
                  type="button"
                  key={item.value}
                  onClick={() =>
                    onDrilldown({
                      dimension: "classification",
                      value: item.value,
                      label: item.label,
                    })
                  }
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-amber-500/30 hover:bg-amber-500/[0.04]"
                >
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-black text-amber-300">
                        {index + 1}
                      </span>
                      <span className="truncate font-bold">{item.label}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{
                          width: `${Math.max(4, (item.count / max) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="self-end text-sm font-black tabular-nums">
                    {item.count}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem classificações concluídas no período
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="shrink-0">
          <h2 className="text-sm font-black uppercase tracking-wide">
            Demanda por setor
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Chamados abertos no período selecionado
          </p>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 content-start gap-3">
          {sectorData.length ? (
            sectorData.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() =>
                  onDrilldown({
                    dimension: "sector",
                    value: item.value,
                    label: item.label,
                  })
                }
                className="flex items-center justify-between rounded-lg border border-border border-l-2 border-l-sky-400 bg-background/40 px-4 py-3 text-left transition hover:bg-muted"
              >
                <span className="truncate text-sm font-semibold">{item.label}</span>
                <span className="ml-3 text-lg font-black tabular-nums">
                  {item.count}
                </span>
              </button>
            ))
          ) : (
            <div className="col-span-2 flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem chamados no período
            </div>
          )}
        </div>

        <div className="mt-4 shrink-0 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-red-300">
            Próxima camada analítica
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Esta aba será a base da Failure Intelligence: reincidência, conjunto/subconjunto,
            intervalo entre ocorrências e timeline por ativo.
          </p>
        </div>
      </section>
    </div>
  );
}
