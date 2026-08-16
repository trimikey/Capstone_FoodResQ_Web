# FoodResQ — Diagram Index

**Capstone SP26SE088 | FPT University**

**77 sequence diagrams** covering the whole system, written in PlantUML.
Each `.puml` file holds several diagrams (one `@startuml <id> … @enduml` block each),
grouped by backend module.

## Mandatory conventions

- **Every participant box is prefixed with `:`** — the UML notation for an anonymous
  instance: `:UsersScreen`, `:AdminController`, `:AdminService`, `:PrismaService`.
  `actor` and `database` keep their plain names because they are not object boxes.
- **Every diagram contains a `Screen` box** — even flows triggered by a cron job end
  on a user screen (a notification or a changed status).
- **Standard flow**: `Actor → :Screen → :Controller → :Service → :PrismaService → Database`.
  Error branches use `alt/else`; atomic work uses `group $transaction`.
- **Language**: everything is in English — titles, messages and the design-rationale notes.

## How to render

```bash
# VS Code: install the "PlantUML" extension → Alt+D to preview
# CLI (requires Java):
java -jar plantuml.jar docs/diagrams/*.puml -o out
```

---

## The 77 diagrams

### Auth — `seq-auth.puml` (4)

| # | Diagram | Endpoint |
|---|---|---|
| 01 | `seq-auth-register` | `POST /auth/register` (+ check-email/phone, eKYC selfie) |
| 02 | `seq-auth-login` | `POST /auth/login` · `/auth/google` · `/auth/firebase` |
| 03 | `seq-auth-token-lifecycle` | `POST /auth/refresh` (token rotation) · `/auth/logout` |
| 04 | `seq-auth-password-reset` | `POST /auth/forgot-password` · `/auth/reset-password` |

### Users & Volunteers — `seq-users.puml` (5)

| # | Diagram | Scope |
|---|---|---|
| 05 | `seq-user-profile` | Profile with role-specific stats, plus trust score history |
| 06 | `seq-user-update-profile` | Update name / phone / avatar / address and the pinned location |
| 07 | `seq-user-face-ekyc` | Enrollment status and face enrollment (gate before reserving) |
| 08 | `seq-volunteer-availability` | Volunteer profile and the go-available toggle (eKYC + GPS gated) |
| 09 | `seq-volunteer-location` | GPS watcher pushing the live position to the receiver over WebSocket |

### Listings — `seq-listing.puml` (8)

| # | Diagram | Scope |
|---|---|---|
| 10 | `seq-listing-search` | Nearby search (PostGIS `ST_DWithin`) and listing detail |
| 11 | `seq-listing-create` | Image upload then listing creation (geography via raw SQL) |
| 12 | `seq-listing-update` | Edit a draft freely; a published listing only accepts soft fields |
| 13 | `seq-listing-publish` | Draft becomes active and enters nearby search |
| 14 | `seq-listing-cancel` | Cancel a published listing, blocked while reservations are open |
| 15 | `seq-listing-delete-draft` | Soft delete, drafts only |
| 16 | `seq-listing-duplicate` | Repost as a new draft, copying the geography point |
| 17 | `seq-listing-provider-overview` | Provider stats and listing list |

### Reservations — `seq-reservation.puml` (7)

| # | Diagram | Scope |
|---|---|---|
| 18 | `seq-reservation-create` | Redlock, daily quota, atomic stock decrement |
| 19 | `seq-reservation-my-orders` | Both-side order lists and order detail |
| 20 | `seq-reservation-scan-qr` | Provider scans the code; re-scanning is idempotent, bulk run codes are rejected |
| 21 | `seq-reservation-confirm-pickup` | Provider compares the enrolled photo by eye and confirms — no new photo, no matching |
| 22 | `seq-reservation-pickup-proof` | Receiver submits a live photo, FaceMatchService compares and refuses on mismatch |
| 23 | `seq-reservation-cancel` | Receiver cancel (−10 when late) / provider cancel (no penalty) |
| 24 | `seq-reservation-rate` | Rating providers and shippers (polymorphic rating table) |

### Deliveries — `seq-delivery.puml` (7)

| # | Diagram | Scope |
|---|---|---|
| 25 | `seq-delivery-offer` | Sequential offers, 15s each · accept / reject / lapse |
| 26 | `seq-delivery-lifecycle` | assigned → heading → qc_completed → in_transit → delivered (QR required) |
| 27 | `seq-delivery-track` | Receiver-side realtime tracking over WebSocket |
| 28 | `seq-delivery-drop-task` | Shipper returns the task before pickup, it re-enters the offer queue |
| 29 | `seq-delivery-fail` | Shipper reports a failure after pickup, stock restored, receiver notified |
| 30 | `seq-delivery-receiver-cancel` | Receiver stops the search and falls back to self pickup |
| 31 | `seq-delivery-performance` | Stats, run history, ratings received |

### Bulk Runs — `seq-bulk-run.puml` (4)

| # | Diagram | Scope |
|---|---|---|
| 32 | `seq-bulk-request-review` | Shipper requests → provider approves (Redlock, stock) / rejects |
| 33 | `seq-bulk-pickup` | Pickup and one QR code per distribution stop (24h validity) |
| 34 | `seq-bulk-manage-stops` | Pin / edit / remove stops (PostGIS, portion quota) |
| 35 | `seq-bulk-serve-close` | Atomic serve increments → complete / cancel (−10 trust) |

### Campaigns — `seq-campaign.puml` (12)

| # | Diagram | Scope |
|---|---|---|
| 36 | `seq-campaign-create` | Charity creates a kitchen campaign (cover, coordinates, slots, supplies) |
| 37 | `seq-campaign-browse` | Every list tab plus detail with supply progress |
| 38 | `seq-campaign-apply-review` | Volunteer applies for a shift → organization reviews |
| 39 | `seq-campaign-start` | Start gated by the lead-hours window and the minimum fill rate |
| 40 | `seq-campaign-checkin` | Volunteer check-in: right day, right shift, within 500 m of the kitchen |
| 41 | `seq-campaign-task-progress` | Advance the assignment through checked_in → in_progress → completed |
| 42 | `seq-campaign-complete` | Close the campaign, publish servings, reward volunteers |
| 43 | `seq-campaign-cancel` | Cancel before it starts and notify every applicant |
| 44 | `seq-campaign-pledge-donation` | Provider pledges ingredients to an open campaign |
| 45 | `seq-campaign-confirm-donation` | Organization confirms receipt; only then it counts as pantry stock |
| 46 | `seq-campaign-change-request` | Request a change instead of editing a running campaign directly |
| 47 | `seq-campaign-cancel-change-request` | List the request history and withdraw one still pending |

### Campaign Supply Chain — `seq-campaign-supply.puml` (7)

| # | Diagram | Scope |
|---|---|---|
| 48 | `seq-campaign-find-suppliers` | PostGIS search for approved providers holding stock near the kitchen |
| 49 | `seq-campaign-send-request` | Send a partnership request, gated by the non-commercial waiver |
| 50 | `seq-campaign-provider-review` | Provider accepts → Delivery + CampaignTransport + shipper broadcast |
| 51 | `seq-campaign-ingredient-pickup` | Campaign shipper confirms the collected kilograms with a proof photo |
| 52 | `seq-campaign-transport-receipt` | Organization confirms the transport reached the kitchen |
| 53 | `seq-campaign-create-distribution` | Plan a round, validate quota and stop spacing, dispatch shippers |
| 54 | `seq-campaign-close-distribution` | Shipper closes the round with the actual figures (idempotent claim) |

### Kitchen Operations — `seq-kitchen-ops.puml` (7)

| # | Diagram | Scope |
|---|---|---|
| 55 | `seq-kitchen-shifts` | List, create, update and delete shifts (slots cannot drop below assigned) |
| 56 | `seq-kitchen-menu` | List, add and remove dishes; adding one generates its 4 cooking steps |
| 57 | `seq-kitchen-cooking-steps` | Four-step board · mark done (photo required) · QC failure |
| 58 | `seq-kitchen-safety-log` | Food-safety log (append only) |
| 59 | `seq-kitchen-issue-qr` | Beneficiary requests a collection code; only one stays live at a time |
| 60 | `seq-kitchen-scan-handoff` | Waiter scans the code; a conditional claim prevents a double receipt |
| 61 | `seq-kitchen-beneficiary-feedback` | List received meals and review one, exactly once per receipt |

### Admin — `seq-admin.puml` (7)

| # | Diagram | Scope |
|---|---|---|
| 62 | `seq-admin-dashboard` | ESG overview · frequent cancellers · recent reservations |
| 63 | `seq-admin-verification` | Provider / volunteer verification review (+ audit log) |
| 64 | `seq-admin-users` | List · create account · change status (ban revokes all tokens) |
| 65 | `seq-admin-campaigns` | Create on behalf · status · assign/unassign · change requests |
| 66 | `seq-admin-food-catalog` | Categories and food types: create, rename, soft delete on both levels |
| 67 | `seq-admin-reports` | Review the report queue, resolve or dismiss, write an audit log entry |
| 68 | `seq-admin-config` | Read and change operational thresholds, validated against min / max |

### Supporting Modules — `seq-support.puml` (5)

| # | Diagram | Scope |
|---|---|---|
| 69 | `seq-notification-center` | WebSocket connect · emit · notification centre · device token |
| 70 | `seq-report-create` | Submit a report (ownership validation) and fan out to admins |
| 71 | `seq-recipe-manage` | Recipe library: browse / create (chef) / update / soft delete |
| 72 | `seq-esg-report` | Platform ESG and the provider monthly CSR report |
| 73 | `seq-upload-image` | Authenticated upload and public register upload (throttle, magic bytes) |

### Scheduled Jobs — `seq-cron.puml` (4)

| # | Diagram | Jobs |
|---|---|---|
| 74 | `seq-cron-order-jobs` | No-show (1 min) · daily quota reset (00:00) · offer sweep (30 s) · stalled deliveries (5 min) |
| 75 | `seq-cron-campaign-close` | 00:00 cancels campaigns that never started · hourly completes those past their end time |
| 76 | `seq-cron-dish-steps` | Every 30 s — unlock a cooking step once it is due and the previous one is done |
| 77 | `seq-cron-bulk-cleanup` | Every 10 min — close bulk runs abandoned at 24 h / 4 h / 8 h and restock |

Two reminder-only jobs are deliberately left out of the diagrams because they change no state — `ListingsCron.handleExpiryAlerts` (every 30 min, warns a provider that a listing is about to expire) and `CampaignsCron.nudgeUpcomingTasks` (every 5 min, reminds a volunteer about an upcoming shift).

---

## Class diagrams

**41 class diagrams** in 12 files. One per flow, grouped so that flows sharing the same set of
classes stay in a single diagram and flows with a different set get their own.

Each box follows the report template: `Controller` and `Service` list their public operations
with parameter and return types, `Service` also lists its injected dependencies as attributes,
DTOs appear as plain boxes, and entities carry their key columns.

Each diagram is paired with a method specification table in
[class-specs.md](class-specs.md) — 97 tables, one per class declared inside a diagram package,
in the `No | Method | Description` format the report uses. Paste the table straight under its
figure.

Every relationship is directed and typed. The notation key below applies to all 41 diagrams;
it is kept here rather than inside the diagrams so the rendered images stay clean. Each
diagram is preceded in its `.puml` file by a `' Giải thích:` comment block explaining what
that flow does — comments are not rendered, so they are working notes, not part of the image.

| Notation | Meaning | Where it comes from |
|---|---|---|
| `A --> B` | Association — A keeps a reference to B | constructor injection, or a foreign key with `onDelete: Restrict` |
| `A ..> B` | Dependency — A only uses B inside a call | DTO parameters, guards, and the Prisma delegates that reach a table |
| `A *-- B` | Composition — a B row is deleted together with its A | a foreign key declared `onDelete: Cascade` in `schema.prisma` |
| `"1"` `"0..1"` `"0..*"` | Multiplicity at each end of the line | the cardinality of the Prisma relation |

The composition diamonds are not stylistic: each one was derived from the actual `onDelete`
clause in `apps/api/prisma/schema.prisma`, so the diagram and the database agree on what
disappears when a parent row is removed.

| File | Class diagram | Covers SD |
|---|---|---|
| `class-auth.puml` | `class-auth-register` | 01 |
| | `class-auth-login` | 02 |
| | `class-auth-token-lifecycle` | 03 |
| | `class-auth-password-reset` | 04 |
| `class-users.puml` | `class-user-profile` | 05, 06 |
| | `class-user-face-ekyc` | 07 |
| | `class-volunteer-availability` | 08, 09 |
| `class-listing.puml` | `class-listing-search` | 10, 17 |
| | `class-listing-create` | 11 |
| | `class-listing-manage` | 12-16 |
| `class-reservation.puml` | `class-reservation-create` | 18 |
| | `class-reservation-my-orders` | 19 |
| | `class-reservation-handover` | 20-22 |
| | `class-reservation-cancel-rate` | 23, 24 |
| `class-delivery.puml` | `class-delivery-offer` | 25 |
| | `class-delivery-lifecycle` | 26 |
| | `class-delivery-track` | 27, 31 |
| | `class-delivery-stop` | 28-30 |
| `class-bulk-run.puml` | `class-bulk-request-review` | 32 |
| | `class-bulk-pickup-stops` | 33, 34 |
| | `class-bulk-serve-close` | 35 |
| `class-campaign.puml` | `class-campaign-create-browse` | 36, 37 |
| | `class-campaign-apply-review` | 38 |
| | `class-campaign-lifecycle` | 39-43 |
| | `class-campaign-donation-change` | 44-47 |
| `class-campaign-supply.puml` | `class-campaign-supplier-request` | 48, 49 |
| | `class-campaign-provider-review` | 50 |
| | `class-campaign-distribution` | 51-54 |
| `class-kitchen-ops.puml` | `class-kitchen-shifts-menu` | 55, 56 |
| | `class-kitchen-cooking-steps` | 57, 58 |
| | `class-kitchen-handoff` | 59-61 |
| `class-admin.puml` | `class-admin-dashboard` | 62, 63 |
| | `class-admin-users-campaigns` | 64, 65 |
| | `class-admin-settings` | 66-68 |
| `class-support.puml` | `class-notification` | 69 |
| | `class-report` | 70 |
| | `class-recipe` | 71 |
| | `class-esg` | 72 |
| | `class-upload` | 73 |
| `class-cron.puml` | `class-cron-order-jobs` | 74 |
| | `class-cron-campaign-jobs` | 75-77 |

---

## Other diagrams

| File | Content |
|---|---|
| `erd-logical.puml` · `erd-logical.dbml` | Logical ERD — `erd-logical.puml` cho PlantUML, `erd-logical.dbml` để paste vào [dbdiagram.io](https://dbdiagram.io/d) hoặc sinh SQL DDL bằng `dbml2sql` |
| `state-delivery.puml` | Delivery status state machine |
| `campaign-activity.mmd` | Kitchen campaign activity diagram (Mermaid) |
| `activity-diagrams.drawio` · `web-package-diagram.drawio` | draw.io drawings |
