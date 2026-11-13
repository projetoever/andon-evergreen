/** Global, minimal busy set for authenticated attendance selectors.
 * This is NOT a machine/call list. Do not include cross-scope call, workstation
 * or machine identifiers in the response. The attendance mutation remains
 * the transactional authority and rechecks active sessions under locks.
 */
export function busyTechnicianIdsFromGlobalSessions(
  technicians: ReadonlyArray<{ id: string; name: string }>,
  sessions: ReadonlyArray<{
    technicianId: string | null;
    technicianName: string;
    callId: string;
  }>,
  currentCallId: string,
): string[] {
  const normalized = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
  const legacyNameToIds = new Map<string, string[]>();
  const validIds = new Set(technicians.map(t => t.id));
  for (const technician of technicians) {
    const name = normalized(technician.name);
    const ids = legacyNameToIds.get(name) ?? [];
    ids.push(technician.id);
    legacyNameToIds.set(name, ids);
  }
  const busy = new Set<string>();
  for (const session of sessions) {
    if (session.callId === currentCallId) continue;
    // An already identified technician is matched by stable ID; older sessions
    // with null ID are conservatively resolved by their stored name.
    if (session.technicianId && validIds.has(session.technicianId)) {
      busy.add(session.technicianId);
    } else if (!session.technicianId) {
      for (const id of legacyNameToIds.get(normalized(session.technicianName)) ?? []) {
        busy.add(id);
      }
    }
  }
  return [...busy].sort();
}
