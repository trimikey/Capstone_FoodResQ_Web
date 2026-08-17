-- Separate campaign approval/execution from volunteer recruitment.
CREATE TYPE "campaign_status_new" AS ENUM (
  'pending_approval', 'approved', 'in_progress', 'completed', 'cancelled'
);
CREATE TYPE "recruitment_status" AS ENUM (
  'scheduled', 'open', 'staffed', 'expired_understaffed', 'closed_ready'
);
CREATE TYPE "campaign_shift_period" AS ENUM (
  'midnight', 'morning', 'afternoon', 'evening'
);
CREATE TYPE "assignment_confirmation_status" AS ENUM (
  'pending', 'confirmed', 'declined'
);

ALTER TABLE "kitchen_campaigns"
  ADD COLUMN "operation_start_at" TIMESTAMPTZ,
  ADD COLUMN "operation_end_at" TIMESTAMPTZ,
  ADD COLUMN "recruitment_start_at" TIMESTAMPTZ,
  ADD COLUMN "recruitment_end_at" TIMESTAMPTZ,
  ADD COLUMN "recruitment_buffer_hours" SMALLINT NOT NULL DEFAULT 24,
  ADD COLUMN "recruitment_status" "recruitment_status" NOT NULL DEFAULT 'scheduled';

UPDATE "kitchen_campaigns"
SET
  "operation_start_at" = (("scheduled_date"::text || ' ' || "start_time")::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
  -- Giữ nguyên end_date lịch sử. Nếu dữ liệu demo cũ có end_date trước ngày bắt
  -- đầu, chỉ dùng scheduled_date làm mốc backfill operation_end_at.
  "operation_end_at" = (((GREATEST(COALESCE("end_date", "scheduled_date"), "scheduled_date"))::text || ' ' || "end_time")::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
  "recruitment_start_at" = LEAST(
    "created_at",
    (("scheduled_date"::text || ' ' || "start_time")::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '25 hours'
  ),
  "recruitment_end_at" = ((("scheduled_date"::text || ' ' || "start_time")::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '24 hours'),
  "recruitment_status" = CASE
    WHEN "status"::text = 'open' THEN 'open'::"recruitment_status"
    WHEN "status"::text IN ('in_progress', 'completed') THEN 'closed_ready'::"recruitment_status"
    ELSE 'scheduled'::"recruitment_status"
  END;

-- Historical campaigns can have an end clock earlier than the start clock.
UPDATE "kitchen_campaigns"
SET "operation_end_at" = "operation_end_at" + INTERVAL '1 day'
WHERE "operation_end_at" <= "operation_start_at";

ALTER TABLE "kitchen_campaigns"
  ALTER COLUMN "operation_start_at" SET NOT NULL,
  ALTER COLUMN "operation_end_at" SET NOT NULL,
  ALTER COLUMN "recruitment_start_at" SET NOT NULL,
  ALTER COLUMN "recruitment_end_at" SET NOT NULL,
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "kitchen_campaigns"
  ALTER COLUMN "status" TYPE "campaign_status_new"
  USING (
    CASE "status"::text
      WHEN 'draft' THEN 'pending_approval'
      WHEN 'open' THEN 'approved'
      ELSE "status"::text
    END
  )::"campaign_status_new";
DROP TYPE "campaign_status";
ALTER TYPE "campaign_status_new" RENAME TO "campaign_status";
ALTER TABLE "kitchen_campaigns"
  ALTER COLUMN "status" SET DEFAULT 'pending_approval'::"campaign_status";

ALTER TABLE "campaign_shifts"
  ADD COLUMN "period" "campaign_shift_period",
  ADD COLUMN "end_day_offset" SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false;

UPDATE "campaign_shifts"
SET
  "period" = CASE
    WHEN "start_time" IN ('00:00', '00:00:00') AND "end_time" IN ('06:00', '06:00:00') THEN 'midnight'::"campaign_shift_period"
    WHEN "start_time" IN ('06:00', '06:00:00') AND "end_time" IN ('12:00', '12:00:00') THEN 'morning'::"campaign_shift_period"
    WHEN "start_time" IN ('12:00', '12:00:00') AND "end_time" IN ('18:00', '18:00:00') THEN 'afternoon'::"campaign_shift_period"
    WHEN "start_time" IN ('18:00', '18:00:00') AND "end_time" IN ('00:00', '00:00:00', '24:00') THEN 'evening'::"campaign_shift_period"
    ELSE NULL
  END,
  "end_day_offset" = CASE
    WHEN "start_time" IN ('18:00', '18:00:00') AND "end_time" IN ('00:00', '00:00:00', '24:00') THEN 1
    ELSE 0
  END,
  "needs_review" = NOT (
    ("start_time" IN ('00:00', '00:00:00') AND "end_time" IN ('06:00', '06:00:00')) OR
    ("start_time" IN ('06:00', '06:00:00') AND "end_time" IN ('12:00', '12:00:00')) OR
    ("start_time" IN ('12:00', '12:00:00') AND "end_time" IN ('18:00', '18:00:00')) OR
    ("start_time" IN ('18:00', '18:00:00') AND "end_time" IN ('00:00', '00:00:00', '24:00'))
  );

ALTER TABLE "campaign_volunteer_assignments"
  ADD COLUMN "confirmation_status" "assignment_confirmation_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "confirmed_at" TIMESTAMPTZ;

UPDATE "campaign_volunteer_assignments"
SET
  "confirmation_status" = CASE
    WHEN "status"::text IN ('assigned', 'checked_in', 'in_progress', 'completed')
      THEN 'confirmed'::"assignment_confirmation_status"
    WHEN "status"::text IN ('rejected', 'cancelled', 'absent')
      THEN 'declined'::"assignment_confirmation_status"
    ELSE 'pending'::"assignment_confirmation_status"
  END,
  "confirmed_at" = CASE
    WHEN "status"::text IN ('assigned', 'checked_in', 'in_progress', 'completed') THEN "updated_at"
    ELSE NULL
  END;

CREATE INDEX "kitchen_campaigns_status_recruitment_window_idx"
  ON "kitchen_campaigns" ("status", "recruitment_status", "recruitment_start_at", "recruitment_end_at");
CREATE INDEX "kitchen_campaigns_status_operation_start_idx"
  ON "kitchen_campaigns" ("status", "operation_start_at");

ALTER TABLE "kitchen_campaigns" ADD CONSTRAINT "campaign_operation_window_valid"
  CHECK ("operation_end_at" > "operation_start_at");
ALTER TABLE "kitchen_campaigns" ADD CONSTRAINT "campaign_recruitment_window_valid"
  CHECK ("recruitment_end_at" > "recruitment_start_at");
ALTER TABLE "kitchen_campaigns" ADD CONSTRAINT "campaign_recruitment_buffer_valid"
  CHECK ("recruitment_buffer_hours" BETWEEN 6 AND 48);
ALTER TABLE "campaign_shifts" ADD CONSTRAINT "campaign_shift_end_day_offset_valid"
  CHECK ("end_day_offset" IN (0, 1));
