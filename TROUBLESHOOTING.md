# FoodResQ — Sổ tra lỗi

Các lỗi đã gặp thật trong repo này, kèm nguyên nhân và cách sửa.
Lỗi trùng nguyên nhân được gộp làm một mục.

Cập nhật: 2026-08-10

---

## Lệnh kiểm tra nhanh

Chạy từ thư mục gốc `foodresq/` khi nghi ngờ có lỗi:

```bash
pnpm --filter @foodresq/types build      # phải chạy TRƯỚC khi typecheck api/web
pnpm --filter @foodresq/api build        # nest build — lỗi TS sẽ hiện ở đây
pnpm --filter @foodresq/api test         # jest
cd apps/web && npx tsc --noEmit          # typecheck FE
```

Trạng thái lúc viết file này: build API ✅ · typecheck web ✅ · test 103 pass / 3 fail (mục 3–4) · lint ❌ (mục 2).

---

## 1. `Cannot find module '...\apps\api\dist\main'`

**Triệu chứng**

```
Error: Cannot find module 'D:\Do_An\foodresq\apps\api\dist\main'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1421:15)
  code: 'MODULE_NOT_FOUND'
```

**Nguyên nhân**

`npm run start:prod` = `node dist/main` — nó chỉ *chạy* code đã build chứ không build.
Thư mục `dist/` chưa tồn tại vì một trong các lý do:

- Chưa từng chạy `nest build` sau khi clone / sau khi xoá `dist`.
- Build bị lỗi hoặc bị Ctrl+C giữa chừng. [nest-cli.json](nest-cli.json) đặt
  `"deleteOutDir": true`, nghĩa là Nest **xoá sạch `dist/` trước** rồi mới compile —
  build hỏng giữa chừng để lại thư mục rỗng.
- Trên Windows, một tiến trình `node` cũ đang giữ file trong `dist/` khiến bước xoá/ghi thất bại.

**Cách sửa**

```bash
# Từ thư mục gốc
pnpm --filter @foodresq/api build
pnpm --filter @foodresq/api start:prod
```

Nếu build vẫn lỗi trên Windows: tắt hết tiến trình `node` đang chạy API rồi build lại.

**Lưu ý**: khi phát triển thì dùng `pnpm dev` (watch mode) — không cần build tay.
`start:prod` chỉ dành cho lúc chạy bản đã build.

---

## 2. `Cannot find package 'eslint-plugin-prettier'`

**Triệu chứng**

```
Oops! Something went wrong! :(
ESLint: 9.39.4
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'eslint-plugin-prettier'
imported from D:\Do_An\foodresq\apps\api\eslint.config.mjs
```

**Nguyên nhân**

[apps/api/eslint.config.mjs](apps/api/eslint.config.mjs) import 4 package:

```js
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
```

nhưng `apps/api/package.json` **không khai báo package nào trong số đó** ở
`devDependencies` (kiểm tra: không có dòng nào chứa `eslint` hay `prettier`).
Vì pnpm không hoisted mặc định, ESLint không tự tìm thấy chúng → `pnpm lint` fail.

**Cách sửa**

```bash
pnpm --filter @foodresq/api add -D eslint @eslint/js eslint-plugin-prettier prettier globals typescript-eslint
```

Sau đó `pnpm --filter @foodresq/api lint` sẽ chạy được.
Cảnh báo: script `lint` có cờ `--fix`, nó sẽ **tự sửa format toàn bộ `src/`** ngay lần
chạy đầu → nên commit code hiện tại trước, rồi chạy lint riêng một commit.

---

## 3. 2 test GPS check-in fail: nhận `TypeError` thay vì `BadRequestException`

**Triệu chứng**

```
● CampaignsService › requires GPS coordinates to move an assignment to checked in
● CampaignsService › rejects GPS check-in outside the kitchen radius

  Expected constructor: BadRequestException
  Received constructor: TypeError
```

**Nguyên nhân**

Phần kiểm tra GPS trong [campaigns.service.ts:1661-1679](apps/api/src/modules/campaigns/campaigns.service.ts#L1661-L1679)
đang bị comment lại để tiện test:

```ts
if (next === 'checked_in') {
  // TODO: bỏ comment khi deploy — tạm thời bỏ GPS check để test
  // if (!hasLng || !hasLat) {
  //   throw new BadRequestException('Cần vị trí GPS để điểm danh tại bếp.');
  // }
  this.assertWithinCheckInWindow(a.campaign, a.shift, a.role);
  // ... ST_DWithin 500m cũng bị comment
}
```

Không còn ném `BadRequestException` nữa, luồng chạy tiếp xuống
`assertWithinCheckInWindow` → mock campaign trong test không có `startTime`
→ `campaign.startTime.split(':')` ném `TypeError`. Test bắt được `TypeError`, không phải
lỗi nghiệp vụ mong đợi.

**Cách sửa** — chọn 1 trong 2:

- **Nếu muốn bật lại ràng buộc GPS (đúng cho bản deploy)**: bỏ comment 2 khối trên.
  Hai test sẽ pass lại ngay, không phải sửa test.
- **Nếu vẫn muốn tạm tắt GPS**: đánh dấu 2 test đó `it.skip(...)` kèm ghi chú lý do,
  để không lẫn với test hỏng thật.

Đây là ràng buộc chống gian lận điểm danh (phải có mặt trong bán kính 500 m của bếp) —
**không nên quên bật lại trước khi bảo vệ / deploy**.

> **ĐÃ XỬ LÝ (2026-08-12)**: mock campaign trong hai test đã được bổ sung
> `startTime`/`endTime` nên không còn ném `TypeError` theo giờ chạy nữa. Hai test giờ
> ở trạng thái `it.skip` kèm ghi chú — bỏ comment khối GPS trong service thì bỏ
> `.skip` là chúng xanh lại. Phần mô tả bên dưới giữ để hiểu vì sao chúng từng chập chờn.

> **Hai test này CÒN CHẬP CHỜN THEO GIỜ CHẠY** — nguy hiểm hơn là fail hẳn.
> Mock campaign dùng `scheduledDate: new Date()`, và `assertWithinCheckInWindow` so
> `scheduledDate.toISOString()` (giờ **UTC**) với ngày hiện tại theo giờ **VN**:
>
> - Chạy lúc 07:00–24:00 giờ VN → ngày UTC = ngày VN → qua được cửa ngày, rơi xuống
>   `campaign.startTime.split(':')` mà mock không có `startTime` → **TypeError → FAIL**.
> - Chạy lúc 00:00–07:00 giờ VN → ngày UTC lùi 1 ngày → ném `BadRequestException`
>   ngay ở cửa ngày → **PASS nhưng vì lý do sai**.
>
> Nghĩa là cùng một commit, chạy tối thì đỏ, chạy khuya thì xanh. Khi sửa nhớ thêm
> `startTime`/`endTime` vào mock campaign để test không phụ thuộc đồng hồ.

---

## 4. Test `accepts check-in at any time on the campaign day` fail

**Triệu chứng**

```
● CampaignsService › check-in work window › accepts check-in at any time on the campaign day

  Expected: not to throw
  Error message: "Chiến dịch bắt đầu lúc 09:00. Chưa đến giờ điểm danh."
```

**Nguyên nhân**

Test cũ hơn implementation. Tên test nói "any time on the campaign day", nó gọi
`assertWithinCheckInWindow` lúc 00:00 giờ VN với campaign `09:00–10:00` và kỳ vọng
**không** ném lỗi.

Nhưng [campaigns.service.ts:161-169](apps/api/src/modules/campaigns/campaigns.service.ts#L161-L169)
hiện đã siết lại — chỉ cho điểm danh **trong khoảng `startTime` → `endTime`**:

```ts
if (nowTotal < startTotal) {
  throw new BadRequestException(`Chiến dịch bắt đầu lúc ${campaign.startTime}. Chưa đến giờ điểm danh.`);
}
```

Tức là hành vi đã đổi có chủ đích, còn test thì chưa cập nhật theo.

**Cách sửa**

Sửa test cho khớp hành vi mới (đây mới là hành vi đúng):

```ts
it('accepts check-in inside the campaign work window', () => {
  // 2099-01-01 09:30 giờ VN = 02:30Z
  expect(() => assertWindow('2099-01-01T02:30:00.000Z')).not.toThrow();
});

it('rejects check-in before the campaign start time', () => {
  // 2099-01-01 00:00 giờ VN = 2098-12-31 17:00Z
  expect(() => assertWindow('2098-12-31T17:00:00.000Z')).toThrow(BadRequestException);
});
```

Nhớ quy đổi: **giờ VN = giờ UTC + 7**. Test dùng mốc UTC nên rất dễ lệch 7 tiếng.

---

## 5. API crash ngay khi khởi động vì thiếu biến môi trường

**Triệu chứng**: app chết lúc bootstrap, log nhắc tới `REDIS_URL`, `JWT_SECRET` hoặc
`JWT_REFRESH_SECRET`.

**Nguyên nhân**

Các biến này đọc bằng `config.getOrThrow(...)` — thiếu là ném lỗi ngay, không có giá trị
mặc định:

- `REDIS_URL` — [app.module.ts:34](apps/api/src/app.module.ts#L34), dùng cho BullMQ.
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — [auth.service.ts:596-602](apps/api/src/modules/auth/auth.service.ts#L596-L602).
- `JWT_SECRET` cũng cần cho WebSocket ([notifications.gateway.ts:40](apps/api/src/modules/notifications/notifications.gateway.ts#L40)) —
  thiếu thì mọi kết nối socket bị disconnect ngay, thông báo real-time im lặng không báo lỗi.

**Cách sửa**

```bash
cp apps/api/.env.example apps/api/.env   # rồi điền giá trị
```

Ngoài env, **Redis phải đang chạy** ở `localhost:6379` (Memurai trên Windows hoặc WSL) —
xem [SETUP.md](SETUP.md). Không có Redis thì đặt chỗ (Redlock) và hàng đợi mời shipper
sẽ hỏng.

---

## 6. `prisma db push` / `prisma generate` lỗi khoá file trên Windows

**Triệu chứng**: `EPERM` / `operation not permitted` khi ghi đè
`node_modules/.prisma/client/query_engine-windows.dll.node`.

**Nguyên nhân**

Server NestJS đang chạy giữ file DLL của Prisma engine → Windows không cho ghi đè.

**Cách sửa**

Tắt server API (`Ctrl+C` cả tab `pnpm dev`) rồi chạy lại:

```bash
pnpm db:push        # hoặc pnpm db:generate
```

DB dùng chung trên Supabase và **không dùng migration file** — đồng bộ schema bằng
`prisma db push`.

---

## 7. Sửa enum trong `packages/types` mà api/web không thấy thay đổi

**Triệu chứng**: vừa thêm giá trị enum trong `packages/types/src/enums.ts` nhưng
api/web vẫn báo không tồn tại, hoặc typecheck fail với giá trị cũ.

**Nguyên nhân**

`packages/types/package.json` trỏ `main`/`types` vào **`./dist`**, không phải `src`.
Các app nạp bản đã compile, nên sửa `src/` mà chưa build thì không có tác dụng gì.

**Cách sửa**

```bash
pnpm --filter @foodresq/types build     # hoặc `dev` để watch
```

Chạy lệnh này **trước** mọi lần typecheck/build api hay web sau khi đụng vào enum.

---

## 8. `PrismaClientValidationError: Invalid value for argument 'reason'. Expected TrustScoreReason`

**Triệu chứng**

```
PrismaClientValidationError:
Invalid `this.prisma.user.update()` invocation in
.../trust.service.ts:33:24
Invalid value for argument `reason`. Expected TrustScoreReason.
```

(Prisma trỏ vào `user.update` vì đó là lệnh đầu trong `$transaction`, nhưng chỗ sai thật
là `trustScoreHistory.create` ngay bên dưới.)

**Nguyên nhân**

`TrustService.applyDelta()` khai `reason: string` rồi ép kiểu khi ghi:

```ts
reason: reason as never,   // ← vô hiệu hoá kiểm tra kiểu của Prisma
```

`as never` làm TypeScript chấp nhận mọi chuỗi, nên chuỗi không thuộc enum
`trust_score_reason` lọt qua `tsc` và chỉ nổ lúc chạy thật. Hai chỗ gọi sai:

- `deliveries.service.ts` → `'late_pickup'`
- `bulk-runs.service.ts` → `'bulk_run_cancelled_after_approval'`

Cả hai đều không nằm trong 9 giá trị enum có sẵn.

**Cách sửa** (đã áp dụng)

1. `applyDelta(reason: TrustScoreReason)` + bỏ `as never` → sai kiểu là `tsc` chặn ngay.
2. Bổ sung `late_pickup`, `bulk_run_cancelled_after_approval` vào **cả 3 nơi phải khớp nhau**:
   `packages/types/src/enums.ts`, `apps/api/prisma/schema.prisma`, và **DB Postgres**.
3. Thêm nhãn tiếng Việt trong `TRUST_REASON_LABEL` ([apps/web/src/app/(dashboard)/profile/page.tsx](apps/web/src/app/(dashboard)/profile/page.tsx)) —
   thiếu nhãn thì người dùng thấy chuỗi thô `late_pickup` trong lịch sử điểm uy tín.

**Bài học**: mỗi khi thêm giá trị enum, phải sửa đủ **4 chỗ** — types → schema.prisma →
DB → nhãn FE. Thiếu chỗ nào cũng hỏng, mà chỉ chỗ DB mới gây lỗi lúc chạy.

---

## 9. Route động Next.js bỗng dưng 404 (vd toàn bộ `/admin/<tab>`)

**Triệu chứng**

`/admin` vào được (200) nhưng mọi tab con `/admin/campaigns`, `/admin/users`,
`/admin/reports`… đều trả trang 404 mặc định của Next.js. Code không đổi gì.

**Nguyên nhân**

KHÔNG phải lỗi code. Kiểm chứng đã làm:

- `src/app/(dashboard)/admin/[tab]/page.tsx` tồn tại, cú pháp đúng.
- Không có chỗ nào gọi `notFound()`; `AdminShell` nhận tab lạ thì fallback về
  `dashboard` chứ không 404.
- Thư mục build `.next/dev/server/app/(dashboard)/admin/[tab]` vẫn còn — tức route
  từng được biên dịch thành công.

Dev server (Next + Turbopack) mất đăng ký route động trong bộ nhớ. Hay gặp sau khi
HMR gặp lỗi biên dịch giữa chừng, hoặc file được tạo/đổi tên lúc server đang chạy.

**Cách sửa**

Ép biên dịch lại route đó — chạm vào file là đủ, không cần restart cả server:

```bash
touch "apps/web/src/app/(dashboard)/admin/[tab]/page.tsx"
```

Không ăn thua thì tắt `pnpm dev` rồi chạy lại. Cần triệt để hơn thì xoá cache:

```bash
rm -rf apps/web/.next/dev
```

**Cách phân biệt với lỗi code thật**: nếu `.next/dev/server/app/...` có thư mục của
route mà request vẫn 404 → gần như chắc chắn là dev server hỏng trạng thái, không phải
sai đường dẫn. Còn 404 do link sai (vd trỏ tới `/manage/overview` không tồn tại) thì
thư mục build cũng không có.

---

## 10. `The column X does not exist in the current database`

**Triệu chứng**

```
PrismaClientKnownRequestError:
Invalid `this.prisma.campaignProviderRequest.findMany()` invocation
The column `campaign_provider_requests.demand_details` does not exist in the current database.
```

**Nguyên nhân**

`schema.prisma` đã có cột mới nhưng **DB Supabase thì chưa**. Prisma sinh câu SELECT
liệt kê tường minh từng cột, nên chỉ cần một cột chưa tồn tại là mọi truy vấn đụng
tới bảng đó đều hỏng — kể cả những chỗ không dùng cột mới.

Đây là hệ quả của việc dự án đồng bộ schema bằng `prisma db push` thay vì migration
file: sửa `schema.prisma` xong mà quên đẩy lên DB thì code và DB lệch nhau.

**Cách sửa**

Thêm cột trực tiếp bằng SQL (an toàn nhất — chỉ thêm, không đụng dữ liệu cũ):

```sql
ALTER TABLE <bảng> ADD COLUMN IF NOT EXISTS <cột> <kiểu>;
```

Hoặc `pnpm db:push` (nhớ tắt server API trước — xem mục 6). Lưu ý `db:push` đồng bộ
**toàn bộ** schema nên nếu DB đã lệch sẵn ở chỗ khác thì nó sẽ sửa luôn cả chỗ đó;
thêm cột lẻ bằng `ALTER TABLE` thì phạm vi hẹp và đoán trước được.

**Không cần restart API** sau khi thêm cột: Prisma gửi tên cột theo từng truy vấn,
cột vừa có là request kế tiếp chạy được ngay.

**Cách kiểm tra nhanh còn lệch gì không**:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'campaign_provider_requests';
```
