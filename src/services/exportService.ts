import type { AndonCall } from "@/types/andon";
import type { AppBackup } from "@/types/history";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  getConfirmedAssetLocationLabel,
  getEffectiveAssetLocationLabel,
  getOpeningAssetLocationLabel,
  hasAssetConfirmation,
} from "@/utils/assetLocationUtils";
import {
  getAndonStatusLabel,
  getCallSubtypeLabel,
} from "@/utils/statusUtils";
import { appBackupSchema } from "./backupSchema";
import { ZodError } from "zod";

function escapeCsv(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "";

  const str = String(value);

  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

function getRecordTypeLabel(call: AndonCall): string {
  return call.isSystemTest
    ? "Teste automático"
    : "Chamado operacional";
}

function getCallOriginLabel(call: AndonCall): string {
  if (
    call.isSystemTest ||
    call.origin === "installer_health_check"
  ) {
    return "Teste automático";
  }

  return "Kiosk";
}

export function buildHistoryCsv(
  calls: AndonCall[],
): string {
  const header = [
    "Máquina",
    "Tipo de registro",
    "Origem",
    "Status",
    "Categoria",
    "Subtipo",
    "Localização efetiva",
    "Localização na abertura",
    "Localização confirmada",
    "Situação da confirmação",
    "Confirmado por",
    "Confirmado em",
    "Motivo da correção",
    "Aberto em",
    "Atendido em",
    "Finalizado em",
    "Tempo aguardando (min)",
    "Tempo em atendimento (min)",
    "Tempo total (min)",
    "Tempo máquina em falha (min)",
    "Técnico",
    "Observações",
  ];

  const rows = calls.map((call) => {
    const assetWasConfirmed =
      hasAssetConfirmation(call);

    const confirmationStatus =
      assetWasConfirmed
        ? call.assetLocationChanged
          ? "Corrigida"
          : "Confirmada sem alteração"
        : "Não confirmada";

    return [
      call.machineId,
      getRecordTypeLabel(call),
      getCallOriginLabel(call),
      getAndonStatusLabel(call.status),
      call.category === "maintenance"
        ? "Manutenção"
        : "Produção",
      getCallSubtypeLabel(call.subtype),
      getEffectiveAssetLocationLabel(
        call,
        "Não informado",
      ),
      getOpeningAssetLocationLabel(
        call,
        "Não informado",
      ),
      getConfirmedAssetLocationLabel(
        call,
        "Não confirmada",
      ),
      confirmationStatus,
      call.assetConfirmedBy ?? "",
      assetWasConfirmed
        ? formatDateTime(
            call.assetConfirmedAt,
          )
        : "",
      call.assetLocationChanged
        ? call.assetChangeReason ?? ""
        : "",
      formatDateTime(call.openedAt),
      formatDateTime(call.attendedAt),
      formatDateTime(call.finishedAt),
      call.callWaitingMinutes,
      call.attendanceMinutes,
      call.totalCallMinutes,
      call.machineStoppedMinutes,
      call.technicianName ?? "",
      call.notes ?? "",
    ];
  });

  return [header, ...rows]
    .map((row) =>
      row.map(escapeCsv).join(";"),
    )
    .join("\r\n");
}

export function exportHistoryToCsv(
  calls: AndonCall[],
): void {
  const csv = buildHistoryCsv(calls);

  const blob = new Blob(
    ["\uFEFF" + csv],
    {
      type: "text/csv;charset=utf-8",
    },
  );

  downloadBlob(
    blob,
    `andon-historico-${Date.now()}.csv`,
  );
}

export function exportBackupToJson(
  data: AppBackup,
): void {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    {
      type: "application/json",
    },
  );

  downloadBlob(
    blob,
    `andon-backup-${Date.now()}.json`,
  );
}

export function importBackupFromJson(
  file: File,
): Promise<AppBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const raw = JSON.parse(
          String(reader.result),
        );

        const parsed =
          appBackupSchema.parse(raw);

        resolve(parsed satisfies AppBackup);
      } catch (error) {
        if (error instanceof ZodError) {
          const first = error.errors[0];
          const path =
            first?.path.join(".") || "(raiz)";

          reject(
            new Error(
              `Arquivo de backup inválido: ${path} — ${
                first?.message ??
                "estrutura inesperada"
              }`,
            ),
          );

          return;
        }

        if (error instanceof SyntaxError) {
          reject(
            new Error(
              "Arquivo de backup inválido: JSON malformado",
            ),
          );

          return;
        }

        reject(error);
      }
    };

    reader.onerror = () =>
      reject(reader.error);

    reader.readAsText(file);
  });
}