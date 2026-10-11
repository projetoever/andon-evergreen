import type {
  AnalyticsAssetReliability,
  AnalyticsFailureIntelligence,
  AnalyticsMaintenanceParticipation,
  AnalyticsOverview,
  AndonBiFilterOptions,
  AndonBiFilters,
} from "@/types/analytics";

export type ExecutiveReportData = {
  overview: AnalyticsOverview;
  reliability: AnalyticsAssetReliability;
  maintenance: AnalyticsMaintenanceParticipation;
  failures: AnalyticsFailureIntelligence;
  filters: AndonBiFilters;
  options: AndonBiFilterOptions;
};

const esc = (input: unknown): string =>
  String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function minutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}min` : ""}` : `${remainder}min`;
}

function percentage(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function timestamp(value: string, zone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(value));
}

function tableRows(rows: string[], cells: number): string {
  return rows.length
    ? rows.join("")
    : `<tr><td colspan="${cells}" class="empty">Sem registros para os filtros selecionados.</td></tr>`;
}

function row(cells: unknown[]): string {
  return `<tr>${cells.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`;
}

function sectionTitle(title: string, subtitle?: string) {
  return `<h2>${esc(title)}</h2>${subtitle ? `<p class="context">${esc(subtitle)}</p>` : ""}`;
}

function tile(label: string, value: string, note: string, color: string) {
  return `<div class="kpi ${color}">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(value)}</div>
    <div class="kpi-note">${esc(note)}</div>
  </div>`;
}

function reportTable(headers: string[], rows: string[]) {
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${tableRows(rows, headers.length)}</tbody></table>`;
}

function pageHeader(number: string, heading: string, stamp: string) {
  return `<div class="page-heading"><div>
    <div class="brand"><span class="brand-square"></span> ANDON BI <span class="brand-sub">MAINTENANCE &amp; RELIABILITY INTELLIGENCE</span></div>
    <h1>${esc(heading)}</h1>
  </div><div class="page-number">${esc(number)}<small>${esc(stamp)}</small></div></div>`;
}

export function buildExecutiveReportHtml({
  overview,
  reliability,
  maintenance,
  failures,
  filters,
  options,
}: ExecutiveReportData): string {
  const period = overview.meta.period;
  const timeZone = overview.meta.timeZone || "America/Sao_Paulo";
  const generatedAt = timestamp(overview.meta.generatedAt, timeZone);
  const periodLabel = {
    "24h": "Últimas 24 horas",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
  }[filters.period];
  const machineName =
    options.machines.find((machine) => machine.id === filters.machineId)?.name ??
    (filters.machineId || "Todas as máquinas");
  const sectorName =
    options.sectors.find((sector) => sector.id === filters.subtype)?.displayName ??
    (filters.subtype || "Todos os setores");
  const className =
    options.classifications.find((classification) => classification.value === filters.classification)?.label ??
    (filters.classification || "Todas as classificações");
  const classificationLabel = (id: string) =>
    options.classifications.find((item) => item.value === id)?.label ?? id;
  const areaLabel = (id: string | null) =>
    options.sectors.find((item) => item.id === id)?.displayName ?? id ?? "Não informada";
  const k = overview.kpis;
  const h = reliability.dataHealth;
  const warn = (h.activeCallsOver24h ?? 0) +
    h.openFailureEventsOver24h +
    (h.activeSessionsOver24h ?? 0) +
    h.finishedCallsMissingClassification;

  const meta = `<div class="filters">
    <div><strong>PERÍODO</strong><span>${esc(periodLabel)}</span></div>
    <div><strong>INÍCIO</strong><span>${esc(timestamp(period.start, timeZone))}</span></div>
    <div><strong>FIM CONSIDERADO</strong><span>${esc(timestamp(period.effectiveEnd, timeZone))}</span></div>
    <div><strong>MÁQUINA</strong><span>${esc(machineName)}</span></div>
    <div><strong>SETOR</strong><span>${esc(sectorName)}</span></div>
    <div><strong>CLASSIFICAÇÃO</strong><span>${esc(className)}</span></div>
  </div>`;

  const highlights: string[] = [];
  const downCompare = overview.comparison.downtimeMinutes;
  if (downCompare.direction === "up" || downCompare.direction === "down") {
    highlights.push(`Downtime ${downCompare.direction === "up" ? "aumentou" : "reduziu"} ${percentage(Math.abs(downCompare.deltaPercent ?? 0))} em relação ao período anterior equivalente.`);
  } else {
    highlights.push("Comparação de downtime indisponível ou sem variação relevante na janela equivalente.");
  }
  if (overview.highlights.topMachine) {
    const top = overview.highlights.topMachine;
    highlights.push(`${top.machineName}: ${minutes(top.downtimeMinutes)} de downtime, equivalentes a ${percentage(top.sharePercent)} do total filtrado.`);
  }
  if (warn > 0) {
    highlights.push(`Atenção à integridade: ${h.activeCallsOver24h ?? 0} chamados, ${h.openFailureEventsOver24h} eventos físicos e ${h.activeSessionsOver24h ?? 0} sessões técnicas ultrapassam 24 horas em aberto.`);
  } else {
    highlights.push("Nenhum registro ultrapassou o limiar de 24 horas entre os alertas atualmente monitorados.");
  }

  const topMachines = reliability.assets
    .filter((asset) =>
      asset.downtimeMinutes > 0 ||
      asset.callsOpened > 0 ||
      (asset.activeCallCount ?? 0) > 0,
    )
    .slice(0, 8);
  const topMachineRows = topMachines.map((asset, index) => row([
    index + 1, asset.machineName, minutes(asset.downtimeMinutes),
    asset.physicalStopEpisodes, minutes(asset.mtbfEstimatedMinutes),
    asset.activeCallCount === null ? "—" : asset.activeCallCount,
  ]));

  const topFailures = failures.groups.slice(0, 6).map((group) => row([
    group.machineName,
    classificationLabel(group.classification),
    group.calls, group.repeats24h, group.repeats7d, group.repeats30d,
  ]));

  const classRows = overview.classificationPareto.slice(0, 5).map((item) =>
    row([classificationLabel(item.label), item.count]),
  );

  const techRows = maintenance.technicians.slice(0, 7).map((tech) => row([
    tech.technicianName,
    minutes(tech.maintenanceMinutes),
    minutes(tech.followUpMinutes),
    minutes(tech.totalPersonMinutes),
    tech.callCount,
  ]));
  const areaRows = maintenance.technicalAreas.slice(0, 5).map((area) => row([
    areaLabel(area.technicalArea),
    minutes(area.maintenanceMinutes),
    minutes(area.followUpMinutes),
    area.technicianCount,
  ]));

  const periodNote = `Gerado em ${generatedAt} · fuso ${timeZone}`;
  const footer = (page: number) => `<div class="footer">
    <span>ANDON BI · Registros reais do ANDON · Sem dados de teste</span>
    <span>${esc(overview.meta.metricDefinitionVersion)} · Página ${page}/3</span>
  </div>`;

  const css = `
    @page { size: A4 portrait; margin: 12mm 12mm 11mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #1e293b; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
    .page { min-height: 268mm; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .page-heading { display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 12px; border-bottom: 3px solid #f59e0b; }
    .brand { font-size: 18px; letter-spacing: 1px; font-weight: 900; color: #101820; }
    .brand-square { display: inline-block; width: 7px; height: 17px; background: #f59e0b; vertical-align: -2px; margin-right: 4px; }
    .brand-sub { display: block; color: #64748b; font-weight: 700; letter-spacing: 1.2px; margin-top: 3px; font-size: 7px; }
    h1 { font-size: 17px; margin: 16px 0 2px; color: #111827; }
    .page-number { font-size: 17px; font-weight: 800; color: #dc2626; text-align: right; }
    .page-number small { display: block; margin-top: 4px; font-size: 8px; font-weight: 400; color: #64748b; }
    h2 { font-size: 11px; margin: 16px 0 7px; color: #0f172a; text-transform: uppercase; letter-spacing: .65px; border-left: 3px solid #f59e0b; padding-left: 7px; }
    .context { margin: -3px 0 7px; color: #64748b; font-size: 8.5px; }
    .filters { margin-top: 13px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .filters div { border: 1px solid #e2e8f0; border-radius: 5px; padding: 8px; background: #f8fafc; min-width: 0; }
    .filters strong { display: block; font-size: 7px; letter-spacing: .5px; color: #64748b; margin-bottom: 4px; }
    .filters span { font-size: 9px; font-weight: 700; overflow-wrap: anywhere; }
    .kpis { margin-top: 11px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
    .kpi { padding: 10px 9px; border: 1px solid #e2e8f0; border-left: 3px solid #94a3b8; border-radius: 5px; background: #f8fafc; min-height: 69px; }
    .kpi.red { border-left-color: #dc2626; }.kpi.amber { border-left-color: #eab308; }.kpi.blue { border-left-color: #0284c7; }.kpi.green { border-left-color: #16a34a; }
    .kpi-label { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #475569; }
    .kpi-value { margin: 6px 0 4px; font-size: 19px; font-weight: 900; color: #0f172a; }
    .kpi-note { font-size: 8px; line-height: 1.4; color: #64748b; }
    .insights { margin: 0; padding: 0 0 0 16px; }
    .insights li { margin: 0 0 8px; line-height: 1.5; font-size: 10px; }
    .note { padding: 9px 10px; margin-top: 8px; border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 5px; line-height: 1.45; }
    .note.red { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .note.good { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .mini-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 10px; }
    .mini { padding: 9px; border: 1px solid #e2e8f0; border-radius: 5px; background: #f8fafc; }
    .mini strong { display: block; font-size: 16px; color: #111827; margin-bottom: 3px; }
    .mini span { display: block; text-transform: uppercase; letter-spacing: .3px; color: #64748b; font-size: 7.5px; }
    table { border-collapse: collapse; width: 100%; font-size: 9px; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { padding: 8px 6px; background: #17212b; color: #fff; text-align: left; font-size: 8px; font-weight: 800; }
    td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    td.empty { color: #64748b; text-align: center; padding: 14px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .two-col > div { min-width: 0; }
    .legal { font-size: 8px; color: #475569; line-height: 1.5; }
    .legal p { margin: 5px 0; }
    .footer { margin-top: auto; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7px; color: #64748b; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  `;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>ANDON BI - Relatório Executivo - ${esc(periodLabel)}</title>
  <style>${css}</style>
</head>
<body>
  <section class="page">
    ${pageHeader("01", "Relatório executivo de manutenção", periodNote)}
    ${meta}
    ${sectionTitle("Indicadores executivos", "Dados filtrados; métricas sem amostra são apresentadas como indisponíveis.")}
    <div class="kpis">
      ${tile("Chamados abertos", String(k.callsOpened), `${k.callsFinished} concluído(s) no período`, "amber")}
      ${tile("Ativos agora", k.activeCallsNow === null ? "—" : String(k.activeCallsNow), "Snapshot operacional atual", "blue")}
      ${tile("MTTA", minutes(k.mttaMinutes), `${overview.coverage.mttaSampleSize} atendimento(s) na amostra`, "amber")}
      ${tile("Tempo efetivo manutenção", minutes(k.avgMaintenanceMinutes), `${overview.coverage.maintenanceTimeSampleSize} registro(s) de manutenção`, "blue")}
      ${tile("Downtime físico", minutes(k.downtimeMinutes), `${k.physicalStopEpisodes} episódio(s) unido(s)`, "red")}
      ${tile("MTBF estimado", minutes(k.mtbfEstimatedMinutes), "Baseado em exposição calendário, não em horas produtivas", "green")}
    </div>
    ${sectionTitle("Síntese executiva")}
    <ol class="insights">${highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    ${sectionTitle("Confiabilidade e completude")}
    <div class="mini-grid">
      <div class="mini"><strong>${esc(String(k.physicalStopEpisodes))}</strong><span>Episódios físicos</span></div>
      <div class="mini"><strong>${esc(minutes(k.avgDowntimePerEpisodeMinutes))}</strong><span>Downtime / episódio</span></div>
      <div class="mini"><strong>${esc(percentage(k.maintenanceReturnRatePercent))}</strong><span>Chamados com retorno</span></div>
      <div class="mini"><strong>${esc(percentage(k.classificationCoveragePercent))}</strong><span>Cobertura diagnóstica</span></div>
    </div>
    <div class="note ${warn ? "red" : "good"}">
      <strong>${warn ? "Atenção à qualidade do dado" : "Sem alertas de duração prolongada"}</strong><br>
      ${esc(`${warn} alerta(s) de integridade somados nos grupos monitorados. A contagem representa categorias de alerta, não registros únicos. Nenhum dado foi alterado ou encerrado pelo BI.`)}
    </div>
    ${footer(1)}
  </section>

  <section class="page">
    ${pageHeader("02", "Ativos críticos e reincidências", periodNote)}
    ${sectionTitle("Máquinas prioritárias", "Downtime físico recortado no período, unido por máquina; ativos com perdas ou chamados.")}
    ${reportTable(["#", "MÁQUINA", "DOWNTIME", "EPISÓDIOS", "MTBF EST.", "ATIVOS AGORA"], topMachineRows)}
    ${sectionTitle("Reincidência diagnóstica", "Mesmo diagnóstico em novo chamado finalizado da mesma máquina; não equivale a causa raiz.")}
    <div class="mini-grid">
      <div class="mini"><strong>${esc(String(failures.totals.repeated24h))}</strong><span>Até 24 horas</span></div>
      <div class="mini"><strong>${esc(String(failures.totals.repeated7d))}</strong><span>Até 7 dias</span></div>
      <div class="mini"><strong>${esc(String(failures.totals.repeated30d))}</strong><span>Até 30 dias</span></div>
      <div class="mini"><strong>${esc(String(failures.totals.maintenanceReturnCycles))}</strong><span>Retornos no chamado</span></div>
    </div>
    ${reportTable(["MÁQUINA", "DIAGNÓSTICO", "CONCLUÍDOS", "24H", "7D", "30D"], topFailures)}
    <div class="two-col">
      <div>
        ${sectionTitle("Classificações mais registradas")}
        ${reportTable(["CLASSIFICAÇÃO", "QUANTIDADE"], classRows)}
      </div>
      <div>
        ${sectionTitle("Notas de interpretação")}
        <div class="legal">
          <p>As janelas de 24h, 7d e 30d são cumulativas e incluem antecedentes de até 30 dias antes do início do período.</p>
          <p>Retornos à manutenção são ciclos no próprio chamado; reincidências são novos chamados com diagnóstico repetido.</p>
          <p>Eventos físicos sem chamado podem contribuir para downtime, mas não recebem setor ou diagnóstico de chamado presumidos.</p>
        </div>
      </div>
    </div>
    ${footer(2)}
  </section>

  <section class="page">
    ${pageHeader("03", "Equipe, integridade e metodologia", periodNote)}
    ${sectionTitle("Participação técnica", "Pessoa-minutos por mantenedor: volume registrado, não produtividade individual.")}
    <div class="mini-grid">
      <div class="mini"><strong>${esc(minutes(maintenance.totals.maintenancePersonMinutes))}</strong><span>Manutenção</span></div>
      <div class="mini"><strong>${esc(minutes(maintenance.totals.followUpPersonMinutes))}</strong><span>Acompanhamento</span></div>
      <div class="mini"><strong>${esc(String(maintenance.totals.technicianCount))}</strong><span>Mantenedores</span></div>
      <div class="mini"><strong>${esc(String(maintenance.totals.activeSessionCount))}</strong><span>Sessões ativas</span></div>
    </div>
    ${reportTable(["MANTENEDOR", "MANUTENÇÃO", "ACOMPANHAMENTO", "TOTAL PESSOA", "CHAMADOS"], techRows)}
    <div class="two-col">
      <div>
        ${sectionTitle("Distribuição por área técnica")}
        ${reportTable(["ÁREA", "MANUT.", "ACOMP.", "TÉCNICOS"], areaRows)}
      </div>
      <div>
        ${sectionTitle("Saúde dos registros")}
        <div class="mini-grid" style="grid-template-columns: repeat(2,1fr); margin-top:4px">
          <div class="mini"><strong>${esc(String(h.activeCallsOver24h ?? "—"))}</strong><span>Chamados abertos &gt;24h</span></div>
          <div class="mini"><strong>${esc(String(h.openFailureEventsOver24h))}</strong><span>Eventos físicos &gt;24h</span></div>
          <div class="mini"><strong>${esc(String(h.activeSessionsOver24h ?? "—"))}</strong><span>Sessões técnicas &gt;24h</span></div>
          <div class="mini"><strong>${esc(String(h.standaloneFailureEvents))}</strong><span>Eventos sem chamado</span></div>
        </div>
      </div>
    </div>
    ${sectionTitle("Metodologia e limites")}
    <div class="legal">
      <p><strong>Recorte temporal:</strong> aberturas por openedAt; conclusões por finishedAt; MTTA por attendedAt; ativos são snapshot do momento de extração.</p>
      <p><strong>Downtime físico:</strong> união de intervalos de FailureEvent por máquina, sem dupla contagem na mesma máquina. Em várias máquinas o downtime é acumulado entre os ativos.</p>
      <p><strong>MTBF:</strong> estimado a partir de exposição calendário menos downtime. Não substitui MTBF calculado por horas reais em operação.</p>
      <p><strong>Qualidade:</strong> alertas de registros abertos podem inflar tempos até sua apuração operacional. Sem registros fictícios e sem inclusão de testes de sistema.</p>
      <p><strong>Filtros:</strong> setor não atribui eventos físicos órfãos; classificação de chamado e de FailureEvent têm semânticas próprias. Indicadores indisponíveis são exibidos com travessão.</p>
      <p><strong>Rastreabilidade:</strong> geração a partir das APIs read-only do ANDON BI. Cada conjunto de métricas utiliza a mesma janela de período escolhida; os dados podem evoluir com novos registros.</p>
    </div>
    ${footer(3)}
  </section>
</body>
</html>`;
}

/** Uses the browser's native Save as PDF workflow; no third-party CDN or print server. */
export function openReportPrintDialog(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Relatório executivo para exportação em PDF");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "794px";
  frame.style.height = "1123px";
  frame.style.border = "0";
  frame.style.pointerEvents = "none";
  let printStarted = false;

  const dispose = () => {
    if (frame.isConnected) frame.remove();
  };
  frame.onload = () => {
    const inner = frame.contentWindow;
    if (!inner || printStarted) return;
    printStarted = true;
    inner.addEventListener("afterprint", dispose, { once: true });
    void (frame.contentDocument?.fonts.ready ?? Promise.resolve()).then(() => {
      inner.focus();
      inner.print();
    });
  };

  document.body.appendChild(frame);
  frame.srcdoc = html;
}
