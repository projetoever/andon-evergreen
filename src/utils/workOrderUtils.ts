export function normalizeWorkOrderNumber(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function canOpenWithWorkOrder(required: boolean, value: string) {
  return !required || Boolean(normalizeWorkOrderNumber(value));
}
