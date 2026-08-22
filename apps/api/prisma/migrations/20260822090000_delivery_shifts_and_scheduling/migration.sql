-- Chuyển giao hàng từ mô hình "bật/tắt sẵn sàng + mời tuần tự" sang "đăng ký ca + tự chọn đơn".
--
-- 1) Ca giao hàng TNV đã đăng ký (cam kết theo NGÀY cụ thể, khác volunteer_availability
--    vốn chỉ là khai báo rảnh lặp hằng tuần). Tái dùng 4 ca cố định của chiến dịch.
CREATE TABLE IF NOT EXISTS delivery_shift_registrations (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  volunteer_id uuid NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  period       campaign_shift_period NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_shift_reg_unique UNIQUE (volunteer_id, work_date, period)
);
CREATE INDEX IF NOT EXISTS idx_delivery_shift_reg_slot
  ON delivery_shift_registrations (work_date, period);
CREATE INDEX IF NOT EXISTS idx_delivery_shift_reg_volunteer
  ON delivery_shift_registrations (volunteer_id, work_date);

-- 2) Người nhận hẹn giờ giao: NULL = giao ngay như cũ.
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS delivery_scheduled_at timestamptz;
