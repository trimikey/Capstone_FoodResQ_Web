-- Migration: add_campaign_dish_steps
-- Bảng `campaign_dish_steps` — track tiến độ 4 khâu cố định (Sơ chế → Nấu → Trình bày → Sẵn sàng)
-- cho từng món trong chiến dịch. Chef tick "xong" kèm ảnh bằng chứng.
-- Mở khâu: locked → available khi ĐỦ 2 đk AND (đến giờ scheduled_time + khâu trước done).

-- 1. Tạo enum `campaign_dish_step_status`
CREATE TYPE "campaign_dish_step_status" AS ENUM (
  'locked',
  'available',
  'in_progress',
  'done'
);

-- 2. Tạo bảng `campaign_dish_steps`
CREATE TABLE "campaign_dish_steps" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "campaign_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "step_order" SMALLINT NOT NULL,
  "step_name" VARCHAR(100) NOT NULL,
  "scheduled_time" VARCHAR(8) NOT NULL,
  "status" "campaign_dish_step_status" NOT NULL DEFAULT 'locked',
  "completed_at" TIMESTAMPTZ,
  "completed_by_volunteer_id" UUID,
  "proof_url" TEXT,
  "note" VARCHAR(500),
  "opened_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "campaign_dish_steps_pkey" PRIMARY KEY ("id")
);

-- 3. Unique: mỗi (campaign, menu_item, step_order) chỉ có 1 bản ghi
CREATE UNIQUE INDEX "campaign_dish_steps_campaign_id_menu_item_id_step_order_key"
  ON "campaign_dish_steps"("campaign_id", "menu_item_id", "step_order");

-- 4. Index phụ trợ
CREATE INDEX "idx_campaign_dish_steps_campaign" ON "campaign_dish_steps"("campaign_id");
CREATE INDEX "idx_campaign_dish_steps_menu_item" ON "campaign_dish_steps"("menu_item_id");
CREATE INDEX "idx_campaign_dish_steps_status" ON "campaign_dish_steps"("status");
CREATE INDEX "idx_campaign_dish_steps_scheduled_time" ON "campaign_dish_steps"("scheduled_time");

-- 5. Foreign keys
ALTER TABLE "campaign_dish_steps"
  ADD CONSTRAINT "campaign_dish_steps_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "kitchen_campaigns"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "campaign_dish_steps"
  ADD CONSTRAINT "campaign_dish_steps_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "campaign_menu_items"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "campaign_dish_steps"
  ADD CONSTRAINT "campaign_dish_steps_completed_by_volunteer_id_fkey"
  FOREIGN KEY ("completed_by_volunteer_id") REFERENCES "volunteer_profiles"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;