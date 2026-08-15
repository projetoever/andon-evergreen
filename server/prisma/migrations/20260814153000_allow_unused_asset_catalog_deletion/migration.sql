-- Permite remover tipos de subconjunto que só estejam ligados a ativos inativos.
-- O ativo histórico é preservado; apenas o vínculo com o catálogo removido fica nulo.
ALTER TABLE "machine_subsets"
  DROP CONSTRAINT "machine_subsets_typeId_fkey";

ALTER TABLE "machine_subsets"
  ALTER COLUMN "typeId" DROP NOT NULL;

ALTER TABLE "machine_subsets"
  ADD CONSTRAINT "machine_subsets_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "machine_subset_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
