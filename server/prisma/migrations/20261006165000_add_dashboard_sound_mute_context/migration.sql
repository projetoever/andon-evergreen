ALTER TABLE "system_settings"
ADD COLUMN "dashboardSoundMutedAt" TIMESTAMP(3),
ADD COLUMN "dashboardSoundMutedUntil" TIMESTAMP(3),
ADD COLUMN "dashboardSoundMuteReason" TEXT;
