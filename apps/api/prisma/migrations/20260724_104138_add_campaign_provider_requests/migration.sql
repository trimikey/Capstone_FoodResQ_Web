-- Migration: Add campaign_provider_requests table
-- Description: Charity gửi request hợp tác đến provider, provider accept/reject.

-- 1. Create enum
CREATE TYPE campaign_request_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- 2. Create table
CREATE TABLE campaign_provider_requests (
    id                  uuid                            DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id         uuid                            NOT NULL,
    receiver_id         uuid                            NOT NULL,
    provider_id         uuid                            NOT NULL,
    message             varchar(500),
    status              campaign_request_status          DEFAULT 'pending',
    duration_months     integer,
    reviewed_at         timestamptz(6),
    reviewed_note       varchar(255),
    created_at          timestamptz(6)                  DEFAULT now(),
    updated_at          timestamptz(6)                  DEFAULT now(),
    CONSTRAINT fk_campaign_provider_requests_campaign
        FOREIGN KEY (campaign_id) REFERENCES kitchen_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_campaign_provider_requests_receiver
        FOREIGN KEY (receiver_id) REFERENCES receiver_profiles(id),
    CONSTRAINT fk_campaign_provider_requests_provider
        FOREIGN KEY (provider_id) REFERENCES provider_profiles(id)
);

-- 3. Unique constraint
CREATE UNIQUE INDEX idx_campaign_provider_requests_unique
    ON campaign_provider_requests(campaign_id, provider_id)
    WHERE campaign_id != '00000000-0000-0000-0000-000000000000';

CREATE UNIQUE INDEX idx_campaign_provider_requests_pending
    ON campaign_provider_requests(campaign_id, provider_id)
    WHERE status = 'pending';

-- 4. Regular indexes
CREATE INDEX idx_campaign_provider_requests_campaign ON campaign_provider_requests(campaign_id);
CREATE INDEX idx_campaign_provider_requests_provider ON campaign_provider_requests(provider_id);
CREATE INDEX idx_campaign_provider_requests_status  ON campaign_provider_requests(status);
CREATE INDEX idx_campaign_provider_requests_created  ON campaign_provider_requests(created_at DESC);
