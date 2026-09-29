-- Preserve existing calls; failure details are required only for new human finalizations.
ALTER TABLE "andon_calls" ADD COLUMN "failureClassification" TEXT;
ALTER TABLE "andon_calls" ADD COLUMN "failureDescription" TEXT;
