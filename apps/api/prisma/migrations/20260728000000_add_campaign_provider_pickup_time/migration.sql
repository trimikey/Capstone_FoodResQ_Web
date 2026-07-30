-- Add pickup-time fields + transport + delivery-for-campaign-request
-- ============================================================

-- 1) campaign_provider_requests: 4 columns
ALTER TABLE "campaign_provider_requests"
  ADD COLUMN "scheduled_date"      DATE,
  ADD COLUMN "pickup_start_time"   VARCHAR(8),
  ADD COLUMN "pickup_end_time"     VARCHAR(8),
  ADD COLUMN "needs_transport"     BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) campaign_transports: junction request → delivery
CREATE TABLE "campaign_transports" (
  "id"                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  "provider_request_id" UUID         NOT NULL UNIQUE,
  "delivery_id"         UUID         UNIQUE,
  "status"              VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_campaign_transports_request" ON "campaign_transports" ("provider_request_id");

ALTER TABLE "campaign_transports"
  ADD CONSTRAINT "campaign_transports_provider_request_id_fkey"
  FOREIGN KEY ("provider_request_id") REFERENCES "campaign_provider_requests"("id") ON DELETE CASCADE;

ALTER TABLE "campaign_transports"
  ADD CONSTRAINT "campaign_transports_delivery_id_fkey"
  FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL;

-- 3) deliveries: cho phép NULL reservation_id + thêm provider_request_id
ALTER TABLE "deliveries" ALTER COLUMN "reservation_id" DROP NOT NULL;

ALTER TABLE "deliveries" ADD COLUMN "provider_request_id" UUID UNIQUE;

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_provider_request_id_fkey"
  FOREIGN KEY ("provider_request_id") REFERENCES "campaign_provider_requests"("id") ON DELETE SET NULL;

-- 4) deliveries: thêm pickup_proof_* (cho campaign delivery shipper)
ALTER TABLE "deliveries"
  ADD COLUMN "pickup_proof_url" TEXT,
  ADD COLUMN "pickup_proof_at"  TIMESTAMPTZ;
