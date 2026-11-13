import { BarChart3 } from "lucide-react";
import { ui, getInterfaceLocale } from "@/i18n/translate";
import type { GlobalHistorySummary } from "@/services/globalHistoryService";

const STATUS_LABEL: Record<string, string> = {
  open:"Aberto",in_progress:"Em atendimento",post_maintenance:"Em acompanhamento",
  finished:"Finalizado",cancelled:"Cancelado",
};
const CATEGORY_LABEL: Record<string, string> = {
  maintenance:"Manutenção",production:"Produção",
};

function AggregateBars({ values, total }: {
  values: readonly { label: string; count: number }[];
  total: number;
}) {
  return (
    <ul className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {values.map(v => <li key={v.label} className="min-w-0 space-y-1">
        <div className="flex justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">{ui(v.label)}</span>
          <strong className="tabular-nums">{v.count.toLocaleString(getInterfaceLocale())}</strong>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary"
            style={{ width: total > 0 ? `${Math.min(100, Math.max(0, v.count / total * 100))}%` : "0%" }}/>
        </div>
      </li>)}
    </ul>
  );
}

export function GlobalHistorySummaryPanel({ summary }: { summary: GlobalHistorySummary }) {
  const statuses = summary.byStatus.map(v=>({
    label: STATUS_LABEL[v.status] ?? v.status, count:v.count,
  }));
  const categories = summary.byCategory.map(v=>({
    label: CATEGORY_LABEL[v.category] ?? v.category, count:v.count,
  }));
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={ui("Indicadores dos chamados filtrados")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
            {ui("Indicadores dos chamados filtrados")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui("Totais de todos os registros autorizados que correspondem aos filtros, independentemente da página exibida.")}
          </p>
        </div>
        <div className="text-right">
          <strong className="text-2xl font-black tabular-nums">{summary.total.toLocaleString(getInterfaceLocale())}</strong>
          <p className="text-xs text-muted-foreground">{ui("Chamados encontrados")}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide">{ui("Por situação")}</h3>
          {statuses.length ? <AggregateBars values={statuses} total={summary.total}/> :
            <p className="mt-2 text-sm text-muted-foreground">{ui("Nenhum registro no período.")}</p>}
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide">{ui("Por categoria")}</h3>
          {categories.length ? <AggregateBars values={categories} total={summary.total}/> :
            <p className="mt-2 text-sm text-muted-foreground">{ui("Nenhum registro no período.")}</p>}
        </div>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {ui("Chamados reais")}: <strong>{summary.byOrigin.real.toLocaleString(getInterfaceLocale())}</strong>
        {" · "}
        {ui("Testes do sistema")}: <strong>{summary.byOrigin.system.toLocaleString(getInterfaceLocale())}</strong>
      </p>
    </section>
  );
}
