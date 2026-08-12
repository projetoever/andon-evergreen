import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import {
  ATTENDANCE_MODES,
  getSystemSettings,
  GLOBAL_SYSTEM_SETTINGS_ID,
  type AttendanceMode,
} from "../services/systemSettings.js";
import { badRequest } from "./routeUtils.js";

type UpdateSystemSettingsBody = {
  allowWholeSetCalls?: unknown;
  attendanceMode?: unknown;
  rfidReaderMode?: unknown;
  rfidInputTerminator?: unknown;
  rfidCodeLength?: unknown;
};

const RFID_READER_MODES = new Set(["keyboard_hid"]);
const RFID_TERMINATORS = new Set(["enter", "tab", "fixed_length"]);

export function registerSystemSettingsRoutes(app: FastifyInstance) {
  app.get("/api/system-settings", async () => getSystemSettings());

  app.patch<{ Body: UpdateSystemSettingsBody }>("/api/system-settings", async (request, reply) => {
    const body = request.body ?? {};
    const allowWholeSetCalls = body.allowWholeSetCalls;
    const attendanceMode = body.attendanceMode;
    const rfidReaderMode = body.rfidReaderMode;
    const rfidInputTerminator = body.rfidInputTerminator;
    const rfidCodeLength = body.rfidCodeLength;

    if (!Object.keys(body).length) return badRequest(reply, "Informe ao menos uma configuração");
    if ("allowWholeSetCalls" in body && typeof allowWholeSetCalls !== "boolean") {
      return badRequest(reply, "Campo allowWholeSetCalls deve ser booleano");
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
      (!Number.isInteger(rfidCodeLength) || Number(rfidCodeLength) < 4 || Number(rfidCodeLength) > 64)
    ) {
      return badRequest(reply, "Tamanho do código RFID deve ficar entre 4 e 64");
    }

    const patch = {
      ...(typeof allowWholeSetCalls === "boolean" ? { allowWholeSetCalls } : {}),
      ...(typeof attendanceMode === "string" ? { attendanceMode } : {}),
      ...(typeof rfidReaderMode === "string" ? { rfidReaderMode } : {}),
      ...(typeof rfidInputTerminator === "string" ? { rfidInputTerminator } : {}),
      ...("rfidCodeLength" in body ? { rfidCodeLength: rfidCodeLength as number | null } : {}),
    };

    return prisma.systemSettings.upsert({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      update: patch,
      create: {
        id: GLOBAL_SYSTEM_SETTINGS_ID,
        ...patch,
      },
    });
  });
}
