import { ui, getInterfaceLocale } from "@/i18n/translate";
import type { GlobalHistoryCallSummary } from "@/services/globalHistoryService";

/** CSV from the currently visible, already authorized page ONLY.
 * Never claim it exports the entire filtered history. Protect each text
 * cell against spreadsheet formula injection, preserving UTF-8 and quotes.
 */
export function buildGlobalHistoryPageCsv(
  items: readonly GlobalHistoryCallSummary[],
): string {
  const csvCell = (value: string | number | null | undefined): string => {
    let raw = value === null || value === undefined ? "" : String(value);
    raw = raw.replace(/\u0000/g, "");
    // Spreadsheets may strip invisible format characters before recognizing a
    // formula. Keep the original value, but prefix a literal text marker.
    if (/^[\s\uFEFF\u200B-\u200F\u202A-\u202E\u2060-\u206F]*[=+\-@]/u.test(raw) || /^[\t\r\n]/.test(raw))
      raw = "'" + raw;
    return '"' + raw.replace(/"/g, '""') + '"';
  };
  const time = (iso: string | null | undefined) => {
    if (!iso) return "";
    const date = new Date(iso);
    return Number.isFinite(date.valueOf())
      ? date.toLocaleString(getInterfaceLocale(), { dateStyle: "short", timeStyle: "medium" })
      : "";
  };
  const header = [
    ui("Máquina"), ui("ID"), ui("Número da OS"),
    ui("Abertura"), ui("Finalização"), ui("Última movimentação"),
    ui("Situação"), ui("Criticidade"), ui("Categoria"), ui("Tipo / especialidade"),
    ui("Natureza do chamado"), ui("Classificação"), ui("Mantenedores"), ui("Origem"),
  ];
  const rows = items.map(c => [
    c.machine?.name || c.machineId,
    c.id,
    c.workOrderNumber,
    time(c.openedAt),
    time(c.finishedAt),
    time(c.updatedAt),
    c.status,
    c.criticality,
    c.callReasonSnapshot?.reasonNameSnapshot || c.category,
    c.callReasonSnapshot?.optionNameSnapshot || c.subtype,
    c.callReasonSnapshot?.nature ?? "",
    c.failureClassification,
    c.technicianNames?.join(", ") || c.technicianName,
    c.isSystemTest ? ui("Teste do sistema") : ui("Chamado real"),
  ]);
  return [header, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
}

export function downloadGlobalHistoryPageCsv(items: readonly GlobalHistoryCallSummary[]) {
  if (!items.length || items.length > 25)
    throw new Error("history_csv_page_size_invalid");
  const text = buildGlobalHistoryPageCsv(items);
  const url = URL.createObjectURL(new Blob(["\uFEFF" + text], {
    type: "text/csv;charset=utf-8",
  }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `andon-historico-pagina-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    try { anchor.click(); }
    finally { anchor.remove(); }
  } finally {
    URL.revokeObjectURL(url);
  }
}
