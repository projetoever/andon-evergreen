-- Metadados para identificar chamadas automáticas do instalador.
-- Migration exclusivamente aditiva. Registros existentes permanecem como chamadas normais.

ALTER TABLE "andon_calls"
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'kiosk',
ADD COLUMN "isSystemTest" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "andon_calls_isSystemTest_idx"
ON "andon_calls"("isSystemTest");