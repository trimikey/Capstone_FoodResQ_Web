-- Thêm cột end_date vào kitchen_campaigns & campaign_change_requests
-- Cho phép chiến dịch kéo dài nhiều ngày. Cron sẽ tự kết thúc sau endDate + endTime.
-- Dùng IF NOT EXISTS để idempotent (đã được apply thủ công trên staging/prod).
ALTER TABLE "kitchen_campaigns"
  ADD COLUMN IF NOT EXISTS "end_date" DATE;

-- Backfill: campaign đã tồn tại chưa có end_date → mặc định = scheduled_date
UPDATE "kitchen_campaigns"
SET "end_date" = "scheduled_date"
WHERE "end_date" IS NULL;

-- Tương tự cho change_request
ALTER TABLE "campaign_change_requests"
  ADD COLUMN IF NOT EXISTS "end_date" DATE;