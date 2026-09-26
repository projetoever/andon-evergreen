-- Add the business employee identifier without changing legacy technician rows.
-- employeeId remains nullable so existing maintainers continue to load with NULL.
ALTER TABLE "technicians" ADD COLUMN "employeeId" TEXT;

CREATE UNIQUE INDEX "technicians_employeeId_key" ON "technicians"("employeeId");
