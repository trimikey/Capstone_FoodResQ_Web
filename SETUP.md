# FoodResQ — Hướng dẫn setup cho cả nhóm

DB đã deploy chung trên **Supabase** (PostgreSQL 17 + PostGIS). Mọi người dùng chung một DB, không cần cài Postgres local.

---

## 1. Yêu cầu

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | ≥ 20 | |
| pnpm | ≥ 9 (đang dùng 11.5.2) | `npm i -g pnpm` |
| Redis | ≥ 6.2 khuyến nghị | cho cache / lock / queue khi chạy backend |

> **Redis trên Windows**: có thể dùng [Memurai](https://www.memurai.com/) (native) hoặc WSL Ubuntu (`sudo apt install redis-server`). Backend cần Redis ở `localhost:6379`.

---

## 2. Cài đặt

```bash
git clone <repo>
cd foodresq
pnpm install
```

---

## 3. Cấu hình môi trường (`apps/api/.env`)

```bash
cp apps/api/.env.example apps/api/.env
```

Mở `apps/api/.env`, điền `DATABASE_URL` của DB chung (xin **trưởng nhóm** — không commit lên git):

```env
DATABASE_URL="postgresql://postgres:<PASSWORD>@db.qwariaudkacksbpnphoa.supabase.co:5432/postgres?sslmode=require"
```

> ⚠️ Mật khẩu có ký tự đặc biệt phải URL-encode (vd `@` → `%40`), nếu không Prisma parse sai.
>
> 🌐 Host direct (`db.xxx.supabase.co`) dùng **IPv6**. Nếu mạng của bạn là IPv4-only và không kết nối được, đổi sang **Session Pooler** (host `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.qwariaudkacksbpnphoa`) — xin chuỗi này từ trưởng nhóm.

---

## 4. Sinh Prisma client

```bash
pnpm db:generate
```

---

## 5. Chạy

```bash
# Cả monorepo (api + web):
pnpm dev

# Hoặc chỉ backend:
pnpm --filter api dev
```

- API: <http://localhost:3001/api/v1>
- Swagger: <http://localhost:3001/api/docs>
- Web: <http://localhost:3000>

---

## 6. Tài khoản test (đã seed)

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@foodresq.vn` | `Provider123` |
| Provider | `tiembanhmattroi@foodresq.vn` (và các `@foodresq.vn`) | `Provider123` |
| Shipper | `shipper1@foodresq.vn` | `Provider123` |
| Charity | `beptuthien@foodresq.vn` | `Provider123` |

---

## 7. Lưu ý

- **KHÔNG commit `apps/api/.env`** (đã có trong `.gitignore`) — chứa mật khẩu DB.
- DB là **chung**: thay đổi dữ liệu sẽ ảnh hưởng cả nhóm. Cần data riêng để thử nghiệm thì chạy DB local (bỏ comment dòng `DATABASE_URL` local trong `.env`).
- Schema thay đổi: cập nhật `prisma/schema.prisma` → `pnpm db:push` (thống nhất với nhóm trước khi push vì ảnh hưởng DB chung).
- Free tier Supabase tự pause sau ~1 tuần không hoạt động → vào dashboard bấm restore.
