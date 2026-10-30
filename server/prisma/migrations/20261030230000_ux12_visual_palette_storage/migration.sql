-- UX-12 / stage 2A: additive global visual-palette storage only.
-- Empty JSON is a sentinel for the immutable industrial preset.
-- No legacy settings are reset and this migration does NOT enable writes.
ALTER TABLE "system_settings"
  ADD COLUMN "andonVisualPalette" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "andonVisualPaletteRevision" INTEGER NOT NULL DEFAULT 0;

-- Future audited updates use a dedicated authenticated endpoint, not
-- generic PATCH /api/system-settings. Danger/warning are never editable.
