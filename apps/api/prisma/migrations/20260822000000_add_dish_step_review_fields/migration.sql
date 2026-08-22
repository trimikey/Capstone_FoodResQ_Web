-- Add organization review fields for dish-step QC photos.
-- Idempotent because some development databases received these columns manually
-- while the Prisma schema already selected them in cron queries.
ALTER TABLE "campaign_dish_steps"
  ADD COLUMN IF NOT EXISTS "review_status" VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "review_note" VARCHAR(500) NULL;

CREATE INDEX IF NOT EXISTS "idx_campaign_dish_steps_review_status"
  ON "campaign_dish_steps" ("review_status")
  WHERE "review_status" IS NOT NULL;
