import type { AndonCall } from "@/types/andon";
import type { AppBackup } from "@/types/history";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { getCallSubtypeLabel } from "@/utils/statusUtils";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportHistoryToCsv(calls: AndonCall[]): void {
  const header = [
    "Máquina",
    "Categoria",
    "Subtipo",
    "Aberto em",
    "Atendido em",
    "Finalizado em",
    "Tempo aguardando (min)",
    "Tempo em atendimento (min)",
    "Tempo total (min)",
    "Tempo máquina parada (min)",
    "Técnico",
    "Observações",
  ];
  const rows = calls.map((c) => [
    c.machineId,
    c.category === "maintenance" ? "Manutenção" : "Produção",
    getCallSubtypeLabel(c.subtype),
    formatDateTime(c.openedAt),
    formatDateTime(c.attendedAt),
    formatDateTime(c.finishedAt),
    c.callWaitingMinutes,
    c.attendanceMinutes,
    c.totalCallMinutes,
    c.machineStoppedMinutes,
    c.technicianName ?? "",
    c.notes ?? "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map(escapeCsv).join(";"))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `andon-historico-${Date.now()}.csv`);
}

export function exportBackupToJson(data: AppBackup): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `andon-backup-${Date.now()}.json`);
}

export function importBackupFromJson(file: File): Promise<AppBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppBackup;
        if (!parsed.machines || !parsed.calls || !parsed.settings) {
          reject(new Error("Arquivo de backup inválido"));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
