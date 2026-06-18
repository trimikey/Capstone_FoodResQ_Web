# Task bàn giao — Dev B

> **Phạm vi:** Luồng 2 (Search & Listing) + Luồng 3 (Reservation & QR) của app mobile FoodResQ.
> **Branch:** `feat/mobile-listing-reservation` (đã tạo, có sẵn skeleton + lib cần thiết).

---

## 1. Đã có sẵn (KHÔNG làm lại)

| Hạng mục | Trạng thái | Vị trí |
|---|---|---|
| React Query (`QueryClientProvider`) | ✅ | `app/_layout.tsx`, `src/lib/queryClient.ts` |
| Tab navigation (Home/Orders/Profile) + auth guard | ✅ | `app/(app)/_layout.tsx` |
| API client (tự gắn token + refresh 401), **baseURL đã gồm `/api/v1`** | ✅ | `src/api/client.ts` |
| Auth login | ✅ | đăng nhập được → vào tab Home |
| Lib render/animation | ✅ | FlashList, expo-image (`ui/AppImage`), bottom-sheet, content-loader, `react-native-qrcode-svg` |

**Convention gọi API:** dùng `apiClient` từ `src/api/client.ts` + React Query. Path tương đối (`/listings`), KHÔNG thêm `/api/v1` (baseURL đã có).

---

## 2. Skeleton đã tạo sẵn (điền TODO bên trong)

```
src/services/geolocation.ts        # T2.1 — getCurrentCoords() (đang trả fallback HCM)
src/hooks/useListings.ts           # T2.2 — useListings(), useListingDetail()
src/hooks/useReservations.ts       # T3.1 — useMyReservations(), useCreateReservation()
src/components/ListingCard.tsx     # T2.3
src/components/SearchBar.tsx       # T2.3
src/components/QRDisplay.tsx       # T3.3
app/(app)/listing/[id].tsx         # T2.5 + T3.2 — chi tiết listing + form đặt chỗ
app/(app)/order/[id].tsx           # T3.5 — chi tiết đơn + QR
app/(app)/home.tsx                 # T2.4 — thay placeholder bằng SearchBar + FlashList
app/(app)/orders.tsx               # T3.4 — thay placeholder bằng FlashList reservations
```

---

## 3. Hợp đồng API (đã verify với backend)

### Listings
- `GET /listings` — query: `lat, lng, radiusKm, category, search, page, limit`
- `GET /listings/:id`

### Reservations
- `POST /reservations` — body: `{ listingId: uuid, quantity: number(>0), notes?: string }` → trả reservation kèm `qrToken`
- `GET /reservations/my`
- `GET /reservations/:id`
- (tham khảo) `POST /reservations/:id/cancel`, `POST /reservations/:id/rating`

> Field chi tiết của response: xem Swagger backend hoặc gọi thử bằng tài khoản test rồi cập nhật interface `Listing`/`Reservation` trong hook.

---

## 4. Đầu việc

### Luồng 2 — Search & Listing
- [ ] **T2.1** `geolocation.ts`: cài `npx expo install expo-location`, xin quyền, trả toạ độ thật.
- [ ] **T2.2** `useListings.ts`: hoàn thiện interface `Listing`, phân trang.
- [ ] **T2.3** `ListingCard` (dùng `AppImage`) + `SearchBar` (debounce).
- [ ] **T2.4** `home.tsx`: `SearchBar` + `FlashList<ListingCard>` + infinite scroll + skeleton (`react-content-loader`). Card `onPress` → `router.push('/listing/' + id)`.
- [ ] **T2.5** `listing/[id].tsx`: `useListingDetail(id)` → ảnh, provider, hạn dùng, nút **Đặt chỗ**.

### Luồng 3 — Reservation & QR
- [ ] **T3.1** `useReservations.ts`: hoàn thiện interface, xử lý lỗi.
- [ ] **T3.2** Form đặt chỗ trong `listing/[id].tsx` → `useCreateReservation()` → toast + điều hướng `/order/[id]`.
- [ ] **T3.3** `QRDisplay`: khung trắng + logo.
- [ ] **T3.4** `orders.tsx`: `FlashList` reservations theo trạng thái; tap → `/order/[id]`.
- [ ] **T3.5** `order/[id].tsx`: `QRDisplay value={qrToken}` + countdown 30' + checklist pickup.

---

## 5. Chạy & test

```bash
cd apps/mobile
npx expo start --android
```
- Backend chạy ở `localhost:3001` (DB/Redis container đã Up). Emulator gọi API qua `10.0.2.2` (đã set trong `.env`).
- **Tài khoản test:**
  ```
  Email:    mobiletest_1781756513@foodresq.com
  Password: Test1234!
  ```
- Trước mỗi commit: `npx tsc --noEmit` phải sạch.
- Commit theo Conventional Commits: `feat(mobile): ...`.

## 6. Acceptance
- Home hiện danh sách thực phẩm gần (geospatial), kéo phân trang mượt.
- Vào chi tiết → đặt chỗ → nhận QR.
- Tab Orders thấy đơn vừa đặt + xem lại QR.

---

## 7. Ranh giới với Dev A (tránh đụng file)
- **Dev A** sở hữu: auth (`components/*Screen` sign-up/forgot/reset/otp), `(app)/profile.tsx`, `stores/auth.ts`.
- **Dev B (bạn)** sở hữu: mọi file ở mục 2. → gần như không sửa chung file.
