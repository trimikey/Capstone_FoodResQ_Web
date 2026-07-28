# Capstone Project Register — FoodResQ (SP26SE088)

> **This is the SCOPE ANCHOR for the whole project.** Every feature request must map to a
> functional requirement (FR) listed here. If a request does not map, flag it as
> out-of-scope and confirm with the team lead before building. See CLAUDE.md § Scope guard.

- **English name:** FoodResQ — Volunteer-based Food Rescue Platform
- **Vietnamese name:** Nền tảng cứu trợ và phân phối thực phẩm
- **Abbreviation:** FRQ
- **Supervisor:** Đỗ Phúc Thịnh (thinhdp2@fpt.edu.vn)
- **Team:** Lê Đức Trí (SE180473, Leader) · Nguyễn Đặng Đăng Quan (SE182747) · Trần Bá Huy (SE180058) · Lê Thị Minh Thư (SE185044)
- **Registered:** 13/04/2026

## Context

Food waste has become a major issue in urban areas, especially from restaurants, bakeries,
and supermarkets that often have surplus food at the end of the day. At the same time, many
individuals and organizations are in need of food support. There is no efficient platform to
connect food providers with receivers in a timely manner. FoodResQ enables real-time
sharing, reservation, and distribution of surplus food to minimize waste and maximize
social impact.

## Proposed solutions

1. Platform for food providers to list surplus food items
2. Users search and reserve available food
3. Time-based system to manage food expiration
4. Fair distribution to prevent abuse
5. Pickup or delivery coordination
6. Tracking and reporting of rescued food
7. Point system to encourage user participation

## Functional requirements

### FR-P · Food Provider
- P1. Register and create business accounts
- P2. Update profile information (name, address, contact)
- P3. Account verification by admin (optional)
- P4. Create food listings with customizable categories (Rice, Dry food, Fresh food…)
- P5. Set custom expiration times dynamically by food type (extended limits for storable items)
- P6. Upload images of food items
- P7. Edit or delete listings before they are reserved
- P8. View listing status (draft, available, partially reserved, fully reserved, expired)
- P9. View all reservations for their listings
- P10. Track reserved quantity and remaining quantity
- P11. Cancel invalid reservations
- P12. View totals: food shared, successful pickups, expired items
- P13. View performance reports over time

### FR-R · Food Receiver
- R1. Register and manage personal accounts
- R2. View and update personal information
- R3. Trust score and usage history
- R4. Search food by location (nearby), category, expiry time
- R5. View details: description, provider info, remaining quantity, pickup window
- R6. Reserve food items; choose quantity within allowed limit
- R7. Receive confirmation after successful reservation
- R8. View active reservations, completed pickups, cancelled reservations
- R9. Cancel reservations before pickup time
- R10. Check pickup details: location, time window, instructions
- R11. Confirm pickup via QR code or manual confirmation
- R12. Notifications: nearby food available · reservation confirmed · pickup deadline near · reservation cancelled
- R13. Rate providers after pickup
- R14. Report food quality issues and incorrect information

### FR-O · Organization (charity receiver)
- O1. Register and request verification
- O2. Prioritized in large-quantity listings
- O3. Reserve larger quantities of food
- O4. Manage group pickups for their members
- O5. View statistics about their social impact

### FR-S · Volunteer Shipper
- S1. View available food pickup requests from providers
- S2. Accept or decline rescue tasks
- S3. Update delivery status: accepted, picked up, delivered
- S4. Confirm delivery completion
- S5. System updates order status after delivery confirmation

### FR-A · Admin
- A1. Manage accounts of providers, receivers, organizations, shippers, chefs, servers
- A2. Approve, reject, or suspend accounts
- A3. Review food listings; remove inappropriate or invalid listings
- A4. Monitor expired items
- A5. View user reports; handle complaints (warning, account suspension)
- A6. Monitor total listings, active users, reservations
- A7. Analytics dashboards: meals rescued, waste reduction, usage trends

### FR-H · System Handler
- H1. Automatically hide food listings after expiry time
- H2. Cancel unclaimed reservations after expiry
- H3. Temporarily lock quantity on reserve; release if not confirmed within a time limit
- H4. Limit reservations per user per day and quantity per reservation
- H5. Prioritize nearby users, high-trust users, and verified organizations for fair distribution

## Non-functional requirements
- Real-time data processing
- Accuracy of location and time data
- Highly available and scalable
- Prevent abuse and ensure fair usage

## Deliverables
- **Docs:** User Requirement, SRS, Architecture Design, Detail Design, Testing, Installation Guide (UML 2.0)
- **Server:** NestJS + PostgreSQL
- **Clients:** ReactJS web (admin + provider + customer), React Native mobile
- **Task packages:** (1) APIs · (2) Provider Management Web · (3) Mobile app · (4) Build–Deploy–Test · (5) Documents

## Registered-scope extensions (built beyond the register — keep, and add to SRS)

These are implemented and demo-ready; they extend registered FRs rather than replace them.
When writing the SRS, list them under the FR they extend:

| Extension | Extends | Status |
|---|---|---|
| Face eKYC at registration (selfie, mandatory for individual receivers & volunteers) + face compare at pickup | R11, H5 (anti-abuse) | done |
| Trust score penalty engine (late cancel −10, no-show −20, auto restrict ≤60 / ban ≤30) + penalty-warning popup | R3, H4 | done |
| Shipper offer dispatch (nearest-first cascade, 2-min offer TTL, 4m30s assignment timeout, re-broadcast cron) | S1–S2 | done |
| Live GPS tracking of shipper on receiver map + QR handoff at delivery (proof of correct receiver) | S3–S5 | done |
| Bulk run — shipper takes ≥10 portions, distributes at multiple pinned stops, leftover restock | S1–S5, O2 | done |
| Kitchen campaigns (charity kitchens with chef/waiter/shipper slots) + recipes + provider donations | O4, O5 | done |
| ESG reporting (kg rescued, CO₂ saved) for providers and admin dashboard | P12–P13, A7 | done |
| Surprise bag listings (Too Good To Go style) | P4 | done |
| Realtime notifications (socket) + push (FCM scaffold) | R12 | partial |
