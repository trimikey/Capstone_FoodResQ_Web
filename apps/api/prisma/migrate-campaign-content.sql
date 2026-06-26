-- Migration: thêm 3 cột nội dung cho chiến dịch (thực đơn, lịch trình, vật phẩm cần thiết).
-- An toàn & idempotent — chạy được nhiều lần.
--   psql "$DATABASE_URL" -f apps/api/prisma/migrate-campaign-content.sql

ALTER TABLE kitchen_campaigns ADD COLUMN IF NOT EXISTS menu_items     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE kitchen_campaigns ADD COLUMN IF NOT EXISTS schedule_items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE kitchen_campaigns ADD COLUMN IF NOT EXISTS supply_items   JSONB NOT NULL DEFAULT '[]';
