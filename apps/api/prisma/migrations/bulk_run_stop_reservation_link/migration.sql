-- Migration: bulk_run_stop_reservation_link
-- Links BulkRunStop → Reservation (1:1) when shipper picks up bulk cargo.
-- Also tracks which reservation belongs to which bulk stop.

BEGIN;

-- 1. Add reservationId to bulk_run_stops (unique FK pointing to Reservation)
ALTER TABLE bulk_run_stops
  ADD COLUMN IF NOT EXISTS reservation_id UUID UNIQUE;

COMMENT ON COLUMN bulk_run_stops.reservation_id IS
  'Reservation created when shipper picks up bulk cargo. 1 reservation per stop.';

-- 2. Add bulk_run_stop_id to reservations (back-reference, unique)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS bulk_run_stop_id UUID UNIQUE;

COMMENT ON COLUMN reservations.bulk_run_stop_id IS
  'Bulk run stop this reservation belongs to. Null for normal individual reservations.';

-- 3. FK constraints
ALTER TABLE bulk_run_stops
  ADD CONSTRAINT fk_bulk_run_stops_reservation
  FOREIGN KEY (reservation_id)
  REFERENCES reservations(id)
  ON DELETE SET NULL;

ALTER TABLE reservations
  ADD CONSTRAINT fk_reservations_bulk_run_stop
  FOREIGN KEY (bulk_run_stop_id)
  REFERENCES bulk_run_stops(id)
  ON DELETE SET NULL;

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_reservations_bulk_run_stop
  ON reservations(bulk_run_stop_id)
  WHERE bulk_run_stop_id IS NOT NULL;

-- 5. Create placeholder user + receiver for bulk run (system account)
-- ID: 00000000-0000-0000-0000-000000000001
-- Uses raw SQL to bypass passwordHash requirement
DO $$
BEGIN
  INSERT INTO users (id, email, full_name, role, created_at, updated_at)
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'bulk-run@foodresq.internal',
    'Hệ thống — Giao sỉ (Bulk)',
    'receiver',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

DO $$
BEGIN
  INSERT INTO receiver_profiles (id, user_id, is_charity_org, organization_name, verification_status, verified_at, created_at, updated_at)
  VALUES (
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000001',
    true,
    'Tổ chức từ thiện (Bulk Run)',
    'approved',
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;
END $$;

COMMIT;
