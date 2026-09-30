import type { AndonCall } from "@/types/andon";
import type { MachineStopEvent } from "@/types/machine";
import {
  findApplicableFailureEvent,
  isSpecificFailureClassification,
} from "@/utils/failureEventUtils";

export function getCallFailureDetails(call: AndonCall, linkedEvents: MachineStopEvent[]) {
  const event = findApplicableFailureEvent(linkedEvents, call.id);
  const classification = call.failureClassification?.trim() || event?.failureClassification;
  return {
    classification: isSpecificFailureClassification(classification) ? classification : null,
    description: call.failureDescription?.trim() || event?.failureDescription?.trim() || null,
  };
}

function trimBlankEdges(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;

  return lines.slice(start, end);
}

export function getCallSupplementalNotes(
  notes?: string | null,
  failureDescription?: string | null,
) {
  const normalizedNotes = notes?.replace(/\r\n?/g, "\n").trim();
  if (!normalizedNotes) return null;

  const normalizedFailureDescription = failureDescription?.replace(/\r\n?/g, "\n").trim();
  if (!normalizedFailureDescription) return normalizedNotes;

  const noteLines = normalizedNotes.split("\n");
  const failureLines = normalizedFailureDescription.split("\n");
  const duplicateStart = noteLines.findIndex((_, start) =>
    failureLines.every(
      (failureLine, offset) => noteLines[start + offset]?.trim() === failureLine.trim(),
    ),
  );

  if (duplicateStart === -1) return normalizedNotes;

  const supplementalLines = trimBlankEdges([
    ...noteLines.slice(0, duplicateStart),
    ...noteLines.slice(duplicateStart + failureLines.length),
  ]);

  return supplementalLines.join("\n").trim() || null;
}
