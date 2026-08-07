-- Khung giờ mở cửa TRONG NGÀY cho tin đăng.
-- Trước đây chỉ có pickup_start_time → pickup_end_time (mốc tuyệt đối), nên tin kéo dài
-- nhiều ngày sẽ cho đặt cả lúc 3h sáng khi cửa hàng đóng.
-- Lưu bằng số phút từ 00:00 giờ VN (7:00 → 420, 21:00 → 1260) thay vì kiểu `time`
-- để không phụ thuộc múi giờ của server.
ALTER TABLE "food_listings"
  ADD COLUMN IF NOT EXISTS "daily_start_minute" SMALLINT,
  ADD COLUMN IF NOT EXISTS "daily_end_minute" SMALLINT;

-- Giá trị hợp lệ: 0..1439 và giờ mở phải trước giờ đóng (không hỗ trợ khung qua nửa đêm).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'food_listings_daily_window_check'
      AND conrelid = 'food_listings'::regclass
  ) THEN
    ALTER TABLE "food_listings"
      ADD CONSTRAINT "food_listings_daily_window_check"
      CHECK (
        ("daily_start_minute" IS NULL AND "daily_end_minute" IS NULL)
        OR (
          "daily_start_minute" BETWEEN 0 AND 1439
          AND "daily_end_minute" BETWEEN 0 AND 1439
          AND "daily_start_minute" < "daily_end_minute"
        )
      );
  END IF;
END $$;
