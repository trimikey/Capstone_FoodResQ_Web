---
name: conventional-commits
description: "Enforce Conventional Commits format for every git commit in this project. Always active — apply whenever creating a commit message, suggesting a commit, or running git commit."
version: 1.0.0
---

# Conventional Commits

Mọi commit trong project FoodResQ **bắt buộc** tuân theo [Conventional Commits 1.0.0](https://www.conventionalcommits.org/).

---

## Format

```
<type>(<scope>): <subject>

[body]

[footer]
```

- **type** và **scope** viết thường (lowercase)
- **subject** không viết hoa chữ đầu, không kết thúc bằng dấu chấm
- **subject** tối đa 100 ký tự
- **body** (tuỳ chọn): giải thích WHY, không phải WHAT. Cách header 1 dòng trắng

---

## Types hợp lệ

| Type | Dùng khi |
|---|---|
| `feat` | Thêm tính năng mới |
| `fix` | Sửa bug |
| `refactor` | Tái cấu trúc code, không thêm feature hay fix bug |
| `style` | Format, dấu chấm phẩy, không thay đổi logic |
| `test` | Thêm hoặc sửa test |
| `docs` | Chỉ thay đổi tài liệu |
| `chore` | Build, deps, config, không liên quan tới source code |
| `ci` | CI/CD pipeline |
| `perf` | Cải thiện hiệu năng |
| `revert` | Hoàn tác commit trước |

---

## Scopes của project FoodResQ

Dùng scope để chỉ rõ phần nào của monorepo bị ảnh hưởng:

| Scope | Phạm vi |
|---|---|
| `api` | NestJS backend (`apps/api`) |
| `web` | Next.js frontend (`apps/web`) |
| `mobile` | React Native app (`apps/mobile`) |
| `auth` | Authentication / authorization |
| `listings` | Food listings |
| `reservations` | Reservation flow |
| `deliveries` | Delivery / shipper flow |
| `campaigns` | Charity campaigns |
| `notifications` | WebSocket / push notifications |
| `admin` | Admin module |
| `trust` | Trust score system |
| `db` | Schema, migrations, Prisma |
| `deps` | Dependencies |
| `config` | Cấu hình, env, turbo |

Scope là **tuỳ chọn** nhưng nên dùng khi commit ảnh hưởng một phần cụ thể.

---

## Ví dụ đúng

```
feat(reservations): add QR code expiry warning before pickup
fix(auth): handle expired refresh token on mobile
refactor(listings): extract distance calculation to util
chore(deps): upgrade prisma to v6.1
test(trust): add penalty score unit tests
docs: update API endpoint reference in README
ci: add pnpm cache to GitHub Actions workflow
```

## Ví dụ sai

```
# ❌ Thiếu type
update login screen

# ❌ Type không hợp lệ
updated(auth): fix bug

# ❌ Subject viết hoa
feat(api): Add new endpoint

# ❌ Subject kết thúc bằng dấu chấm
fix(web): resolve map crash.

# ❌ Subject quá dài (> 100 ký tự)
feat(mobile): add a very long description that exceeds the maximum allowed character limit for subject line
```

---

## Breaking Changes

Thêm `!` sau type/scope, và ghi rõ trong footer:

```
feat(auth)!: remove legacy JWT v1 support

BREAKING CHANGE: clients using JWT v1 tokens must re-authenticate.
```

---

## Quy tắc áp dụng

1. **Luôn dùng format này** khi tạo commit message, kể cả khi người dùng không nhắc
2. **Gợi ý scope phù hợp** dựa trên file đang thay đổi
3. **Từ chối tạo commit message sai format** — sửa và giải thích lý do
4. Khi chạy `git commit`, **tự động áp dụng format đúng** thay vì dùng message tuỳ tiện
