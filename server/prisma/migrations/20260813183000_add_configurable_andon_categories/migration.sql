-- ANDON Web Industrial 1.0.0-pilot.3
-- Cadastro persistente e aditivo dos setores exibidos na abertura de chamados.

CREATE TABLE "andon_categories" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "categoryGroup" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "andon_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "andon_categories_active_idx" ON "andon_categories"("active");
CREATE INDEX "andon_categories_displayOrder_idx" ON "andon_categories"("displayOrder");

INSERT INTO "andon_categories"
  ("id", "displayName", "categoryGroup", "color", "active", "displayOrder", "updatedAt")
VALUES
  ('electrical', 'Elétrica', 'maintenance', '#F5B700', true, 10, CURRENT_TIMESTAMP),
  ('mechanical', 'Mecânica', 'maintenance', '#F59E0B', true, 20, CURRENT_TIMESTAMP),
  ('hot_melt', 'Hot Melt', 'maintenance', '#F97316', true, 30, CURRENT_TIMESTAMP),
  ('quality', 'Qualidade', 'production', '#0EA5E9', true, 40, CURRENT_TIMESTAMP),
  ('leadership', 'Liderança', 'production', '#8B5CF6', true, 50, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
