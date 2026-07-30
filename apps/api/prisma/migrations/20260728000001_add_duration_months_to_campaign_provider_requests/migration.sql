-- Migration: Add duration_months to campaign_provider_requests
-- Description: Add durationMonths column for partnership duration tracking

ALTER TABLE campaign_provider_requests 
ADD COLUMN IF NOT EXISTS duration_months integer;
