-- RC/P0: legacy "active" is operational eligibility, not machine-screen display.
-- Additive migration; every existing sector keeps its existing direct button.
-- A sector linked to a CallReason may now be hidden as a direct button
-- while remaining openable through that group and preserving all history.
ALTER TABLE "andon_categories"
  ADD COLUMN "showDirectButton" BOOLEAN NOT NULL DEFAULT TRUE;
