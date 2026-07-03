# Package Diagram — Front-end (web): Cách nối mũi tên

> Quy ước: mũi tên đi **từ nơi import → tới thứ được import** (hướng lên trên).
> Nhãn: `Import` = ES module import · `access` = gọi API client dùng chung.
> Tất cả cạnh dưới đây đã đối chiếu với import **thật** trong `apps/web/src`.

## Nhóm A — `hooks` phụ thuộc tầng dùng chung (4 mũi tên)

| # | Từ | Đến | Nhãn | Bằng chứng (file) |
|---|---|---|---|---|
| 1 | hooks | lib/api.ts | access | `useListings` / `useReservation` / `useProfile` / `useDeliveries` → `import { api } from '@/lib/api'` |
| 2 | hooks | schemas | Import | `useReservation` → `import type { CreateReservationInput } from '@/schemas/reservation.schema'` |
| 3 | hooks | @foodresq/types | Import | `useListings` → `FoodCategory`; `useProfile` → `UserRole, UserStatus` |
| 4 | hooks | stores | Import | `useDeliveries` / `useNotifications` → `import { useAuthStore } from '@/stores/auth.store'` |

## Nhóm B — `components` phụ thuộc (5 mũi tên đi lên + 2 nội bộ)

| # | Từ | Đến | Nhãn | Bằng chứng |
|---|---|---|---|---|
| 5 | components | hooks | Import | `ReservationModal` → `useCreateReservation`, `useListing` |
| 6 | components | schemas | Import | `ReservationModal` → `createReservationSchema` |
| 7 | components | lib/firebase.ts | Import | `auth-page` → `signInWithGoogle from '@/lib/firebase'` |
| 8 | components | stores | Import | `auth-page`, `PublicHeader` → `@/stores/auth.store` |
| 9 | components | @foodresq/types | Import | `PublicHeader`, `RecipeFormModal` |
| 10 | components/reservations | components/shared | Import | `PickupVerificationModal` → `@/components/shared/CameraCapture` |
| 11 | components/home | components/shared | Import | `PublicHeader` → `@/components/shared/NotificationBell` |

> #10, #11 là mũi tên **nội bộ trong box `components`** (giống `Admin→Common`, `Auth→Common` trong mẫu Crema).

## Nhóm C — `app` phụ thuộc (6 mũi tên đi lên)

| # | Từ | Đến | Nhãn | Bằng chứng |
|---|---|---|---|---|
| 12 | app/(auth) | components | Import | `login/page.tsx` → `import AuthPage from "@/components/auth-page"` |
| 13 | app/(dashboard) | components | Import | dashboard pages → `components/listings, recipes, reservations, shared, home` |
| 14 | app | hooks | Import | (dashboard) import hooks **31 lần**; volunteer pages |
| 15 | app | stores | Import | 6 file app → `@/stores/auth.store` |
| 16 | app | @foodresq/types | Import | 11 file page import enums |
| 17 | app/(providers) | lib/query-client.ts | Import | `providers.tsx` → `import { queryClient } from '@/lib/query-client'` |

## Cách vẽ đường đi (routing) cho mấy mũi tên "khó"

Vì box `hooks` nằm chắn giữa, vài mũi tên phải đi vòng:

- **#6, #9 (components → schemas / types):** đi thẳng lên qua **khe trống giữa 2 box hooks** (giữa `useReservation.ts` và `useNotifications.ts`), rồi rẽ ngang vào đích.
- **#16 (app → types):** đi lên ở **lề phải** (bên phải box `useNotifications.ts`), rồi rẽ trái vào `@foodresq/types`.
- **#17 (app → query-client):** đi ra **lề trái ngoài cùng** rồi lên — vì `query-client.ts` nằm khuất dưới `api.ts`.
- **#11 (home → shared):** đi xuống dưới hàng box trên của `components`, rẽ trái, xuống vào `shared`.

## Cạnh KHÔNG vẽ (chỉ ghi chú)

- `components (auth-page) → lib/api.ts`: auth-page gọi `api` trực tiếp — **có thật**, nhưng `api.ts` bị `query-client.ts` che ngay dưới, vẽ vào sẽ đâm xuyên box → để dạng ghi chú.

## Cạnh KHÔNG map được từ mẫu Crema (tránh vẽ sai)

- `services → apis → index.ts` (chuỗi ngang trong 1 layer): là **pipeline API riêng của template Crema**. Dự án FoodResQ không có chuỗi này — `lib` chỉ có `api.ts`, `firebase.ts`, `query-client.ts` độc lập. Vẽ vào = bịa.

---

**Tổng: 17 mũi tên**, tất cả suy ra từ import thật trong `apps/web/src`.
