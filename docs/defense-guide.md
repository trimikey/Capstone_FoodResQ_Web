# FoodResQ — Tài liệu ôn bảo vệ (Database & Deployment)

> Dùng để trình bày trước hội đồng. Gồm 3 phần: (1) Cách đẩy schema lên production, (2) Ý nghĩa 32 bảng, (3) Bộ câu hỏi & trả lời.

---

## PHẦN 1 — Cách đẩy Database lên Production

### 1.1 Bức tranh tổng thể

- **DB production** đặt trên **Supabase** (PostgreSQL 16 + extension PostGIS), region `ap-southeast-1` (Singapore).
- Backend kết nối qua **connection pooler** của Supabase: `aws-1-ap-southeast-1.pooler.supabase.com:5432`.
- **ORM:** Prisma. File nguồn sự thật là `apps/api/prisma/schema.prisma`.
- Cách triển khai schema: **`prisma db push`** (đồng bộ trực tiếp, không tạo file migration).

### 1.2 Các bước đã thực hiện (đẩy 7 bảng + 3 enum bếp ăn)

1. **Sửa `schema.prisma`** — thêm 3 enum (`RecipeDifficulty`, `SafetyCheckType`, `SafetyCheckResult`), 7 model (`Recipe`, `RecipeIngredient`, `CampaignMenuItem`, `KitchenSafetyLog`, `MealDistribution`, `MealFeedback`, `CampaignShift`) và các quan hệ ngược.
2. **`prisma format`** — căn chỉnh + kiểm tra cú pháp.
3. **`prisma validate`** — xác nhận schema hợp lệ (quan hệ 2 chiều, kiểu dữ liệu...). Kết quả: 32 model hợp lệ.
4. **`prisma db push`** — Prisma làm 3 việc:
   - **Introspect** DB hiện tại (đọc cấu trúc thật trên Supabase).
   - **So sánh (diff)** DB thật vs `schema.prisma` → tính ra các câu lệnh DDL cần chạy.
   - **Áp dụng** DDL lên DB. Kết quả: `Your database is now in sync` (2.42s).
5. **`prisma generate`** — sinh lại Prisma Client để code TypeScript nhận các model mới.

### 1.3 Lệnh DDL thực tế mà `db push` đã sinh (bản chất)

Vì thay đổi chỉ **cộng thêm**, các lệnh đều an toàn (không xoá/sửa dữ liệu cũ):

```sql
-- 3 kiểu enum mới
CREATE TYPE "recipe_difficulty"   AS ENUM ('easy','medium','hard');
CREATE TYPE "safety_check_type"   AS ENUM ('temperature','hygiene','storage','cross_contamination','handwashing','other');
CREATE TYPE "safety_check_result" AS ENUM ('pass','warning','fail');

-- 7 bảng mới (kèm khoá ngoại + index)
CREATE TABLE "recipes" (...);
CREATE TABLE "recipe_ingredients" (...);
CREATE TABLE "campaign_menu_items" (...);
CREATE TABLE "kitchen_safety_logs" (...);
CREATE TABLE "meal_distributions" (...);
CREATE TABLE "meal_feedback" (...);
CREATE TABLE "campaign_shifts" (...);

-- 1 cột mới, cho phép NULL → không ảnh hưởng dòng cũ
ALTER TABLE "campaign_volunteer_assignments" ADD COLUMN "shift_id" uuid;
```

### 1.4 Vì sao an toàn (điểm nhấn khi bảo vệ)

- **Additive-only:** chỉ `CREATE TYPE`, `CREATE TABLE`, `ADD COLUMN nullable` → **không drop, không đổi kiểu, không mất dữ liệu**.
- Đã **backup `schema.prisma`** trước khi thao tác và **`validate`** trước khi push.
- Cột mới `shift_id` để **NULL** nên mọi bản ghi phân công cũ vẫn hợp lệ.

### 1.5 `db push` vs `migrate` — phải nắm để trả lời

| Tiêu chí | `prisma db push` | `prisma migrate dev/deploy` |
|---|---|---|
| Cơ chế | So sánh schema ↔ DB rồi áp DDL trực tiếp | Sinh **file migration** (.sql) có version, lưu lịch sử |
| Lịch sử thay đổi | ❌ Không lưu | ✅ Có (thư mục `prisma/migrations`) |
| Phù hợp | Prototype, dev nhanh, capstone | Sản phẩm thật, nhiều môi trường, cần rollback/audit |
| Rollback | Thủ công | Theo từng migration |

> **Câu trả lời chuẩn nếu bị hỏi:** "Nhóm dùng `db push` vì đang trong giai đoạn phát triển nhanh; thay đổi lần này thuần cộng thêm nên an toàn. Khi lên vận hành thật, hướng đi đúng là chuyển sang `prisma migrate` để có lịch sử migration và khả năng rollback."

---

## PHẦN 2 — Ý nghĩa 32 bảng

> Quy ước chung: khoá chính `id` kiểu **UUID** (chống dò ID tuần tự); cột thời gian **timestamptz** (UTC); cột vị trí **geography(Point,4326)** (PostGIS) + index **GiST**; xoá mềm qua **deleted_at**.

### A. Định danh & Xác thực (3 bảng)

| Bảng | Ý nghĩa & vai trò nghiệp vụ |
|---|---|
| **users** | Tài khoản gốc cho **mọi vai trò** (admin/provider/receiver/volunteer). Giữ email, mật khẩu băm bcrypt, `role`, `status` (pending/active/suspended/banned), `trust_score` (mặc định 100). Một user → tối đa 1 hồ sơ theo vai trò. |
| **refresh_tokens** | Lưu **refresh token đã băm** để cấp lại access token. Hỗ trợ **token rotation** (mỗi lần refresh thu hồi token cũ, cấp token mới) và **revoke toàn bộ khi ban** user. TTL 30 ngày. |
| **liability_waivers** | Bản ghi người dùng **đã đồng ý điều khoản miễn trừ trách nhiệm** (phiên bản waiver + thời điểm + IP). Quan trọng về pháp lý vì nền tảng chia sẻ thực phẩm. |

### B. Hồ sơ theo vai trò (4 bảng)

| Bảng | Ý nghĩa |
|---|---|
| **provider_profiles** | Hồ sơ **nhà cung cấp** (nhà hàng/siêu thị/khách sạn...). Có `location` (PostGIS), trạng thái xác minh, và chỉ số ESG tích luỹ (`total_food_rescued_kg`, `total_co2_saved_kg`). |
| **receiver_profiles** | Hồ sơ **người nhận** (gồm tổ chức từ thiện `is_charity_org`). Lưu dữ liệu xác thực danh tính: `id_card_*`, `face_image_url`, `face_descriptor` (vector khuôn mặt), và `reservations_today` để **giới hạn số lần đặt/ngày**. |
| **volunteer_profiles** | Hồ sơ **tình nguyện viên**. Có `current_location` cập nhật realtime, `is_available` (đang nhận việc), `dedication_points` (điểm cống hiến), `rank` (newcomer→expert). |
| **volunteer_specializations** | **Kỹ năng** của TNV: `shipper` / `chef` / `waiter`, kèm chứng chỉ ATTP và cờ `is_verified`. Một TNV có nhiều kỹ năng (unique theo volunteer+specialization). Quyết định TNV được ứng tuyển vai trò nào. |

### C. Thực phẩm & Đặt chỗ (2 bảng)

| Bảng | Ý nghĩa |
|---|---|
| **food_listings** | **Tin đăng thực phẩm** của provider. Có số lượng tổng/còn lại, khung giờ nhận, hạn dùng, vị trí nhận (PostGIS để tìm gần), `is_surprise_bag` (túi bí mật), `status` (draft→active→fully_reserved→...). |
| **reservations** | **Đơn đặt chỗ** của người nhận. Trung tâm của nghiệp vụ: `status` (confirmed→picked_up→completed/cancelled/expired/no_show), `qr_token` (mã QR sinh ngẫu nhiên 64 ký tự) + `qr_expires_at` (hết hạn 30'), bằng chứng nhận hàng (`pickup_proof_*`, `pickup_verification_type`). |

### D. Giao hàng (2 bảng)

| Bảng | Ý nghĩa |
|---|---|
| **deliveries** | **Đơn giao hàng** gắn 1-1 với reservation (khi người nhận chọn giao tận nơi). Lưu shipper được gán, `status` (pending_assignment→assigned→...→delivered/failed), điểm lấy/giao (PostGIS), `distance_km`. |
| **shipper_task_offers** | **Lời mời nhận đơn** gửi tới tối đa 5 shipper gần nhất, mỗi offer `expires_at` sau 2 phút. Shipper nào **chấp nhận trước thì thắng**; các offer còn lại tự chuyển `expired`. Giải bài toán phân công cạnh tranh. |

### E. Chiến dịch bếp ăn từ thiện (5 bảng)

| Bảng | Ý nghĩa |
|---|---|
| **kitchen_campaigns** | **Chiến dịch nấu ăn** do tổ chức từ thiện tạo. Có lịch, vị trí bếp (PostGIS), số slot cần/đã đầy theo từng vai trò (chef/waiter/shipper), `status` (draft→open→in_progress→completed). |
| **campaign_shifts** | **Ca làm việc** trong chiến dịch (chia theo giờ). TNV ứng tuyển theo ca, mỗi ca có số slot riêng. |
| **campaign_volunteer_assignments** | **Phân công TNV** vào chiến dịch/ca với 1 vai trò. Theo dõi tiến trình: assigned→checked_in→in_progress→completed, kèm ảnh minh chứng từng bước và điểm thưởng. Unique theo (campaign, volunteer, role). |
| **campaign_donations** | **Quyên góp nguyên liệu** của provider cho chiến dịch (status: pledged→received). |
| **campaign_change_requests** | **Yêu cầu thay đổi chiến dịch** do tổ chức gửi, **chờ admin duyệt**. Cột đề xuất = NULL nghĩa là "không đổi trường đó". Bảo đảm thay đổi quan trọng phải được kiểm soát. |

### F. Vận hành bếp & Công thức (6 bảng — vừa deploy)

| Bảng | Ý nghĩa |
|---|---|
| **recipes** | **Thư viện công thức** do đầu bếp đóng góp, tái sử dụng nhiều chiến dịch. Có số khẩu phần, thời gian, độ khó, `times_used`, xoá mềm. |
| **recipe_ingredients** | **Nguyên liệu** của công thức (nhiều dòng/công thức): tên, số lượng, đơn vị. |
| **campaign_menu_items** | **Thực đơn của chiến dịch**, liên kết tới công thức (hoặc món tự do `custom_name`). Khi dùng công thức sẽ tăng `times_used`. |
| **kitchen_safety_logs** | **Nhật ký an toàn thực phẩm kiểu HACCP-lite** do chef ghi: loại kiểm tra (nhiệt độ, vệ sinh, lưu trữ, nhiễm chéo, rửa tay), giá trị đo, kết quả (pass/warning/fail), ảnh. Nếu warning/fail sẽ thông báo tổ chức. |
| **meal_distributions** | **Nhật ký phân phát suất ăn** từng đợt do waiter ghi: số suất phát, số người, suất dư, vị trí (PostGIS tuỳ chọn), ảnh. |
| **meal_feedback** | **Phản hồi của người thụ hưởng** về một đợt phân phát (mức hài lòng 1–5, bình luận). |

### G. Uy tín, Gamification & Đánh giá (3 bảng)

| Bảng | Ý nghĩa |
|---|---|
| **trust_score_history** | **Lịch sử điểm uy tín** của user (delta, lý do, điểm trước/sau). Cơ chế chống lạm dụng: no-show -20, huỷ trễ -10, vi phạm ATTP -50; ≤60 hạn chế, ≤30 bị ban. |
| **dedication_points_history** | **Lịch sử điểm cống hiến** của TNV (gamification để khuyến khích tham gia). |
| **ratings** | **Đánh giá đa hình** (reservation hoặc campaign): người đánh giá, người được đánh giá, điểm, bình luận. Dùng `reference_type`/`reference_id` nên không gắn khoá ngoại cứng. |

### H. Xác minh, Báo cáo & Hệ thống (7 bảng)

| Bảng | Ý nghĩa |
|---|---|
| **verification_requests** | **Yêu cầu xác minh** hồ sơ (provider/charity/chứng chỉ chef/chứng minh thu nhập) để admin duyệt. |
| **reports** | **Tố cáo** đa hình (user/listing/delivery/campaign) với lý do (thực phẩm hỏng, tài khoản giả, quấy rối...), trạng thái xử lý. |
| **notifications** | **Thông báo trong ứng dụng** (lưu DB) — đi kèm WebSocket realtime + FCM push. |
| **device_tokens** | **Token thiết bị FCM** để đẩy push notification; tự dọn token chết. |
| **esg_snapshots** | **Ảnh chụp chỉ số ESG theo ngày** (food rescued, CO₂ saved, số reservation...) phục vụ báo cáo môi trường. |
| **audit_logs** | **Nhật ký kiểm toán** hành động (ai làm gì, trên đối tượng nào, IP, user-agent) — phục vụ truy vết & bảo mật. |
| **system_configs** | **Cấu hình động** dạng key–value JSON (giới hạn đặt chỗ/ngày, bán kính tìm kiếm, hạn QR, ngưỡng điểm uy tín...) — đổi runtime không cần deploy lại. |

---

## PHẦN 3 — Bộ câu hỏi hội đồng & cách trả lời

### Nhóm 1 — Về triển khai DB

**Q1. Em deploy schema lên production bằng cách nào?**
> Dùng `prisma db push`: Prisma đọc cấu trúc DB thật, so sánh với `schema.prisma`, sinh các lệnh DDL chênh lệch rồi áp dụng. Lần này là tạo 7 bảng + 3 enum + 1 cột nullable — toàn bộ cộng thêm nên an toàn.

**Q2. `db push` có rủi ro mất dữ liệu không? Sao không dùng migration?**
> `db push` có rủi ro nếu thay đổi mang tính phá huỷ (drop/đổi kiểu cột). Lần này thuần cộng thêm nên không mất dữ liệu, và em đã `validate` + backup schema trước. Với vận hành thật, hướng đúng là `prisma migrate` để có lịch sử migration và rollback — đây là cải tiến em đã ghi nhận.

**Q3. Làm sao biết DB production khớp với code?**
> Em chạy `prisma db pull` để introspect DB thật rồi so sánh với schema local — kết quả khớp 100% (32 bảng, cùng tên cột). Prisma cũng báo "database is now in sync" sau khi push.

**Q4. Vì sao kết nối qua port 5432 pooler chứ không phải DB trực tiếp?**
> Supabase cung cấp connection pooler (Supavisor) để quản lý số kết nối — quan trọng với serverless/nhiều instance. Port 5432 là chế độ session pooling phù hợp cho Prisma.

### Nhóm 2 — Về thiết kế CSDL

**Q5. Vì sao dùng UUID làm khoá chính thay vì số tự tăng?**
> Tránh lộ quy mô dữ liệu và chống dò tuần tự (đoán ID đơn khác). Phù hợp tài nguyên public-facing như reservation, listing.

**Q6. PostGIS để làm gì? Khác gì lưu lat/lng thường?**
> PostGIS cho phép truy vấn không gian: `ST_DWithin` (tìm trong bán kính), `ST_Distance` (tính khoảng cách) trên kiểu `geography` (tính theo mét trên bề mặt cầu). Có index GiST nên tìm "thực phẩm/shipper gần nhất" rất nhanh, điều mà cột lat/lng thường không tối ưu được.

**Q7. `geography` khác `geometry` thế nào? Vì sao chọn geography?**
> `geometry` tính trên mặt phẳng (đơn vị độ), `geography` tính trên hình cầu (đơn vị mét) — chính xác cho khoảng cách địa lý thực tế. Nhóm chọn `geography(Point,4326)` (chuẩn WGS84) để bán kính 5km là 5km thật.

**Q8. Quan hệ giữa users và các profile?**
> 1 user — 0..1 profile theo vai trò (provider/receiver/volunteer). Tách bảng để mỗi vai trò có trường riêng, tránh bảng users phình to và nhiều cột NULL.

**Q9. Vì sao `ratings` và `reports` không có khoá ngoại cứng tới đối tượng?**
> Chúng **đa hình** (polymorphic): một rating có thể trỏ tới reservation hoặc campaign; report trỏ tới user/listing/delivery/campaign. Dùng cặp `reference_type` + `reference_id` để linh hoạt, đánh đổi là không có ràng buộc FK ở mức DB (kiểm soát ở tầng ứng dụng).

**Q10. Xoá mềm (soft delete) là gì, vì sao dùng?**
> Đặt `deleted_at` thay vì xoá hẳn, để giữ lịch sử/đối soát và tránh hỏng quan hệ. Mọi truy vấn listing đều lọc `deleted_at IS NULL`.

### Nhóm 3 — Về nghiệp vụ & xử lý kỹ thuật khó

**Q11. Chống đặt trùng (2 người đặt cùng lúc món cuối) thế nào?**
> Dùng **khoá phân tán Redlock (Redis)** key `lock:reservation:{listingId}` (TTL 10s). Trong khoá mới kiểm tra số lượng + tạo reservation + giảm `quantity_remaining` trong **một transaction** atomic. Đảm bảo không bán quá số lượng.

**Q12. Mã QR có an toàn không? Người khác đoán được không?**
> QR token sinh từ `gen_random_bytes(32)` (64 ký tự hex ngẫu nhiên) — không đoán được, và `qr_expires_at` hết hạn sau 30 phút. Quét xong chuyển trạng thái `picked_up`.

**Q13. Xác thực khuôn mặt hoạt động ra sao?**
> Người nhận enroll trước (`face_descriptor`). Khi nhận hàng, chụp ảnh → trích vector → so khớp khoảng cách với vector đã lưu. Khớp mới cho `completed`. Chống mạo danh người nhận.

**Q14. Phân công shipper khi nhiều người cùng nhận?**
> Gửi 5 offer cho 5 shipper gần nhất (PostGIS), mỗi offer hết hạn 2 phút. Ai chấp nhận trước, trong transaction set `delivery.shipper_id` + `status=assigned` và **các offer còn lại thành expired**. Đảm bảo 1 đơn 1 shipper.

**Q15. Điểm uy tín (trust score) vận hành thế nào?**
> Bắt đầu 100. Vi phạm bị trừ (no-show -20, huỷ trễ -10, vi phạm ATTP -50), hành vi tốt được cộng. ≤60 hạn chế (1 đơn/ngày), ≤30 bị **ban** và thu hồi toàn bộ refresh token. Mọi thay đổi ghi vào `trust_score_history`.

**Q16. Vì sao tách `system_configs` thay vì hằng số trong code?**
> Để admin chỉnh runtime (giới hạn đặt/ngày, bán kính, hạn QR, ngưỡng điểm) mà không cần sửa code + deploy lại.

**Q17. Bảo mật xác thực gồm những gì?**
> Mật khẩu băm bcrypt (≥12 vòng); access token JWT 15 phút; refresh token băm lưu DB, xoay vòng mỗi lần refresh; ban thì revoke hết token; rate-limit endpoint `/auth/*`; Helmet + CORS whitelist.

**Q18. Hệ thống realtime hoạt động ra sao?**
> Socket.IO Gateway xác thực JWT khi kết nối, đưa client vào room `user:{id}`. Sự kiện `notification:new` (thông báo) và `delivery:location` (theo dõi shipper realtime). Ngoài app dùng FCM push.

### Nhóm 4 — Câu hỏi "bẫy" thường gặp

**Q19. Tại sao kiến trúc không có tầng Repository như mẫu Spring?**
> NestJS + Prisma: `PrismaService` chính là tầng truy cập dữ liệu (Data Access Layer), đã trừu tượng hoá DB. Thêm Repository sẽ thừa một lớp bọc. Service gọi thẳng PrismaService là pattern chuẩn của hệ sinh thái NestJS.

**Q20. Nếu dữ liệu lớn lên, có mở rộng được không?**
> Có: index hợp lý (GiST cho vị trí, B-tree cho khoá tra cứu), phân trang bắt buộc, Redis cache + queue BullMQ tách tải bất đồng bộ, connection pooler. Khi cần có thể tách đọc/ghi, đánh chỉ mục thêm theo truy vấn nóng.

**Q21. Vì sao có `menu_items` (JSON) trong kitchen_campaigns lại còn bảng campaign_menu_items?**
> `menu_items` (JSON) là cách lưu nhanh ban đầu (snapshot đơn giản). `campaign_menu_items` là bản chuẩn hoá, liên kết tới `recipes` để tái sử dụng công thức và thống kê `times_used`. Đây là bước tiến hoá schema khi tính năng công thức ra đời.

**Q22. Dữ liệu thời gian lưu thế nào, có vấn đề múi giờ không?**
> Tất cả dùng `timestamptz` (UTC). FE quy đổi sang giờ địa phương khi hiển thị → tránh lệch múi giờ.

**Q23. Có cơ chế kiểm toán/truy vết hành động không?**
> Có `audit_logs` ghi actor, action, đối tượng, IP, user-agent; cộng với các bảng *_history (trust, dedication) để truy vết minh bạch.

---

### Mẹo trình bày
- Mở đầu bằng **kiến trúc phân lớp** + **sơ đồ ERD**, rồi đi theo **luồng nghiệp vụ chính** (đặt chỗ → QR → giao hàng) để hội đồng thấy bức tranh trước khi vào chi tiết bảng.
- Khi bị hỏi sâu một bảng, luôn trả lời theo công thức: **bảng này phục vụ nghiệp vụ gì → cột quan trọng → quan hệ → ràng buộc/đặc biệt**.
- Nếu được hỏi điểm yếu, thành thật: "đang dùng `db push`, hướng cải tiến là `migrate` có lịch sử" — thể hiện hiểu vấn đề.
