-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add geography columns (IF NOT EXISTS to be idempotent)
ALTER TABLE "provider_profiles"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

ALTER TABLE "receiver_profiles"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

ALTER TABLE "volunteer_profiles"
  ADD COLUMN IF NOT EXISTS "current_location" geography(Point, 4326);

ALTER TABLE "food_listings"
  ADD COLUMN IF NOT EXISTS "pickup_location" geography(Point, 4326);

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "pickup_location" geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS "delivery_location" geography(Point, 4326);

ALTER TABLE "kitchen_campaigns"
  ADD COLUMN IF NOT EXISTS "kitchen_location" geography(Point, 4326);

ALTER TABLE "campaign_volunteer_assignments"
  ADD COLUMN IF NOT EXISTS "check_in_location" geography(Point, 4326);

-- Spatial indexes
CREATE INDEX IF NOT EXISTS "idx_provider_location" ON "provider_profiles" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "idx_volunteer_location" ON "volunteer_profiles" USING GIST ("current_location");
CREATE INDEX IF NOT EXISTS "idx_listing_location" ON "food_listings" USING GIST ("pickup_location");
