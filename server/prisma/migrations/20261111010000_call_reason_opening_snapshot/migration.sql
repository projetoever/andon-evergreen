-- S3-B1 additive only. Existing calls have no snapshot row, intentionally.
-- A future gated S3-B2 write inserts the snapshot atomically with the call.
CREATE TABLE "andon_call_reason_snapshots" (
    "callId" TEXT NOT NULL,
    "reasonId" TEXT NOT NULL,
    "reasonNameSnapshot" TEXT NOT NULL,
    "reasonRevision" INTEGER NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionNameSnapshot" TEXT NOT NULL,
    "optionRevision" INTEGER NOT NULL,
    "technicalAreaId" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "suggestedResponsibility" TEXT NOT NULL,
    "maintenanceKpiPolicy" TEXT NOT NULL,
    "analyticsDisposition" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "andon_call_reason_snapshots_pkey" PRIMARY KEY ("callId")
);
CREATE INDEX "andon_call_reason_snapshots_reasonId_idx"
    ON "andon_call_reason_snapshots"("reasonId");
CREATE INDEX "andon_call_reason_snapshots_optionId_idx"
    ON "andon_call_reason_snapshots"("optionId");
ALTER TABLE "andon_call_reason_snapshots"
    ADD CONSTRAINT "andon_call_reason_snapshots_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "andon_calls"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
