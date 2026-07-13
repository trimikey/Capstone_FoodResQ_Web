-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'provider', 'receiver', 'volunteer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending_verification', 'active', 'suspended', 'banned');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('restaurant', 'supermarket', 'bakery', 'hotel', 'other');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VolunteerRank" AS ENUM ('newcomer', 'active', 'experienced', 'expert');

-- CreateEnum
CREATE TYPE "VolunteerSpecialization" AS ENUM ('shipper', 'chef', 'waiter');

-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('prepared_meal', 'raw_ingredients', 'bakery', 'beverage', 'other');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'active', 'fully_reserved', 'completed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('kg', 'portion', 'item', 'box', 'liter');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('confirmed', 'picked_up', 'completed', 'cancelled', 'expired', 'no_show');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending_assignment', 'assigned', 'heading_to_provider', 'qc_completed', 'in_transit', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('chef', 'waiter', 'shipper');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('assigned', 'checked_in', 'in_progress', 'completed', 'absent', 'cancelled');

-- CreateEnum
CREATE TYPE "VerificationRequestType" AS ENUM ('provider_registration', 'charity_registration', 'volunteer_chef_cert', 'receiver_income_proof');

-- CreateEnum
CREATE TYPE "TrustScoreReason" AS ENUM ('late_cancellation', 'no_show', 'bad_rating_received', 'food_safety_violation', 'hoarding_detected', 'manual_penalty', 'successful_rescue', 'high_rating_received', 'manual_bonus');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('user', 'listing', 'delivery', 'campaign');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('spoiled_food', 'fake_account', 'hoarding', 'no_show_provider', 'unsafe_food', 'harassment', 'fraud', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'under_review', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending_verification',
    "trust_score" SMALLINT NOT NULL DEFAULT 100,
    "fcm_token" TEXT,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "business_name" VARCHAR(255) NOT NULL,
    "business_type" "BusinessType" NOT NULL,
    "tax_code" VARCHAR(50),
    "description" TEXT,
    "address" TEXT NOT NULL,
    "contact_phone" VARCHAR(20),
    "website_url" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "total_food_rescued_kg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_co2_saved_kg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_rating" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiver_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "is_charity_org" BOOLEAN NOT NULL DEFAULT false,
    "organization_name" VARCHAR(255),
    "id_card_number" VARCHAR(50),
    "id_card_image_url" TEXT,
    "address" TEXT,
    "income_proof_url" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "reservations_today" SMALLINT NOT NULL DEFAULT 0,
    "avg_rating" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "receiver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "id_card_number" VARCHAR(50),
    "location_updated_at" TIMESTAMPTZ,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "dedication_points" INTEGER NOT NULL DEFAULT 0,
    "rank" "VolunteerRank" NOT NULL DEFAULT 'newcomer',
    "vehicle_type" VARCHAR(50),
    "vehicle_plate" VARCHAR(20),
    "avg_rating" DECIMAL(3,2),
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "volunteer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_specializations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "volunteer_id" UUID NOT NULL,
    "specialization" "VolunteerSpecialization" NOT NULL,
    "food_safety_cert_url" TEXT,
    "cert_expiry_date" DATE,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ,

    CONSTRAINT "volunteer_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liability_waivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "waiver_version" VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "liability_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" "FoodCategory" NOT NULL,
    "quantity_total" DECIMAL(10,2) NOT NULL,
    "quantity_remaining" DECIMAL(10,2) NOT NULL,
    "quantity_unit" "QuantityUnit" NOT NULL DEFAULT 'portion',
    "weight_per_unit_kg" DECIMAL(6,3),
    "pickup_start_time" TIMESTAMPTZ NOT NULL,
    "pickup_end_time" TIMESTAMPTZ NOT NULL,
    "expiry_time" TIMESTAMPTZ NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "storage_conditions" TEXT,
    "allergen_notes" TEXT,
    "max_per_reservation" SMALLINT NOT NULL DEFAULT 1,
    "image_urls" JSONB NOT NULL DEFAULT '[]',
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "cancelled_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "food_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'confirmed',
    "qr_token" VARCHAR(64) NOT NULL,
    "qr_expires_at" TIMESTAMPTZ NOT NULL,
    "pickup_proof_url" TEXT,
    "pickup_proof_at" TIMESTAMPTZ,
    "scanned_by" UUID,
    "scanned_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "receiver_notes" TEXT,
    "trust_penalty_applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "shipper_id" UUID,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending_assignment',
    "qc_photo_url" TEXT,
    "qc_photo_at" TIMESTAMPTZ,
    "delivery_proof_url" TEXT,
    "delivery_proof_at" TIMESTAMPTZ,
    "distance_km" DECIMAL(8,2),
    "assigned_at" TIMESTAMPTZ,
    "picked_up_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "failed_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "charity_receiver_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "kitchen_address" TEXT NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "start_time" VARCHAR(8) NOT NULL,
    "end_time" VARCHAR(8) NOT NULL,
    "chef_slots_needed" SMALLINT NOT NULL DEFAULT 0,
    "waiter_slots_needed" SMALLINT NOT NULL DEFAULT 0,
    "shipper_slots_needed" SMALLINT NOT NULL DEFAULT 0,
    "chef_slots_filled" SMALLINT NOT NULL DEFAULT 0,
    "waiter_slots_filled" SMALLINT NOT NULL DEFAULT 0,
    "shipper_slots_filled" SMALLINT NOT NULL DEFAULT 0,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "expected_servings" INTEGER,
    "actual_servings" INTEGER,
    "image_urls" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kitchen_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_volunteer_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "volunteer_id" UUID NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'assigned',
    "check_in_time" TIMESTAMPTZ,
    "check_out_time" TIMESTAMPTZ,
    "ingredient_proof_url" TEXT,
    "ingredient_proof_at" TIMESTAMPTZ,
    "cooked_proof_url" TEXT,
    "cooked_proof_at" TIMESTAMPTZ,
    "distribution_proof_url" TEXT,
    "distribution_proof_at" TIMESTAMPTZ,
    "points_awarded" SMALLINT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "campaign_volunteer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_type" VARCHAR(20) NOT NULL,
    "reference_id" UUID NOT NULL,
    "rater_id" UUID NOT NULL,
    "ratee_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_score_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "delta" SMALLINT NOT NULL,
    "reason" "TrustScoreReason" NOT NULL,
    "reference_type" VARCHAR(20),
    "reference_id" UUID,
    "score_before" SMALLINT NOT NULL,
    "score_after" SMALLINT NOT NULL,
    "created_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dedication_points_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "volunteer_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "reference_type" VARCHAR(20),
    "reference_id" UUID,
    "points_before" INTEGER NOT NULL,
    "points_after" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dedication_points_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "request_type" "VerificationRequestType" NOT NULL,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "reviewer_notes" TEXT,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" UUID,
    "payload" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "esg_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_date" DATE NOT NULL,
    "provider_id" UUID,
    "total_food_rescued_kg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_co2_saved_kg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_reservations" INTEGER NOT NULL DEFAULT 0,
    "total_volunteers_active" INTEGER NOT NULL DEFAULT 0,
    "total_providers_active" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esg_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_info" VARCHAR(255),
    "ip_address" TEXT,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "evidence_urls" JSONB NOT NULL DEFAULT '[]',
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "resolver_id" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipper_task_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" UUID NOT NULL,
    "shipper_id" UUID NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "offered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "reject_reason" TEXT,

    CONSTRAINT "shipper_task_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_user_id_key" ON "provider_profiles"("user_id");

-- CreateIndex
CREATE INDEX "provider_profiles_user_id_idx" ON "provider_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "receiver_profiles_user_id_key" ON "receiver_profiles"("user_id");

-- CreateIndex
CREATE INDEX "receiver_profiles_user_id_idx" ON "receiver_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_profiles_user_id_key" ON "volunteer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "volunteer_profiles_user_id_idx" ON "volunteer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "volunteer_profiles_is_available_idx" ON "volunteer_profiles"("is_available");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_specializations_volunteer_id_specialization_key" ON "volunteer_specializations"("volunteer_id", "specialization");

-- CreateIndex
CREATE UNIQUE INDEX "liability_waivers_user_id_waiver_version_key" ON "liability_waivers"("user_id", "waiver_version");

-- CreateIndex
CREATE INDEX "food_listings_provider_id_idx" ON "food_listings"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_qr_token_key" ON "reservations"("qr_token");

-- CreateIndex
CREATE INDEX "reservations_receiver_id_idx" ON "reservations"("receiver_id");

-- CreateIndex
CREATE INDEX "reservations_qr_token_idx" ON "reservations"("qr_token");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_receiver_id_created_at_idx" ON "reservations"("receiver_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_listing_id_receiver_id_key" ON "reservations"("listing_id", "receiver_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_reservation_id_key" ON "deliveries"("reservation_id");

-- CreateIndex
CREATE INDEX "deliveries_shipper_id_idx" ON "deliveries"("shipper_id");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE INDEX "kitchen_campaigns_charity_receiver_id_idx" ON "kitchen_campaigns"("charity_receiver_id");

-- CreateIndex
CREATE INDEX "kitchen_campaigns_scheduled_date_status_idx" ON "kitchen_campaigns"("scheduled_date", "status");

-- CreateIndex
CREATE INDEX "campaign_volunteer_assignments_campaign_id_idx" ON "campaign_volunteer_assignments"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_volunteer_assignments_volunteer_id_idx" ON "campaign_volunteer_assignments"("volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_volunteer_assignments_campaign_id_volunteer_id_rol_key" ON "campaign_volunteer_assignments"("campaign_id", "volunteer_id", "role");

-- CreateIndex
CREATE INDEX "ratings_ratee_id_idx" ON "ratings"("ratee_id");

-- CreateIndex
CREATE INDEX "ratings_reference_type_reference_id_idx" ON "ratings"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_reference_type_reference_id_rater_id_ratee_id_key" ON "ratings"("reference_type", "reference_id", "rater_id", "ratee_id");

-- CreateIndex
CREATE INDEX "trust_score_history_user_id_created_at_idx" ON "trust_score_history"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dedication_points_history_volunteer_id_created_at_idx" ON "dedication_points_history"("volunteer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- CreateIndex
CREATE INDEX "verification_requests_status_idx" ON "verification_requests"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "esg_snapshots_snapshot_date_idx" ON "esg_snapshots"("snapshot_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "esg_snapshots_snapshot_date_provider_id_key" ON "esg_snapshots"("snapshot_date", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "shipper_task_offers_delivery_id_idx" ON "shipper_task_offers"("delivery_id");

-- CreateIndex
CREATE INDEX "shipper_task_offers_shipper_id_status_idx" ON "shipper_task_offers"("shipper_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shipper_task_offers_delivery_id_shipper_id_key" ON "shipper_task_offers"("delivery_id", "shipper_id");

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiver_profiles" ADD CONSTRAINT "receiver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_specializations" ADD CONSTRAINT "volunteer_specializations_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liability_waivers" ADD CONSTRAINT "liability_waivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_listings" ADD CONSTRAINT "food_listings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "food_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "receiver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "volunteer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_campaigns" ADD CONSTRAINT "kitchen_campaigns_charity_receiver_id_fkey" FOREIGN KEY ("charity_receiver_id") REFERENCES "receiver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_volunteer_assignments" ADD CONSTRAINT "campaign_volunteer_assignments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "kitchen_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_volunteer_assignments" ADD CONSTRAINT "campaign_volunteer_assignments_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_score_history" ADD CONSTRAINT "trust_score_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dedication_points_history" ADD CONSTRAINT "dedication_points_history_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "esg_snapshots" ADD CONSTRAINT "esg_snapshots_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolver_id_fkey" FOREIGN KEY ("resolver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipper_task_offers" ADD CONSTRAINT "shipper_task_offers_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipper_task_offers" ADD CONSTRAINT "shipper_task_offers_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "volunteer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
