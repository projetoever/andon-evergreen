CREATE TABLE "technician_technical_areas" (
    "technicianId" TEXT NOT NULL,
    "technicalArea" TEXT NOT NULL,

    CONSTRAINT "technician_technical_areas_pkey" PRIMARY KEY ("technicianId", "technicalArea")
);

CREATE INDEX "technician_technical_areas_technicalArea_idx"
ON "technician_technical_areas"("technicalArea");

INSERT INTO "technician_technical_areas" ("technicianId", "technicalArea")
SELECT technician."id", technician."technicalArea"
FROM "technicians" AS technician
INNER JOIN "andon_categories" AS category
    ON category."id" = technician."technicalArea"
WHERE technician."technicalArea" IS NOT NULL
ON CONFLICT ("technicianId", "technicalArea") DO NOTHING;

ALTER TABLE "technician_technical_areas"
ADD CONSTRAINT "technician_technical_areas_technicianId_fkey"
FOREIGN KEY ("technicianId") REFERENCES "technicians"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "technician_technical_areas"
ADD CONSTRAINT "technician_technical_areas_technicalArea_fkey"
FOREIGN KEY ("technicalArea") REFERENCES "andon_categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
