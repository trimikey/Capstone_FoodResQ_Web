-- HSD tính theo SỐ NGÀY kể từ khi nhận, thay vì một mốc ngày tuyệt đối.
-- Lý do: người nhận nhìn "08/09/2026" trên tin dễ hiểu nhầm đó là NGÀY SẢN XUẤT.
-- expiry_time vẫn giữ nguyên (deadline cứng dùng cho cron near-expiry + chặn đặt đơn),
-- nay được suy ra = pickup_end_time + shelf_life_days ngày.
ALTER TABLE food_listings
  ADD COLUMN shelf_life_days SMALLINT;

-- Backfill tin cũ: quy đổi mốc expiry_time hiện có về số ngày (làm tròn lên, tối thiểu 1).
UPDATE food_listings
SET shelf_life_days = GREATEST(
  1,
  LEAST(30, CEIL(EXTRACT(EPOCH FROM (expiry_time - pickup_end_time)) / 86400.0)::int)
)
WHERE shelf_life_days IS NULL;

ALTER TABLE food_listings
  ADD CONSTRAINT food_listings_shelf_life_days_range
  CHECK (shelf_life_days IS NULL OR (shelf_life_days >= 1 AND shelf_life_days <= 30));
