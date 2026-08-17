-- Repair production drift where lifecycle columns became nullable after the
-- recruitment lifecycle migration had already been applied.
UPDATE "kitchen_campaigns"
SET "operation_start_at" = (("scheduled_date"::text || ' ' || "start_time")::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
WHERE "operation_start_at" IS NULL;

UPDATE "kitchen_campaigns"
SET "operation_end_at" = (
  ((GREATEST(COALESCE("end_date", "scheduled_date"), "scheduled_date"))::text || ' ' || "end_time")::timestamp
  AT TIME ZONE 'Asia/Ho_Chi_Minh'
)
WHERE "operation_end_at" IS NULL;

UPDATE "kitchen_campaigns"
SET "operation_end_at" = "operation_end_at" + INTERVAL '1 day'
WHERE "operation_end_at" <= "operation_start_at";

UPDATE "kitchen_campaigns"
SET "recruitment_end_at" = "operation_start_at" - make_interval(hours => "recruitment_buffer_hours")
WHERE "recruitment_end_at" IS NULL;

UPDATE "kitchen_campaigns"
SET "recruitment_start_at" = LEAST(
  "created_at",
  "recruitment_end_at" - INTERVAL '1 hour'
)
WHERE "recruitment_start_at" IS NULL;

ALTER TABLE "kitchen_campaigns"
  ALTER COLUMN "operation_start_at" SET NOT NULL,
  ALTER COLUMN "operation_end_at" SET NOT NULL,
  ALTER COLUMN "recruitment_start_at" SET NOT NULL,
  ALTER COLUMN "recruitment_end_at" SET NOT NULL;
