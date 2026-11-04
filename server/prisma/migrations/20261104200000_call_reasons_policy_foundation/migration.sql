-- REFINE 6, step 1: additive, inert catalog. No seeds or historical backfill.
-- A technical area is shared by different reasons, e.g. maintenance/mechanics
-- and setup/mechanics. Neither reasons nor options can be opened via API yet.
CREATE TABLE "call_reasons" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#64748B',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "nature" TEXT NOT NULL DEFAULT 'unclassified',
  "suggestedResponsibility" TEXT NOT NULL DEFAULT 'unassigned',
  "maintenanceKpiPolicy" TEXT NOT NULL DEFAULT 'pending',
  "analyticsDisposition" TEXT NOT NULL DEFAULT 'include',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "call_reasons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_reasons_nature_check" CHECK ("nature" IN ('corrective_failure', 'planned_setup', 'production_support', 'unclassified')),
  CONSTRAINT "call_reasons_responsibility_check" CHECK ("suggestedResponsibility" IN ('maintenance','operations','process','quality','leadership','other','unassigned')),
  CONSTRAINT "call_reasons_kpi_policy_check" CHECK ("maintenanceKpiPolicy" IN ('eligible','excluded','pending')),
  CONSTRAINT "call_reasons_disposition_check" CHECK ("analyticsDisposition" IN ('include','test','false_call','duplicate')),
  CONSTRAINT "call_reasons_no_false_corrective_check" CHECK ("nature" = 'corrective_failure' OR "maintenanceKpiPolicy" <> 'eligible'),
  CONSTRAINT "call_reasons_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "call_reasons_order_check" CHECK ("displayOrder" >= 0),
  CONSTRAINT "call_reasons_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "call_reasons_name_check" CHECK (length(trim("displayName")) BETWEEN 1 AND 80)
);
CREATE INDEX "call_reasons_active_displayOrder_idx" ON "call_reasons"("active", "displayOrder");

CREATE TABLE "call_reason_options" (
  "id" TEXT NOT NULL,
  "reasonId" TEXT NOT NULL,
  "technicalAreaId" TEXT NOT NULL,
  "displayName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "natureOverride" TEXT,
  "suggestedResponsibilityOverride" TEXT,
  "maintenanceKpiPolicyOverride" TEXT,
  "analyticsDispositionOverride" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "call_reason_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "call_reason_options_nature_check" CHECK ("natureOverride" IS NULL OR "natureOverride" IN ('corrective_failure', 'planned_setup', 'production_support', 'unclassified')),
  CONSTRAINT "call_reason_options_responsibility_check" CHECK ("suggestedResponsibilityOverride" IS NULL OR "suggestedResponsibilityOverride" IN ('maintenance','operations','process','quality','leadership','other','unassigned')),
  CONSTRAINT "call_reason_options_kpi_policy_check" CHECK ("maintenanceKpiPolicyOverride" IS NULL OR "maintenanceKpiPolicyOverride" IN ('eligible','excluded','pending')),
  CONSTRAINT "call_reason_options_disposition_check" CHECK ("analyticsDispositionOverride" IS NULL OR "analyticsDispositionOverride" IN ('include','test','false_call','duplicate')),
  CONSTRAINT "call_reason_options_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "call_reason_options_order_check" CHECK ("displayOrder" >= 0),
  CONSTRAINT "call_reason_options_name_check" CHECK ("displayName" IS NULL OR length(trim("displayName")) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX "call_reason_options_reasonId_technicalAreaId_key"
  ON "call_reason_options"("reasonId", "technicalAreaId");
CREATE INDEX "call_reason_options_reasonId_active_displayOrder_idx"
  ON "call_reason_options"("reasonId", "active", "displayOrder");
CREATE INDEX "call_reason_options_technicalAreaId_idx"
  ON "call_reason_options"("technicalAreaId");
ALTER TABLE "call_reason_options"
  ADD CONSTRAINT "call_reason_options_reasonId_fkey"
  FOREIGN KEY ("reasonId") REFERENCES "call_reasons"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "call_reason_options"
  ADD CONSTRAINT "call_reason_options_technicalAreaId_fkey"
  FOREIGN KEY ("technicalAreaId") REFERENCES "andon_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
