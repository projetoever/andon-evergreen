ALTER TABLE "system_settings"
ADD COLUMN "dashboardSoundAutoMuteTimerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dashboardSoundActiveDurationMinutes" INTEGER NOT NULL DEFAULT 3;
