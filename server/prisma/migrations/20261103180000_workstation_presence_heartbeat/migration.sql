-- Additive, nullable and independent from the legacy lastSeenAt.
-- No backfill: historical check-ins must never be misreported as online.
ALTER TABLE "workstations" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
