-- Migration: Fix upsert on campaign_provider_requests
-- Description: The previous migration created PARTIAL unique indexes which
-- Postgres cannot use for plain `ON CONFLICT (col) DO UPDATE` (Postgres error 42P10:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification").
-- We replace the partial indexes with a FULL unique constraint on
-- (campaign_id, provider_id). The dummy "zero" UUID used by the service when
-- there is no campaign is already unique by itself, so the upsert works as before.

-- 1. Drop old partial unique indexes
DROP INDEX IF EXISTS idx_campaign_provider_requests_unique;
DROP INDEX IF EXISTS idx_campaign_provider_requests_pending;

-- 2. Add FULL unique constraint (Prisma @@@@unique([campaignId, providerId]) maps to this)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'campaign_provider_requests_campaign_id_provider_id_key'
    ) THEN
        ALTER TABLE campaign_provider_requests
            ADD CONSTRAINT campaign_provider_requests_campaign_id_provider_id_key
            UNIQUE (campaign_id, provider_id);
    END IF;
END $$;
