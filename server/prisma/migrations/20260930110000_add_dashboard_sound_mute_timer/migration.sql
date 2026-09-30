ALTER TABLE "system_settings"
ADD COLUMN "dashboardSoundMuteTimerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dashboardSoundMuteDurationMinutes" INTEGER NOT NULL DEFAULT 3;
