# FoodResQ - Current System Flows For Slides

Copy one Mermaid block at a time into draw.io:

Arrange -> Insert -> Advanced -> Mermaid -> paste -> Insert.

## Flow 0 - Registration & Account Management

```mermaid
flowchart LR
  A["Create account<br/>Tạo tài khoản"]
  B["Verify email / OTP<br/>Xác thực email hoặc OTP"]
  C["Accept terms and policies<br/>Đồng ý điều khoản"]
  D{"Select role<br/>Chọn vai trò"}
  P["Provider profile<br/>Hồ sơ nhà cung cấp"]
  R["Receiver profile<br/>Hồ sơ người nhận"]
  V["Volunteer profile<br/>Hồ sơ tình nguyện viên"]
  O["Charity organization profile<br/>Hồ sơ tổ chức từ thiện"]
  E["Face eKYC if required<br/>Xác minh khuôn mặt nếu cần"]
  F["Submit verification documents<br/>Gửi giấy tờ / chứng chỉ"]
  G["Admin reviews profile<br/>Admin kiểm tra hồ sơ"]
  H{"Approved?<br/>Được duyệt?"}
  I["Activate role-based access<br/>Cấp quyền theo vai trò"]
  J["Reject or request update<br/>Từ chối hoặc yêu cầu bổ sung"]

  A --> B --> C --> D
  D --> P --> F
  D --> R --> E
  D --> V --> E --> F
  D --> O --> F
  F --> G --> H
  R --> I
  H -->|Yes| I
  H -->|No| J --> F
```

## Flow 1 - Provider Food Listing & Reservation

```mermaid
flowchart LR
  A["Provider creates food listing<br/>Provider tạo tin thực phẩm"]
  B["Add title, image, quantity, pickup time, expiry, location<br/>Nhập món, ảnh, số lượng, giờ nhận, hạn dùng, vị trí"]
  C["System stores pickup location with PostGIS<br/>Lưu vị trí bằng PostGIS"]
  D["Provider publishes listing<br/>Provider đăng tin"]
  E["Listing status = active<br/>Tin chuyển sang active"]
  F["Receiver searches nearby food<br/>Người nhận tìm món gần mình"]
  G["System filters by radius, expiry, quantity<br/>Lọc theo bán kính, hạn dùng, số lượng"]
  H["Receiver selects listing and quantity<br/>Chọn món và số lượng"]
  I["System checks daily limit and trust score<br/>Kiểm tra giới hạn ngày và điểm uy tín"]
  J["Redis locks listing quantity<br/>Redis khóa số lượng"]
  K["Transaction creates reservation and decreases remaining quantity<br/>Transaction tạo đơn và trừ tồn"]
  L["Generate QR token<br/>Sinh mã QR"]
  M["Provider sees pickup order<br/>Provider thấy đơn nhận hàng"]

  A --> B --> C --> D --> E --> F --> G --> H --> I --> J --> K --> L --> M
```

## Flow 2 - Receiver Self Pickup With QR

```mermaid
flowchart LR
  A["Receiver has confirmed reservation<br/>Người nhận có đơn đã xác nhận"]
  B["Receiver goes to provider location<br/>Đi đến điểm nhận"]
  C["Show QR code<br/>Xuất trình mã QR"]
  D["Provider scans QR<br/>Provider quét QR"]
  E{"QR valid and not expired?<br/>QR hợp lệ và chưa hết hạn?"}
  F["Confirm pickup<br/>Xác nhận nhận hàng"]
  G["Upload pickup proof / face verification if required<br/>Tải ảnh minh chứng / xác minh mặt nếu cần"]
  H["Reservation status = completed<br/>Đơn chuyển completed"]
  I["Receiver rates provider<br/>Người nhận đánh giá provider"]
  J["System updates trust score and ESG stats<br/>Cập nhật trust score và ESG"]
  X["Reject scan<br/>Từ chối xác nhận"]

  A --> B --> C --> D --> E
  E -->|Yes| F --> G --> H --> I --> J
  E -->|No| X
```

## Flow 3 - Volunteer Delivery Assignment

```mermaid
flowchart LR
  A["Receiver reserves food with delivery<br/>Người nhận đặt món có giao hàng"]
  B["System creates delivery = pending_assignment<br/>Tạo delivery chờ shipper"]
  C["Find nearby available shippers by PostGIS<br/>Tìm shipper gần nhất bằng PostGIS"]
  D["Broadcast task offers<br/>Gửi lời mời nhận đơn"]
  E{"Shipper accepts before offer expires?<br/>Shipper nhận trước khi hết hạn?"}
  F["Assign first accepted shipper<br/>Gán shipper đầu tiên nhận"]
  G["Expire remaining offers<br/>Hết hạn các offer còn lại"]
  H["Shipper goes to provider<br/>Shipper đến provider"]
  I["Confirm pickup / upload proof<br/>Xác nhận lấy hàng / ảnh minh chứng"]
  J["Deliver to receiver<br/>Giao cho người nhận"]
  K["Receiver confirms delivery<br/>Người nhận xác nhận"]
  L["Delivery status = delivered<br/>Đơn giao chuyển delivered"]
  M["Rate and award dedication points<br/>Đánh giá và cộng điểm cống hiến"]
  X["Re-broadcast or mark failed<br/>Gửi lại offer hoặc đánh dấu thất bại"]

  A --> B --> C --> D --> E
  E -->|Yes| F --> G --> H --> I --> J --> K --> L --> M
  E -->|No| X --> C
```

## Flow 4 - Bulk Run / Multi-stop Distribution

```mermaid
flowchart LR
  A["Create bulk run request<br/>Tạo yêu cầu phân phối số lượng lớn"]
  B["Define pickup source and multiple stops<br/>Khai báo điểm lấy và nhiều điểm phát"]
  C["Volunteer shipper accepts bulk run<br/>Shipper nhận chuyến bulk"]
  D["Go to pickup source<br/>Đến điểm lấy hàng"]
  E["Confirm pickup quantity<br/>Xác nhận số lượng lấy"]
  F["Navigate to stop 1..n<br/>Di chuyển qua các điểm phát"]
  G["Record served quantity, photo, note<br/>Ghi số suất, ảnh, ghi chú"]
  H{"More stops?<br/>Còn điểm phát?"}
  I["Record leftover servings<br/>Ghi nhận suất còn dư"]
  J["Complete bulk run<br/>Hoàn tất chuyến bulk"]
  K["Update history and volunteer points<br/>Cập nhật lịch sử và điểm TNV"]

  A --> B --> C --> D --> E --> F --> G --> H
  H -->|Yes| F
  H -->|No| I --> J --> K
```

## Flow 5 - Charity Kitchen Campaign

```mermaid
flowchart LR
  A["Charity creates campaign<br/>Tổ chức tạo chiến dịch"]
  B["System validates charity profile<br/>Hệ thống kiểm tra hồ sơ"]
  C["Admin reviews campaign<br/>Admin duyệt chiến dịch"]
  D{"Approved?<br/>Được duyệt?"}
  E["Campaign status = open<br/>Chiến dịch được mở"]
  F["Volunteers apply for chef / waiter / shipper<br/>TNV ứng tuyển vai trò"]
  G["Charity/Admin assigns volunteers<br/>Phân công tình nguyện viên"]
  H["Providers pledge donations<br/>Provider cam kết quyên góp"]
  I["Charity confirms received donations<br/>Tổ chức xác nhận đã nhận"]
  J["Campaign starts<br/>Chiến dịch bắt đầu"]
  K["Volunteers check in<br/>TNV check-in"]
  L["Chefs prepare meals<br/>Đầu bếp chuẩn bị món"]
  M{"Food safety check<br/>Kiểm tra ATTP"}
  N["Distribute meals<br/>Phân phát suất ăn"]
  O["Record meal distribution<br/>Ghi nhận số suất, ảnh, vị trí"]
  P["Collect beneficiary feedback<br/>Nhận phản hồi người thụ hưởng"]
  Q["Complete campaign<br/>Hoàn tất chiến dịch"]
  R["Update impact and dedication points<br/>Cập nhật tác động và điểm TNV"]
  X["Reject / request changes<br/>Từ chối hoặc yêu cầu sửa"]
  Y["Notify charity and handle issue<br/>Cảnh báo tổ chức và xử lý"]

  A --> B --> C --> D
  D -->|No| X --> A
  D -->|Yes| E
  E --> F --> G
  E --> H --> I
  G --> J
  I --> J
  J --> K --> L --> M
  M -->|Pass| N --> O --> P --> Q --> R
  M -->|Warning / Fail| Y --> M
```

## Flow 6 - Provider Donation To Campaign

```mermaid
flowchart LR
  A["Provider opens campaign list<br/>Provider mở danh sách chiến dịch"]
  B["Select open / in-progress campaign<br/>Chọn chiến dịch đang mở"]
  C["Pledge ingredients<br/>Cam kết nguyên liệu"]
  D["System creates donation = pledged<br/>Tạo donation trạng thái pledged"]
  E["Notify charity<br/>Thông báo tổ chức"]
  F["Charity receives ingredients<br/>Tổ chức nhận nguyên liệu"]
  G["Charity confirms donation<br/>Tổ chức xác nhận donation"]
  H["Donation status = received<br/>Donation chuyển received"]
  I["Notify provider<br/>Thông báo provider"]

  A --> B --> C --> D --> E --> F --> G --> H --> I
```

## Flow 7 - Kitchen Operation: Safety Log, Distribution, Feedback

```mermaid
flowchart LR
  A["Campaign in progress<br/>Chiến dịch đang chạy"]
  B["Chef records safety log<br/>Chef ghi nhật ký ATTP"]
  C{"Result?<br/>Kết quả?"}
  D["Pass: continue cooking<br/>Đạt: tiếp tục nấu"]
  E["Warning / Fail: notify charity<br/>Cảnh báo / lỗi: báo tổ chức"]
  F["Waiter records distribution round<br/>Waiter ghi đợt phân phát"]
  G["Input servings, people served, leftover, photo, location<br/>Nhập suất phát, người nhận, suất dư, ảnh, vị trí"]
  H["System updates distribution summary<br/>Cập nhật tổng hợp phân phát"]
  I["Beneficiary submits feedback<br/>Người thụ hưởng gửi phản hồi"]
  J["Store satisfaction and comment<br/>Lưu mức hài lòng và bình luận"]

  A --> B --> C
  C -->|Pass| D --> F
  C -->|Warning / Fail| E --> B
  F --> G --> H --> I --> J
```

## Flow 8 - Campaign Volunteer Task Progress

```mermaid
flowchart LR
  A["Volunteer assigned to campaign<br/>TNV được phân công"]
  B["Open my task<br/>Mở nhiệm vụ của tôi"]
  C["Check in with proof photo<br/>Check-in kèm ảnh minh chứng"]
  D["Status = checked_in<br/>Trạng thái checked_in"]
  E["Start task<br/>Bắt đầu nhiệm vụ"]
  F["Status = in_progress<br/>Trạng thái in_progress"]
  G["Complete task with proof photo<br/>Hoàn thành kèm ảnh minh chứng"]
  H["Status = completed<br/>Trạng thái completed"]
  I["Award dedication points<br/>Cộng điểm cống hiến"]
  J["Save points history<br/>Lưu lịch sử điểm"]

  A --> B --> C --> D --> E --> F --> G --> H --> I --> J
```

## Flow 9 - Trust Score, Report & Account Enforcement

```mermaid
flowchart LR
  A["User performs system action<br/>User thực hiện hành động"]
  B{"Violation or good behavior?<br/>Vi phạm hay hành vi tốt?"}
  C["No-show / late cancel / food safety violation<br/>Không đến / hủy trễ / vi phạm ATTP"]
  D["Create trust score history<br/>Ghi lịch sử điểm uy tín"]
  E["Update trust score<br/>Cập nhật điểm uy tín"]
  F{"Score threshold?<br/>Đạt ngưỡng xử lý?"}
  G["Restrict account<br/>Hạn chế tài khoản"]
  H["Ban account and revoke refresh tokens<br/>Ban tài khoản và thu hồi token"]
  I["Normal access<br/>Tiếp tục sử dụng bình thường"]
  J["User submits report<br/>User gửi tố cáo"]
  K["Admin reviews report<br/>Admin xử lý tố cáo"]

  A --> B
  B -->|Violation| C --> D --> E --> F
  B -->|Report issue| J --> K --> D
  F -->|Score <= 30| H
  F -->|Score <= 60| G
  F -->|Safe| I
```

## Flow 10 - Admin Governance

```mermaid
flowchart LR
  A["Admin logs in<br/>Admin đăng nhập"]
  B["Open dashboard<br/>Mở dashboard"]
  C["Review verification requests<br/>Duyệt hồ sơ xác minh"]
  D["Review campaigns<br/>Duyệt chiến dịch"]
  E["Review reports<br/>Xử lý tố cáo"]
  F["Manage users and listings<br/>Quản lý user và listing"]
  G{"Decision<br/>Quyết định"}
  H["Approve / activate<br/>Duyệt / kích hoạt"]
  I["Reject / request update<br/>Từ chối / yêu cầu bổ sung"]
  J["Suspend or ban account<br/>Tạm khóa hoặc ban"]
  K["Write audit log<br/>Ghi audit log"]

  A --> B
  B --> C --> G
  B --> D --> G
  B --> E --> G
  B --> F --> G
  G --> H --> K
  G --> I --> K
  G --> J --> K
```

## Flow 11 - Notification & Realtime Update

```mermaid
flowchart LR
  A["Business event happens<br/>Có sự kiện nghiệp vụ"]
  B["Create notification record<br/>Tạo notification trong DB"]
  C["Socket.IO emits to user room<br/>Socket.IO gửi tới room user"]
  D{"User online?<br/>User đang online?"}
  E["Show realtime notification<br/>Hiển thị thông báo realtime"]
  F["Queue FCM push job<br/>Đưa job push FCM vào queue"]
  G["Send push notification<br/>Gửi push notification"]
  H["Mark as read later<br/>User đánh dấu đã đọc"]

  A --> B --> C --> D
  D -->|Yes| E --> H
  D -->|No| F --> G --> H
```

## Flow 12 - Recipe & Campaign Menu

```mermaid
flowchart LR
  A["Chef creates recipe<br/>Chef tạo công thức"]
  B["Add ingredients and instructions<br/>Nhập nguyên liệu và cách làm"]
  C["Recipe is saved<br/>Lưu công thức"]
  D["Charity opens campaign menu<br/>Tổ chức mở menu chiến dịch"]
  E{"Use recipe or custom dish?<br/>Dùng công thức hay món tự nhập?"}
  F["Select recipe<br/>Chọn công thức"]
  G["Create custom menu item<br/>Tạo món tự nhập"]
  H["Set planned servings<br/>Nhập số suất dự kiến"]
  I["Add item to campaign menu<br/>Thêm vào menu chiến dịch"]
  J["Increase recipe times_used if linked<br/>Tăng số lần dùng nếu gắn công thức"]

  A --> B --> C --> D --> E
  E -->|Recipe| F --> H --> I --> J
  E -->|Custom| G --> H --> I
```

## Flow 13 - ESG / Impact Reporting

```mermaid
flowchart LR
  A["Reservation, delivery, or campaign completed<br/>Đơn / giao hàng / chiến dịch hoàn tất"]
  B["System aggregates rescued food and servings<br/>Tổng hợp thực phẩm cứu trợ và số suất"]
  C["Calculate CO2 saved and impact metrics<br/>Tính CO2 tiết kiệm và chỉ số tác động"]
  D["Create ESG snapshot<br/>Tạo ESG snapshot"]
  E["Provider views ESG dashboard<br/>Provider xem dashboard ESG"]
  F["Admin views system analytics<br/>Admin xem phân tích toàn hệ thống"]
  G["Use metrics for defense/report<br/>Dùng số liệu cho báo cáo"]

  A --> B --> C --> D
  D --> E
  D --> F
  E --> G
  F --> G
```
