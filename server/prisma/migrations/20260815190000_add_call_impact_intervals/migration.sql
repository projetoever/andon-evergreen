-- Keep physical machine failure periods independent from the calls that are
-- responsible for productive impact during each portion of that period.
ALTER TABLE "andon_calls"
ADD COLUMN "impactTrackingVersion" INTEGER;

CREATE TABLE "call_impact_intervals" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "source" TEXT NOT NULL,
    "assignedByCallId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_impact_intervals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "call_impact_intervals_callId_idx" ON "call_impact_intervals"("callId");
CREATE INDEX "call_impact_intervals_machineId_idx" ON "call_impact_intervals"("machineId");
CREATE INDEX "call_impact_intervals_callId_endedAt_idx" ON "call_impact_intervals"("callId", "endedAt");
CREATE INDEX "call_impact_intervals_machineId_endedAt_idx" ON "call_impact_intervals"("machineId", "endedAt");
CREATE INDEX "call_impact_intervals_startedAt_idx" ON "call_impact_intervals"("startedAt");

ALTER TABLE "call_impact_intervals"
ADD CONSTRAINT "call_impact_intervals_callId_fkey"
FOREIGN KEY ("callId") REFERENCES "andon_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "call_impact_intervals"
ADD CONSTRAINT "call_impact_intervals_machineId_fkey"
FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing finished history keeps the legacy calculation. Active real calls
-- enter the interval-based model without changing any previous record.
UPDATE "andon_calls"
SET "impactTrackingVersion" = 1
WHERE "status" IN ('open', 'in_progress', 'post_maintenance')
  AND "isSystemTest" = false;

-- Preserve only the current explicit owner of an active physical failure.
-- Other simultaneous calls intentionally do not inherit past stopped time.
INSERT INTO "call_impact_intervals" (
    "id",
    "callId",
    "machineId",
    "startedAt",
    "endedAt",
    "durationSeconds",
    "source",
    "assignedByCallId",
    "notes",
    "createdAt",
    "updatedAt"
)
SELECT
    'impact_' || md5(f."id" || ':' || c."id"),
    c."id",
    c."machineId",
    GREATEST(f."startedAt", c."openedAt"),
    NULL,
    NULL,
    'migration_active_owner',
    NULL,
    'Intervalo inicial preservado na migração da atribuição de impacto',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "failure_events" f
JOIN "andon_calls" c ON c."id" = f."callId"
WHERE f."endedAt" IS NULL
  AND c."status" IN ('open', 'in_progress', 'post_maintenance')
  AND c."isSystemTest" = false;
