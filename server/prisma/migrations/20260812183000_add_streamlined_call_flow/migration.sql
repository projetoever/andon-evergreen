-- ANDON Web Industrial 1.0.0-pilot.3
-- Modos de identificação e credenciais protegidas para atendimento.
-- Migration exclusivamente aditiva: mantenedores existentes permanecem válidos.

ALTER TABLE "system_settings"
ADD COLUMN "attendanceMode" TEXT NOT NULL DEFAULT 'name',
ADD COLUMN "rfidReaderMode" TEXT NOT NULL DEFAULT 'keyboard_hid',
ADD COLUMN "rfidInputTerminator" TEXT NOT NULL DEFAULT 'enter',
ADD COLUMN "rfidCodeLength" INTEGER;

ALTER TABLE "technicians"
ADD COLUMN "pinHash" TEXT,
ADD COLUMN "tagHash" TEXT;
