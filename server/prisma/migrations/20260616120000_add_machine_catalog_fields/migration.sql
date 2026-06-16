ALTER TABLE "machines" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "machines" ADD COLUMN "displayOrder" INTEGER;
ALTER TABLE "machines" ALTER COLUMN "productionMode" SET DEFAULT 'scheduled';
