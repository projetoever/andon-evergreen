import type { AnalyticsMachine360 } from "@/types/analytics";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function minutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 60);
  const remain = total % 60;
  return hours > 0 ? `${hours}h${remain > 0 ? ` ${remain}min` : ""}` : `${remain}min`;
}

function localDate(iso: string, zone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: zone,
  }).format(new Date(iso));
}
function tr(items: unknown[]): string {
  return "<tr>" + items.map(item => `<td>${escapeHtml(item)}</td>`).join("") + "</tr>";
}
function table(headers: string[], rows: string[]) {
  return `<table><thead><tr>${headers.map(item => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${
    rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="empty">Sem registros para esta seleção</td></tr>`
  }</tbody></table>`;
}
function metric(label: string, value: string, accent: string) {
  return `<div class="metric ${accent}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
const heading = (text: string) => `<h2>${escapeHtml(text)}</h2>`;

export function buildMachinePdfHtml(
  data: AnalyticsMachine360,
  classificationLabels: Map<string, string>,
): string {
  const r = data.recurrence;
  const zone = data.meta.timeZone;
  const names = (key: string) => classificationLabels.get(key) ?? key;
  const rows = r.groups.slice(0, 9).map(group => tr([
    group.setName ?? "Não informado",
    group.subsetName ?? "Não informado",
    names(group.classification),
    group.calls,
    group.repeats30d,
  ]));
  const history = r.timeline.slice(0, 12).map(c => tr([
    localDate(c.finishedAt, zone),
    names(c.classification),
    `${c.setName ?? "—"} / ${c.subsetName ?? "—"}`,
    c.workOrderNumber ?? "—",
    c.repeatSubset30d ? "Subconjunto" :
      c.repeatSet30d ? "Conjunto" : c.repeat30d ? "Diagnóstico" : "Sem repetição ≤30d",
  ]));
  const diagnostics = data.diagnoses.slice(0, 6).map(c => tr([
    names(c.classification), c.count,
  ]));
  const filters = [
    `Início: ${localDate(data.meta.period.start, zone)}`,
    `Fim considerado: ${localDate(data.meta.period.effectiveEnd, zone)}`,
    `Setor: ${data.meta.filters.subtype ?? "Todos"}`,
    `Classificação: ${data.meta.filters.classification ? names(data.meta.filters.classification) : "Todas"}`,
  ];
  const css = `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; font: 10px Arial, Helvetica, sans-serif; color: #1e293b; }
    .page { width: 210mm; min-height: 297mm; display: flex; flex-direction: column; padding: 13mm 14mm; break-after: page; }
    .page:last-child { break-after: auto; }
    header { border-bottom: 3px solid #eab308; padding-bottom: 10px; display: flex; align-items: flex-end; justify-content: space-between; }
    .logo { font-weight: 900; font-size: 19px; letter-spacing: .5px; color: #0f172a; }
    .sub { margin-top: 4px; font-size: 9px; color: #64748b; }
    h1 { font-size: 22px; margin: 14px 0 6px; color: #0f172a; }
    h2 { margin: 15px 0 8px; font-size: 11px; text-transform: uppercase; border-left: 3px solid #f59e0b; padding-left: 8px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .filters span { padding: 7px 9px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
    .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; margin-top: 13px; }
    .metric { border: 1px solid #e2e8f0; border-left: 3px solid #0284c7; border-radius: 5px; padding: 11px; background: #f8fafc; }
    .metric.red { border-left-color: #dc2626; }.metric.amber { border-left-color: #eab308; }.metric.green { border-left-color: #16a34a; }
    .metric span { display: block; text-transform: uppercase; font-size: 8px; font-weight: 800; color: #64748b; }
    .metric strong { display: block; margin-top: 6px; font-size: 21px; color: #0f172a; }
    .summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; padding: 11px; background: #eff6ff; border-radius: 5px; margin-top: 12px; }
    .summary span { font-size: 9px; }.summary strong { font-size: 15px; display: block; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
    thead { display: table-header-group; }
    th { padding: 8px 5px; color: #fff; background: #17212b; text-align: left; font-size: 8px; }
    td { padding: 8px 5px; border-bottom: 1px solid #e2e8f0; overflow-wrap: anywhere; }
    tr { break-inside: avoid; }
    tr:nth-child(even) td { background: #f8fafc; }
    td.empty { text-align: center; color: #64748b; }
    .note { padding: 11px; border: 1px solid #fde68a; background: #fffbeb; color: #92400e; line-height: 1.55; margin-top: 12px; font-size: 9px; border-radius: 5px; }
    .foot { margin-top: auto; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #64748b; display: flex; justify-content: space-between; }
    @media screen { body { background: #e2e8f0; } .page { margin: 12px auto; background: white; box-shadow: 0 2px 9px #94a3b8; } }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { margin: 0; box-shadow: none; } }
  `;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>ANDON BI - ${escapeHtml(data.machine.name)} - Machine 360</title><style>${css}</style></head><body>
<section class="page">
  <header><div><div class="logo">ANDON BI</div><div class="sub">MAINTENANCE &amp; RELIABILITY INTELLIGENCE</div></div><div class="sub">FICHA INDIVIDUAL · 01/02</div></header>
  <h1>Machine 360 · ${escapeHtml(data.machine.name)}</h1>
  <div class="filters">${filters.map(x => `<span>${escapeHtml(x)}</span>`).join("")}</div>
  <div class="grid">
    ${metric("Downtime físico", minutes(data.kpis.downtimeMinutes), "red")}
    ${metric("Episódios físicos", String(data.kpis.physicalStopEpisodes), "red")}
    ${metric("MTBF estimado", data.machine.isActive ? minutes(data.kpis.mtbfEstimatedMinutes) : "—", "green")}
    ${metric("MTTA", minutes(data.kpis.mttaMinutes), "amber")}
    ${metric("Manutenção efetiva", minutes(data.kpis.avgMaintenanceMinutes), "")}
    ${metric("Parada por episódio", minutes(data.kpis.avgDowntimePerEpisodeMinutes), "red")}
  </div>
  <div class="summary">
    <span>Chamados abertos<strong>${data.kpis.callsOpened}</strong></span>
    <span>Concluídos<strong>${data.kpis.callsFinished}</strong></span>
    <span>Ativos agora<strong>${data.kpis.callsActiveNow}</strong></span>
    <span>Retornos registrados<strong>${data.kpis.maintenanceReturnCycles}</strong></span>
    <span>Eventos abertos<strong>${data.dataHealth.openFailureEvents}</strong></span>
    <span>Sessões ativas<strong>${data.kpis.activeSessionsNow}</strong></span>
  </div>
  ${heading("Diagnósticos mais registrados")}
  ${table(["DIAGNÓSTICO", "CHAMADOS CONCLUÍDOS"], diagnostics)}
  <div class="note"><strong>Leitura executiva:</strong> downtime é a união dos intervalos físicos por máquina.
  O MTBF é estimado por exposição calendário, não horas reais de produção. Sessões em aberto podem ampliar tempos.
  O BI não presume que registros do notebook de homologação sejam perdas reais.</div>
  <div class="foot"><span>ANDON BI · Somente leitura · Gerado em ${escapeHtml(localDate(data.meta.generatedAt, zone))}</span><span>Machine 360 · Página 1/2</span></div>
</section>
<section class="page">
  <header><div><div class="logo">ANDON BI</div><div class="sub">DIAGNÓSTICOS E RECORRÊNCIA</div></div><div class="sub">FICHA INDIVIDUAL · 02/02</div></header>
  <h1>Falhas recorrentes · ${escapeHtml(data.machine.name)}</h1>
  <div class="summary">
    <span>Concluídos classificados<strong>${r.totals.diagnosedFinishedCalls}</strong></span>
    <span>Repetições ≤24h<strong>${r.totals.repeated24h}</strong></span>
    <span>Repetições ≤7d<strong>${r.totals.repeated7d}</strong></span>
    <span>Repetições ≤30d<strong>${r.totals.repeated30d}</strong></span>
    <span>Mesmo conjunto ≤30d<strong>${r.totals.repeatedSet30d}</strong></span>
    <span>Mesmo subconjunto ≤30d<strong>${r.totals.repeatedSubset30d}</strong></span>
  </div>
  ${heading("Localização histórica por conjunto e subconjunto")}
  ${table(["CONJUNTO", "SUBCONJUNTO", "DIAGNÓSTICO", "CHAMADOS", "REP. 30D"], rows)}
  ${heading("Linha do tempo de conclusões")}
  ${table(["CONCLUSÃO", "DIAGNÓSTICO", "LOCAL", "OS", "RECORRÊNCIA"], history)}
  <div class="note">
    ${escapeHtml(r.semantics.lookback)} ${escapeHtml(r.semantics.hierarchy)}
    ${r.groupsTruncated || r.timelineTruncated ? " Os rankings e históricos exibidos são amostras limitadas; os totais usam a coorte completa." : ""}
    Retornos dentro do mesmo chamado são contabilizados separadamente.
  </div>
  <div class="foot"><span>ANDON BI · Dados históricos sem inferência de causa raiz</span><span>Machine 360 · Página 2/2</span></div>
</section></body></html>`;
}
