import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { TechnicianConfig } from "@/types/settings";

export interface TechnicianActiveAssignment {
  technicianId?: string;
  technicianName: string;
  callId: string;
  machineId: string;
  machineLabel: string;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function assignmentKey(technicianId: string | undefined, technicianName: string) {
  return technicianId ? `id:${technicianId}` : `name:${normalizeName(technicianName)}`;
}

export function buildTechnicianActiveAssignmentMap(
  calls: AndonCall[],
  machines: Machine[],
  currentCallId?: string | null,
) {
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));
  const result = new Map<string, TechnicianActiveAssignment>();

  for (const call of calls) {
    if (call.id === currentCallId) continue;

    for (const session of call.technicianSessions ?? []) {
      if (session.endedAt) continue;

      const machine = machineById.get(call.machineId);
      const machineLabel = machine
        ? machine.name && machine.name !== machine.id
          ? `Máquina ${machine.id} · ${machine.name}`
          : `Máquina ${machine.id}`
        : `Máquina ${call.machineId}`;

      const assignment: TechnicianActiveAssignment = {
        technicianId: session.technicianId,
        technicianName: session.technicianName,
        callId: call.id,
        machineId: call.machineId,
        machineLabel,
      };

      result.set(assignmentKey(session.technicianId, session.technicianName), assignment);
      result.set(`name:${normalizeName(session.technicianName)}`, assignment);
    }
  }

  return result;
}

export function getTechnicianActiveAssignment(
  technician: Pick<TechnicianConfig, "id" | "name">,
  assignments: ReadonlyMap<string, TechnicianActiveAssignment>,
) {
  return (
    assignments.get(assignmentKey(technician.id || undefined, technician.name)) ??
    assignments.get(`name:${normalizeName(technician.name)}`) ??
    null
  );
}
