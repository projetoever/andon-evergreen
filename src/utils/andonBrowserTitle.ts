/** Customer-neutral product title. The Hub client name is data, not markup. */
export function formatAndonBrowserTitle(clientName: unknown): string {
  if (typeof clientName !== "string") return "ANDON";
  // Avoid control/bidi spoofing in browser chrome; preserve accented and CJK names.
  const normalized = clientName
    .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim();
  return normalized.length >= 2 && normalized.length <= 100
    ? `ANDON ${normalized}`
    : "ANDON";
}
