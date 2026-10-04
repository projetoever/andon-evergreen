CREATE TABLE "machine_priority_history" (
  "id" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "previousOrder" INTEGER,
  "newOrder" INTEGER,
  "previousPriorityRank" INTEGER,
  "newPriorityRank" INTEGER,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedBy" TEXT,
  "source" TEXT NOT NULL DEFAULT 'priority_manager',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machine_priority_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "machine_priority_history_machineId_idx"
  ON "machine_priority_history"("machineId");

CREATE INDEX "machine_priority_history_changedAt_idx"
  ON "machine_priority_history"("changedAt");

CREATE INDEX "machine_priority_history_machineId_changedAt_idx"
  ON "machine_priority_history"("machineId", "changedAt");

CREATE INDEX "machine_priority_history_newPriorityRank_idx"
  ON "machine_priority_history"("newPriorityRank");

ALTER TABLE "machine_priority_history"
  ADD CONSTRAINT "machine_priority_history_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "machines"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

WITH ordered_active AS (
  SELECT
    m."id",
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(
          m."priorityOrder"::BIGINT,
          m."displayOrder"::BIGINT,
          CASE
            WHEN m."id" ~ '^[0-9]+$' THEN m."id"::BIGINT
            ELSE 9223372036854775807
          END
        ),
        m."id"
    ) AS active_rank
  FROM "machines" m
  WHERE m."isActive" = TRUE
),
ordered_all AS (
  SELECT
    m."id",
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(
          m."priorityOrder"::BIGINT,
          m."displayOrder"::BIGINT,
          CASE
            WHEN m."id" ~ '^[0-9]+$' THEN m."id"::BIGINT
            ELSE 9223372036854775807
          END
        ),
        m."id"
    ) AS visual_order
  FROM "machines" m
)
INSERT INTO "machine_priority_history" (
  "id",
  "machineId",
  "previousOrder",
  "newOrder",
  "previousPriorityRank",
  "newPriorityRank",
  "changedAt",
  "changedBy",
  "source",
  "reason",
  "createdAt"
)
SELECT
  'priority-baseline-' || m."id",
  m."id",
  NULL,
  oa2.visual_order::INTEGER,
  NULL,
  CASE
    WHEN oa.active_rank BETWEEN 1 AND 5 THEN oa.active_rank::INTEGER
    ELSE NULL
  END,
  CURRENT_TIMESTAMP,
  NULL,
  'history_baseline',
  'Initial priority history baseline',
  CURRENT_TIMESTAMP
FROM "machines" m
JOIN ordered_all oa2 ON oa2."id" = m."id"
LEFT JOIN ordered_active oa ON oa."id" = m."id";
