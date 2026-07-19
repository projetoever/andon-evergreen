-- ANDON Web Industrial 1.0.0-pilot.2
-- Confirmação da localização técnica sem alterar a localização informada na abertura.

ALTER TABLE "andon_calls"
ADD COLUMN "confirmedMachineSetId" TEXT,
ADD COLUMN "confirmedMachineSetCodeSnapshot" TEXT,
ADD COLUMN "confirmedMachineSetNameSnapshot" TEXT,
ADD COLUMN "confirmedMachineSetTypeSnapshot" TEXT,
ADD COLUMN "confirmedMachineSubsetId" TEXT,
ADD COLUMN "confirmedMachineSubsetCodeSnapshot" TEXT,
ADD COLUMN "confirmedMachineSubsetNameSnapshot" TEXT,
ADD COLUMN "confirmedMachineSubsetTypeSnapshot" TEXT,
ADD COLUMN "assetConfirmedAt" TIMESTAMP(3),
ADD COLUMN "assetConfirmedBy" TEXT,
ADD COLUMN "assetLocationChanged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assetChangeReason" TEXT;

CREATE INDEX "andon_calls_confirmedMachineSetId_idx"
ON "andon_calls"("confirmedMachineSetId");

CREATE INDEX "andon_calls_confirmedMachineSubsetId_idx"
ON "andon_calls"("confirmedMachineSubsetId");

CREATE INDEX "andon_calls_assetConfirmedAt_idx"
ON "andon_calls"("assetConfirmedAt");

ALTER TABLE "andon_calls"
ADD CONSTRAINT "andon_calls_confirmedMachineSetId_fkey"
FOREIGN KEY ("confirmedMachineSetId")
REFERENCES "machine_sets"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "andon_calls"
ADD CONSTRAINT "andon_calls_confirmedMachineSubsetId_fkey"
FOREIGN KEY ("confirmedMachineSubsetId")
REFERENCES "machine_subsets"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;