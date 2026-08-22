-- Khung giờ tình nguyện viên tự khai là rảnh, theo LỊCH TUẦN LẶP LẠI.
--
-- Tái dùng đúng 4 ca cố định của chiến dịch (campaign_shift_period) nên việc so khớp
-- "ca này có ai rảnh không" chỉ là một phép JOIN, không cần so giờ tự do.
--
-- Đây là KHAI BÁO Ý ĐỊNH, không phải cam kết: hệ thống chỉ dùng để lọc/gợi ý,
-- luồng đăng ký → tổ chức duyệt → TNV xác nhận giữ nguyên.
CREATE TABLE IF NOT EXISTS volunteer_availability (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  volunteer_id uuid NOT NULL REFERENCES volunteer_profiles(id) ON DELETE CASCADE,
  -- 1 = Thứ 2 … 7 = Chủ nhật (theo ISO-8601, khớp EXTRACT(ISODOW FROM date)).
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period       campaign_shift_period NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  -- Mỗi ô trong lưới 7 ngày × 4 ca chỉ tồn tại một lần cho mỗi TNV.
  CONSTRAINT volunteer_availability_unique_cell UNIQUE (volunteer_id, day_of_week, period)
);

-- Truy vấn chính: "ca <period> ngày <dow> có những TNV nào rảnh".
CREATE INDEX IF NOT EXISTS idx_volunteer_availability_slot
  ON volunteer_availability (day_of_week, period);
CREATE INDEX IF NOT EXISTS idx_volunteer_availability_volunteer
  ON volunteer_availability (volunteer_id);
