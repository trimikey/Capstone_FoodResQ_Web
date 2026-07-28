-- ProviderProposal: charity đề xuất NCC mới (khi hệ thống chưa có provider)
CREATE TYPE "provider_proposal_status" AS ENUM ('pending', 'approved', 'rejected', 'expired');

CREATE TABLE "provider_proposals" (
  "id"                  UUID                     DEFAULT uuid_generate_v4() PRIMARY KEY,
  "proposed_by_user_id" UUID                     NOT NULL REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "business_name"       VARCHAR(255)             NOT NULL,
  "contact_name"        VARCHAR(120),
  "contact_phone"       VARCHAR(20),
  "contact_email"       VARCHAR(255),
  "address"             VARCHAR(255),
  "note"                VARCHAR(1000),
  "duration_months"     SMALLINT                 NOT NULL DEFAULT 1,
  "status"              "provider_proposal_status" NOT NULL DEFAULT 'pending',
  "reviewed_by_user_id" UUID                     REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "reviewed_at"         TIMESTAMPTZ(6),
  "review_note"         VARCHAR(500),
  "created_provider_id" UUID                     REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "created_at"          TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ(6)           NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_provider_proposals_proposer" ON "provider_proposals"("proposed_by_user_id");
CREATE INDEX "idx_provider_proposals_status"   ON "provider_proposals"("status");
