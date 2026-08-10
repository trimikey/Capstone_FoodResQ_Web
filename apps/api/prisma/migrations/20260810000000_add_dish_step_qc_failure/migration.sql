-- Add QC-failure fields to CampaignDishStep so the kitchen can flag a step
-- as quality-failed and notify the charity organization in real time.
-- A failed step is non-destructive: the dish itself keeps its status, the
-- other dishes in the campaign are unaffected.
ALTER TABLE "campaign_dish_steps"
  ADD COLUMN "qc_failed_at" TIMESTAMPTZ NULL,
  ADD COLUMN "qc_failed_by_volunteer_id" UUID NULL,
  ADD COLUMN "qc_failure_reason" VARCHAR(500) NULL;

ALTER TABLE "campaign_dish_steps"
  ADD CONSTRAINT "campaign_dish_steps_qc_failed_by_volunteer_id_fkey"
  FOREIGN KEY ("qc_failed_by_volunteer_id")
  REFERENCES "volunteer_profiles"("id")
  ON DELETE SET NULL;

CREATE INDEX "idx_campaign_dish_steps_qc_failed_at"
  ON "campaign_dish_steps" ("qc_failed_at")
  WHERE "qc_failed_at" IS NOT NULL;
