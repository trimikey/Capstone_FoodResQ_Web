-- Báo sự cố của shipper trong CHIẾN DỊCH (đi lấy nguyên liệu / đi phát suất ăn).
-- Tách khỏi luồng giao hàng đơn lẻ (deliveries) — không đụng bảng nào của luồng đó.
CREATE TABLE IF NOT EXISTS campaign_incidents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id    UUID NOT NULL REFERENCES kitchen_campaigns(id) ON DELETE CASCADE,
  volunteer_id   UUID NOT NULL REFERENCES volunteer_profiles(id),
  context        VARCHAR(20) NOT NULL CHECK (context IN ('pickup', 'distribution')),
  reference_id   UUID,
  reason_code    VARCHAR(40) NOT NULL,
  detail         TEXT,
  photo_url      TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at    TIMESTAMPTZ,
  resolved_note  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_incidents_campaign_id_created_at_idx
  ON campaign_incidents (campaign_id, created_at);
