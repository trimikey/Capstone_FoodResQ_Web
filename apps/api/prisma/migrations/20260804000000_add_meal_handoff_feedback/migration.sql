-- Account-level receiver QR tokens, auditable meal handoffs, and receiver-owned feedback.
CREATE TABLE "receiver_handoff_qr_tokens" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "receiver_id" UUID NOT NULL,
  "qr_token" VARCHAR(64) NOT NULL,
  "qr_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receiver_handoff_qr_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receiver_handoff_qr_tokens_qr_token_key" UNIQUE ("qr_token"),
  CONSTRAINT "receiver_handoff_qr_tokens_receiver_id_fkey"
    FOREIGN KEY ("receiver_id") REFERENCES "receiver_profiles"("id") ON DELETE CASCADE
);

CREATE INDEX "receiver_handoff_qr_tokens_receiver_id_qr_expires_at_idx"
  ON "receiver_handoff_qr_tokens"("receiver_id", "qr_expires_at");

CREATE TABLE "meal_handoffs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "distribution_id" UUID NOT NULL,
  "receiver_id" UUID NOT NULL,
  "scanned_by_volunteer_id" UUID NOT NULL,
  "qr_token_id" UUID NOT NULL,
  "served_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "meal_handoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meal_handoffs_qr_token_id_key" UNIQUE ("qr_token_id"),
  CONSTRAINT "meal_handoffs_distribution_id_receiver_id_key" UNIQUE ("distribution_id", "receiver_id"),
  CONSTRAINT "meal_handoffs_distribution_id_fkey"
    FOREIGN KEY ("distribution_id") REFERENCES "meal_distributions"("id") ON DELETE CASCADE,
  CONSTRAINT "meal_handoffs_receiver_id_fkey"
    FOREIGN KEY ("receiver_id") REFERENCES "receiver_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "meal_handoffs_scanned_by_volunteer_id_fkey"
    FOREIGN KEY ("scanned_by_volunteer_id") REFERENCES "volunteer_profiles"("id"),
  CONSTRAINT "meal_handoffs_qr_token_id_fkey"
    FOREIGN KEY ("qr_token_id") REFERENCES "receiver_handoff_qr_tokens"("id")
);

CREATE INDEX "meal_handoffs_receiver_id_served_at_idx"
  ON "meal_handoffs"("receiver_id", "served_at");
CREATE INDEX "meal_handoffs_distribution_id_idx"
  ON "meal_handoffs"("distribution_id");

CREATE TABLE "beneficiary_feedback" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "handoff_id" UUID NOT NULL,
  "satisfaction" SMALLINT NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "beneficiary_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beneficiary_feedback_handoff_id_key" UNIQUE ("handoff_id"),
  CONSTRAINT "beneficiary_feedback_handoff_id_fkey"
    FOREIGN KEY ("handoff_id") REFERENCES "meal_handoffs"("id") ON DELETE CASCADE,
  CONSTRAINT "beneficiary_feedback_satisfaction_check" CHECK ("satisfaction" BETWEEN 1 AND 5)
);
