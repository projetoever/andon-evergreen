-- PENTE 2: additive configuration for 1..active-machine-count priority highlights.
-- Existing installations retain the historical P1-P5 behavior until changed.
ALTER TABLE "dashboard_priority_config"
  ADD COLUMN "priorityHighlightCount" INTEGER NOT NULL DEFAULT 5;

-- Writes enforce 1..active-machine-count and CAS transactionally in the API.
-- When the active catalog shrinks, the dashboard clamps the effective count.
ALTER TABLE "dashboard_priority_config"
  ADD CONSTRAINT "dashboard_priority_config_highlight_count_positive"
  CHECK ("priorityHighlightCount" >= 1);
