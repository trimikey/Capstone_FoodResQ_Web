# FoodResQ — Coding Rules & Project Conventions

**Capstone SP26SE088 | FPT University**
Stack: NestJS (BE) · Next.js (FE) · PostgreSQL + PostGIS · TypeScript

---

## 1. Project Structure

```
foodresq/
├── apps/
│   ├── api/          ← NestJS backend
│   └── web/          ← Next.js frontend (Admin + Provider portal)
├── packages/
│   ├── dto/          ← Shared DTO / Zod schemas (used by both)
│   └── types/        ← Shared TypeScript types/enums
├── schema.sql        ← Source-of-truth DB schema
└── CLAUDE.md
```

---

## 2. Backend — NestJS

### 2.1 Core Libraries

| Purpose | Package |
|---|---|
| ORM | `prisma` + `@prisma/client` |
| Validation | `class-validator` + `class-transformer` |
| Auth | `@nestjs/passport` + `passport-jwt` + `passport-local` |
| Config | `@nestjs/config` |
| Caching / Redis | `@nestjs/cache-manager` + `cache-manager-ioredis` |
| Queue | `@nestjs/bullmq` + `bullmq` |
| WebSocket | `@nestjs/websockets` + `socket.io` |
| API Docs | `@nestjs/swagger` |
| Logging | `nestjs-pino` |
| File upload | `@nestjs/platform-express` + `multer` |
| Hashing | `bcrypt` + `@types/bcrypt` |
| JWT | `@nestjs/jwt` |

### 2.2 Module Structure (per feature)

```
src/
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/          ← jwt.strategy.ts, local.strategy.ts
│   │   ├── guards/              ← jwt-auth.guard.ts, roles.guard.ts
│   │   └── dto/
│   ├── listings/
│   ├── reservations/
│   ├── deliveries/
│   ├── campaigns/
│   ├── users/
│   ├── volunteers/
│   ├── trust/
│   ├── notifications/
│   └── admin/
├── common/
│   ├── decorators/              ← @CurrentUser(), @Roles()
│   ├── filters/                 ← http-exception.filter.ts
│   ├── interceptors/            ← logging, transform response
│   ├── pipes/                   ← validation.pipe.ts
│   └── utils/
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── main.ts
```

### 2.3 Prisma Rules

- Schema file at `prisma/schema.prisma` — mirrors `schema.sql` exactly
- Spatial queries (ST_DWithin, ST_Distance) use `prisma.$queryRaw` with `Prisma.sql` tagged template
- Never use `prisma.$executeRaw` for SELECT; always `$queryRaw`
- Always pass raw spatial params as `Prisma.sql` to prevent SQL injection

```typescript
// Correct spatial query pattern
const listings = await this.prisma.$queryRaw<FoodListing[]>(Prisma.sql`
  SELECT id, title, ST_Distance(pickup_location::geography, ST_MakePoint(${lng}, ${lat})::geography) AS distance_m
  FROM food_listings
  WHERE status = 'active'
    AND ST_DWithin(pickup_location::geography, ST_MakePoint(${lng}, ${lat})::geography, ${radiusMeters})
  ORDER BY distance_m
  LIMIT ${limit}
`);
```

### 2.4 API Conventions

- All routes prefixed `/api/v1`
- Response wrapper: `{ success: true, data: T, meta?: PaginationMeta }`
- Error response: `{ success: false, error: { code: string, message: string } }`
- Use `@ApiTags()`, `@ApiOperation()`, `@ApiBearerAuth()` on every controller
- Pagination: `?page=1&limit=20` — never return unbounded lists
- Dates: always ISO 8601 UTC strings in responses

### 2.5 Auth Pattern

- Access token: JWT, 15 minutes TTL
- Refresh token: stored hashed in `refresh_tokens` table, 30 days TTL
- Token rotation on every refresh
- Force-revoke all tokens on ban: `DELETE FROM refresh_tokens WHERE user_id = ?`

```typescript
// Guard usage
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PROVIDER)
@Get('listings')
```

### 2.6 Redis & Concurrency

- Reservation lock key: `lock:reservation:{listingId}`
- Lock TTL: 10 seconds (acquire window)
- Use `redlock` library for distributed lock across multiple Redis nodes
- Always release lock in `finally` block

```typescript
const lock = await redlock.acquire([`lock:reservation:${listingId}`], 10_000);
try {
  // decrement quantity + create reservation in one transaction
  await this.prisma.$transaction([...]);
} finally {
  await lock.release();
}
```

### 2.7 BullMQ Jobs

Queue names: `reservation-expiry`, `notification-push`, `esg-snapshot`

```typescript
@Processor('reservation-expiry')
export class ReservationExpiryProcessor {
  @Process()
  async handle(job: Job<{ reservationId: string }>) { ... }
}
```

### 2.8 DTO Rules

- All DTOs use `class-validator` decorators
- All inputs sanitized via `ValidationPipe({ whitelist: true, transform: true })`
- Never trust `req.body` without a DTO
- Use `@IsUUID()` for all ID params

---

## 3. Frontend — Next.js

### 3.1 Core Libraries

| Purpose | Package |
|---|---|
| Server state | `@tanstack/react-query` v5 |
| HTTP client | `axios` (with interceptor for JWT refresh) |
| Forms | `react-hook-form` + `@hookform/resolvers` |
| Schema validation | `zod` |
| UI components | `shadcn/ui` + `tailwindcss` |
| Maps | `mapbox-gl` + `react-map-gl` |
| Auth | `next-auth` v5 |
| Client state | `zustand` |
| Date handling | `date-fns` |
| Tables | `@tanstack/react-table` |
| Icons | `lucide-react` |
| Toasts | `sonner` |
| Animation | `framer-motion` |
| QR code | `qrcode.react` (display) + `@zxing/library` (scan) |

### 3.2 Directory Structure

```
src/
├── app/                         ← Next.js App Router
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── admin/
│   │   ├── provider/
│   │   └── volunteer/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                      ← shadcn generated components
│   ├── map/
│   ├── listings/
│   ├── reservations/
│   └── shared/
├── hooks/                       ← useListings, useReservation, etc.
├── lib/
│   ├── api.ts                   ← axios instance
│   ├── auth.ts                  ← next-auth config
│   └── utils.ts
├── stores/                      ← zustand stores
├── types/                       ← TypeScript interfaces
└── schemas/                     ← zod schemas (mirror backend DTOs)
```

### 3.3 Data Fetching Rules

- **Server Components**: use `fetch` directly for initial data (SSR/SSG)
- **Client Components**: use TanStack Query for interactive/real-time data
- **Mutations**: always use `useMutation` + `queryClient.invalidateQueries` after success
- Stale time for listings: 30 seconds; for user profile: 5 minutes

```typescript
// Query key convention: ['resource', 'action', ...params]
const { data } = useQuery({
  queryKey: ['listings', 'nearby', { lat, lng, radius }],
  queryFn: () => api.get('/listings/nearby', { params: { lat, lng, radius } }),
  staleTime: 30_000,
});
```

### 3.4 Form Rules

- All forms: `react-hook-form` + `zod` resolver — no manual `useState` for form fields
- Zod schema defined separately, reused for both FE validation and API typing
- Submit button disabled while `isSubmitting === true`

```typescript
const schema = z.object({
  title: z.string().min(5).max(255),
  quantity: z.number().positive(),
});

const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
});
```

### 3.5 Map Rules

- All coordinates stored and sent as `[longitude, latitude]` (GeoJSON order)
- Default map center: Ho Chi Minh City `[106.6297, 10.8231]`
- Use `react-map-gl` `Marker` for food listing pins
- Cluster markers when zoom < 12

### 3.6 Real-time (WebSocket)

- Connect socket on login, disconnect on logout
- Room naming: `user:{userId}` for personal notifications
- Use `socket.io-client` with auto-reconnect

---

## 4. Shared TypeScript Conventions

- **Strict mode**: `"strict": true` in all `tsconfig.json`
- **No `any`**: use `unknown` + type narrowing or explicit interfaces
- **Enums**: define once in `packages/types`, import everywhere
- **Null safety**: prefer `undefined` over `null` in TS interfaces; DB NULLs map to `null` in Prisma
- **File naming**: `kebab-case.ts` for files, `PascalCase` for classes/interfaces, `camelCase` for functions/variables
- **Imports**: absolute paths via `@/` alias, not relative `../../`

---

## 5. Database Rules

- **Never** raw string interpolation in SQL — always parameterized (`Prisma.sql` or `$1` placeholders)
- **Soft deletes**: check `deleted_at IS NULL` in every listing query
- **Spatial indexes**: all GEOGRAPHY columns must have a `GIST` index
- **Transactions**: reservation creation + quantity decrement must be one atomic transaction
- **UUIDs**: always `uuid_generate_v4()` as default — never sequential IDs for public-facing resources
- **Migrations**: use `prisma migrate dev` for local, `prisma migrate deploy` for prod — never hand-edit the DB in production

---

## 6. Security Rules

- All passwords hashed with `bcrypt`, rounds ≥ 12
- JWT secret from env var `JWT_SECRET` — never hardcode
- File uploads: validate MIME type server-side; store on S3/Cloudflare R2, never local disk in prod
- Rate limiting on `/auth/*` endpoints: `@nestjs/throttler` — max 10 req/min
- CORS: whitelist explicit origins, no wildcard in production
- Helmet middleware enabled in NestJS `main.ts`

---

## 7. Environment Variables

```bash
# Backend (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/foodresq
JWT_SECRET=
JWT_REFRESH_SECRET=
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
S3_BUCKET=
S3_REGION=
FCM_SERVER_KEY=

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

## 8. Key Business Rules (hardcoded as constants, configurable via system_configs)

| Rule | Default | Config Key |
|---|---|---|
| Max free reservations/day/user | 3 | `MAX_RESERVATIONS_PER_DAY` |
| Search radius | 5 km | `SEARCH_RADIUS_KM` |
| QR code validity | 30 min | `QR_VALIDITY_MINUTES` |
| Trust score ban threshold | ≤ 30 | `TRUST_BAN_THRESHOLD` |
| Trust score restriction threshold | ≤ 60 | `TRUST_RESTRICT_THRESHOLD` |
| Shipper offer expiry | 2 min | `SHIPPER_OFFER_EXPIRY_MINUTES` |
| Shipper assignment timeout (no one accepts → close order, notify receiver) | 4 min 30 s | hardcoded `ASSIGNMENT_TIMEOUT_MS` |
| Stalled delivery auto-fail (no status update after accept) | 6 h | hardcoded `DELIVERY_STALL_HOURS` |
| Bulk run minimum quantity | 10 portions | hardcoded `BULK_MIN_QTY` |
| Bulk run request approval expiry | 24 h | hardcoded in BulkRunsService |
| Trust score starting value | 100 | hardcoded |
| Reservation window | only within listing `pickup_start_time → pickup_end_time` | enforced in ReservationsService.create |
| Late cancellation | cancel < 30 min before `pickup_end_time` → −10 trust | hardcoded |
| Face eKYC | mandatory at registration for individual receivers & volunteers (selfie in the register request — no face, no account); social-login accounts are gated at first dashboard visit and blocked from reserving / going available until enrolled | enforced in AuthService + FE FaceEnrollmentGate |

---

## 9. Core Flows (reference)

### Reservation flow
```
Receiver searches nearby listings (PostGIS ST_DWithin)
  → clicks Reserve (requires enrolled face for individuals; within pickup window only)
  → BE: acquire Redis lock on listingId (10s)
  → BE: check daily limit (reservations_today < MAX_RESERVATIONS_PER_DAY)
  → BE: decrement quantity_remaining in transaction
  → BE: create reservation (status=confirmed, qr_token, qr_expires_at=+30min)
  → release lock
  → FE: show QR code (no auto-redirect — user reviews then navigates)
  → Provider scans QR → reservation status=picked_up
  → Provider confirms identity (face compare) OR receiver uploads pickup_proof → completed
  → Trust score +2, dedication points awarded
Cancel: allowed while confirmed; late cancel (<30 min before pickup_end_time) → −10 trust
  (FE shows a penalty-warning popup with the projected score & ban/restrict outcome);
  cancelling a delivery order also closes the delivery + recalls offers + frees the shipper
  (not allowed once the shipper picked the food up).
No-show cron (pickup orders only — delivery orders are governed by the delivery lifecycle):
  confirmed past qr_expires_at → no_show, stock restored, −20 trust.
```

### Shipper offer flow
```
Reservation created with delivery=true (receiver must have address + location in profile)
  → BE: create deliveries row (status=pending_assignment) + copy pickup/delivery coords
  → find 5 nearest available VERIFIED shippers (ST_DWithin 5km), excluding those who
    already rejected this delivery → upsert 5 shipper_task_offers (expires_at=+2min)
  → socket `delivery:offer` pops a global accept popup on the shipper app
  → first shipper to accept → UPDATE deliveries.shipper_id, status=assigned
    (blocked if the shipper already has an active delivery or bulk run)
  → sweep cron (30s): expire stale offers + re-broadcast to next-nearest shippers
  → no acceptance within 4m30s → delivery failed, reservation cancelled (no penalty),
    stock restored, receiver notified to re-order
  → delivery lifecycle: assigned → heading_to_provider → qc_completed (QC photo)
    → in_transit (live GPS tracking) → delivered
  → delivered REQUIRES scanning the receiver's QR token (proof of correct handoff);
    then reservation=completed, receiver +2 trust, shipper +5 dedication points
  → stalled runs (no update 6h) auto-fail via cron
```

### Bulk run flow (giao sỉ nhiều điểm)
```
Verified shipper requests ≥10 portions from one listing (bulk_runs, status=requested)
  → provider approves (stock decremented under the listing Redis lock) or rejects
  → shipper picks up (optional QC photo) → status=picked_up
  → provider AND/OR shipper pin ad-hoc distribution stops (bulk_run_stops, geography)
  → shipper logs served portions per stop (atomic conditional increment — can't exceed total)
  → all portions served → auto-complete; manual complete returns leftover to listing stock
  → rewards: +5 dedication +2 per served stop; cron closes stale requests (24h) / runs (6h)
```

### Trust score penalty
```
no_show → -20 pts
late_cancellation (< 30min) → -10 pts
food_safety_violation → -50 pts
score ≤ 60 → restricted (max 1 reservation/day)
score ≤ 30 → banned (status=banned, all refresh_tokens revoked)
```
