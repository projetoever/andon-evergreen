/**
 * Central admission never inherits the legacy requireWorkstationApproval flag.
 * An unconfigured deployment requires Admin approval. The isolated notebook
 * launcher alone opts into an open default for NEW workstation registrations.
 * Existing pending/rejected workstations are not reopened by a policy change.
 */
export function isolatedNotebookHmlAutoAdmissionEnabled(): boolean {
  if (process.env.ANDON_HML_OPEN_NEW_WORKSTATIONS_DEFAULT !== "1" ||
      process.env.ANDON_HOMOLOGATION_HOST !== "127.0.0.1" ||
      process.env.ANDON_HOMOLOGATION_FRONTEND_PORT !== "8080" ||
      process.env.ANDON_ACCESS_ORIGIN !== "https://localhost:8080") return false;
  try {
    const db = new URL(process.env.DATABASE_URL ?? "");
    return db.protocol === "postgresql:" &&
      db.hostname === "127.0.0.1" &&
      db.port === "55432" &&
      db.pathname === "/andon_https_hml";
  } catch {
    return false;
  }
}

export function centralWorkstationApprovalRequired(stored: boolean | null | undefined): boolean {
  if (typeof stored === "boolean") return stored;
  return !isolatedNotebookHmlAutoAdmissionEnabled();
}
