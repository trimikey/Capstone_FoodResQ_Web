-- Campaign transport lifecycle, receipt audit, and legacy-data backfill.
ALTER TABLE "campaign_transports"
  ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "picked_up_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "received_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "receipt_note" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "receipt_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "last_broadcast_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaign_transports_received_by_user_id_fkey'
      AND conrelid = 'campaign_transports'::regclass
  ) THEN
    ALTER TABLE "campaign_transports"
      ADD CONSTRAINT "campaign_transports_received_by_user_id_fkey"
      FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_campaign_transports_status"
  ON "campaign_transports" ("status");

UPDATE "campaign_transports" ct
SET
  "status" = CASE d."status"::text
    WHEN 'assigned' THEN 'assigned'
    WHEN 'heading_to_provider' THEN 'heading_to_provider'
    WHEN 'qc_completed' THEN 'picked_up'
    WHEN 'in_transit' THEN 'in_transit'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'failed'
    ELSE 'pending'
  END,
  "assigned_at" = COALESCE(ct."assigned_at", d."assigned_at"),
  "picked_up_at" = COALESCE(ct."picked_up_at", d."picked_up_at"),
  "delivered_at" = COALESCE(ct."delivered_at", d."delivered_at"),
  "failed_at" = CASE
    WHEN d."status"::text = 'failed' THEN COALESCE(ct."failed_at", d."updated_at")
    ELSE ct."failed_at"
  END,
  "failure_reason" = COALESCE(ct."failure_reason", d."failed_reason"),
  "updated_at" = GREATEST(ct."updated_at", d."updated_at")
FROM "deliveries" d
WHERE ct."delivery_id" = d."id";
