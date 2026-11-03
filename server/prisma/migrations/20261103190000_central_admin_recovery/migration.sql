-- Central recovery is independent from the legacy SystemSettings Admin recovery.
-- Additive and nullable for existing admins; no plaintext code and no backfill.
ALTER TABLE "access_users" ADD COLUMN "adminRecoveryCodeHash" TEXT;
ALTER TABLE "access_users" ADD COLUMN "adminRecoveryCodeIssuedAt" TIMESTAMP(3);
