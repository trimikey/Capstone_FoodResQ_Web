-- Cho phép một chiến dịch gửi NHIỀU đơn nguyên liệu tới cùng một nhà cung cấp.
--
-- Unique (campaign_id, provider_id) sinh ra cho cơ chế upsert cũ: mỗi lần gửi lại là
-- GHI ĐÈ đơn trước, nên đặt gạo xong quay lại đặt thêm thịt từ cùng NCC là mất đơn
-- gạo. Service đã đổi sang chỉ sửa-tại-chỗ đơn còn pending, còn lại tạo dòng mới —
-- ràng buộc unique vì thế phải gỡ. Giữ index thường để tra cứu theo cặp vẫn nhanh.
ALTER TABLE campaign_provider_requests
  DROP CONSTRAINT IF EXISTS campaign_provider_requests_campaign_id_provider_id_key;
DROP INDEX IF EXISTS campaign_provider_requests_campaign_id_provider_id_key;

CREATE INDEX IF NOT EXISTS idx_campaign_provider_requests_campaign_provider
  ON campaign_provider_requests (campaign_id, provider_id);
