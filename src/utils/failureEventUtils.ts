import type { MachineStopEvent } from "@/types/machine";

export const GENERIC_FAILURE_CLASSIFICATIONS = new Set([
  "unclassified",
  "unidentified_stop",
  "real_machine_failure",
]);

export function isSpecificFailureClassification(value?: string | null) {
  return Boolean(value && !GENERIC_FAILURE_CLASSIFICATIONS.has(value));
}

function compareNewestFirst(current: MachineStopEvent, next: MachineStopEvent) {
  return new Date(next.stoppedAt).getTime() - new Date(current.stoppedAt).getTime();
}

export function findApplicableFailureEvent(events: MachineStopEvent[], callId: string) {
  const linkedEvents = events.filter((event) => event.callId === callId).sort(compareNewestFirst);

  return linkedEvents.find((event) => !event.resumedAt) ?? linkedEvents[0] ?? null;
}
