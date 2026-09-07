-- Nối khoản quyên góp với đơn nguyên liệu đã sinh ra nó.
--
-- Khi NCC đồng ý một campaign_provider_request, backend tự tạo một campaign_donation
-- để số kg vào SỔ KHO (buildSupplyProgress chỉ đọc donations). Nhưng hai bảng không hề
-- có khoá nối — liên kết duy nhất là chuỗi "Tạo từ request <uuid>" trong cột note.
-- Hệ quả: giao diện hiện MỘT lô hàng thành hai thẻ rời, tổ chức phải xác nhận hai lần
-- và có thể cử hai shipper khác nhau đi lấy cùng một lô.
ALTER TABLE campaign_donations
  ADD COLUMN IF NOT EXISTS provider_request_id uuid
  REFERENCES campaign_provider_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_donations_provider_request
  ON campaign_donations (provider_request_id);

-- Backfill dữ liệu cũ từ chính chuỗi ghi chú, chỉ nhận uuid trỏ tới đơn có thật.
UPDATE campaign_donations d
SET provider_request_id = r.id
FROM campaign_provider_requests r
WHERE d.provider_request_id IS NULL
  AND d.note ~ 'Tạo từ request [0-9a-f-]{36}'
  AND r.id = (substring(d.note from 'Tạo từ request ([0-9a-f-]{36})'))::uuid;
