export function normalizeWorkOrderNumber(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function canOpenWithWorkOrder(required: boolean, value: string) {
  return !required || Boolean(normalizeWorkOrderNumber(value));
}

export function canSubmitWorkOrderGate({
  required,
  value,
  isLoading,
  loadFailed,
}: {
  required: boolean;
  value: string;
  isLoading: boolean;
  loadFailed: boolean;
}) {
  return !isLoading && !loadFailed && canOpenWithWorkOrder(required, value);
}
