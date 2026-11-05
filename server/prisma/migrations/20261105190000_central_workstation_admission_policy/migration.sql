-- Central admission is independent of the legacy module/workstation policy.
-- NULL defaults to APPROVAL REQUIRED in ordinary deployments; the isolated
-- notebook HML launcher can opt into a separate open-enrollment default.
-- Existing workstation approvals/rejections and active sessions are untouched.
ALTER TABLE "system_settings"
  ADD COLUMN "centralRequireWorkstationApproval" BOOLEAN;
