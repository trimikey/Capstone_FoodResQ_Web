# FoodResQ — Kịch bản Demo bảo vệ (35 phút)

**Capstone SP26SE088 | FPT University**
Hai luồng xuyên suốt, kết hợp Web + Mobile, một câu chuyện duy nhất: *một quán ăn dư 20 suất cơm
và một bếp thiện nguyện nấu 100 suất cho bệnh nhân* .

---

## 0. Phân vai & thiết bị

Không có MC riêng — **ai thao tác phần nào thì tự thuyết minh phần đó**, để cả 4 thành viên đều
được hội đồng nghe và hỏi.

| Vai | Người | Thiết bị | Đăng nhập sẵn |
|---|---|---|---|
| **Nhà cung cấp + Admin** | **SV1** | Laptop chiếu — profile 1 & 2 | tài khoản NCC (`tiembanhmattroi@foodresq.vn`) và `admin@foodresq.vn` |
| **Người nhận + Bếp trưởng** | **SV2** | Laptop chiếu — profile 3, và Điện thoại B | tài khoản người nhận cá nhân (đã eKYC) trên web; TNV bếp trên app |
| **Shipper** | **SV3** | Điện thoại A (mirror lên máy chiếu) | TNV shipper trên app |
| **Tổ chức từ thiện** | **SV4** | Laptop chiếu — profile 4 | tài khoản tổ chức (`beptuthien@foodresq.vn`) |

> **Chiếu màn hình**: một laptop duy nhất, mở sẵn 4 profile trình duyệt cho 4 vai, chia đôi màn
> hình — trái là Web, phải là màn hình điện thoại (scrcpy hoặc ứng dụng mirror). Người xem phải
> thấy đồng thời hai phía, đó là điểm mạnh của bài demo.
>
> **Chuyển lượt**: dùng một bàn phím/chuột không dây chuyền tay, hoặc đổi chỗ ngồi theo bảng
> thời gian bên dưới. Tập trước ít nhất 2 lần cho mượt chỗ chuyển người.

**Phân bổ thời gian nói** (để không ai bị lép vế trước hội đồng):

| Người | Vai | Tổng thời gian cầm mic |
|---|---|---|
| SV1 | Mở đầu, Nhà cung cấp, Admin | ~8 phút |
| SV2 | Người nhận, Bếp trưởng | ~8 phút |
| SV3 | Shipper (cả 2 luồng) | ~8 phút |
| SV4 | Tổ chức từ thiện, Kết | ~11 phút |

---

## 1. Chuẩn bị trước giờ G (làm xong trước 60 phút)

### 1.1 Hệ thống
- [ ] Mở `https://capstone-foodresq-web.onrender.com/api/docs` để **đánh thức API trên Render**
      (bản free ngủ sau 15 phút không traffic). Mở lại ngay trước khi vào phòng.
- [ ] Mở web `https://capstone-food-res-q-web-web.vercel.app`, đăng nhập sẵn **4 profile trình duyệt** cho 4 vai (NCC, Admin, người nhận, tổ chức).
- [ ] Điện thoại: cài sẵn bản build FoodResQ (không dùng Expo Go), đã đăng nhập, **đã cấp quyền
      vị trí + camera + thông báo**. Mở app ít nhất 1 lần để nhận FCM token.
- [ ] Wifi/4G dự phòng; chuẩn bị **điện thoại thứ 3** cài sẵn app phòng khi 1 máy lỗi.

### 1.2 Cấu hình hệ thống (Admin → Cấu hình)
| Khóa | Giá trị demo | Lý do |
|---|---|---|
| `CAMPAIGN_ALLOW_EARLY_START_AND_CHECKIN` | `1` | cho phép điểm danh và nấu trước giờ lịch, nếu không phải chờ đúng ngày giờ chiến dịch |
| `CAMPAIGN_MIN_FILL_PERCENT` | `0` | không bị chặn vì thiếu TNV xác nhận ca |
| `QR_VALIDITY_MINUTES` | `30` (mặc định) | đủ cho buổi demo |
| `DELIVERY_CLAIM_WINDOW_MINUTES` | `30` (mặc định) | đơn giao ngay còn nằm trong danh sách 30 phút, thừa sức cho buổi demo |
| `DELIVERY_SCHEDULED_CUTOFF_MINUTES` | `0` | nếu demo đơn **hẹn giờ**: mặc định đóng nhận trước giờ hẹn 15 phút, đặt 0 để nhận được tới tận phút hẹn |

### 1.3 Dữ liệu mồi
- [ ] Tài khoản người nhận cá nhân **đã đăng ký khuôn mặt (eKYC)** — chưa enroll thì không đặt được.
- [ ] Shipper: đã xác minh (`approved`), **đã đăng ký ca giao hàng đúng khung giờ demo**
      (bắt buộc — không có ca là nút nhận đơn bị mờ), vị trí GPS gần điểm lấy hàng (< 5 km).
- [ ] Shipper **không được nhận ca chiến dịch trùng khung giờ đó**, vì hệ thống coi là đang bận
      và chặn nhận đơn lẻ.
- [ ] Chiến dịch dự phòng đã ở trạng thái "đang chạy" (phòng khi luồng 2 kẹt ở bước duyệt).
- [ ] 1 listing dự phòng đang `active` với khung giờ nhận bao trùm giờ demo.

### 1.4 Ba rủi ro phải biết trước
1. **Shipper phải đăng ký ca trước.** Mô hình nhận đơn là "chợ đơn": đơn chờ hiện thành danh sách
   trong bán kính 5 km và shipper tự bấm nhận, nhưng chỉ nhận được đơn nằm trong ca đã đăng ký.
   Quên đăng ký ca là nút nhận bị mờ ngay trên sân khấu.
2. **Đơn giao ngay chỉ nằm trong danh sách 30 phút** rồi bị huỷ nếu không ai nhận. Với đơn hẹn giờ,
   hệ thống đóng nhận trước giờ hẹn 15 phút, nên khi demo hãy đặt
   `DELIVERY_SCHEDULED_CUTOFF_MINUTES = 0` hoặc dùng đơn giao ngay.
3. **Đặt chỗ chỉ được trong khung `pickup_start_time → pickup_end_time`** của listing. Khi tạo món
   ở bước 2.1, đặt khung giờ rộng, ví dụ từ bây giờ đến 23:00.

---

## 2. LUỒNG 1 — Giải cứu suất ăn dư (12 phút)

> **Câu chuyện**: 14h, quán cơm còn 20 suất chưa bán hết. Thay vì bỏ đi, họ đăng lên FoodResQ.

| Phút | Vai / Thiết bị | Thao tác | Lời dẫn |
|---|---|---|---|
| 0:00–1:30 | **SV1** — Web (NCC) | `/provider/create`: tạo món — tên, số suất, **khung giờ nhận**, ảnh, địa chỉ lấy hàng (chọn trên bản đồ) → **Đăng** | "Nhà cung cấp chỉ mất 30 giây để đăng phần dư. Toạ độ lấy hàng được lưu dạng không gian PostGIS." |
| 1:30–3:00 | **SV2** — Web (người nhận) | Trang chủ → danh sách quanh đây, nhìn thấy món vừa đăng kèm **khoảng cách** | "Người nhận chỉ thấy các điểm trong bán kính 5 km, sắp xếp theo khoảng cách thật, truy vấn bằng `ST_DWithin`." |
| 3:00–5:00 | **SV2** — Web (người nhận) | Mở món → chọn số suất → **chọn hình thức nhận: giao tận nơi** → địa chỉ + thời gian nhận → Đặt | "Đặt chỗ chạy trong một giao dịch có khoá Redis, nên 100 người bấm cùng lúc cũng không bao giờ vượt quá số suất còn lại." |
| 5:00–6:00 | **SV2** — Web (người nhận) | Màn hình đơn hiện **mã QR + mã đơn** | "Mã QR sống 30 phút, đây là bằng chứng giao đúng người." |
| 6:00–8:00 | **SV3** — Điện thoại A | Mở tab **Giao hàng**: đơn vừa tạo nằm trong danh sách đơn chờ kèm khoảng cách, quãng đường và giờ hẹn → bấm **Nhận đơn** | "Shipper là tình nguyện viên, không phải nhân viên, nên hệ thống không ép ai nhận đơn. Mọi đơn trong bán kính 5 km hiện thành danh sách, ai rảnh thì nhận. Nhưng chỉ nhận được đơn nằm trong ca mình đã đăng ký, và ai đang có ca chiến dịch trùng giờ thì bị coi là bận — nhờ vậy đơn không rơi vào tay người không thể đi." |
| 8:00–10:30 | **SV3** — Điện thoại A | Màn hình đơn đang chạy: **Đến lấy hàng** → chụp **ảnh QC** → **Bắt đầu giao** (bản đồ chạy theo GPS) | "Ảnh QC là bằng chứng tình trạng món lúc nhận. Vị trí shipper đẩy realtime qua WebSocket." |
| 10:30–11:30 | **SV3** quét màn hình của SV2 | Bấm **Quét QR người nhận** → quét mã QR đang hiển thị trên web → đơn chuyển **Đã giao** | "Không quét được QR thì không thể bấm hoàn thành. Đây là chốt chặn chống gian lận." |
| 11:30–12:00 | **SV2** — Web (người nhận) | `/history`: đơn nằm ở tab **Đã nhận**; điểm uy tín +2 | "Mỗi lần nhận đúng hẹn cộng điểm uy tín; không đến bị trừ 20 và có thể bị khoá." |

**Nếu đơn không hiện trong danh sách**: kiểm tra theo thứ tự — shipper đã đăng ký ca khung giờ này
chưa, GPS có đang ở trong bán kính 5 km quanh điểm lấy hàng không, và đơn có phải loại hẹn giờ đã
quá mốc đóng nhận không. Phương án dự phòng: mở `/deliveries` trên web của shipper để nhận bằng web,
vừa nói "shipper dùng được cả hai kênh".

---

## 3. LUỒNG 2 — Bếp ăn thiện nguyện (18 phút)

> **Câu chuyện**: một tổ chức từ thiện nấu 100 suất cho người nhà bệnh nhân, cần nguyên liệu từ
> nhà cung cấp và cần tình nguyện viên.

| Phút | Vai / Thiết bị | Thao tác | Lời dẫn |
|---|---|---|---|
| 0:00–2:30 | **SV4** — Web (tổ chức) | `/campaigns` → **Tạo chiến dịch**: tên, bếp + toạ độ, ngày giờ vận hành, thực đơn, **ca trực và số lượng TNV theo vai** (bếp / phục vụ / shipper) | "Chiến dịch được chia theo ca và theo vai trò, không gom một cục." |
| 2:30–3:30 | **SV1** — Web (Admin) | `/admin` → Chiến dịch chờ duyệt → **Duyệt** | "Admin kiểm duyệt trước khi chiến dịch được mở tuyển, tránh chiến dịch ảo." |
| 3:30–5:00 | **SV4** — Web (tổ chức) | Mở chiến dịch → **Tuyển tình nguyện viên** (mở tuyển / mời trực tiếp) → thấy TNV đăng ký và **xác nhận ca** | "Cửa sổ tuyển đóng trước giờ chạy một khoảng đệm; tổ chức biết trước có đủ người hay không." |
| 5:00–6:30 | **SV4** — Web (tổ chức) | Tab **Hậu cần** → **Gửi yêu cầu nguyên liệu** tới nhà cung cấp: món, khối lượng, ngày giờ lấy, **cần vận chuyển** | "Tổ chức không tự đi chợ, họ đặt hàng chính các nhà cung cấp đang dư thực phẩm." |
| 6:30–7:30 | **SV1** — Web (NCC) | `/provider/requests` → **Chấp nhận** yêu cầu | "Nhà cung cấp chủ động duyệt, có hạn 24 giờ, quá hạn hệ thống tự đóng." |
| 7:30–9:30 | **SV3** — Điện thoại A | Nhận nhiệm vụ lấy nguyên liệu → tới NCC → nhập **số kg thực nhận** + ảnh → Xác nhận | "Số kg thực nhận luôn được ghi lại, vì hàng quyên góp hiếm khi đúng bằng số đăng ký. Đây là dữ liệu cho báo cáo ESG." |
| 9:30–10:30 | **SV4** — Web (tổ chức) | Tab Hậu cần: chuyến chuyển sang **Đã nhận**, tổ chức xác nhận nhập kho | "Đủ nguyên liệu thì bếp mới mở khâu nấu." |
| 10:30–13:00 | **SV2** — Điện thoại B | Đăng nhập TNV bếp → chiến dịch → **Điểm danh** (có ghi nhận đi trễ bao nhiêu phút) → mở món → tick theo 4 khâu: **Sơ chế → Nấu → Trình bày → Sẵn sàng phát**, mỗi khâu **kèm ảnh** | "Khâu sau chỉ mở khi khâu trước xong và đã tới giờ. Mỗi khâu bắt buộc có ảnh, không có ảnh không qua." |
| 13:00–14:30 | **SV4** — Web (tổ chức) | Tab **Bếp**: xem ảnh từng khâu → **Duyệt món** (hoặc Từ chối kèm lý do, bếp phải làm lại) | "Tổ chức là người kiểm soát chất lượng cuối cùng trước khi phát cho người dân." |
| 14:30–16:30 | **SV4** — Web + **SV3** Điện thoại A | Web tổ chức: tab **Phân phát** → tạo đợt phát, chọn điểm phát và **phân công TNV**. Điện thoại: TNV nhận nhiệm vụ, tới điểm phát, **quét QR của người nhận** để ghi nhận từng suất | "Mỗi suất phát ra đều gắn với một người nhận cụ thể qua QR, nên số liệu không phải do ai đó tự khai." |
| 16:30–18:00 | **SV4** — Web (tổ chức) | Tab **Báo cáo**: tổng suất đã phát, số người nhận, số kg nguyên liệu, điểm cống hiến của TNV → **Hoàn thành chiến dịch** | "Kết thúc chiến dịch, mọi con số đều truy vết được tới từng ảnh và từng lần quét QR." |

---

## 4. Mở đầu và kết thúc

| Phần — người nói | Nội dung |
|---|---|
| **Mở đầu (3 phút)** — **SV1** | Vấn đề: thực phẩm dư bị bỏ đi trong khi nhiều người thiếu ăn. Giải pháp: 4 vai — Nhà cung cấp, Người nhận, Tình nguyện viên, Tổ chức từ thiện. Nêu trước hai luồng sắp demo. |
| **Kết (2 phút)** — **SV4** | Nhắc lại điểm kỹ thuật nổi bật: tìm kiếm theo bán kính PostGIS, khoá Redis chống đặt trùng, nhận đơn theo ca đã đăng ký, eKYC khuôn mặt, QR hai đầu, điểm uy tín và điểm cống hiến. Kết bằng trang Tác động (ESG). |

---

## 5. Bảng tổng thời gian

| Phần | Thời lượng |
|---|---|
| Mở đầu | 3 phút |
| Luồng 1 — Giải cứu suất ăn dư | 12 phút |
| Luồng 2 — Bếp ăn thiện nguyện | 18 phút |
| Kết | 2 phút |
| **Tổng** | **35 phút** |

> Còn 5 phút đệm nếu hội đồng cho khung 40 phút. Nếu bị thúc thời gian, cắt theo thứ tự:
> (1) phần tuyển TNV ở luồng 2, nói bằng lời thay vì thao tác; (2) trang Báo cáo cuối;
> (3) bước ảnh QC ở luồng 1.

---

## 6. Câu hỏi hội đồng hay hỏi — trả lời ngắn

| Câu hỏi | Trả lời |
|---|---|
| Hai người đặt cùng lúc suất cuối thì sao? | Khoá phân tán Redis trên từng listing, giảm tồn kho và tạo đơn trong cùng một giao dịch, nên không bao giờ âm kho. |
| Làm sao biết giao đúng người? | Người nhận có mã QR riêng, shipper bắt buộc quét mới hoàn tất được đơn; ngoài ra người nhận cá nhân phải đăng ký khuôn mặt khi tạo tài khoản. |
| Đặt rồi không đến thì sao? | Cron quét đơn quá hạn QR, chuyển thành "không đến", hoàn kho và trừ 20 điểm uy tín. Dưới 60 điểm bị hạn chế, dưới 30 bị khoá. |
| Vì sao không tự động gán shipper mà để họ tự nhận? | Shipper là tình nguyện viên, không có ràng buộc lao động, nên ép nhận đơn sẽ dẫn tới bỏ ngang giữa đường. Thay vào đó hệ thống ràng ở đầu vào: chỉ ai đã đăng ký ca đúng khung giờ, ở trong bán kính 5 km và không vướng ca chiến dịch mới thấy nút nhận. |
| Không shipper nào nhận đơn? | Đơn giao ngay nằm trong danh sách chờ 30 phút; đơn hẹn giờ đóng nhận trước giờ hẹn 15 phút. Hết hạn thì cron huỷ đơn, hoàn kho và báo người nhận đặt lại, không trừ điểm ai. |
| Hai shipper cùng bấm nhận một đơn? | Lệnh nhận kiểm tra đơn vẫn `pending_assignment` và chưa có `shipper_id`; người bấm sau nhận thông báo đơn đã có người nhận. |
| Chi phí vận hành, ai trả tiền ship? | Shipper là tình nguyện viên, được ghi nhận bằng điểm cống hiến và thứ hạng, không thu phí người nhận. |
| Số liệu báo cáo có tin được không? | Mỗi con số đều gắn với bằng chứng: ảnh từng khâu nấu, số kg thực nhận, và mỗi suất phát ra là một lần quét QR. |
