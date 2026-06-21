# FoodResQ Mobile

App di động FoodResQ — **Expo SDK 56 + React Native 0.85 + [Expo Router](https://docs.expo.dev/router/introduction/)**.
Một app trong monorepo `Capstone_FoodResQ_Web` (pnpm workspaces); backend NestJS ở `apps/api`.

> 📚 Toàn bộ link tài liệu chính thức gom ở [§9](#9-tài-liệu-chính-thức). Mỗi bước bên dưới có link tới đúng mục cần đọc.

---

## 1. Onboarding — chạy app trong 6 bước

Đường đi **khuyến nghị** (build qua EAS, dùng chung keystore → **không phải tự thêm SHA-1**):

- [ ] **1.** Nhờ chủ project mời vào **Expo org `foodresq-team`** + **Firebase project `foodresq-53ae8`** (theo email).
- [ ] **2.** `git pull` rồi `corepack pnpm install` (từ gốc monorepo).
- [ ] **3.** Tạo `apps/mobile/.env` và `apps/api/.env` — xin giá trị thật từ chủ project qua kênh **riêng tư**. Xem [§3](#3-cấu-hình).
- [ ] **4.** Tải `google-services.json` từ Firebase Console → đặt vào `apps/mobile/`. Xem [§3.2](#32-google-servicesjson-firebase).
- [ ] **5.** Chạy backend: `cd apps/api && corepack pnpm dev` (DB + Redis đã deploy cloud — **không cần docker**).
- [ ] **6.** Build dev client + chạy app. Xem [§4](#4-chạy-app).

> Chỉ khi **build local** (không dùng EAS) mới phải tự thêm SHA-1 máy mình — xem [§5](#5-firebase-chỉ-khi-dựng-lại-hoặc-build-local).

---

## 2. Yêu cầu môi trường

| Cần | Ghi chú | Tài liệu |
|---|---|---|
| **Node ≥ 20** + corepack | dùng `corepack pnpm` (không cài pnpm global) | [corepack](https://nodejs.org/api/corepack.html) · [pnpm](https://pnpm.io/installation) |
| **JDK 17** + Android SDK + `adb` | 1 emulator bản **Google Play** (cần cho Google Sign-In / Phone OTP), không phải "Google APIs" | [Expo: set up environment](https://docs.expo.dev/get-started/set-up-your-environment/) |
| Tài khoản **Expo** | để build dev client qua EAS | [EAS Build](https://docs.expo.dev/build/introduction/) |

> ⚠️ **`react-native-worklets` phải đúng `0.8.3`** (peer của Reanimated 4.3.1 + Expo SDK 56). Version khác gây crash `"undefined is not a function"` toàn app → `npx expo install react-native-worklets@0.8.3`.

---

## 3. Cấu hình

### 3.1. Biến môi trường `apps/mobile/.env`
Không commit (đã gitignore). Biến `EXPO_PUBLIC_*` được inline vào bundle — xem [Expo: Environment variables](https://docs.expo.dev/guides/environment-variables/).

```bash
# API backend — Android emulator dùng 10.0.2.2 để trỏ về localhost máy host
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api/v1
# iOS simulator: http://localhost:3001/api/v1 — thiết bị thật: http://<LAN-IP>:3001/api/v1

# Google Sign-In: Web client ID (oauth_client client_type=3 trong google-services.json)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

> Backend `apps/api/.env` xem mẫu `apps/api/.env.example`. DB (Supabase) + Redis đã deploy cloud — chỉ cần điền `DATABASE_URL`, `REDIS_URL` xin từ chủ project.

### 3.2. `google-services.json` (Firebase)
⚠️ **KHÔNG commit** (chứa API key client). Mỗi dev tự tải từ project chung — xem [react-native-firebase: Android setup](https://rnfirebase.io/#generating-android-credentials):

1. Firebase Console → ⚙️ **Project settings → app Android `com.foodresq.mobile`** → **Download `google-services.json`** → đặt vào `apps/mobile/`.
2. Lấy **Web client ID** (`oauth_client` có `client_type: 3`) trong file đó → điền `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` ở `.env`.

> `GoogleService-Info.plist` (iOS) — thêm khi build iOS (cũng không commit).

---

## 4. Chạy app

App gọi API ở `apps/api` (port **3001**, prefix `/api/v1`) → backend phải chạy trước ([§1](#1-onboarding--chạy-app-trong-6-bước) bước 5).

| Chế độ | Dùng cho | Lệnh |
|---|---|---|
| **Expo Go** | hầu hết màn hình, email/password, forgot-password | `cd apps/mobile && corepack pnpm android` |
| **Dev Client** | **bắt buộc** cho Google Sign-In & Phone OTP (native module) | build 1 lần (dưới) rồi `npx expo start --dev-client` |

Build dev client (khuyến nghị **EAS** — [Create a development build](https://docs.expo.dev/develop/development-builds/create-a-build/)):

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build --profile development --platform android   # ~15-20 phút
adb install -r <file>.apk            # tải APK từ link kết quả rồi cài
npx expo start --dev-client          # các lần sau chỉ cần chạy Metro
```

> **EAS** → cả nhóm dùng **chung 1 keystore** (SHA-1 `06:1C:...` đã đăng ký Firebase) ⇒ không ai phải thêm SHA-1.
> Muốn **build local** (`npx expo run:android`) → ký bằng debug keystore máy bạn ⇒ phải tự thêm SHA-1, xem [§5](#5-firebase-chỉ-khi-dựng-lại-hoặc-build-local).

---

## 5. Firebase (chỉ khi dựng lại hoặc build local)

Project: **`foodresq-53ae8`**, package **`com.foodresq.mobile`**. Bỏ qua mục này nếu build qua EAS với config sẵn có.

1. **Bật provider**: Authentication → Sign-in method → bật **Google** + **Phone**.
2. **Thêm SHA-1** (build local): Project settings → app Android → *Add fingerprint*.
   - Debug keystore: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
   - EAS keystore: `npx eas-cli credentials`
   - Thiếu SHA-1 → Google Sign-In báo `DEVELOPER_ERROR` (code 10) — xem [troubleshooting](https://react-native-google-signin.github.io/docs/troubleshooting).
3. **SMS region** (Phone OTP): Authentication → Settings → **SMS region policy** → cho phép **Vietnam (+84)**. Thiếu → `auth/operation-not-allowed` (code 17006).
4. **Test phone number** (OTP miễn phí): Authentication → Phone → *Phone numbers for testing* → thêm số + mã → **Save**. Xem [Firebase: test phone numbers](https://firebase.google.com/docs/auth/android/phone-auth#test-with-fictional-phone-numbers).

---

## 6. Cấu trúc & quy ước

```
apps/mobile/
├── app/                 # Routes (Expo Router, file-based) — auth screens + (app)/ sau đăng nhập (tab bar)
└── src/
    ├── api/             # axios client + interceptor refresh token
    ├── components/      # UI thuần (*Screen.tsx), nhận callback qua props
    ├── screens/auth/    # Container: gọi API/store + điều hướng, render component UI
    ├── services/        # firebaseAuth.ts (Google/Phone)
    ├── stores/          # auth.ts (zustand)
    ├── hooks/ lib/ utils/  # useAuth, queryClient, validators (zod)
    └── navigation/      # adapter.ts: map React Navigation API → Expo Router
```

- **Pattern Container/Component**: `app/*.tsx` (route mỏng) → `screens/auth/*` (logic) → `components/*` (UI thuần).
- **Thêm màn mới**: tạo container + component → thêm route trong `app/` → thêm mapping vào `ROUTE_TO_PATH` (`adapter.ts`).
- ⚠️ Adapter JSON-encode params: chuỗi toàn số (vd OTP) bị `JSON.parse` thành **number** → ép `String()` trước khi gửi API.
- **TS strict, functional style, không comment thừa.** Commit theo Conventional Commits. Lỗi async hiển thị bằng `Toast` + `getErrorMessage` (`src/hooks/useErrorHandler`), tránh `console.error`. Chi tiết: `src/ERROR_HANDLING_GUIDE.md`.

---

## 7. Các luồng Auth

| Luồng | Cơ chế | Trạng thái |
|---|---|---|
| Đăng ký / Đăng nhập email | Backend JWT (access 15m + refresh) | ✅ |
| Quên mật khẩu | OTP qua email (Redis TTL 10') + Resend SMTP | ✅ |
| Đăng nhập Google / SĐT | Firebase → idToken → `POST /auth/firebase` → JWT app | ✅ |
| Facebook | — | Phase 2 |

`/auth/firebase` verify Firebase ID token, **upsert user** theo email/phone, cấp JWT app + cờ `isNewUser`. User phone-only dùng email placeholder `<uid>@phone.foodresq.local`. State auth ở `src/stores/auth.ts` (`login`, `loginWithFirebase`, `register`, `logout`); token lưu `AsyncStorage`, backend trả `fullName` → store chuẩn hoá thành `name`.

---

## 8. Troubleshooting

| Triệu chứng | Xử lý |
|---|---|
| Crash `undefined is not a function` toàn cục | `npx expo install react-native-worklets@0.8.3` |
| Google Sign-In `DEVELOPER_ERROR` (code 10) | Chưa thêm **SHA-1** vào Firebase ([§5.2](#5-firebase-chỉ-khi-dựng-lại-hoặc-build-local)) |
| Phone OTP `auth/operation-not-allowed` (17006) | Provider Phone chưa **Save** / **SMS region** chưa cho phép +84 |
| Đổi route `(app)` lỗi typedRoutes | Restart Metro để regenerate `.expo/types` |
| Metro "Cannot connect" / Fast Refresh lỗi | Restart Metro + reload app (`r`) |
| `adb: no devices found` chập chờn | `adb kill-server && adb start-server` |

---

## 9. Tài liệu chính thức

- **Expo** — [Set up environment](https://docs.expo.dev/get-started/set-up-your-environment/) · [Expo Router](https://docs.expo.dev/router/introduction/) · [Environment variables](https://docs.expo.dev/guides/environment-variables/) · [EAS development build](https://docs.expo.dev/develop/development-builds/create-a-build/)
- **React Native Firebase** — [Android credentials](https://rnfirebase.io/#generating-android-credentials) · [Phone auth](https://rnfirebase.io/auth/phone-auth)
- **Google Sign-In (RN)** — [Get started](https://react-native-google-signin.github.io/docs/setting-up/get-config-file) · [Troubleshooting](https://react-native-google-signin.github.io/docs/troubleshooting)
- **Firebase** — [Test phone numbers](https://firebase.google.com/docs/auth/android/phone-auth#test-with-fictional-phone-numbers)
- **Hạ tầng** — [Supabase docs](https://supabase.com/docs) · [TanStack Query](https://tanstack.com/query/latest) · [Zustand](https://zustand.docs.pmnd.rs/)

---

## 10. Scripts & việc tiếp theo

```bash
corepack pnpm android          # Expo Go (Android)
npx expo start --dev-client    # Metro cho dev client (Firebase)
npx tsc --noEmit               # type-check
corepack pnpm lint             # eslint
```

**Next:** Luồng Search & Listing (Home đang "chưa triển khai") · hoàn thiện hồ sơ sau đăng nhập social/phone (`isNewUser`) · verify tài liệu người dùng · Facebook login (Phase 2).
