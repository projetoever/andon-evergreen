ALTER TABLE "system_settings"
ADD COLUMN "adminPasswordHash" TEXT,
ADD COLUMN "adminRecoveryCodeHash" TEXT,
ADD COLUMN "adminRecoveryCodeIssuedAt" TIMESTAMP(3);
