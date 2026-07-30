-- Migration: Add listing_ids to campaign_provider_requests
-- Description: Store selected food listing IDs when charity requests from provider

ALTER TABLE campaign_provider_requests 
ADD COLUMN IF NOT EXISTS listing_ids varchar(1000);
