-- Bật Row Level Security (RLS) cho TẤT CẢ bảng trong schema public.
-- Vì sao an toàn với app này:
--   • App NestJS kết nối bằng vai trò `postgres` (chủ bảng) → RLS được BỎ QUA → app chạy y nguyên.
--   • Bật RLS + KHÔNG tạo policy → chặn hoàn toàn truy cập qua Supabase Data API (PostgREST,
--     anon/authenticated key). Đây chính là thứ Security Advisor cảnh báo.
-- Cách chạy nhanh nhất: dán vào Supabase Dashboard → SQL Editor → Run.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END$$;

-- Kiểm tra sau khi chạy (rowsecurity phải = true cho mọi bảng):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY 1;
