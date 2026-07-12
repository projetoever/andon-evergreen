-- Backfill da referência oficial dos tipos de conjuntos.
-- Preserva o campo legado type e todos os chamados e snapshots.

UPDATE "machine_sets" AS ms
SET
  "typeId" = mst."id",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "machine_set_types" AS mst
WHERE ms."typeId" IS NULL
  AND ms."type" IS NOT NULL
  AND BTRIM(ms."type") <> ''
  AND mst."code" = LOWER(BTRIM(ms."type"));
