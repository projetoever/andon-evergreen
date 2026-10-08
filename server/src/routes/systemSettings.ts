import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import {
  ATTENDANCE_MODES,
  getSystemSettings,
  GLOBAL_SYSTEM_SETTINGS_ID,
  type AttendanceMode,
} from "../services/systemSettings.js";
import { validateDashboardSoundMuteSettingsPatch } from "../services/dashboardSoundMuteSettings.js";
import {
  resolveDashboardSoundState,
  setDashboardSoundState,
  type DashboardSoundMuteReason,
} from "../services/dashboardSoundState.js";
import { badRequest } from "./routeUtils.js";

type UpdateSystemSettingsBody = {
  allowWholeSetCalls?: unknown;
  virtualKeyboardEnabled?: unknown;
  requireWorkOrderAtOpen?: unknown;
  restrictMaintenanceCompletionToAttendanceWorkstation?: unknown;
  dashboardSoundMuteTimerEnabled?: unknown;
  dashboardSoundMuteDurationMinutes?: unknown;
  dashboardSoundAutoMuteTimerEnabled?: unknown;
  dashboardSoundActiveDurationMinutes?: unknown;
  dashboardSoundMuted?: unknown;
  dashboardMachineOrderMode?: unknown;
  attendanceMode?: unknown;
  rfidReaderMode?: unknown;
  rfidInputTerminator?: unknown;
  rfidCodeLength?: unknown;
  filterTechniciansByCurrentShift?: unknown;
};

const RFID_READER_MODES = new Set(["keyboard_hid"]);
const RFID_TERMINATORS = new Set(["enter", "tab", "fixed_length"]);

export function registerSystemSettingsRoutes(app: FastifyInstance) {
  app.get("/api/system-settings", async () => getSystemSettings());

  app.get("/api/dashboard-sound-state", async () => resolveDashboardSoundState());

  app.patch<{ Body: { muted?: unknown; reason?: unknown } }>(
    "/api/dashboard-sound-state",
    async (request, reply) => {
      const muted = request.body?.muted;
      const reason = request.body?.reason;

      if (typeof muted !== "boolean") {
        return badRequest(reply, "Campo muted deve ser booleano");
      }
      if (
        reason !== undefined &&
        reason !== "manual" &&
        reason !== "auto"
      ) {
        return badRequest(reply, "Motivo do mute deve ser manual ou auto");
      }

      return setDashboardSoundState(
        muted,
        (reason === "auto" ? "auto" : "manual") as DashboardSoundMuteReason,
      );
    },
  );

  app.patch<{ Body: UpdateSystemSettingsBody }>("/api/system-settings", async (request, reply) => {
    const body = request.body ?? {};
    const allowWholeSetCalls = body.allowWholeSetCalls;
    const virtualKeyboardEnabled = body.virtualKeyboardEnabled;
    const requireWorkOrderAtOpen = body.requireWorkOrderAtOpen;
    const restrictMaintenanceCompletionToAttendanceWorkstation =
      body.restrictMaintenanceCompletionToAttendanceWorkstation;
    const dashboardSoundMuteTimerEnabled = body.dashboardSoundMuteTimerEnabled;
    const dashboardSoundMuteDurationMinutes = body.dashboardSoundMuteDurationMinutes;
    const dashboardSoundAutoMuteTimerEnabled = body.dashboardSoundAutoMuteTimerEnabled;
    const dashboardSoundActiveDurationMinutes = body.dashboardSoundActiveDurationMinutes;
    const dashboardSoundMuted = body.dashboardSoundMuted;
    const dashboardMachineOrderMode = body.dashboardMachineOrderMode;
    const attendanceMode = body.attendanceMode;
    const rfidReaderMode = body.rfidReaderMode;
    const rfidInputTerminator = body.rfidInputTerminator;
    const rfidCodeLength = body.rfidCodeLength;
    const filterTechniciansByCurrentShift = body.filterTechniciansByCurrentShift;

    if (!Object.keys(body).length) return badRequest(reply, "Informe ao menos uma configuração");
    if ("allowWholeSetCalls" in body && typeof allowWholeSetCalls !== "boolean") {
      return badRequest(reply, "Campo allowWholeSetCalls deve ser booleano");
    }
    if ("virtualKeyboardEnabled" in body && typeof virtualKeyboardEnabled !== "boolean") {
      return badRequest(reply, "Campo virtualKeyboardEnabled deve ser booleano");
    }
    if ("requireWorkOrderAtOpen" in body && typeof requireWorkOrderAtOpen !== "boolean") {
      return badRequest(reply, "Campo requireWorkOrderAtOpen deve ser booleano");
    }
    if (
      "restrictMaintenanceCompletionToAttendanceWorkstation" in body &&
      typeof restrictMaintenanceCompletionToAttendanceWorkstation !== "boolean"
    ) {
      return badRequest(
        reply,
        "Campo restrictMaintenanceCompletionToAttendanceWorkstation deve ser booleano",
      );
    }
    const dashboardSoundMuteValidationError = validateDashboardSoundMuteSettingsPatch(body);
    if (dashboardSoundMuteValidationError) {
      return badRequest(reply, dashboardSoundMuteValidationError);
    }
    if (
      "dashboardMachineOrderMode" in body &&
      dashboardMachineOrderMode !== "default" &&
      dashboardMachineOrderMode !== "priority"
    ) {
      return badRequest(reply, "Modo de organização do Dashboard inválido");
    }
    if (
      "attendanceMode" in body &&
      (typeof attendanceMode !== "string" ||
        !ATTENDANCE_MODES.includes(attendanceMode as AttendanceMode))
    ) {
      return badRequest(reply, "Modo de atendimento inválido");
    }
    if (
      "rfidReaderMode" in body &&
      (typeof rfidReaderMode !== "string" || !RFID_READER_MODES.has(rfidReaderMode))
    ) {
      return badRequest(reply, "Modo do leitor RFID inválido");
    }
    if (
      "rfidInputTerminator" in body &&
      (typeof rfidInputTerminator !== "string" || !RFID_TERMINATORS.has(rfidInputTerminator))
    ) {
      return badRequest(reply, "Finalizador de leitura RFID inválido");
    }
    if (
      "rfidCodeLength" in body &&
      rfidCodeLength !== null &&
      (!Number.isInteger(rfidCodeLength) ||
        Number(rfidCodeLength) < 4 ||
        Number(rfidCodeLength) > 64)
    ) {
      return badRequest(reply, "Tamanho do código RFID deve ficar entre 4 e 64");
    }
    if (
      "filterTechniciansByCurrentShift" in body &&
      typeof filterTechniciansByCurrentShift !== "boolean"
    ) {
      return badRequest(reply, "Campo filterTechniciansByCurrentShift deve ser booleano");
    }

    const patch = {
      ...(typeof allowWholeSetCalls === "boolean" ? { allowWholeSetCalls } : {}),
      ...(typeof virtualKeyboardEnabled === "boolean" ? { virtualKeyboardEnabled } : {}),
      ...(typeof requireWorkOrderAtOpen === "boolean" ? { requireWorkOrderAtOpen } : {}),
      ...(typeof restrictMaintenanceCompletionToAttendanceWorkstation === "boolean"
        ? { restrictMaintenanceCompletionToAttendanceWorkstation }
        : {}),
      ...(typeof dashboardSoundMuteTimerEnabled === "boolean"
        ? { dashboardSoundMuteTimerEnabled }
        : {}),
      ...(typeof dashboardSoundMuteDurationMinutes === "number"
        ? { dashboardSoundMuteDurationMinutes }
        : {}),
      ...(typeof dashboardSoundAutoMuteTimerEnabled === "boolean"
        ? { dashboardSoundAutoMuteTimerEnabled }
        : {}),
      ...(typeof dashboardSoundActiveDurationMinutes === "number"
        ? { dashboardSoundActiveDurationMinutes }
        : {}),
      ...(dashboardMachineOrderMode === "default" || dashboardMachineOrderMode === "priority"
        ? { dashboardMachineOrderMode }
        : {}),
      ...(typeof attendanceMode === "string" ? { attendanceMode } : {}),
      ...(typeof rfidReaderMode === "string" ? { rfidReaderMode } : {}),
      ...(typeof rfidInputTerminator === "string" ? { rfidInputTerminator } : {}),
      ...("rfidCodeLength" in body ? { rfidCodeLength: rfidCodeLength as number | null } : {}),
      ...(typeof filterTechniciansByCurrentShift === "boolean"
        ? { filterTechniciansByCurrentShift }
        : {}),
    };

    await prisma.systemSettings.upsert({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      update: patch,
      create: {
        id: GLOBAL_SYSTEM_SETTINGS_ID,
        ...patch,
      },
    });

    if (typeof dashboardSoundMuted === "boolean") {
      await setDashboardSoundState(dashboardSoundMuted, "manual");
    }

    return getSystemSettings();
  });
}
