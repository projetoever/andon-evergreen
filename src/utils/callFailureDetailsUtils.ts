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
