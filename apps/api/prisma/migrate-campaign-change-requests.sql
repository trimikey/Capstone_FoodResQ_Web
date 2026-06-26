-- Migration: thêm cơ chế "yêu cầu thay đổi chiến dịch" (charity gửi → admin duyệt).
-- Chạy trên DB cloud trước khi deploy code mới:
--   psql "$DATABASE_URL" -f apps/api/prisma/migrate-campaign-change-requests.sql
--
-- Lưu ý: nếu sau này chạy `prisma db push`, partial unique index dưới đây có thể bị
-- coi là drift và bị xoá (Prisma schema không biểu diễn được partial unique). Ràng buộc
-- "1 yêu cầu pending / chiến dịch" cũng đã được enforce ở tầng service, nên không sao.

BEGIN;

-- 1) Enum trạng thái yêu cầu thay đổi
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_change_status') THEN
    CREATE TYPE campaign_change_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;
END$$;

-- 2) Bảng yêu cầu thay đổi
CREATE TABLE IF NOT EXISTS campaign_change_requests (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id             UUID NOT NULL REFERENCES kitchen_campaigns(id) ON DELETE CASCADE,
    requested_by_user_id    UUID NOT NULL REFERENCES users(id),
    status                  campaign_change_status NOT NULL DEFAULT 'pending',
    reason                  TEXT,
    scheduled_date          DATE,
    start_time              VARCHAR(8),
    end_time                VARCHAR(8),
    kitchen_address         TEXT,
    lng                     DOUBLE PRECISION,
    lat                     DOUBLE PRECISION,
    chef_slots_needed       SMALLINT,
    waiter_slots_needed     SMALLINT,
    shipper_slots_needed    SMALLINT,
    review_note             TEXT,
    reviewed_by_user_id     UUID REFERENCES users(id),
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_change_campaign ON campaign_change_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_change_status ON campaign_change_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_one_pending_change
    ON campaign_change_requests(campaign_id) WHERE status = 'pending';

-- 3) Config khoá sửa (tuỳ chọn — service đã có default 3 nếu thiếu row này)
INSERT INTO system_configs (key, value, description, updated_at)
VALUES ('CAMPAIGN_CHANGE_LOCK_DAYS', '3',
        'Tổ chức chỉ được gửi yêu cầu thay đổi khi còn ít nhất số ngày này tới ngày diễn ra.', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;
