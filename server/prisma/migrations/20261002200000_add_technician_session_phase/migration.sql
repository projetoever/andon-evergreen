ALTER TABLE "technician_sessions"
ADD COLUMN "phase" TEXT,
ADD COLUMN "cycleIndex" INTEGER;

CREATE INDEX "technician_sessions_callId_phase_endedAt_idx"
ON "technician_sessions"("callId", "phase", "endedAt");
