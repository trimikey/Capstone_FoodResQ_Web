# FoodResQ — Lỗi đã gặp & cách xử lý

File này ghi lại **các lỗi đã xảy ra** khi phát triển / chạy FoodResQ, kèm
cách nhận biết, cách fix tại chỗ, và cách phòng tránh tái diễn.

> **Quy tắc cập nhật**: mỗi lần có lỗi mới → **append** entry mới vào cuối
> file, **không sửa/xoá** entry cũ (giữ lịch sử). Nếu cách fix thay đổi
> đáng kể, ghi thêm `E0xx — Update <date>` block bên dưới entry gốc.

---

## E001 — `InvalidDatasourceError: URL must start with 'prisma://' or 'prisma+postgres://'`

**Ngày gặp:** 2026-08-10
**Triệu chứng:**
```
InvalidDatasourceError: Error validating datasource `db`:
the URL must start with the protocol `prisma://` or `prisma+postgres://`
  at Proxy.$connect (.../@prisma/client/src/runtime/getPrismaClient.ts:461:29)
  at Proxy.onModuleInit (apps/api/src/prisma/prisma.service.ts:7:16)
```
Nest không boot được, crash ngay khi `PrismaService.onModuleInit()`.

**Nguyên nhân gốc:**
Một lần trước đó chạy `npx prisma generate --no-engine` để vượt qua lỗi
EPERM khi ghi file `query_engine-windows.dll.node`. Cờ `--no-engine` bảo
Prisma generate ra Prisma Client dùng **Data Proxy / Accelerate**, chỉ
chấp nhận URL dạng `prisma://` — không tương thích với `postgresql://`
mà `.env` đang dùng.

**Fix:**
1. Dừng dev server đang lock file:
   ```powershell
   Get-Process node | Where-Object { $_.CommandLine -like '*nest start*' } |
     ForEach-Object { Stop-Process -Id $_.Id -Force }
   ```
2. Chạy lại **không có** `--no-engine`:
   ```bash
   cd apps/api
   npx prisma generate
   ```
3. Verify kết nối (optional, nhưng nên làm):
   ```js
   // .tmp-prisma-probe.cjs
   const { PrismaClient } = require('@prisma/client');
   const p = new PrismaClient();
   p.$connect().then(() => { console.log('OK'); return p.$disconnect(); });
   ```

**Phòng tránh:**
- **Không bao giờ** dùng `prisma generate --no-engine` cho dev NestJS /
  Node.js server. Cờ đó chỉ dành cho serverless edge (Cloudflare Workers,
  Vercel Edge) muốn gọi Prisma qua Accelerate.
- Khi `prisma generate` lỗi EPERM → dừng dev server trước rồi regen, đừng
  hack bằng `--no-engine`.

---

## E002 — Cron spam `column ... does not exist` sau khi sửa schema

**Ngày gặp:** 2026-08-10
**Triệu chứng:**
```
[Nest] ERROR [CampaignsCron] autoOpenAvailableSteps failed
[Nest] ERROR [CampaignsCron] PrismaClientKnownRequestError:
Invalid `this.prisma.campaignDishStep.findMany()` invocation
The column `campaign_dish_steps.qc_failed_at` does not exist in the current database.
  code: 'P2022',
  meta: { modelName: 'CampaignDishStep', column: 'campaign_dish_steps.qc_failed_at' }
```
Lỗi lặp lại mỗi 30s (chu kỳ cron).

**Nguyên nhân gốc:**
Mình đã sửa `schema.prisma` + tạo file migration
`20260810000000_add_dish_step_qc_failure/migration.sql`, generate lại
Prisma Client (OK). Nhưng **quên chạy migration** để áp DDL vào database
thật trên Supabase. Prisma Client thì đã biết cột `qc_failed_at` tồn tại
(theo schema), nhưng DB thật thì chưa có → query fail.

**Fix áp dụng:**
Dùng script Node `prisma.$executeRawUnsafe` chạy từng statement trong
file migration, vì:
- `npx prisma migrate deploy` fail trên Supabase pooler transaction
  mode (port 6543): `prepared statement "s0" does not exist`
- `npx prisma db execute` bị treo vô thời hạn với pooler này
- `$executeRawUnsafe` gửi inline (không prepared) → tương thích pgbouncer

```js
// .tmp-apply-migration.cjs
const fs = require('fs'); const path = require('path');
const { PrismaClient } = require('@prisma/client');

(async () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, 'prisma/migrations/<migration_name>/migration.sql'),
    'utf8'
  );
  const stmts = sql.split('\n').filter(l => !l.trim().startsWith('--'))
    .join('\n').split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  const p = new PrismaClient();
  try {
    await p.$connect();
    for (const s of stmts) {
      console.log('---', s.slice(0, 80));
      await p.$executeRawUnsafe(s);
      console.log('OK');
    }
  } finally { await p.$disconnect(); }
})();
```

**Phòng tránh:**
- **Mỗi lần sửa `schema.prisma` phải áp migration vào DB ngay**, không
  chỉ generate client. Nếu dùng Supabase pooler (transaction mode), không
  dùng `migrate deploy` được — dùng script `$executeRawUnsafe` như trên.
- Hoặc đổi `DIRECT_URL` trong `.env` sang **direct connection** (port
  5432, không có `pgbouncer=true`) rồi `migrate deploy` bình thường. Lưu
  ý Supabase free tier giới hạn ~15 connection ở port 5432.
- Sau khi áp DDL, verify bằng cách query `information_schema.columns` để
  chắc chắn cột đã tồn tại trước khi restart app.

---

## E003 — `EPERM: operation not permitted, rename query_engine-windows.dll.node`

**Ngày gặp:** 2026-08-10 (xảy ra trước E001)
**Triệu chứng:**
```
Error: EPERM: operation not permitted, rename
'D:\Do_An\foodresq\node_modules\.prisma\client\query_engine-windows.dll.node.tmp14260'
  -> 'D:\Do_An\foodresq\node_modules\.prisma\client\query_engine-windows.dll.node'
```
`prisma generate` không ghi đè được file engine do Windows đang lock.

**Nguyên nhân gốc:**
Nest dev server (`nest start --watch`) đang chạy → load file engine vào
memory → Windows không cho phép process khác rename file.

**Fix:**
1. Dừng Nest/Next dev server trước:
   ```powershell
   Get-Process node | Where-Object { $_.CommandLine -like '*nest*' -or
     $_.CommandLine -like '*next*' } | ForEach-Object {
       Stop-Process -Id $_.Id -Force
     }
   ```
2. Chạy lại `npx prisma generate`.
3. Khởi động lại dev server.

**Phòng tránh:**
- Nếu cần regen Prisma Client, **luôn dừng dev server trước**. Hoặc tạm
  thời tắt `--watch` (`nest start` không watch).
- Đừng bao giờ hack bằng `--no-engine` (xem E001).

---

## E004 — Optional chaining không đủ sâu khi API response shape thay đổi

**Ngày gặp:** 2026-08-10
**Triệu chứng:**
```
Uncaught TypeError: Cannot read properties of undefined (reading 'length')
  at MyTaskDetailPage (src/app/(dashboard)/my-tasks/[assignmentId]/page.tsx:350:41)
```
Code bị crash khi render sau khi mình thêm field mới vào API response
(`CampaignSuppliesPayload.requested`), nhưng Next dev đang load response
cũ từ cache khi API server đã restart chưa kịp.

**Nguyên nhân gốc:**
Code gốc dùng `supplies?.requested.length ?? 0`:
- `supplies?.` chỉ guard khi `supplies === null/undefined`
- Khi `supplies` là object nhưng `requested` không tồn tại trong object
  (response shape cũ từ cache, hoặc server Nest restart chưa xong) →
  `supplies.requested === undefined` → `.length` crash.

**Fix:**
Đổi sang optional chaining **tầng sâu** để guard cả 2 cấp:
```tsx
// Sai:
supplies?.requested.length ?? 0
// Đúng:
supplies?.requested?.length ?? 0
```
Tương tự cho mọi field mới thêm vào API response khi viết FE render.

**Phòng tránh:**
- Khi thêm field mới vào API response shape, **luôn dùng
  `obj?.field?.nested?.length ?? 0`** cho mọi chuỗi truy cập, không
  chỉ dừng ở cấp 1.
- Khi test API shape mới: mở Network tab, kiểm tra response đúng shape
  trước khi reload FE; hoặc tắt cache TanStack Query
  (`staleTime: 0`) cho dev khi đang refactor response shape.
- Lỗi optional chaining "một tầng" rất hay xảy ra khi refactor
  payload lớn — rule: **mọi field mới = dùng `?.` cho cả chuỗi
  truy cập từ root đến leaf**.

---

## Format cho entry mới

Khi append lỗi mới, dùng template:

```markdown
## E00N — <tên ngắn gọn>

**Ngày gặp:** YYYY-MM-DD
**Triệu chứng:**
```
<paste exact error từ terminal>
```

**Nguyên nhân gốc:**
<1-3 câu>

**Fix áp dụng:**
<steps + code nếu cần>

**Phòng tránh:**
<1-3 câu rule để không lặp lại>
```
