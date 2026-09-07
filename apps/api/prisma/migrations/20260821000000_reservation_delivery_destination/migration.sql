-- Điểm giao do NGƯỜI ĐẶT chọn cho từng đơn.
--
-- Trước đây chuyến giao luôn lấy địa chỉ trong hồ sơ người nhận, nên người khó di
-- chuyển đang nằm viện / ở nhà người thân không có cách nào nhận hàng đúng chỗ.
-- Hai cột này để trống = dùng địa chỉ hồ sơ như cũ (tương thích ngược).
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_location geography(Point, 4326);

-- Truy vấn tìm shipper và tính khoảng cách đều đi qua cột này.
CREATE INDEX IF NOT EXISTS idx_reservations_delivery_location
  ON reservations USING GIST (delivery_location);
