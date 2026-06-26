-- Migration: mở rộng enum food_category (5 → 9 loại, phân 2 nhóm lớn)
-- Remap dữ liệu cũ: prepared_meal → cooked_meal, raw_ingredients → vegetables
-- Chạy trên DB cloud TRƯỚC khi deploy code mới. Idempotent-ish: chạy 1 lần.
--
--   psql "$DATABASE_URL" -f apps/api/prisma/migrate-food-category.sql
--
-- Postgres không cho xoá/đổi tên value của enum đang dùng, nên ta tạo type mới
-- rồi chuyển cột sang type mới qua bảng ánh xạ CASE.

BEGIN;

-- 1) Đổi tên type cũ
ALTER TYPE food_category RENAME TO food_category_old;

-- 2) Tạo type mới với 9 loại
CREATE TYPE food_category AS ENUM (
  'cooked_meal', 'bakery', 'fresh_fruit', 'beverage',
  'vegetables', 'raw_protein', 'dry_goods', 'canned_packaged',
  'other'
);

-- 3) Chuyển cột food_listings.category sang type mới, remap value cũ
ALTER TABLE food_listings
  ALTER COLUMN category TYPE food_category
  USING (
    CASE category::text
      WHEN 'prepared_meal'   THEN 'cooked_meal'
      WHEN 'raw_ingredients' THEN 'vegetables'
      ELSE category::text          -- bakery, beverage, other giữ nguyên
    END
  )::food_category;

-- 4) Xoá type cũ
DROP TYPE food_category_old;

COMMIT;

-- Kiểm tra sau khi chạy:
--   SELECT category, COUNT(*) FROM food_listings GROUP BY category ORDER BY 2 DESC;
