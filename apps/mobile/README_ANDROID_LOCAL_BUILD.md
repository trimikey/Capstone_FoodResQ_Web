# FoodResQ Mobile — hướng dẫn build Android local

Tài liệu này ghi lại quy trình từ lúc clone dự án mới về đến khi build/cài app Android trên emulator/simulator bằng `expo run:android`.

## 1. Yêu cầu máy local

- **Node.js**: khuyến nghị Node 20 LTS trở lên.
- **pnpm**: dự án đã dùng `pnpm@11.8.0`.
- **Android Studio**: cài Android SDK, Android SDK Platform Tools, emulator Android.
- **JDK**: dùng JDK tương thích với Android Gradle Plugin của dự án.
- **Backend đang chạy**: mobile gọi API NestJS ở port `3001`.

Kiểm tra nhanh:

```bash
node -v
pnpm -v
adb version
```

Nếu chưa có pnpm:

```bash
npm install -g pnpm@11.8.0
```

## 2. Clone và cài dependency

Từ thư mục muốn chứa project:

```bash
git clone <repo-url>
cd Capstone_FoodResQ_Web
pnpm install
```

Generate Prisma client cho backend:

```bash
pnpm db:generate
```

## 3. Cấu hình backend

Tạo/cập nhật file:

```text
apps/api/.env
```

Các biến quan trọng:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
```

Ghi chú:

- PostgreSQL hiện dùng cloud/Supabase, không bắt buộc cài PostgreSQL local.
- Redis hiện dùng Upstash Redis qua `REDIS_URL`.
- Không commit file `.env` hoặc secret thật.

Test nhanh Redis nếu cần:

```bash
pnpm --filter @foodresq/api exec node -e "const Redis=require('ioredis'); const r=new Redis(process.env.REDIS_URL); r.ping().then(x=>{console.log(x); return r.quit();}).catch(e=>{console.error(e); process.exit(1);})"
```

Chạy backend:

```bash
pnpm --filter @foodresq/api dev
```

Mở kiểm tra:

```text
http://localhost:3001/api/docs
```

## 4. Cấu hình mobile env

Tạo/cập nhật file:

```text
apps/mobile/.env
```

Nếu chạy Android emulator:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api/v1
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Nếu chạy thiết bị thật cùng Wi-Fi:

```env
EXPO_PUBLIC_API_URL=http://<LAN-IP-cua-may-tinh>:3001/api/v1
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

Ví dụ LAN IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.4:3001/api/v1
```

Lưu ý:

- Android emulator không gọi được `localhost` của máy host bằng `localhost`; phải dùng `10.0.2.2`.
- Thiết bị thật phải dùng IP LAN của máy đang chạy backend.
- Nếu dùng Google Sign-In/Firebase native, cần file `apps/mobile/google-services.json`.
- Firebase Android app phải dùng package name `com.foodresq.mobile`.

## 5. Chuẩn bị Android emulator

Mở Android Studio:

1. Vào **Device Manager**.
2. Tạo hoặc mở một Android emulator.
3. Ưu tiên image có **Google Play** nếu cần Google Sign-In.
4. Đảm bảo emulator đã boot xong trước khi build.

Kiểm tra thiết bị:

```bash
adb devices
```

Phải thấy device ở trạng thái `device`.

## 6. Build và chạy app Android

Từ root repo:

```bash
pnpm --filter mobile android
```

Lệnh này tương đương:

```bash
cd apps/mobile
pnpm android
```

Expo sẽ chạy:

```bash
expo run:android
```

Lần đầu có thể lâu vì Gradle tải dependency:

- Gradle distribution, ví dụ `gradle-9.3.1-bin.zip`.
- Android NDK, ví dụ `27.1.12297006`.
- Các Android build cache.

Nếu thấy warning dạng SDK XML version khác nhau nhưng build vẫn chạy tiếp thì thường có thể bỏ qua.

Build thành công khi log có:

```text
BUILD SUCCESSFUL
```

Sau đó Expo sẽ cài app debug lên emulator và mở Metro/dev server.

## 7. Các lỗi đã gặp và cách sửa

### 7.1. Lỗi `resource color/iconBackground not found`

Triệu chứng:

```text
AAPT: error: resource color/iconBackground not found
```

File liên quan:

```text
apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
```

Cách sửa đã áp dụng:

```xml
<!-- apps/mobile/android/app/src/main/res/values/colors.xml -->
<color name="iconBackground">#FFFFFF</color>
```

### 7.2. Lỗi Kotlin `Unresolved reference: R` hoặc `BuildConfig`

Triệu chứng:

```text
Unresolved reference 'R'
Unresolved reference 'BuildConfig'
```

Nguyên nhân trong phiên này:

- Kotlin package là `com.foodresq.mobile`.
- `app.json` cũng khai báo Android package là `com.foodresq.mobile`.
- Nhưng `android/app/build.gradle` trước đó dùng `com.foodresq`.

Cách sửa đã áp dụng:

```gradle
// apps/mobile/android/app/build.gradle
namespace "com.foodresq.mobile"

defaultConfig {
    applicationId "com.foodresq.mobile"
}
```

### 7.3. Generated autolinking vẫn trỏ `com.foodresq.BuildConfig`

Triệu chứng:

```text
ReactNativeApplicationEntryPoint.java
package com.facebook.react;
...
com.foodresq.BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
```

Nguyên nhân:

- Cache autolinking cũ trong `apps/mobile/android/build/generated/autolinking`.
- File generated vẫn giữ package cũ `com.foodresq`.

Cách xử lý:

```bash
cd apps/mobile/android
./gradlew clean
```

Nếu vẫn lỗi, xóa cache generated rồi build lại.

PowerShell:

```powershell
Remove-Item -Recurse -Force .\build\generated\autolinking
```

Git Bash:

```bash
rm -rf build/generated/autolinking
```

Sau đó chạy lại từ root repo:

```bash
pnpm --filter mobile android
```

### 7.4. Thiếu `google-services.json`

Triệu chứng có thể gặp ở bước cấu hình native/Firebase:

```text
File google-services.json is missing
```

Cách xử lý:

1. Vào Firebase Console.
2. Chọn Android app package `com.foodresq.mobile`.
3. Tải `google-services.json`.
4. Đặt file tại:

```text
apps/mobile/google-services.json
```

Không commit file này.

## 8. Lệnh debug hữu ích

Build Android với log chi tiết:

```bash
cd apps/mobile/android
./gradlew.bat app:assembleDebug -x lint -x test --configure-on-demand --build-cache -PreactNativeDevServerPort=8081 -PreactNativeArchitectures=x86_64 --stacktrace --info
```

Clean Gradle:

```bash
cd apps/mobile/android
./gradlew.bat clean
```

Kiểm tra config Expo:

```bash
pnpm --filter mobile exec expo config --json
```

Kiểm tra autolinking package:

```bash
pnpm --filter mobile exec expo-modules-autolinking react-native-config --platform android
```

Kiểm tra process theo port:

```powershell
Get-NetTCPConnection -LocalPort 3001,8081 -ErrorAction SilentlyContinue
```

## 9. Thứ tự chạy khuyến nghị sau khi clone mới

Terminal 1 — backend:

```bash
cd Capstone_FoodResQ_Web
pnpm install
pnpm db:generate
pnpm --filter @foodresq/api dev
```

Terminal 2 — Android build:

```bash
cd Capstone_FoodResQ_Web
pnpm --filter mobile android
```

Nếu build lỗi do cache Android:

```bash
cd apps/mobile/android
./gradlew.bat clean
```

Sau đó quay lại root và chạy lại:

```bash
cd ../../..
pnpm --filter mobile android
```

## 10. Checklist trước khi báo build lỗi

- `adb devices` thấy emulator ở trạng thái `device`.
- Backend chạy được ở `http://localhost:3001/api/docs`.
- `apps/mobile/.env` dùng đúng URL:
  - Emulator: `http://10.0.2.2:3001/api/v1`
  - Máy thật: `http://<LAN-IP>:3001/api/v1`
- `apps/mobile/google-services.json` tồn tại nếu build native có Firebase/Google Sign-In.
- `android/app/build.gradle` dùng `com.foodresq.mobile`.
- Đã clean/xóa autolinking cache nếu log còn trỏ `com.foodresq.BuildConfig`.

