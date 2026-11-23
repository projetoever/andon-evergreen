-- REFINE23 P0: presentation-only override for the direct sector buttons.
-- Empty array retains the existing global showDirectButton policy for all machines.
-- No changes to category.active, reason groups, calls, BI, history or GPIO.
ALTER TABLE "machines"
  ADD COLUMN "hiddenDirectSectorIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sectorVisibilityRevision" INTEGER NOT NULL DEFAULT 0;
