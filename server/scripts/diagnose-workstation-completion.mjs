#!/usr/bin/env node
/**
 * Read-only attendance workstation diagnosis.
 * Run locally from server/ with DATABASE_URL configured; never paste passwords
 * or full workstation IDs into external tickets.
 *
 * Example: node --env-file=.env scripts/diagnose-workstation-completion.mjs CALL_ID
 */
import { PrismaClient } from "@prisma/client";

const callId = process.argv[2]?.trim();
if (!callId || !/^[a-zA-Z0-9_-]{4,120}$/.test(callId)) {
  process.stderr.write("Uso: node --env-file=.env scripts/diagnose-workstation-completion.mjs <callId>\n");
  process.exitCode = 2;
} else {
  const prisma = new PrismaClient();
  try {
    const [call, settings] = await Promise.all([
      prisma.andonCall.findUnique({
        where: { id: callId },
        select: {
          id: true,
          machineId: true,
          status: true,
          category: true,
          maintenanceReturnCount: true,
          technicianSessions: {
            select: {
              phase: true,
              cycleIndex: true,
              workstationId: true,
              endedAt: true,
              workstation: { select: { name: true, active: true, lastIpAddress: true } },
            },
          },
        },
      }),
      prisma.systemSettings.findUnique({
        where: { id: "global" },
        select: { restrictMaintenanceCompletionToAttendanceWorkstation: true },
      }),
    ]);
    if (!call) {
      process.stderr.write("Chamado não encontrado.\n");
      process.exitCode = 1;
    } else {
      const maintenance = call.technicianSessions.filter((row) => row.phase !== "follow_up");
      const cycle = Math.max(1, ...maintenance.map((row) => row.cycleIndex ?? 1));
      const currentCycle = maintenance.filter((row) => (row.cycleIndex ?? 1) === cycle);
      const active = currentCycle.filter((row) => row.endedAt === null);
      const relevant = active.length ? active : currentCycle;
      const authorizedIds = new Set(relevant.map((row) => row.workstationId).filter(Boolean));
      const short = (id) => id ? `...${id.slice(-8)}` : "(sem ID)";
      // Aggregate only: no technician names, secrets, complete UUIDs or raw queries.
      process.stdout.write(JSON.stringify({
        machineId: call.machineId,
        callIdSuffix: short(call.id),
        status: call.status,
        maintenanceRestrictionEnabled: settings?.restrictMaintenanceCompletionToAttendanceWorkstation ?? false,
        latestMaintenanceCycle: cycle,
        activeMaintenanceSessions: active.length,
        authorizedStationSuffixes: [...authorizedIds].map(short),
        historicalNoStationCount: currentCycle.filter((row) => !row.workstationId).length,
        sessions: currentCycle.map((row) => ({
          stationSuffix: short(row.workstationId),
          stationName: row.workstation?.name ?? null,
          workstationActive: row.workstation?.active ?? null,
          lastIp: row.workstation?.lastIpAddress ?? null,
          participationEnded: Boolean(row.endedAt),
        })),
        finding: authorizedIds.size
          ? "Compare os sufixos com o UUID da workstation no painel Admin. Se divergentes, NÃO altere a sessão histórica; use recuperação supervisionada."
          : "Ciclo sem proveniência persistente: regra legada permite a conclusão; confirme pelo endpoint oficial."
      }, null, 2) + "\n");
    }
  } catch (error) {
    process.stderr.write("Falha ao consultar. Confira conexão e credenciais locais sem divulgar segredos.\n");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
