import type { AndonCall } from "@/types/andon";
import { extractFailureDescriptionForFinish } from "./failureDescriptionUtils";
import { isSpecificFailureClassification } from "./failureEventUtils";

/** A physical stop can be handed to another call; its diagnosis is not that call's draft. */
export function getFinishCallDefaults(
  call: Pick<AndonCall, "failureClassification" | "failureDescription" | "notes">,
) {
  return {
    classification: isSpecificFailureClassification(call.failureClassification)
      ? (call.failureClassification ?? "")
      : "",
    description:
      extractFailureDescriptionForFinish(call.failureDescription) ||
      extractFailureDescriptionForFinish(call.notes),
  };
}
