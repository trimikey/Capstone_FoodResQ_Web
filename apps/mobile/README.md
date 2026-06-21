# FoodResQ Mobile

App di động của nền tảng cứu trợ thực phẩm FoodResQ — xây bằng **Expo (SDK 56) + React Native 0.85 + Expo Router**. Tài liệu này hướng dẫn từ setup đến phát triển tiếp cho thành viên mới.

> Đây là một app trong monorepo `Capstone_FoodResQ_Web` (pnpm workspaces). Backend NestJS nằm ở `apps/api`.

---

## 0. Onboarding nhanh cho thành viên mới

Checklist để chạy được app (chi tiết từng mục ở các phần dưới):

- [ ] Được mời vào **Expo Organization `foodresq-team`** (để build chung) và **Firebase project `foodresq-53ae8`** (để tải config). → nhờ chủ project mời theo email.
- [ ] `git pull` + `corepack pnpm install` (từ gốc monorepo).
- [ ] Tạo **`apps/mobile/.env`** và **`apps/api/.env`** — xin giá trị (`DATABASE_URL` + `REDIS_URL` đã deploy cloud, Resend key, Firebase service account, JWT secret, Google Web client ID...) từ chủ project qua kênh **riêng tư** (không commit). Xem §3.1.
- [ ] Tải **`google-services.json`** từ Firebase Console → đặt vào `apps/mobile/`. Xem §3.2.
- [ ] Cài JDK 17 + Android SDK + 1 emulator (bản Google Play). Xem §2.
- [ ] Chạy backend: `cd apps/api && corepack pnpm dev` (DB + Redis đã deploy cloud — **không cần docker**). Xem §4.
- [ ] **Build dev client qua EAS** (khuyến nghị — dùng chung keystore org, **không phải thêm SHA-1**): `eas build --profile development --platform android` → cài APK → `npx expo start --dev-client`. Xem §5.2.

> ⭐ **Vì sao build qua EAS:** project thuộc org `foodresq-team` nên mọi member build dùng **chung 1 keystore** (SHA-1 `06:1C:...` đã đăng ký Firebase) → **không ai phải thêm SHA-1 riêng**. Chỉ khi build **local** (`expo run:android`) mới phải thêm SHA-1 debug của máy mình (xem §6).

---

## 1. Tech stack

| Lĩnh vực | Công nghệ |
|---|---|
| Framework | Expo SDK `~56`, React Native `0.85`, Expo Router (file-based) |
| Ngôn ngữ | TypeScript (strict) |
| UI | `react-native-paper`, `expo-image`, `react-content-loader`, `@shopify/flash-list`, `@gorhom/bottom-sheet` |
| Animation | `react-native-reanimated@4.3.1` + `react-native-worklets@0.8.3` |
| State / Data | `zustand` (auth store), `@tanstack/react-query` |
| Form | `react-hook-form` + `zod` |
| Auth social | `@react-native-firebase/app` + `/auth`, `@react-native-google-signin/google-signin` |
| Toast | `react-native-toast-message` |

> ⚠️ **`react-native-worklets` phải khớp `0.8.3`** (peer của Reanimated 4.3.1 + bản Expo Go SDK 56). Nâng version khác gây crash `"undefined is not a function"` toàn app.

---

## 2. Yêu cầu môi trường

- **Node** ≥ 20 (đang dùng v22), **pnpm** qua corepack (`corepack pnpm`)
- **JDK 17** (cho build Android)
- **Android SDK** + 1 emulator (vd Pixel API 34) — bản **Google Play** (cần cho Google Sign-In / Phone OTP), không phải "Google APIs"
- `adb` trong PATH
- (Tùy chọn) Tài khoản **Expo** nếu build dev client bằng EAS cloud

---

## 3. Cài đặt

```bash
# từ thư mục gốc monorepo
corepack pnpm install
```

### 3.1. Biến môi trường — `apps/mobile/.env`
File này **không commit** (gitignore). Tạo từ mẫu dưới:

```bash
# API backend — Android emulator dùng 10.0.2.2 để trỏ về localhost máy host
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api/v1
# iOS simulator: http://localhost:3001/api/v1 — thiết bị thật: http://<LAN-IP>:3001/api/v1

# Google Sign-In: Web client ID (OAuth 2.0) lấy trong google-services.json
# (oauth_client có client_type = 3) hoặc Firebase Console → Authentication → Google
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

### 3.2. File cấu hình Firebase
> ⚠️ `google-services.json` **KHÔNG được commit** (đã gitignore — chứa API key client, tránh GitHub secret scanning). Mỗi dev tự lấy file này từ project Firebase chung.

**Để có file (teammate mới):**
1. **Được mời vào project Firebase chung** (không tạo project riêng): chủ project vào Firebase Console → ⚙️ Project settings → **Users and permissions → Add member** → nhập email bạn (role Editor).
2. Bạn vào Console project chung → ⚙️ Project settings → app Android `com.foodresq.mobile` → **Download `google-services.json`** → đặt vào `apps/mobile/google-services.json`.
3. Lấy **Web client ID** trong file đó (`oauth_client` có `client_type: 3`) → điền vào `.env` (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).
4. **Build local** (`expo run:android`): lấy SHA-1 debug keystore **máy bạn** và **Add fingerprint** vào Firebase (mỗi máy SHA-1 khác nhau → Google Sign-In mới chạy). Nếu cả nhóm build qua **EAS** thì dùng chung SHA-1 của EAS keystore (chỉ cần thêm 1 lần).

- `apps/mobile/GoogleService-Info.plist` (iOS) — chưa cần, thêm khi build iOS (cũng không commit).

---

## 4. Chạy backend (bắt buộc để auth hoạt động)

App gọi API ở `apps/api` (NestJS, port **3001**, prefix `/api/v1`).

> ✅ **Hạ tầng đã deploy cloud — không cần docker.** Database (Postgres trên **Supabase**) và **Redis** đều đã chạy trên cloud. Thành viên mới **không** phải khởi động Postgres/Redis local nữa, chỉ cần điền `DATABASE_URL` + `REDIS_URL` (xin từ chủ project) vào `apps/api/.env`.

```bash
cd apps/api
corepack pnpm dev           # nest start --watch → http://localhost:3001/api/v1
```

Backend cần `apps/api/.env` — xem mẫu ở `apps/api/.env.example`. Các biến chính: `DATABASE_URL` (Supabase), `REDIS_URL` (cloud), `JWT_SECRET`, SMTP/Resend (forgot-password), `FIREBASE_*` (Firebase Admin cho `/auth/firebase`). Xin giá trị thật từ chủ project qua kênh riêng tư.

---

## 5. Chạy app

App có **2 chế độ chạy** tùy tính năng cần test:

### 5.1. Expo Go — cho phần KHÔNG dùng native Firebase
Đủ cho hầu hết màn hình, email/password, forgot-password.
```bash
cd apps/mobile
corepack pnpm android        # hoặc: npx expo start --android
```

### 5.2. Dev Client — BẮT BUỘC cho Google Sign-In & Phone OTP
`@react-native-firebase` là native module → **không chạy trên Expo Go**. Cần dev client (build 1 lần):

```bash
# Cách A — EAS cloud (KHUYẾN NGHỊ cho cả nhóm)
# Cần: được mời vào Expo org `foodresq-team` (project đã transfer vào org này).
cd apps/mobile
npx eas-cli login
npx eas-cli build --profile development --platform android   # ~15-20 phút
# Tải APK từ link kết quả → cài: adb install -r <file>.apk

# Cách B — build local (nhanh hơn nếu máy đã có Android SDK)
ANDROID_HOME=~/Library/Android/sdk npx expo run:android

# Sau khi đã có dev client trên máy, chỉ cần chạy Metro:
npx expo start --dev-client
```

> **Local vs EAS:**
> - **EAS cloud (khuyến nghị):** project thuộc org **`foodresq-team`** → mọi member build dùng **chung 1 keystore** (SHA-1 `06:1C:...` đã đăng ký Firebase) → **KHÔNG phải thêm SHA-1**. Tiện chia sẻ APK, keystore an toàn.
> - **Local:** nhanh hơn nhưng ký bằng **debug keystore máy bạn** → phải tự thêm SHA-1 debug của máy vào Firebase (xem §6). Mỗi máy một SHA-1 khác nhau.

---

## 6. Cấu hình Firebase (cho Google + Phone)

Project hiện tại: **`foodresq-53ae8`**, package Android **`com.foodresq.mobile`**.

Nếu dựng lại từ đầu hoặc đổi keystore, cần làm đủ:

1. **Bật provider**: Firebase Console → Authentication → Sign-in method → bật **Google** và **Phone**.
2. **SHA-1 fingerprint** (cho Google Sign-In): Project settings → app Android → *Add fingerprint*. Lấy SHA-1:
   - Debug keystore (local build): `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
   - EAS keystore: `npx eas-cli credentials` → Android, hoặc trích từ APK: `apksigner verify --print-certs <apk>`
   - Thiếu SHA-1 → Google báo `DEVELOPER_ERROR` (code 10).
3. **SMS Region Policy** (cho Phone OTP): Authentication → Settings → **SMS region policy** → cho phép **Vietnam (+84)** (hoặc Allow all khi test).
   - Thiếu → lỗi `auth/operation-not-allowed` / code `17006` "SMS unable to be sent until this region enabled".
4. **Test phone number** (test OTP miễn phí, không tốn SMS): Authentication → Phone → *Phone numbers for testing* → thêm vd `+84 947 942 640` / mã `123456`. **Bấm Save**.

---

## 7. Cấu trúc thư mục

```
apps/mobile/
├── app/                      # Routes (Expo Router, file-based)
│   ├── _layout.tsx           # Root layout + auth guard
│   ├── index.tsx
│   ├── sign-in.tsx, select-role.tsx, sign-up-*.tsx
│   ├── forgot-password.tsx, otp-verification.tsx, reset-password.tsx
│   ├── phone-sign-in.tsx
│   └── (app)/                # Nhóm route sau đăng nhập (có tab bar)
│       ├── _layout.tsx       # Tabs: Trang chủ / Đơn của tôi / Tài khoản + guard
│       └── home.tsx, orders.tsx, profile.tsx
└── src/
    ├── api/                  # axios client + endpoints + interceptor refresh token
    ├── components/           # UI thuần (presentational), vd SignInScreen, OtpVerificationScreen
    ├── screens/auth/         # Container (logic + navigation) bọc component UI
    ├── services/             # firebaseAuth.ts (Google/Phone helper)
    ├── stores/               # auth.ts (zustand)
    ├── hooks/                # useAuth, useErrorHandler
    ├── navigation/           # adapter.ts (React Navigation API → Expo Router)
    ├── lib/                  # queryClient...
    └── utils/                # validators.ts (zod schemas)
```

### Pattern Container / Component
- `src/components/*Screen.tsx` = **UI thuần** (form, layout), nhận callback qua props.
- `src/screens/auth/*Screen.tsx` = **container** (gọi API/store, điều hướng), render component UI.
- `app/*.tsx` = route mỏng, dùng `useScreenNav()` rồi render container.

### Navigation adapter
`src/navigation/adapter.ts` map API kiểu React Navigation (`navigation.navigate('SignIn')`) sang Expo Router. Khi thêm màn mới:
1. Tạo container + component.
2. Thêm route file trong `app/`.
3. Thêm mapping tên → path vào `ROUTE_TO_PATH` trong `adapter.ts`.

> ⚠️ Adapter JSON-encode params object. Param dạng **chuỗi toàn số** (vd OTP) khi decode bị `JSON.parse` thành **number** → ép `String()` ở nơi nhận trước khi gửi API.

---

## 8. Các luồng Auth đã có

| Luồng | Cơ chế | Trạng thái |
|---|---|---|
| Đăng ký / Đăng nhập email | Backend JWT (access 15m + refresh) | ✅ |
| Quên mật khẩu | OTP qua email (Redis TTL 10') + Resend SMTP | ✅ |
| Đăng nhập Google | Firebase → idToken → `POST /auth/firebase` → JWT app | ✅ |
| Đăng nhập SĐT (OTP) | Firebase Phone → idToken → `POST /auth/firebase` → JWT app | ✅ |
| Facebook | — | Phase 2 |

Backend `/auth/firebase` verify Firebase ID token, **upsert user** theo email/phone, cấp JWT app (giống login thường), trả thêm cờ `isNewUser` để app cho hoàn thiện hồ sơ. User social/phone được set `passwordHash` ngẫu nhiên (không login bằng mật khẩu); user phone-only dùng email placeholder `<uid>@phone.foodresq.local`.

State auth ở `src/stores/auth.ts`: `login`, `loginWithFirebase(idToken, role?)`, `register`, `logout`. Token lưu `AsyncStorage`; backend trả `fullName`, store chuẩn hoá thành `name` qua `normalizeUser`.

---

## 9. Quy ước phát triển

- **TypeScript strict**, ưu tiên functional style. Không thêm comment thừa.
- **Commit theo Conventional Commits** (`feat:`, `fix:`, `chore:`...).
- Dùng **`corepack pnpm`** (pnpm không cài global trong môi trường này).
- Lỗi async hiển thị bằng `Toast` + `getErrorMessage` (xem `src/hooks/useErrorHandler`), tránh `console.error` gây LogBox overlay với lỗi mong đợi (vd logout 401 → `console.debug`).
- Xem thêm `src/ERROR_HANDLING_GUIDE.md`.

---

## 10. Troubleshooting

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| App crash `undefined is not a function` toàn cục | `react-native-worklets` sai version → `npx expo install react-native-worklets@0.8.3` |
| Google Sign-In `DEVELOPER_ERROR` (code 10) | Chưa thêm **SHA-1** keystore tương ứng vào Firebase |
| Phone OTP `auth/operation-not-allowed` | Provider Phone chưa **Save**, hoặc **SMS region** chưa cho phép +84 (code 17006) |
| OTP đúng nhưng nút Verify "không ăn" | Form schema bắt buộc field không có giá trị → kiểm tra `validators.ts` |
| Đổi route nhóm `(app)` báo lỗi typedRoutes | Restart Metro để regenerate `.expo/types` |
| Metro mất kết nối / Fast Refresh "Cannot connect" | Restart Metro + reload app (`r` trong terminal Metro) |
| `adb: no devices found` chập chờn | `adb kill-server && adb start-server` |

---

## 11. Scripts

```bash
corepack pnpm android     # Expo Go trên Android
npx expo start --dev-client   # Metro cho dev client (Firebase)
npx tsc --noEmit          # type-check
corepack pnpm lint        # eslint (expo lint)
```

---

## 12. Việc tiếp theo (gợi ý)

- **Luồng 2 — Search & Listing** (Home hiện hiển thị "chưa triển khai").
- **Facebook login** (Phase 2): cần Facebook app riêng.
- Hoàn thiện hồ sơ sau đăng ký social/phone (dùng cờ `isNewUser`): cho user đặt tên thật, địa chỉ, role.
- Verify tài liệu người dùng (đã tách khỏi luồng đăng ký — làm sau khi tạo tài khoản).
